import adrMetadata from './adr-metadata.json';

/** Maximum plausible dividend yield (decimal). */
export const MAX_DIVIDEND_YIELD = 0.2;

/** Primary vs trailing yield disagreement threshold (decimal). */
const YIELD_DISAGREE_THRESHOLD = 0.02;

/** Yahoo FX symbols: local currency units per 1 USD. */
const FX_YAHOO_SYMBOL = {
  KRW: 'KRW=X',
  JPY: 'JPY=X',
  TWD: 'TWD=X',
  EUR: 'EURUSD=X',
  GBP: 'GBPUSD=X',
};

export function rawYahooNumber(field) {
  if (field == null) return null;
  if (typeof field === 'number' && Number.isFinite(field)) return field;
  if (typeof field === 'object' && typeof field.raw === 'number') return field.raw;
  return null;
}

export function isValidYieldDecimal(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= MAX_DIVIDEND_YIELD;
}

export function adrMetadataFor(ticker) {
  return adrMetadata[String(ticker || '').toUpperCase()] ?? null;
}

export function fxYahooSymbolFor(currency) {
  return FX_YAHOO_SYMBOL[String(currency || '').toUpperCase()] ?? null;
}

/**
 * Standard (non-ADR) dividend yield from Yahoo summaryDetail.
 * Returns decimal yield (0.015 = 1.5%) or null.
 */
export function normalizeDividendYield({ summaryDetail = {}, price = {}, stats = {} }) {
  const primary = rawYahooNumber(summaryDetail.dividendYield);
  if (isValidYieldDecimal(primary)) return primary;

  const trailing = rawYahooNumber(summaryDetail.trailingAnnualDividendYield);
  if (trailing != null && trailing > 0 && trailing < 1) {
    if (primary == null || Math.abs(trailing - primary) <= YIELD_DISAGREE_THRESHOLD) {
      if (isValidYieldDecimal(trailing)) return trailing;
    }
  }

  const rate = rawYahooNumber(summaryDetail.trailingAnnualDividendRate);
  const marketPrice =
    rawYahooNumber(price.regularMarketPrice) ??
    rawYahooNumber(summaryDetail.regularMarketPrice);
  if (rate != null && marketPrice != null && marketPrice > 0) {
    const computed = rate / marketPrice;
    // Reject currency-mismatch artifacts (e.g. KRW dividend amount on USD price).
    if (isValidYieldDecimal(computed) && rate <= marketPrice) {
      return computed;
    }
  }

  const statsYield = rawYahooNumber(stats.yield);
  if (statsYield != null && statsYield > 0 && statsYield < 1 && isValidYieldDecimal(statsYield)) {
    return statsYield;
  }

  return null;
}

/**
 * ADR-specific USD yield: (local div per ordinary × ADR ratio) / FX / ADR USD price.
 */
export function computeAdrDividendYield({ summaryDetail = {}, price = {}, adrMeta, fxRate }) {
  if (!adrMeta) return null;

  const rate = rawYahooNumber(summaryDetail.trailingAnnualDividendRate);
  const adrPrice = rawYahooNumber(price.regularMarketPrice);
  const { ordinarySharesPerAdr } = adrMeta;

  if (rate == null || adrPrice == null || adrPrice <= 0) return null;
  if (ordinarySharesPerAdr == null || ordinarySharesPerAdr <= 0) return null;
  if (fxRate == null || fxRate <= 0) return null;

  const localDivPerAdr = rate * ordinarySharesPerAdr;
  const usdDivPerAdr = localDivPerAdr / fxRate;
  const yieldDecimal = usdDivPerAdr / adrPrice;

  return isValidYieldDecimal(yieldDecimal) ? yieldDecimal : null;
}

export function formatDividendYield(value) {
  if (value == null || !Number.isFinite(value)) return '—';
  const pct = value * 100;
  return `${pct.toLocaleString('en-US', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

/**
 * Tiered dividend yield resolution: primary → ADR calc → underlying listing.
 */
export async function resolveDividendYield({
  symbol,
  summaryDetail = {},
  price = {},
  stats = {},
  fetchQuoteSummary,
  fetchFxRate,
}) {
  const normalized = normalizeDividendYield({ summaryDetail, price, stats });
  if (normalized != null) return normalized;

  const meta = adrMetadataFor(symbol);
  if (!meta) return null;

  if (fetchFxRate) {
    const fxRate = await fetchFxRate(meta.dividendCurrency);
    const adrYield = computeAdrDividendYield({
      summaryDetail,
      price,
      adrMeta: meta,
      fxRate,
    });
    if (adrYield != null) return adrYield;
  }

  if (meta.underlying && fetchQuoteSummary) {
    const underlying = await fetchQuoteSummary(meta.underlying);
    if (underlying) {
      const underlyingYield = normalizeDividendYield(underlying);
      if (underlyingYield != null) return underlyingYield;
    }
  }

  return null;
}

/** Parse FX rate from Yahoo v7 quote response (local currency units per 1 USD). */
export function fxRateFromQuoteResponse(data, fxSymbol) {
  const results = data?.quoteResponse?.result || [];
  const match = results.find((row) => row?.symbol === fxSymbol) ?? results[0];
  const price = rawYahooNumber(match?.regularMarketPrice);
  return price != null && price > 0 ? price : null;
}

/** Parse modules from Yahoo v10 quoteSummary response. */
export function modulesFromQuoteSummaryResponse(data) {
  const result = data?.quoteSummary?.result?.[0] || {};
  return {
    summaryDetail: result.summaryDetail || {},
    price: result.price || {},
    stats: result.defaultKeyStatistics || {},
    financialData: result.financialData || {},
  };
}
