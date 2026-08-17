import { describe, expect, it } from 'vitest';
import {
  chartPointsFromQuotes,
  clipToLastSession,
  period1ForRange,
} from '../src/yahoo/chart-range.js';

describe('period1ForRange', () => {
  it('pads 1d far enough that a Sunday still includes Friday\'s session', () => {
    const sunday = new Date('2026-08-16T22:00:00-04:00');
    const period1 = period1ForRange('1d', sunday);
    const fridayOpen = new Date('2026-08-14T09:30:00-04:00');
    expect(period1.getTime()).toBeLessThanOrEqual(fridayOpen.getTime());
    expect(sunday.getTime() - period1.getTime()).toBeGreaterThan(24 * 60 * 60 * 1000);
  });

  it('starts ytd at January 1 of the given year', () => {
    const now = new Date('2026-08-16T22:00:00-04:00');
    expect(period1ForRange('ytd', now)).toEqual(new Date(2026, 0, 1));
  });
});

describe('clipToLastSession', () => {
  it('keeps only the last session when quotes span two trading days', () => {
    const thursday = 1786641600;
    const fridayOpen = 1786714200;
    const points = [
      { t: thursday, close: 7795.29 },
      { t: thursday + 300, close: 7794.03 },
      { t: fridayOpen, close: 7803.21 },
      { t: fridayOpen + 300, close: 7803.05 },
    ];
    expect(clipToLastSession(points).map((point) => point.close)).toEqual([
      7803.21, 7803.05,
    ]);
  });

  it('returns a single session unchanged', () => {
    const fridayOpen = 1786714200;
    const points = [
      { t: fridayOpen, close: 7803.21 },
      { t: fridayOpen + 300, close: 7803.05 },
    ];
    expect(clipToLastSession(points)).toEqual(points);
  });
});

describe('chartPointsFromQuotes', () => {
  it('clips 1d quotes to the last session and leaves longer ranges intact', () => {
    const thursday = new Date('2026-08-13T13:20:00-04:00');
    const friday = new Date('2026-08-14T09:30:00-04:00');
    const quotes = [
      { date: thursday, close: 7795.29 },
      { date: friday, close: 7803.21 },
    ];

    expect(chartPointsFromQuotes(quotes, '1d').map((point) => point.close)).toEqual([
      7803.21,
    ]);
    expect(chartPointsFromQuotes(quotes, '5d')).toHaveLength(2);
  });
});
