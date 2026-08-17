import { describe, expect, it } from 'vitest';
import {
  computeAdrDividendYield,
  formatDividendYield,
  normalizeDividendYield,
  resolveDividendYield,
} from '../src/yahoo/normalize-dividend-yield.js';

describe('normalizeDividendYield', () => {
  it('accepts primary decimal yield for AAPL-like payloads', () => {
    const yieldDecimal = normalizeDividendYield({
      summaryDetail: { dividendYield: 0.0035, trailingAnnualDividendYield: 0.0034 },
      price: { regularMarketPrice: 230 },
      stats: {},
    });
    expect(yieldDecimal).toBeCloseTo(0.0035, 5);
    expect(formatDividendYield(yieldDecimal)).toBe('0.4%');
  });

  it('rejects SKHY bad trailingAnnualDividendYield fallback', () => {
    const yieldDecimal = normalizeDividendYield({
      summaryDetail: {
        trailingAnnualDividendYield: 15.844751,
        trailingAnnualDividendRate: 2625,
      },
      price: { regularMarketPrice: 166.33, currency: 'USD' },
      stats: {},
    });
    expect(yieldDecimal).toBeNull();
  });

  it('rejects currency-mismatched rate/price computation', () => {
    const yieldDecimal = normalizeDividendYield({
      summaryDetail: {
        trailingAnnualDividendRate: 2625,
      },
      price: { regularMarketPrice: 166.33, currency: 'USD' },
      stats: {},
    });
    expect(yieldDecimal).toBeNull();
  });

  it('uses primary yield when trailingAnnualDividendYield disagrees (SONY)', () => {
    const yieldDecimal = normalizeDividendYield({
      summaryDetail: {
        dividendYield: 0.0065,
        trailingAnnualDividendYield: 1.0588733,
        trailingAnnualDividendRate: 25,
      },
      price: { regularMarketPrice: 24.29 },
      stats: {},
    });
    expect(yieldDecimal).toBeCloseTo(0.0065, 5);
    expect(formatDividendYield(yieldDecimal)).toBe('0.7%');
  });
});

describe('computeAdrDividendYield', () => {
  it('computes SKHY ADR yield from KRW dividend, ratio, FX, and USD price', () => {
    const yieldDecimal = computeAdrDividendYield({
      summaryDetail: { trailingAnnualDividendRate: 2625 },
      price: { regularMarketPrice: 166.33 },
      adrMeta: { ordinarySharesPerAdr: 0.1, dividendCurrency: 'KRW' },
      fxRate: 1350,
    });
    expect(yieldDecimal).toBeCloseTo(0.00117, 4);
    expect(formatDividendYield(yieldDecimal)).toBe('0.1%');
  });
});

describe('resolveDividendYield', () => {
  it('falls back to underlying listing yield when ADR calc inputs are missing', async () => {
    const yieldDecimal = await resolveDividendYield({
      symbol: 'SKHY',
      summaryDetail: { trailingAnnualDividendYield: 15.844751 },
      price: { regularMarketPrice: 166.33 },
      stats: {},
      fetchFxRate: async () => null,
      fetchQuoteSummary: async () => ({
        summaryDetail: { dividendYield: 0.0009 },
        price: {},
        stats: {},
      }),
    });
    expect(yieldDecimal).toBeCloseTo(0.0009, 5);
  });

  it('prefers ADR calculation over underlying listing when FX is available', async () => {
    const yieldDecimal = await resolveDividendYield({
      symbol: 'SKHY',
      summaryDetail: { trailingAnnualDividendRate: 2625 },
      price: { regularMarketPrice: 166.33 },
      stats: {},
      fetchFxRate: async () => 1350,
      fetchQuoteSummary: async () => ({
        summaryDetail: { dividendYield: 0.0009 },
        price: {},
        stats: {},
      }),
    });
    expect(yieldDecimal).toBeCloseTo(0.00117, 4);
  });
});
