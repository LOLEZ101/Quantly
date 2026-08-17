import { readFile } from 'node:fs/promises';
import { defineConfig } from 'vite';
import YahooFinance from 'yahoo-finance2';
import { preferredEquityFromPeriods, resolveEarningsYield } from './src/yahoo/earnings-yield.js';
import {
  fxYahooSymbolFor,
  modulesFromQuoteSummaryResponse,
  rawYahooNumber,
  resolveDividendYield,
} from './src/yahoo/normalize-dividend-yield.js';
import {
  computeRocFromQuarterly,
  mergeFundamentalsPeriods,
} from './src/yahoo/roc-fundamentals.js';
import { chartPointsFromQuotes, period1ForRange } from './src/yahoo/chart-range.js';

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
const fundamentalsCache = new Map();
/** @type {Map<string, { data: unknown, fetchedAt: number }>} */
const metricsCache = new Map();
/** @type {Map<string, { data: unknown, fetchedAt: number }>} */
const chartCache = new Map();
/** @type {Map<string, { rate: number, fetchedAt: number }>} */
const fxCache = new Map();
const QUOTE_TTL_MS = 5 * 60 * 1000;
const FX_TTL_MS = 60 * 60 * 1000;
const CHART_TTL_MS = 2 * 60 * 1000;
const FUNDAMENTALS_LOOKBACK_MS = 4 * 365 * 24 * 60 * 60 * 1000;

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
    modules: ['summaryDetail', 'defaultKeyStatistics', 'price', 'financialData'],
  });

  const data = {
    quoteSummary: {
      result: [
        {
          summaryDetail: result.summaryDetail || {},
          defaultKeyStatistics: result.defaultKeyStatistics || {},
          price: result.price || {},
          financialData: result.financialData || {},
        },
      ],
    },
  };

  quoteCache.set(cacheKey, { data, fetchedAt: Date.now() });
  return data;
}

function quoteModulesFromSummaryData(data) {
  return modulesFromQuoteSummaryResponse(data);
}

async function fetchFxRate(currency) {
  const fxSymbol = fxYahooSymbolFor(currency);
  if (!fxSymbol) return null;

  const cached = fxCache.get(fxSymbol);
  if (cached && Date.now() - cached.fetchedAt < FX_TTL_MS) {
    return cached.rate;
  }

  try {
    const quote = await yahooFinance.quote(fxSymbol);
    const rate = rawYahooNumber(quote?.regularMarketPrice);
    if (rate == null || rate <= 0) return null;
    fxCache.set(fxSymbol, { rate, fetchedAt: Date.now() });
    return rate;
  } catch (error) {
    console.warn(`[yahoo] FX fetch failed for ${fxSymbol}:`, error);
    return null;
  }
}

async function resolveSymbolDividendYield(symbol, quoteData) {
  const { summaryDetail, price, stats } = quoteModulesFromSummaryData(quoteData);

  return resolveDividendYield({
    symbol,
    summaryDetail,
    price,
    stats,
    fetchFxRate,
    fetchQuoteSummary: async (underlyingSymbol) => {
      const underlyingData = await fetchYahooQuoteSummary(underlyingSymbol);
      return quoteModulesFromSummaryData(underlyingData);
    },
  });
}

async function fetchYahooFundamentals(symbol) {
  const cacheKey = symbol.toUpperCase();
  const cached = fundamentalsCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < QUOTE_TTL_MS) {
    return cached.data;
  }

  const period1 = new Date(Date.now() - FUNDAMENTALS_LOOKBACK_MS);
  const financials = await yahooFinance.fundamentalsTimeSeries(symbol, {
    period1,
    type: 'quarterly',
    module: 'financials',
  });
  const balanceSheet = await yahooFinance.fundamentalsTimeSeries(symbol, {
    period1,
    type: 'quarterly',
    module: 'balance-sheet',
  });

  const periods = mergeFundamentalsPeriods([financials, balanceSheet]);
  const data = {
    ...computeRocFromQuarterly(periods),
    preferredEquity: preferredEquityFromPeriods(periods),
  };
  fundamentalsCache.set(cacheKey, { data, fetchedAt: Date.now() });
  return data;
}

async function fetchYahooMetrics(symbol) {
  const cacheKey = String(symbol || '').toUpperCase();
  const cached = metricsCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < QUOTE_TTL_MS) {
    return cached.data;
  }

  const quoteData = await fetchYahooQuoteSummary(symbol);
  const {
    summaryDetail: summary,
    price,
    stats,
    financialData,
  } = quoteModulesFromSummaryData(quoteData);
  const dividendYield = await resolveSymbolDividendYield(symbol, quoteData);

  let fundamentals = { roc: null, ebitTtm: null, preferredEquity: null };
  try {
    fundamentals = await fetchYahooFundamentals(symbol);
  } catch (error) {
    console.warn(`[yahoo] fundamentals failed for ${symbol}:`, error);
  }

  const earningsYield = await resolveEarningsYield({
    ebitTtm: fundamentals.ebitTtm,
    preferredEquity: fundamentals.preferredEquity,
    price,
    summaryDetail: summary,
    stats,
    financialData,
    fetchFxRate,
  });

  const data = {
    symbol: cacheKey,
    earningsYield,
    dividendYield,
    fundamentals,
  };
  metricsCache.set(cacheKey, { data, fetchedAt: Date.now() });
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

  const points = chartPointsFromQuotes(chart.quotes, range);
  const timestamps = points.map((point) => point.t);
  const closes = points.map((point) => point.close);

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

function devSourceIndexPlugin() {
  return {
    name: 'dev-source-index',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const [pathname, query = ''] = (req.url || '').split('?');
        if (pathname === '/' || pathname === '/index.html') {
          req.url = `/index.source.html${query ? `?${query}` : ''}`;
        }
        next();
      });
    },
  };
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
      const data = await fetchYahooMetrics(symbol);
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

export default defineConfig(({ command }) => ({
  base: command === 'serve' ? '/' : '/Quantly/',
  plugins: [devSourceIndexPlugin(), yahooFinancePlugin()],
  optimizeDeps: {
    entries: ['index.source.html'],
  },
  build: {
    rollupOptions: {
      input: 'index.source.html',
    },
  },
}));
