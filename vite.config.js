import { defineConfig } from 'vite';
import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance({
  suppressNotices: ['yahooSurvey'],
  queue: { concurrency: 2, interval: 250 },
});

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
      server.middlewares.use(yahooApiMiddleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(yahooApiMiddleware);
    },
  };
}

async function yahooApiMiddleware(req, res, next) {
  const rawUrl = req.url || '';
  const parsed = new URL(rawUrl, 'http://localhost');
  const pathname = parsed.pathname;

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
  plugins: [yahooFinancePlugin()],
});
