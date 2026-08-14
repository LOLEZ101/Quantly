import { readFile } from 'node:fs/promises';
import { defineConfig } from 'vite';
import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance({
  suppressNotices: ['yahooSurvey'],
  queue: { concurrency: 2, interval: 250 },
});

const NASDAQ_TRADED_URL =
  'https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqtraded.txt';
const NASDAQ_TRADED_FALLBACK = '/Volumes/symboldirectory/nasdaqtraded.txt';

/** @type {Promise<{ symbol: string, name: string, yahooSymbol: string }[]> | null} */
let nasdaqSymbolsPromise = null;

/** @type {Map<string, { data: unknown, fetchedAt: number }>} */
const quoteCache = new Map();
/** @type {Map<string, { data: unknown, fetchedAt: number }>} */
const chartCache = new Map();
const QUOTE_TTL_MS = 5 * 60 * 1000;
const CHART_TTL_MS = 2 * 60 * 1000;

const RANGE_MS = {
  '1d': 1 * 24 * 60 * 60 * 1000,
  '5d': 7 * 24 * 60 * 60 * 1000,
  '1mo': 31 * 24 * 60 * 60 * 1000,
  '6mo': 183 * 24 * 60 * 60 * 1000,
  '1y': 365 * 24 * 60 * 60 * 1000,
  '5y': 5 * 365 * 24 * 60 * 60 * 1000,
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

function json(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function cleanSecurityName(name) {
  return String(name || '')
    .replace(/\s+-\s+Common Stock\s*$/i, '')
    .replace(/\s+Common Stock\s*$/i, '')
    .trim();
}

function parseNasdaqTraded(text) {
  const symbols = [];
  const lines = String(text || '').split(/\r?\n/);

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line) continue;
    if (i === 0 && line.startsWith('Nasdaq Traded|')) continue;
    if (line.startsWith('File Creation Time:')) continue;

    const cols = line.split('|');
    if (cols.length < 8) continue;

    const symbol = cols[1]?.trim();
    const securityName = cols[2]?.trim();
    const testIssue = cols[7]?.trim();
    if (!symbol || testIssue === 'Y') continue;

    symbols.push({
      symbol,
      name: cleanSecurityName(securityName),
      yahooSymbol: symbol.replace(/\./g, '-'),
    });
  }

  return symbols;
}

async function loadNasdaqSymbolsFromUrl() {
  const response = await fetch(NASDAQ_TRADED_URL);
  if (!response.ok) {
    throw new Error(`NASDAQ directory returned ${response.status}`);
  }
  const symbols = parseNasdaqTraded(await response.text());
  if (!symbols.length) {
    throw new Error('NASDAQ directory parsed empty');
  }
  return symbols;
}

async function loadNasdaqSymbolsFromFallback() {
  const text = await readFile(NASDAQ_TRADED_FALLBACK, 'utf8');
  const symbols = parseNasdaqTraded(text);
  if (!symbols.length) {
    throw new Error('NASDAQ fallback directory parsed empty');
  }
  return symbols;
}

function loadNasdaqSymbols() {
  if (nasdaqSymbolsPromise) return nasdaqSymbolsPromise;

  nasdaqSymbolsPromise = (async () => {
    try {
      const symbols = await loadNasdaqSymbolsFromUrl();
      console.log(
        `[nasdaq] loaded ${symbols.length} symbols from nasdaqtrader.com`,
      );
      return symbols;
    } catch (urlError) {
      console.warn('[nasdaq] failed to fetch official directory:', urlError);
      try {
        const symbols = await loadNasdaqSymbolsFromFallback();
        console.log(
          `[nasdaq] loaded ${symbols.length} symbols from fallback file`,
        );
        return symbols;
      } catch (fileError) {
        console.error('[nasdaq] fallback file also failed:', fileError);
        return [];
      }
    }
  })();

  return nasdaqSymbolsPromise;
}

async function fetchYahooQuoteSummary(symbol) {
  const cacheKey = symbol.toUpperCase();
  const cached = quoteCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < QUOTE_TTL_MS) {
    return cached.data;
  }

  const result = await yahooFinance.quoteSummary(symbol, {
    modules: ['summaryDetail', 'defaultKeyStatistics'],
  });

  const data = {
    quoteSummary: {
      result: [
        {
          summaryDetail: result.summaryDetail || {},
          defaultKeyStatistics: result.defaultKeyStatistics || {},
        },
      ],
    },
  };

  quoteCache.set(cacheKey, { data, fetchedAt: Date.now() });
  return data;
}

async function fetchYahooChart(symbol, range, interval) {
  const cacheKey = `${symbol.toUpperCase()}|${range}|${interval}`;
  const cached = chartCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CHART_TTL_MS) {
    return cached.data;
  }

  const period1 = period1ForRange(range);
  const chart = await yahooFinance.chart(symbol, {
    period1,
    interval,
  });

  const timestamps = [];
  const closes = [];
  for (const quote of chart.quotes || []) {
    if (quote?.date == null || quote.close == null) continue;
    const t = Math.floor(new Date(quote.date).getTime() / 1000);
    if (!Number.isFinite(t) || !Number.isFinite(quote.close)) continue;
    timestamps.push(t);
    closes.push(quote.close);
  }

  if (!timestamps.length) {
    throw new Error('No price points available for this range');
  }

  const data = {
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

  chartCache.set(cacheKey, { data, fetchedAt: Date.now() });
  return data;
}

function yahooFinancePlugin() {
  return {
    name: 'yahoo-finance-api',
    configureServer(server) {
      loadNasdaqSymbols();
      server.middlewares.use(yahooApiMiddleware);
    },
    configurePreviewServer(server) {
      loadNasdaqSymbols();
      server.middlewares.use(yahooApiMiddleware);
    },
  };
}

async function yahooApiMiddleware(req, res, next) {
  const rawUrl = req.url || '';
  const parsed = new URL(rawUrl, 'http://localhost');
  const pathname = parsed.pathname;

  if (pathname === '/api/nasdaq-symbols' || pathname === '/api/nasdaq-symbols/') {
    try {
      const symbols = await loadNasdaqSymbols();
      json(res, 200, symbols);
    } catch (error) {
      console.error('[nasdaq] failed to serve symbol directory:', error);
      json(res, 200, []);
    }
    return;
  }

  const metricsMatch = pathname.match(/^\/api\/yahoo-metrics\/([^/]+)\/?$/);
  if (metricsMatch) {
    try {
      const symbol = decodeURIComponent(metricsMatch[1]);
      const data = await fetchYahooQuoteSummary(symbol);
      json(res, 200, data);
    } catch (error) {
      json(res, 502, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return;
  }

  const chartMatch = pathname.match(/^\/api\/yahoo-chart\/([^/]+)\/?$/);
  if (chartMatch) {
    try {
      const symbol = decodeURIComponent(chartMatch[1]);
      const range = parsed.searchParams.get('range') || '1y';
      const interval = parsed.searchParams.get('interval') || '1d';
      const data = await fetchYahooChart(symbol, range, interval);
      json(res, 200, data);
    } catch (error) {
      json(res, 502, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return;
  }

  next();
}

export default defineConfig({
  base: '/StatTest/',
  plugins: [yahooFinancePlugin()],
  build: {
    rollupOptions: {
      input: 'index.source.html',
    },
  },
});
