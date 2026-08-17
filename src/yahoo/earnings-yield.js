import { rawYahooNumber } from './normalize-dividend-yield.js';
import { finiteNumber, periodTimestamp } from './roc-fundamentals.js';

/** Yahoo FX pairs quoted as USD per 1 unit of the currency. */
const USD_PER_UNIT_CURRENCIES = new Set(['EUR', 'GBP']);

export function currencyCode(value) {
  if (typeof value === 'string' && value.trim()) {
    return value.trim().toUpperCase();
  }
  if (value && typeof value === 'object' && typeof value.raw === 'string') {
    return value.raw.trim().toUpperCase();
  }
  return '';
}

export function marketCapFromQuote({ price = {}, summaryDetail = {}, stats = {} } = {}) {
  const quoted =
    rawYahooNumber(price.marketCap) ??
    rawYahooNumber(summaryDetail.marketCap) ??
    rawYahooNumber(stats.marketCap) ??
    rawYahooNumber(summaryDetail.nonDilutedMarketCap);
  if (quoted != null && quoted > 0) return quoted;

  const shares =
    rawYahooNumber(stats.sharesOutstanding) ??
    rawYahooNumber(stats.impliedSharesOutstanding) ??
    rawYahooNumber(price.sharesOutstanding);
  const marketPrice =
    rawYahooNumber(price.regularMarketPrice) ??
    rawYahooNumber(summaryDetail.regularMarketPrice);
  if (shares != null && shares > 0 && marketPrice != null && marketPrice > 0) {
    return shares * marketPrice;
  }

  return quoted;
}

export function preferredEquityFromPeriod(period) {
  return (
    finiteNumber(period?.preferredStockEquity) ??
    finiteNumber(period?.preferredStock) ??
    finiteNumber(period?.quarterlyPreferredStockEquity) ??
    finiteNumber(period?.quarterlyPreferredStock)
  );
}

export function preferredEquityFromPeriods(periods) {
  const sorted = [...(periods || [])].sort(
    (a, b) => periodTimestamp(b) - periodTimestamp(a),
  );
  for (const period of sorted) {
    const value = preferredEquityFromPeriod(period);
    if (value != null) return value;
  }
  return null;
}

/**
 * Convert an amount using a Yahoo FX quote.
 * KRW/JPY/TWD-style pairs are local units per 1 USD.
 * EUR/GBP-style pairs are USD per 1 unit of the currency.
 */
export function yahooFxToUsd(amount, currency, fxRate) {
  const value = finiteNumber(amount);
  if (value == null) return null;
  const code = currencyCode(currency);
  if (!code || code === 'USD') return value;
  const rate = finiteNumber(fxRate);
  if (rate == null || rate <= 0) return null;
  return USD_PER_UNIT_CURRENCIES.has(code) ? value * rate : value / rate;
}

export function usdToYahooFx(usdAmount, currency, fxRate) {
  const value = finiteNumber(usdAmount);
  if (value == null) return null;
  const code = currencyCode(currency);
  if (!code || code === 'USD') return value;
  const rate = finiteNumber(fxRate);
  if (rate == null || rate <= 0) return null;
  return USD_PER_UNIT_CURRENCIES.has(code) ? value / rate : value * rate;
}

export function convertYahooAmount(amount, fromCurrency, toCurrency, rates = {}) {
  const value = finiteNumber(amount);
  if (value == null) return null;
  const from = currencyCode(fromCurrency);
  const to = currencyCode(toCurrency);
  if (!from || !to || from === to) return value;

  const usd = yahooFxToUsd(
    value,
    from,
    from === 'USD' ? 1 : rates[from],
  );
  return usdToYahooFx(usd, to, to === 'USD' ? 1 : rates[to]);
}

export async function alignFinancialAmountsToQuoteCurrency({
  amounts,
  financialCurrency,
  quoteCurrency,
  fetchFxRate,
}) {
  const from = currencyCode(financialCurrency);
  const to = currencyCode(quoteCurrency);
  if (!from || !to || from === to) return amounts;
  if (!fetchFxRate) return null;

  /** @type {Record<string, number>} */
  const rates = {};
  for (const code of [from, to]) {
    if (code === 'USD') continue;
    const rate = await fetchFxRate(code);
    if (rate == null || rate <= 0) return null;
    rates[code] = rate;
  }

  /** @type {Record<string, number | null | undefined>} */
  const converted = {};
  for (const [key, value] of Object.entries(amounts || {})) {
    if (value == null) {
      converted[key] = value;
      continue;
    }
    const next = convertYahooAmount(value, from, to, rates);
    if (next == null) return null;
    converted[key] = next;
  }
  return converted;
}

/**
 * EV = market cap + preferred equity + total debt − cash.
 * Missing preferred and cash are treated as 0. Missing market cap or debt → null.
 * Non-positive EV → null.
 */
export function enterpriseValueFromComponents({
  marketCap,
  preferredEquity,
  totalDebt,
  totalCash,
} = {}) {
  const equity = finiteNumber(marketCap);
  const debt = finiteNumber(totalDebt);
  if (equity == null || debt == null) return null;

  const preferred = finiteNumber(preferredEquity) ?? 0;
  const cash = finiteNumber(totalCash) ?? 0;
  const ev = equity + preferred + debt - cash;
  if (!Number.isFinite(ev) || ev <= 0) return null;
  return ev;
}

export function earningsYieldFromComponents({
  ebitTtm,
  marketCap,
  preferredEquity,
  totalDebt,
  totalCash,
} = {}) {
  const ebit = finiteNumber(ebitTtm);
  const ev = enterpriseValueFromComponents({
    marketCap,
    preferredEquity,
    totalDebt,
    totalCash,
  });
  if (ebit == null || ev == null) return null;
  return ebit / ev;
}

export async function resolveEarningsYield({
  ebitTtm,
  preferredEquity,
  price = {},
  summaryDetail = {},
  stats = {},
  financialData = {},
  fetchFxRate,
} = {}) {
  const marketCap = marketCapFromQuote({ price, summaryDetail, stats });
  const totalDebt = rawYahooNumber(financialData.totalDebt);
  const totalCash = rawYahooNumber(financialData.totalCash);
  const quoteCurrency = currencyCode(price.currency);
  const financialCurrency =
    currencyCode(price.financialCurrency) ||
    currencyCode(financialData.financialCurrency) ||
    quoteCurrency;

  const aligned = await alignFinancialAmountsToQuoteCurrency({
    amounts: {
      ebitTtm,
      preferredEquity,
      totalDebt,
      totalCash,
    },
    financialCurrency,
    quoteCurrency,
    fetchFxRate,
  });
  if (!aligned) return null;

  return earningsYieldFromComponents({
    ebitTtm: aligned.ebitTtm,
    marketCap,
    preferredEquity: aligned.preferredEquity,
    totalDebt: aligned.totalDebt,
    totalCash: aligned.totalCash,
  });
}

export function formatEarningsYield(value) {
  if (value == null || !Number.isFinite(value)) return '—';
  const pct = value * 100;
  return `${pct.toLocaleString('en-US', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}
