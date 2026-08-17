import { describe, expect, it } from 'vitest';
import {
  computeRocFromQuarterly,
  ebitFromPeriod,
  tangibleCapitalFromPeriod,
  workingCapitalFromPeriod,
} from '../src/yahoo/roc-fundamentals.js';

function balancePeriod({
  date,
  netPPE,
  workingCapital,
  currentAssets,
  currentLiabilities,
}) {
  return {
    date,
    netPPE,
    workingCapital,
    currentAssets,
    currentLiabilities,
  };
}

function incomePeriod({ date, ebit, operatingIncome }) {
  return {
    date,
    EBIT: ebit,
    operatingIncome,
  };
}

describe('workingCapitalFromPeriod', () => {
  it('uses direct workingCapital when present', () => {
    expect(workingCapitalFromPeriod({ workingCapital: 7251000000 })).toBe(
      7251000000,
    );
  });

  it('falls back to currentAssets minus currentLiabilities', () => {
    expect(
      workingCapitalFromPeriod({
        currentAssets: 9168000000,
        currentLiabilities: 1917000000,
      }),
    ).toBe(7251000000);
  });
});

describe('tangibleCapitalFromPeriod', () => {
  it('sums netPPE and net working capital', () => {
    expect(
      tangibleCapitalFromPeriod({
        netPPE: 649000000,
        workingCapital: 7251000000,
      }),
    ).toBe(7900000000);
  });
});

describe('ebitFromPeriod', () => {
  it('uses operating income when EBIT is negative but operating income is positive', () => {
    expect(
      ebitFromPeriod({
        EBIT: -1416000000,
        operatingIncome: 507000000,
      }),
    ).toBe(507000000);
  });
});

describe('computeRocFromQuarterly', () => {
  it('returns null when fewer than four income quarters exist', () => {
    expect(
      computeRocFromQuarterly([
        incomePeriod({ date: '2026-03-31', ebit: 100 }),
        balancePeriod({
          date: '2026-03-31',
          netPPE: 100,
          workingCapital: 200,
        }),
      ]).roc,
    ).toBeNull();
  });

  it('returns null when no balance sheet capital exists', () => {
    expect(
      computeRocFromQuarterly([
        incomePeriod({ date: '2026-03-31', ebit: 100 }),
        incomePeriod({ date: '2025-12-31', ebit: 100 }),
        incomePeriod({ date: '2025-09-30', ebit: 100 }),
        incomePeriod({ date: '2025-06-30', ebit: 100 }),
      ]).roc,
    ).toBeNull();
  });

  it('still returns EBIT TTM when ROC capital is missing', () => {
    const result = computeRocFromQuarterly([
      incomePeriod({ date: '2026-03-31', ebit: 100 }),
      incomePeriod({ date: '2025-12-31', ebit: 100 }),
      incomePeriod({ date: '2025-09-30', ebit: 100 }),
      incomePeriod({ date: '2025-06-30', ebit: 100 }),
    ]);
    expect(result.roc).toBeNull();
    expect(result.ebitTtm).toBe(400);
  });

  it('skips incomplete income quarters and computes positive SNDK-like ROC', () => {
    const periods = [
      incomePeriod({ date: '2026-06-30', ebit: undefined }),
      incomePeriod({ date: '2026-03-31', ebit: 4113000000 }),
      incomePeriod({ date: '2025-12-31', ebit: 962000000 }),
      incomePeriod({ date: '2025-09-30', ebit: 164000000 }),
      incomePeriod({ date: '2025-06-30', ebit: 23000000 }),
      balancePeriod({
        date: '2026-03-31',
        netPPE: 649000000,
        workingCapital: 7251000000,
      }),
    ];

    const result = computeRocFromQuarterly(periods);
    expect(result.ebitTtm).toBe(5262000000);
    expect(result.tangibleCapital).toBe(7900000000);
    expect(result.roc).toBeGreaterThan(0);
    expect(result.roc).toBeCloseTo(0.666, 2);
  });
});
