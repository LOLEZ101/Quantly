import { describe, expect, it } from 'vitest';
import {
  BAND_LABELS,
  METRIC_CLASSIFY_OPTIONS,
  SPREAD_FLOORS,
  bandFromScore,
  classifyPeerColumn,
  finiteMetricValues,
  mad,
  median,
  robustCenterAndSpread,
  scoreAgainstPeers,
} from '../src/peer-demo/peer-metric-scale.js';

describe('finiteMetricValues', () => {
  it('keeps finite numbers and drops nullish or invalid values', () => {
    expect(
      finiteMetricValues([0.052, null, undefined, Number.NaN, Infinity, '0.1', 0.016]),
    ).toEqual([0.052, 0.016]);
  });

  it('returns an empty array for non-arrays', () => {
    expect(finiteMetricValues(null)).toEqual([]);
  });
});

describe('median', () => {
  it('returns the middle value for an odd set', () => {
    expect(median([0.06, 0.035, 0.052])).toBe(0.052);
  });

  it('averages the two middle values for an even set', () => {
    expect(median([0.013, 0.016, 0.017, 0.023])).toBeCloseTo(0.0165);
  });

  it('ignores non-finite values when finding the median', () => {
    expect(median([0.035, null, 0.052, Number.NaN, 0.06])).toBe(0.052);
  });

  it('returns null when nothing finite is present', () => {
    expect(median([null, Number.NaN])).toBeNull();
  });
});

describe('mad and robust spread', () => {
  it('computes the median absolute deviation from the median', () => {
    expect(mad([1, 2, 3, 4, 5])).toBe(1);
  });

  it('uses the metric floor when MAD is tiny', () => {
    const stats = robustCenterAndSpread([0.016, 0.016, 0.017, 0.017], {
      floor: SPREAD_FLOORS.dividendYield,
    });
    expect(stats.center).toBeCloseTo(0.0165);
    expect(stats.spread).toBeLessThan(SPREAD_FLOORS.dividendYield);
    expect(stats.effectiveSpread).toBe(SPREAD_FLOORS.dividendYield);
  });

  it('keeps the MAD spread when it is already wider than the floor', () => {
    const stats = robustCenterAndSpread([0.2, 0.365, 0.41, 0.534, 0.604, 0.66], {
      floor: SPREAD_FLOORS.roc,
    });
    expect(stats.effectiveSpread).toBeGreaterThan(SPREAD_FLOORS.roc);
    expect(stats.effectiveSpread).toBe(stats.spread);
  });
});

describe('bandFromScore', () => {
  it('maps robust scores onto the five qualitative labels', () => {
    expect(bandFromScore(-1.51)).toBe(BAND_LABELS.veryLow);
    expect(bandFromScore(-1.5)).toBe(BAND_LABELS.low);
    expect(bandFromScore(-0.51)).toBe(BAND_LABELS.low);
    expect(bandFromScore(-0.5)).toBe(BAND_LABELS.typical);
    expect(bandFromScore(0)).toBe(BAND_LABELS.typical);
    expect(bandFromScore(0.5)).toBe(BAND_LABELS.typical);
    expect(bandFromScore(0.51)).toBe(BAND_LABELS.high);
    expect(bandFromScore(1.5)).toBe(BAND_LABELS.high);
    expect(bandFromScore(1.51)).toBe(BAND_LABELS.veryHigh);
  });
});

