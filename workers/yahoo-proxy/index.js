import YahooFinance from 'yahoo-finance2';
import { preferredEquityFromPeriods, resolveEarningsYield } from '../../src/yahoo/earnings-yield.js';
import { chartPointsFromQuotes, period1ForRange } from '../../src/yahoo/chart-range.js';
import {
  fxYahooSymbolFor,
  modulesFromQuoteSummaryResponse,
  rawYahooNumber,
  resolveDividendYield,
} from '../../src/yahoo/normalize-dividend-yield.js';
import {
  computeRocFromQuarterly,
  mergeFundamentalsPeriods,
} from '../../src/yahoo/roc-fundamentals.js';

const ALLOWED_ORIGINS = new Set([
  'https://lolez101.github.io',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]);

const yahooFinance = new YahooFinance({
  suppressNotices: ['yahooSurvey'],
  queue: { concurrency: 2, interval: 250 },
});

const QUOTE_TTL_MS = 5 * 60 * 1000;
const FX_TTL_MS = 60 * 60 * 1000;
const CHART_TTL_MS = 2 * 60 * 1000;
const FUNDAMENTALS_LOOKBACK_MS = 4 * 365 * 24 * 60 * 60 * 1000;

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

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const allowOrigin = ALLOWED_ORIGINS.has(origin)
    ? origin
    : ALLOWED_ORIGINS.values().next().value;
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function jsonResponse(request, status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(request),
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
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
  } catch {
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
  } catch {
    // Quote metrics can still render without ROC or earnings yield.
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
  const chart = await yahooFinance.chart(symbol, { period1, interval });
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

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    const url = new URL(request.url);
    const { pathname, searchParams } = url;

    const chartMatch = pathname.match(/^\/api\/yahoo-chart\/([^/]+)\/?$/);
    if (chartMatch) {
      try {
        const symbol = decodeURIComponent(chartMatch[1]);
        const range = searchParams.get('range') || '1y';
        const interval = searchParams.get('interval') || '1d';
        const data = await fetchYahooChart(symbol, range, interval);
        return jsonResponse(request, 200, data);
      } catch (error) {
        return jsonResponse(request, 502, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const metricsMatch = pathname.match(/^\/api\/yahoo-metrics\/([^/]+)\/?$/);
    if (metricsMatch) {
      try {
        const data = await fetchYahooMetrics(decodeURIComponent(metricsMatch[1]));
        return jsonResponse(request, 200, data);
      } catch (error) {
        return jsonResponse(request, 502, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (pathname === '/health') {
      return jsonResponse(request, 200, { ok: true });
    }

    return jsonResponse(request, 404, { error: 'Not found' });
  },
};
