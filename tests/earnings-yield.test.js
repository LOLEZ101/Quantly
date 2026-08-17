import { describe, expect, it } from 'vitest';
import {
  alignFinancialAmountsToQuoteCurrency,
  convertYahooAmount,
  earningsYieldFromComponents,
  enterpriseValueFromComponents,
  formatEarningsYield,
  marketCapFromQuote,
  preferredEquityFromPeriods,
  resolveEarningsYield,
} from '../src/yahoo/earnings-yield.js';

describe('enterpriseValueFromComponents', () => {
  it('adds preferred equity and net debt to market cap', () => {
    expect(
      enterpriseValueFromComponents({
        marketCap: 100,
        preferredEquity: 10,
        totalDebt: 40,
        totalCash: 15,
      }),
    ).toBe(135);
  });

  it('treats missing preferred and cash as zero', () => {
    expect(
      enterpriseValueFromComponents({
        marketCap: 100,
        totalDebt: 40,
      }),
    ).toBe(140);
  });

  it('returns null when market cap or debt is missing', () => {
    expect(
      enterpriseValueFromComponents({
        totalDebt: 40,
        totalCash: 10,
      }),
    ).toBeNull();
    expect(
      enterpriseValueFromComponents({
        marketCap: 100,
        totalCash: 10,
      }),
    ).toBeNull();
  });

  it('returns null when enterprise value is not positive', () => {
    expect(
      enterpriseValueFromComponents({
        marketCap: 10,
        totalDebt: 5,
        totalCash: 20,
      }),
    ).toBeNull();
  });
});

describe('earningsYieldFromComponents', () => {
  it('divides EBIT TTM by enterprise value', () => {
    expect(
      earningsYieldFromComponents({
        ebitTtm: 13.5,
        marketCap: 100,
        preferredEquity: 10,
        totalDebt: 40,
        totalCash: 15,
      }),
    ).toBeCloseTo(0.1, 10);
  });

  it('returns null when EBIT TTM is missing', () => {
    expect(
      earningsYieldFromComponents({
        marketCap: 100,
        totalDebt: 40,
      }),
    ).toBeNull();
  });
});

describe('preferredEquityFromPeriods', () => {
  it('uses the latest preferredStockEquity value', () => {
    expect(
      preferredEquityFromPeriods([
        { date: '2025-12-31', preferredStock: 4 },
        { date: '2026-03-31', preferredStockEquity: 12 },
      ]),
    ).toBe(12);
  });

  it('falls back to preferredStock when equity is missing', () => {
    expect(
      preferredEquityFromPeriods([{ date: '2026-03-31', preferredStock: 8 }]),
    ).toBe(8);
  });

  it('returns null when no preferred line exists', () => {
    expect(preferredEquityFromPeriods([{ date: '2026-03-31', netPPE: 1 }])).toBeNull();
  });
});

describe('convertYahooAmount', () => {
  it('converts TWD amounts into USD using a local-per-USD quote', () => {
    expect(convertYahooAmount(320, 'TWD', 'USD', { TWD: 32 })).toBe(10);
  });

  it('converts EUR amounts into USD using a USD-per-unit quote', () => {
    expect(convertYahooAmount(10, 'EUR', 'USD', { EUR: 1.1 })).toBeCloseTo(11, 10);
  });

  it('leaves amounts unchanged when currencies match', () => {
    expect(convertYahooAmount(50, 'USD', 'USD', {})).toBe(50);
  });
});

describe('alignFinancialAmountsToQuoteCurrency', () => {
  it('returns amounts unchanged when currencies match', async () => {
    const amounts = { ebitTtm: 10, totalDebt: 20 };
    await expect(
      alignFinancialAmountsToQuoteCurrency({
        amounts,
        financialCurrency: 'USD',
        quoteCurrency: 'USD',
        fetchFxRate: async () => 32,
      }),
    ).resolves.toEqual(amounts);
  });

  it('returns null when a required FX rate is missing', async () => {
    await expect(
      alignFinancialAmountsToQuoteCurrency({
        amounts: { ebitTtm: 320 },
        financialCurrency: 'TWD',
        quoteCurrency: 'USD',
        fetchFxRate: async () => null,
      }),
    ).resolves.toBeNull();
  });
});

describe('marketCapFromQuote', () => {
  it('prefers explicit marketCap fields', () => {
    expect(
      marketCapFromQuote({
        price: { marketCap: 100 },
        summaryDetail: { nonDilutedMarketCap: 90 },
      }),
    ).toBe(100);
  });

  it('falls back to nonDilutedMarketCap when marketCap is missing', () => {
    expect(
      marketCapFromQuote({
        summaryDetail: { nonDilutedMarketCap: 1097386149100 },
      }),
    ).toBe(1097386149100);
  });

  it('falls back to shares outstanding times price', () => {
    expect(
      marketCapFromQuote({
        price: { regularMarketPrice: 10 },
        stats: { sharesOutstanding: 5 },
      }),
    ).toBe(50);
  });
});

describe('resolveEarningsYield', () => {
  it('computes yield from quote modules without FX conversion', async () => {
    await expect(
      resolveEarningsYield({
        ebitTtm: 20,
        preferredEquity: 5,
        price: { marketCap: 100, currency: 'USD', financialCurrency: 'USD' },
        financialData: { totalDebt: 30, totalCash: 10 },
      }),
    ).resolves.toBeCloseTo(20 / 125, 10);
  });

  it('converts financial-currency inputs into the quote currency', async () => {
    await expect(
      resolveEarningsYield({
        ebitTtm: 320,
        preferredEquity: 0,
        price: { marketCap: 100, currency: 'USD', financialCurrency: 'TWD' },
        financialData: { totalDebt: 640, totalCash: 320 },
        fetchFxRate: async (currency) => (currency === 'TWD' ? 32 : null),
      }),
    ).resolves.toBeCloseTo(10 / 110, 10);
  });

  it('uses nonDilutedMarketCap when Yahoo omits marketCap', async () => {
    await expect(
      resolveEarningsYield({
        ebitTtm: 59294000000,
        price: { currency: 'USD', financialCurrency: 'USD' },
        summaryDetail: { nonDilutedMarketCap: 1097386149100 },
        financialData: { totalDebt: 6376000000, totalCash: 26022000640 },
      }),
    ).resolves.toBeCloseTo(59294000000 / (1097386149100 + 6376000000 - 26022000640), 10);
  });
});

describe('formatEarningsYield', () => {
  it('formats a decimal as a one-decimal percentage', () => {
    expect(formatEarningsYield(0.084)).toBe('8.4%');
  });

  it('formats missing values as a dash', () => {
    expect(formatEarningsYield(null)).toBe('—');
  });
});