describe('classifyPeerColumn', () => {
  it('keeps a tight dividend cluster as TYPICAL because of the spread floor', () => {
    const values = [0.016, 0.016, 0.017, 0.017];
    const results = classifyPeerColumn(values, METRIC_CLASSIFY_OPTIONS.dividendYield);
    expect(results.map((row) => row.label)).toEqual([
      BAND_LABELS.typical,
      BAND_LABELS.typical,
      BAND_LABELS.typical,
      BAND_LABELS.typical,
    ]);
    expect(results[0].effectiveSpread).toBe(SPREAD_FLOORS.dividendYield);
  });

  it('classifies dividend yield only among payers and labels zeros as NO DIVIDEND', () => {
    const values = [0, 0, 0.016, 0.017, 0.023, null];
    const results = classifyPeerColumn(values, METRIC_CLASSIFY_OPTIONS.dividendYield);

    expect(results.map((row) => row.label)).toEqual([
      BAND_LABELS.noDividend,
      BAND_LABELS.noDividend,
      BAND_LABELS.typical,
      BAND_LABELS.typical,
      BAND_LABELS.high,
      BAND_LABELS.noDividend,
    ]);
    expect(results[0].center).toBeCloseTo(0.017);
    expect(results[0].peerCount).toBe(3);
    expect(results[0].detail).toBe('Does not pay a dividend.');
  });

  it('treats a failed fetch as missing instead of NO DIVIDEND', () => {
    const results = classifyPeerColumn(
      [undefined, 0.016, 0.017],
      METRIC_CLASSIFY_OPTIONS.dividendYield,
    );
    expect(results[0].label).toBeNull();
    expect(results[1].label).toBe(BAND_LABELS.typical);
  });

  it('labels negative ROC as NEGATIVE even when the robust score is high', () => {
    const values = [-0.02, -0.08, -0.12, -0.18];
    const results = classifyPeerColumn(values, METRIC_CLASSIFY_OPTIONS.roc);
    expect(results.every((row) => row.label === BAND_LABELS.negative)).toBe(true);
    expect(results[0].band).toBe(BAND_LABELS.high);
    expect(results[0].detail).toMatch(/below zero/i);
    expect(results[0].detail).toMatch(/better than most peers/i);
  });

  it('labels negative earnings yield as NEGATIVE', () => {
    const values = [-0.01, 0.04, 0.05, 0.06];
    const results = classifyPeerColumn(values, METRIC_CLASSIFY_OPTIONS.earningsYield);
    expect(results[0].label).toBe(BAND_LABELS.negative);
    expect(results[1].label).not.toBe(BAND_LABELS.negative);
  });

  it('does not emit VERY LOW or VERY HIGH for small peer groups unless the score is extreme', () => {
    const values = [0.035, 0.05, 0.052];
    const results = classifyPeerColumn(values, METRIC_CLASSIFY_OPTIONS.earningsYield);
    expect(results[0].peerCount).toBe(3);
    expect(results[0].score).toBeLessThan(-1.5);
    expect(Math.abs(results[0].score)).toBeLessThan(2.5);
    expect(results[0].label).toBe(BAND_LABELS.low);
    expect(results[0].band).toBe(BAND_LABELS.low);
  });

  it('keeps VERY HIGH in a small group when the score is clearly extreme', () => {
    const values = [0.04, 0.041, 0.2];
    const results = classifyPeerColumn(values, METRIC_CLASSIFY_OPTIONS.earningsYield);
    expect(results[2].peerCount).toBe(3);
    expect(results[2].score).toBeGreaterThanOrEqual(2.5);
    expect(results[2].label).toBe(BAND_LABELS.veryHigh);
  });

  it('uses independent floors so earnings yield and ROC do not share a scale', () => {
    const earnings = classifyPeerColumn(
      [0.05, 0.052, 0.054],
      METRIC_CLASSIFY_OPTIONS.earningsYield,
    );
    const roc = classifyPeerColumn(
      [0.36, 0.365, 0.37],
      METRIC_CLASSIFY_OPTIONS.roc,
    );

    expect(METRIC_CLASSIFY_OPTIONS.earningsYield.floor).toBe(SPREAD_FLOORS.earningsYield);
    expect(METRIC_CLASSIFY_OPTIONS.roc.floor).toBe(SPREAD_FLOORS.roc);
    expect(earnings[0].effectiveSpread).toBe(SPREAD_FLOORS.earningsYield);
    expect(roc[0].effectiveSpread).toBe(SPREAD_FLOORS.roc);
    expect(scoreAgainstPeers(0.052, earnings[0])).not.toBeCloseTo(
      scoreAgainstPeers(0.052, roc[0]),
    );
  });

  it('classifies the Defense Primes earnings yield and dividend yield sanity set', () => {
    const earnings = classifyPeerColumn(
      [0.059, 0.045, 0.054, 0.06, 0.035, 0.052],
      METRIC_CLASSIFY_OPTIONS.earningsYield,
    );
    expect(earnings.map((row) => row.label)).toEqual([
      BAND_LABELS.high,
      BAND_LABELS.low,
      BAND_LABELS.typical,
      BAND_LABELS.high,
      BAND_LABELS.veryLow,
      BAND_LABELS.typical,
    ]);
    expect(earnings[0].detail).toMatch(/above peer median/);

    const dividends = classifyPeerColumn(
      [0.017, 0.017, 0.023, 0.016, 0.013, 0.016],
      METRIC_CLASSIFY_OPTIONS.dividendYield,
    );
    expect(dividends.map((row) => row.label)).toEqual([
      BAND_LABELS.typical,
      BAND_LABELS.typical,
      BAND_LABELS.veryHigh,
      BAND_LABELS.typical,
      BAND_LABELS.low,
      BAND_LABELS.typical,
    ]);
  });

  it('returns a missing result when a value is not finite', () => {
    const results = classifyPeerColumn(
      [null, 0.05, 0.052],
      METRIC_CLASSIFY_OPTIONS.earningsYield,
    );
    expect(results[0].label).toBeNull();
    expect(results[0].detail).toBeNull();
    expect(results[1].label).toBe(BAND_LABELS.typical);
  });
});
