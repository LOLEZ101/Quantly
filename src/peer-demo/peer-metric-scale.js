export const MAD_TO_SIGMA = 1.4826;

export const SPREAD_FLOORS = {
  earningsYield: 0.0075,
  dividendYield: 0.0025,
  roc: 0.05,
};

export const MIN_PEERS_FOR_EXTREME = 4;
export const SMALL_N_EXTREME_SCORE = 2.5;

export const BAND_LABELS = {
  veryLow: 'VERY LOW',
  low: 'LOW',
  typical: 'TYPICAL',
  high: 'HIGH',
  veryHigh: 'VERY HIGH',
  negative: 'NEGATIVE',
  noDividend: 'NO DIVIDEND',
};

const RELATIVE_PERCENT_CAP = 500;

export function finiteMetricValues(values) {
  if (!Array.isArray(values)) return [];
  return values.filter((value) => typeof value === 'number' && Number.isFinite(value));
}

export function median(values) {
  const sorted = finiteMetricValues(values).slice().sort((a, b) => a - b);
  if (sorted.length === 0) return null;

  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

export function mad(values) {
  const finite = finiteMetricValues(values);
  const center = median(finite);
  if (center == null) return null;
  return median(finite.map((value) => Math.abs(value - center)));
}

export function robustCenterAndSpread(values, { floor = 0 } = {}) {
  const finite = finiteMetricValues(values);
  const center = median(finite);
  const absDev = mad(finite);
  const spread = absDev == null ? 0 : MAD_TO_SIGMA * absDev;
  const minFloor = typeof floor === 'number' && Number.isFinite(floor) && floor > 0 ? floor : 0;

  return {
    center,
    spread,
    effectiveSpread: Math.max(spread, minFloor),
  };
}

export function scoreAgainstPeers(value, { center, effectiveSpread } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (center == null || !Number.isFinite(center)) return null;
  if (effectiveSpread == null || !Number.isFinite(effectiveSpread) || effectiveSpread === 0) {
    return 0;
  }
  return (value - center) / effectiveSpread;
}

export function bandFromScore(score) {
  if (typeof score !== 'number' || !Number.isFinite(score)) return null;
  if (score < -1.5) return BAND_LABELS.veryLow;
  if (score < -0.5) return BAND_LABELS.low;
  if (score <= 0.5) return BAND_LABELS.typical;
  if (score <= 1.5) return BAND_LABELS.high;
  return BAND_LABELS.veryHigh;
}

export function clampExtremeBand(band, score, smallNExtremeScore = SMALL_N_EXTREME_SCORE) {
  const extremeEnough =
    typeof score === 'number' &&
    Number.isFinite(score) &&
    Math.abs(score) >= smallNExtremeScore;

  if (extremeEnough) return band;
  if (band === BAND_LABELS.veryLow) return BAND_LABELS.low;
  if (band === BAND_LABELS.veryHigh) return BAND_LABELS.high;
  return band;
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function normalizeOverride(result) {
  if (result == null) return null;
  if (typeof result === 'string') return { label: result };
  if (typeof result.label === 'string' && result.label) return result;
  return null;
}

function sentenceCase(text) {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function relativeDetail(value, center, effectiveSpread, band) {
  if (!isFiniteNumber(value) || !isFiniteNumber(center)) return null;
  if (band === BAND_LABELS.typical) return 'in line with peer median';

  const delta = value - center;
  const absCenter = Math.abs(center);
  const canUseRelative =
    absCenter > 0 &&
    isFiniteNumber(effectiveSpread) &&
    absCenter >= effectiveSpread;

  if (canUseRelative) {
    const pct = Math.round(Math.abs(delta / absCenter) * 100);
    if (pct === 0) return 'in line with peer median';
    if (pct > RELATIVE_PERCENT_CAP) {
      return percentagePointDetail(delta);
    }
    const dir = delta >= 0 ? 'above' : 'below';
    return `${pct}% ${dir} peer median`;
  }

  return percentagePointDetail(delta);
}

function percentagePointDetail(delta) {
  const pp = Math.abs(delta) * 100;
  if (!Number.isFinite(pp) || pp < 0.05) return 'in line with peer median';
  const formatted = pp.toLocaleString('en-US', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  const dir = delta >= 0 ? 'above' : 'below';
  return `${formatted} pp ${dir} peer median`;
}

function semanticDetail(label, score, metricNoun) {
  if (label === BAND_LABELS.noDividend) return 'Does not pay a dividend.';
  if (label !== BAND_LABELS.negative) return null;

  const noun = metricNoun || 'this metric';
  if (typeof score === 'number' && Number.isFinite(score)) {
    if (score > 0.5) {
      return `Better than most peers, but ${noun} remains below zero.`;
    }
    if (score < -0.5) {
      return `Worse than most peers; ${noun} is below zero.`;
    }
  }
  return `${sentenceCase(noun)} remains below zero.`;
}

function emptyStats(floor = 0) {
  const minFloor = typeof floor === 'number' && Number.isFinite(floor) && floor > 0 ? floor : 0;
  return { center: null, spread: 0, effectiveSpread: minFloor };
}

function missingResult(value, stats, peerCount) {
  return {
    value: value === undefined ? null : value,
    label: null,
    band: null,
    score: null,
    center: stats.center,
    spread: stats.spread,
    effectiveSpread: stats.effectiveSpread,
    detail: null,
    peerCount,
  };
}

export function classifyPeerColumn(values, options = {}) {
  const {
    floor = 0,
    includeInPeers = isFiniteNumber,
    override = () => null,
    minPeersForExtreme = MIN_PEERS_FOR_EXTREME,
    smallNExtremeScore = SMALL_N_EXTREME_SCORE,
    metricNoun = 'this metric',
  } = options;

  const input = Array.isArray(values) ? values : [];
  const peerValues = input.filter(includeInPeers);
  const stats = peerValues.length
    ? robustCenterAndSpread(peerValues, { floor })
    : emptyStats(floor);
  const peerCount = peerValues.length;

  return input.map((value) => {
    const semantic = normalizeOverride(override(value));
    const finite = isFiniteNumber(value);

    if (!finite && !semantic) {
      return missingResult(value, stats, peerCount);
    }

    const score = finite ? scoreAgainstPeers(value, stats) : null;
    let band = score == null ? null : bandFromScore(score);
    if (band && peerCount < minPeersForExtreme) {
      band = clampExtremeBand(band, score, smallNExtremeScore);
    }

    const label = semantic?.label || band;
    const detail =
      semantic?.detail ||
      (semantic
        ? semanticDetail(semantic.label, score, metricNoun)
        : relativeDetail(value, stats.center, stats.effectiveSpread, band));

    return {
      value: finite ? value : value ?? null,
      label,
      band,
      score,
      center: stats.center,
      spread: stats.spread,
      effectiveSpread: stats.effectiveSpread,
      detail,
      peerCount,
    };
  });
}

function negativeOverride(value) {
  if (isFiniteNumber(value) && value < 0) return BAND_LABELS.negative;
  return null;
}

export const METRIC_CLASSIFY_OPTIONS = {
  earningsYield: {
    floor: SPREAD_FLOORS.earningsYield,
    metricNoun: 'earnings yield',
    override: negativeOverride,
  },
  roc: {
    floor: SPREAD_FLOORS.roc,
    metricNoun: 'ROC',
    override: negativeOverride,
  },
  dividendYield: {
    floor: SPREAD_FLOORS.dividendYield,
    includeInPeers: (value) => isFiniteNumber(value) && value > 0,
    override(value) {
      if (value === undefined) return null;
      if (value == null || (isFiniteNumber(value) && value <= 0)) {
        return BAND_LABELS.noDividend;
      }
      return null;
    },
  },
};
