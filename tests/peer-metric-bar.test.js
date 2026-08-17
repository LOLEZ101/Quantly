import { describe, expect, it } from 'vitest';
import {
  barLayout,
  barPositionPct,
  barWidthPct,
  overallLeaderboard,
  peerBarScale,
  rankPeerRows,
  zeroBaselinePct,
} from '../src/peer-demo/peer-metric-bar.js';

describe('peerBarScale', () => {
  it('scales all-positive values from zero to the max', () => {
    expect(peerBarScale([0.02, 0.05, 0.04])).toEqual({
      min: 0,
      max: 0.05,
      span: 0.05,
    });
  });

  it('extends through zero when values include negatives', () => {
    expect(peerBarScale([-0.02, 0.06])).toEqual({
      min: -0.02,
      max: 0.06,
      span: 0.08,
    });
  });

  it('ignores nullish and non-finite values', () => {
    expect(peerBarScale([null, 0.04, undefined, Number.NaN])).toEqual({
      min: 0,
      max: 0.04,
      span: 0.04,
    });
  });

  it('returns a zero span when nothing finite is present', () => {
    expect(peerBarScale([null, undefined])).toEqual({
      min: 0,
      max: 0,
      span: 0,
    });
  });
});

describe('barWidthPct', () => {
  it('returns percent of max for all-positive sets', () => {
    const scale = peerBarScale([0.02, 0.05, 0.04]);
    expect(barWidthPct(0.05, scale)).toBe(100);
    expect(barWidthPct(0.025, scale)).toBe(50);
    expect(barWidthPct(0.02, scale)).toBe(40);
  });

  it('returns null for missing values so no bar is drawn', () => {
    const scale = peerBarScale([0.05]);
    expect(barWidthPct(null, scale)).toBeNull();
    expect(barWidthPct(undefined, scale)).toBeNull();
    expect(barWidthPct(Number.NaN, scale)).toBeNull();
  });

  it('returns 0 for a zero value', () => {
    const scale = peerBarScale([0, 0.05]);
    expect(barWidthPct(0, scale)).toBe(0);
  });
});

describe('barPositionPct', () => {
  it('places the median on the same axis as bar length', () => {
    const scale = peerBarScale([0.02, 0.05, 0.04]);
    expect(barPositionPct(0.05, scale)).toBe(100);
    expect(barPositionPct(0.025, scale)).toBe(50);
    expect(barPositionPct(0.02, scale)).toBe(40);
  });

  it('returns null when the value or scale cannot be drawn', () => {
    expect(barPositionPct(null, peerBarScale([0.05]))).toBeNull();
    expect(barPositionPct(0.05, peerBarScale([null]))).toBeNull();
  });
});

describe('mixed-sign zero baseline', () => {
  it('places positives to the right of the zero baseline', () => {
    const scale = peerBarScale([-0.02, 0.06]);
    expect(zeroBaselinePct(scale)).toBeCloseTo(25);
    const layout = barLayout(0.06, scale);
    expect(layout.startPct).toBeCloseTo(25);
    expect(layout.widthPct).toBeCloseTo(75);
    expect(layout.negative).toBe(false);
  });

  it('places negatives to the left of the zero baseline', () => {
    const scale = peerBarScale([-0.02, 0.06]);
    const layout = barLayout(-0.02, scale);
    expect(layout.startPct).toBeCloseTo(0);
    expect(layout.widthPct).toBeCloseTo(25);
    expect(layout.negative).toBe(true);
  });

  it('omits the zero line when every value is non-negative', () => {
    expect(zeroBaselinePct(peerBarScale([0.01, 0.04]))).toBeNull();
  });
});

describe('rankPeerRows', () => {
  const rows = [
    { company: { ticker: 'VZ' }, metrics: { earningsYield: 0.052, roc: 0.11 } },
    { company: { ticker: 'T' }, metrics: { earningsYield: 0.071, roc: null } },
    { company: { ticker: 'TMUS' }, metrics: { earningsYield: 0.041, roc: 0.18 } },
  ];

  it('orders companies by the active metric, highest first', () => {
    expect(rankPeerRows(rows, 'earningsYield').map((row) => row.company.ticker)).toEqual([
      'T',
      'VZ',
      'TMUS',
    ]);
    expect(rankPeerRows(rows, 'roc').map((row) => row.company.ticker)).toEqual([
      'TMUS',
      'VZ',
      'T',
    ]);
  });

  it('numbers ranks from 1 in that sorted order', () => {
    expect(rankPeerRows(rows, 'earningsYield').map((row) => row.rank)).toEqual([1, 2, 3]);
  });

  it('keeps missing values at the bottom and remembers the original index', () => {
    const ranked = rankPeerRows(rows, 'roc');
    expect(ranked[2].company.ticker).toBe('T');
    expect(ranked[2].sourceIndex).toBe(1);
  });
});

describe('overallLeaderboard', () => {
  const rows = [
    {
      company: { ticker: 'LMT' },
      metrics: { earningsYield: 0.05, roc: 0.1, dividendYield: 0.03 },
    },
    {
      company: { ticker: 'NOC' },
      metrics: { earningsYield: 0.08, roc: 0.2, dividendYield: 0.01 },
    },
    {
      company: { ticker: 'GD' },
      metrics: { earningsYield: 0.06, roc: 0.15, dividendYield: 0.02 },
    },
  ];

  it('sorts by combined rank sum, lowest first', () => {
    const ranked = overallLeaderboard(rows);
    expect(ranked.map((row) => row.company.ticker)).toEqual(['NOC', 'GD', 'LMT']);
    expect(ranked.map((row) => row.rankSum)).toEqual([5, 6, 7]);
    expect(ranked.map((row) => row.rank)).toEqual([1, 2, 3]);
  });

  it('breaks ties with the higher earnings yield', () => {
    const tied = [
      {
        company: { ticker: 'A' },
        metrics: { earningsYield: 0.09, roc: 0.15, dividendYield: 0.01 },
      },
      {
        company: { ticker: 'B' },
        metrics: { earningsYield: 0.06, roc: 0.1, dividendYield: 0.03 },
      },
      {
        company: { ticker: 'C' },
        metrics: { earningsYield: 0.03, roc: 0.25, dividendYield: 0.02 },
      },
    ];
    const ranked = overallLeaderboard(tied);
    expect(ranked.map((row) => row.rankSum)).toEqual([6, 6, 6]);
    expect(ranked.map((row) => row.company.ticker)).toEqual(['A', 'B', 'C']);
  });
});
