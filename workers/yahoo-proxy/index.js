import { preferredEquityFromPeriods, resolveEarningsYield } from '../../src/yahoo/earnings-yield.js';
import {
  fxRateFromQuoteResponse,
  fxYahooSymbolFor,
  modulesFromQuoteSummaryResponse,
  resolveDividendYield,
} from '../../src/yahoo/normalize-dividend-yield.js';
import {
  computeRocFromQuarterly,
  parseYahooTimeseries,
} from '../../src/yahoo/roc-fundamentals.js';

const ALLOWED_ORIGINS = new Set([
  'https://lolez101.github.io',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]);

const YAHOO_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; QuantlyStatTest/1.0)',
};

const FUNDAMENTALS_LOOKBACK_SEC = 4 * 365 * 24 * 60 * 60;
const FX_TTL_MS = 60 * 60 * 1000;
const QUOTE_SUMMARY_MODULES = 'summaryDetail,defaultKeyStatistics,price,financialData';
/** @type {Map<string, { data: unknown, fetchedAt: number }>} */
const quoteSummaryCache = new Map();
/** @type {Map<string, { rate: number, fetchedAt: number }>} */
const fxCache = new Map();
const FUNDAMENTAL_TYPES = [
  'quarterlyEBIT',
  'quarterlyOperatingIncome',
  'quarterlyNetPPE',
  'quarterlyWorkingCapital',
  'quarterlyCurrentAssets',
  'quarterlyCurrentLiabilities',
  'quarterlyPreferredStockEquity',
  'quarterlyPreferredStock',
];

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const allowOrigin = ALLOWED_ORIGINS.has(origin) ? origin : ALLOWED_ORIGINS.values().next().value;
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

async function fetchYahooJson(url) {
  const response = await fetch(url, { headers: YAHOO_HEADERS });
  if (!response.ok) {
    throw new Error(`Yahoo Finance returned ${response.status}`);
  }
  return response.json();
}

async function fetchYahooFundamentals(symbol) {
  const period2 = Math.floor(Date.now() / 1000);
  const period1 = period2 - FUNDAMENTALS_LOOKBACK_SEC;
  const yahooUrl =
    `https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(symbol)}` +
    `?type=${encodeURIComponent(FUNDAMENTAL_TYPES.join(','))}` +
    `&period1=${period1}&period2=${period2}`;
  const data = await fetchYahooJson(yahooUrl);
  const periods = parseYahooTimeseries(data);
  return {
    ...computeRocFromQuarterly(periods),
    preferredEquity: preferredEquityFromPeriods(periods),
  };
}

async function proxyYahooChart(request, symbol, searchParams) {
  const range = searchParams.get('range') || '1y';
  const interval = searchParams.get('interval') || '1d';
  const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${encodeURIComponent(range)}&interval=${encodeURIComponent(interval)}`;
  const response = await fetch(yahooUrl, {
    headers: YAHOO_HEADERS,
  });

  if (!response.ok) {
    return jsonResponse(request, response.status, {
      error: `Yahoo Finance returned ${response.status}`,
    });
  }

  const data = await response.json();
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      ...corsHeaders(request),
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

async function proxyYahooQuote(request, symbol) {
  const yahooUrl = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}`;
  const response = await fetch(yahooUrl, {
    headers: YAHOO_HEADERS,
  });

  if (!response.ok) {
    return jsonResponse(request, response.status, {
      error: `Yahoo quote returned ${response.status}`,
    });
  }

  const data = await response.json();
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      ...corsHeaders(request),
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

async function fetchYahooQuoteSummary(symbol) {
  const cacheKey = String(symbol || '').toUpperCase();
  const cached = quoteSummaryCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < FX_TTL_MS) {
    return cached.data;
  }

  const yahooUrl =
    `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}` +
    `?modules=${encodeURIComponent(QUOTE_SUMMARY_MODULES)}`;
  const data = await fetchYahooJson(yahooUrl);
  quoteSummaryCache.set(cacheKey, { data, fetchedAt: Date.now() });
  return data;
}

async function fetchFxRate(currency) {
  const fxSymbol = fxYahooSymbolFor(currency);
  if (!fxSymbol) return null;

  const cached = fxCache.get(fxSymbol);
  if (cached && Date.now() - cached.fetchedAt < FX_TTL_MS) {
    return cached.rate;
  }

  const quoteUrl = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(fxSymbol)}`;
  const quoteData = await fetchYahooJson(quoteUrl);
  const rate = fxRateFromQuoteResponse(quoteData, fxSymbol);
  if (rate == null) return null;

  fxCache.set(fxSymbol, { rate, fetchedAt: Date.now() });
  return rate;
}

async function fetchYahooMetrics(symbol) {
  const cacheKey = String(symbol || '').toUpperCase();
  const quoteData = await fetchYahooQuoteSummary(symbol);
  const { summaryDetail, price, stats, financialData } =
    modulesFromQuoteSummaryResponse(quoteData);
  const dividendYield = await resolveDividendYield({
    symbol: cacheKey,
    summaryDetail,
    price,
    stats,
    fetchFxRate,
    fetchQuoteSummary: async (underlyingSymbol) => {
      const underlyingData = await fetchYahooQuoteSummary(underlyingSymbol);
      return modulesFromQuoteSummaryResponse(underlyingData);
    },
  });

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
    summaryDetail,
    stats,
    financialData,
    fetchFxRate,
  });

  return {
    symbol: cacheKey,
    earningsYield,
    dividendYield,
    fundamentals,
  };
}

async function proxyYahooMetrics(request, symbol) {
  try {
    const data = await fetchYahooMetrics(symbol);
    return jsonResponse(request, 200, data);
  } catch (error) {
    return jsonResponse(request, 502, {
      error: error instanceof Error ? error.message : String(error),
    });
  }
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
      return proxyYahooChart(request, decodeURIComponent(chartMatch[1]), searchParams);
    }

    const quoteMatch = pathname.match(/^\/api\/yahoo-quote\/([^/]+)\/?$/);
    if (quoteMatch) {
      return proxyYahooQuote(request, decodeURIComponent(quoteMatch[1]));
    }

    const metricsMatch = pathname.match(/^\/api\/yahoo-metrics\/([^/]+)\/?$/);
    if (metricsMatch) {
      return proxyYahooMetrics(request, decodeURIComponent(metricsMatch[1]));
    }

    if (pathname === '/health') {
      return jsonResponse(request, 200, { ok: true });
    }

    return jsonResponse(request, 404, { error: 'Not found' });
  },
};
