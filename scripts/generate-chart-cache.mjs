import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YahooFinance from 'yahoo-finance2';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'public', 'chart');

const yahooFinance = new YahooFinance({
  suppressNotices: ['yahooSurvey'],
  queue: { concurrency: 2, interval: 250 },
});

const RANGE_MS = {
  '1d': 1 * 24 * 60 * 60 * 1000,
  '5d': 7 * 24 * 60 * 60 * 1000,
  '1mo': 31 * 24 * 60 * 60 * 1000,
  '6mo': 183 * 24 * 60 * 60 * 1000,
  '1y': 365 * 24 * 60 * 60 * 1000,
  '5y': 5 * 365 * 24 * 60 * 60 * 1000,
};

const RANGES = {
  '1d': { range: '1d', interval: '5m', intraday: true },
  '5d': { range: '5d', interval: '30m', intraday: true },
  '1mo': { range: '1mo', interval: '1d', intraday: false },
  '6mo': { range: '6mo', interval: '1d', intraday: false },
  ytd: { range: 'ytd', interval: '1d', intraday: false },
  '1y': { range: '1y', interval: '1d', intraday: false },
  '5y': { range: '5y', interval: '1wk', intraday: false },
  max: { range: 'max', interval: '1mo', intraday: false },
};

function period1ForRange(range) {
  const now = new Date();
  if (range === 'ytd') {
    return new Date(now.getFullYear(), 0, 1);
  }
  if (range === 'max') {
    return new Date('1970-01-01T00:00:00.000Z');
  }
  const ms = RANGE_MS[range];
  if (!ms) {
    throw new Error(`Unsupported range: ${range}`);
  }
  return new Date(now.getTime() - ms);
}

async function fetchChart(symbol, range, interval) {
  const period1 = period1ForRange(range);
  const chart = await yahooFinance.chart(symbol, { period1, interval });

  const timestamps = [];
  const closes = [];
  for (const quote of chart.quotes || []) {
    if (quote?.date == null || quote.close == null) continue;
    const t = Math.floor(new Date(quote.date).getTime() / 1000);
    if (!Number.isFinite(t) || !Number.isFinite(quote.close)) continue;
    timestamps.push(t);
    closes.push(quote.close);
  }

  return {
    chart: {
      result: [
        {
          meta: chart.meta || { symbol },
          timestamp: timestamps,
          indicators: {
            quote: [{ close: closes }],
          },
        },
      ],
    },
  };
}

function cacheKeyForSymbol(symbol) {
  return String(symbol || '')
    .trim()
    .replace(/\^/g, '')
    .replace(/\./g, '-');
}

async function main() {
  const symbol = '^GSPC';
  const cacheKey = cacheKeyForSymbol(symbol);
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  for (const [key, config] of Object.entries(RANGES)) {
    const payload = await fetchChart(symbol, config.range, config.interval);
    const outFile = path.join(outDir, `${cacheKey}-${key}.json`);
    await writeFile(outFile, `${JSON.stringify(payload)}\n`, 'utf8');
    console.log(`[build] cached ${symbol} ${key}`);
  }
}

main().catch((error) => {
  console.error('[build] failed to generate chart cache:', error);
  process.exit(1);
});
