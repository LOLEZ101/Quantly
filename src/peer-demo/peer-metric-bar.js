import { finiteMetricValues } from './peer-metric-scale.js';

export function peerBarScale(values) {
  const finite = finiteMetricValues(values);
  if (finite.length === 0) {
    return { min: 0, max: 0, span: 0 };
  }

  const min = Math.min(0, ...finite);
  const max = Math.max(0, ...finite);
  return { min, max, span: max - min };
}

export function zeroBaselinePct(scale) {
  if (!scale || !(scale.span > 0) || !(scale.min < 0)) return null;
  return (-scale.min / scale.span) * 100;
}

export function barLayout(value, scale) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;

  const span = scale?.span ?? 0;
  const min = scale?.min ?? 0;
  if (span <= 0 || value === 0) {
    return { startPct: 0, widthPct: 0, negative: value < 0 };
  }

  const start = value < 0 ? value - min : -min;
  return {
    startPct: (start / span) * 100,
    widthPct: (Math.abs(value) / span) * 100,
    negative: value < 0,
  };
}

export function barWidthPct(value, scale) {
  const layout = barLayout(value, scale);
  return layout ? layout.widthPct : null;
}

export function barPositionPct(value, scale) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const span = scale?.span ?? 0;
  if (!(span > 0)) return null;
  const min = scale.min ?? 0;
  return Math.min(100, Math.max(0, ((value - min) / span) * 100));
}

function isFiniteMetric(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

export const LEADERBOARD_METRIC_KEYS = [
  'earningsYield',
  'roc',
  'dividendYield',
];

export function overallLeaderboard(
  results,
  metricKeys = LEADERBOARD_METRIC_KEYS,
) {
  if (!Array.isArray(results) || results.length === 0) return [];

  const byTicker = new Map();
  for (const [sourceIndex, row] of results.entries()) {
    byTicker.set(row.company?.ticker, {
      company: row.company,
      metrics: row.metrics,
      sourceIndex,
      ranks: {},
      rankSum: 0,
    });
  }

  for (const key of metricKeys) {
    for (const ranked of rankPeerRows(results, key)) {
      const entry = byTicker.get(ranked.company.ticker);
      if (!entry) continue;
      entry.ranks[key] = ranked.rank;
      entry.rankSum += ranked.rank;
    }
  }

  const ordered = [...byTicker.values()].sort((a, b) => {
    if (a.rankSum !== b.rankSum) return a.rankSum - b.rankSum;
    const aEy = a.metrics?.earningsYield;
    const bEy = b.metrics?.earningsYield;
    const aOk = isFiniteMetric(aEy);
    const bOk = isFiniteMetric(bEy);
    if (aOk && bOk && aEy !== bEy) return bEy - aEy;
    if (aOk !== bOk) return aOk ? -1 : 1;
    return (a.company?.ticker || '').localeCompare(b.company?.ticker || '');
  });

  const maxSum = metricKeys.length * ordered.length;
  return ordered.map((row, index) => ({
    company: row.company,
    metrics: row.metrics,
    sourceIndex: index,
    rank: index + 1,
    rankSum: row.rankSum,
    ranks: row.ranks,
    overallScore: maxSum - row.rankSum,
  }));
}

export function rankPeerRows(results, metricKey) {
  if (!Array.isArray(results)) return [];

  return results
    .map((row, sourceIndex) => ({ row, sourceIndex }))
    .sort((a, b) => {
      const aVal = a.row.metrics?.[metricKey];
      const bVal = b.row.metrics?.[metricKey];
      const aOk = isFiniteMetric(aVal);
      const bOk = isFiniteMetric(bVal);
      if (aOk && bOk && aVal !== bVal) return bVal - aVal;
      if (aOk !== bOk) return aOk ? -1 : 1;
      const aTicker = a.row.company?.ticker || '';
      const bTicker = b.row.company?.ticker || '';
      return aTicker.localeCompare(bTicker);
    })
    .map(({ row, sourceIndex }, index) => ({
      company: row.company,
      metrics: row.metrics,
      sourceIndex,
      rank: index + 1,
    }));
}
