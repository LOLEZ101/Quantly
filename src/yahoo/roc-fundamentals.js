export function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function periodTimestamp(period) {
  const date = period?.date;
  if (date instanceof Date) return date.getTime();
  if (typeof date === 'number' && Number.isFinite(date)) {
    return date < 1e12 ? date * 1000 : date;
  }
  if (typeof date === 'string') {
    const parsed = Date.parse(date);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function ebitFromPeriod(period) {
  const ebit = finiteNumber(period?.EBIT);
  const operatingIncome = finiteNumber(period?.operatingIncome);
  if (operatingIncome != null && ebit != null && ebit < 0 && operatingIncome > 0) {
    return operatingIncome;
  }
  return ebit ?? operatingIncome;
}

export function workingCapitalFromPeriod(period) {
  const workingCapital = finiteNumber(period?.workingCapital);
  if (workingCapital != null) return workingCapital;
  const currentAssets = finiteNumber(period?.currentAssets);
  const currentLiabilities = finiteNumber(period?.currentLiabilities);
  if (currentAssets != null && currentLiabilities != null) {
    return currentAssets - currentLiabilities;
  }
  return null;
}

export function tangibleCapitalFromPeriod(period) {
  const netFixedAssets = finiteNumber(period?.netPPE);
  const netWorkingCapital = workingCapitalFromPeriod(period);
  if (netFixedAssets == null || netWorkingCapital == null) return null;
  return netFixedAssets + netWorkingCapital;
}

export function mergeFundamentalsPeriods(groups) {
  /** @type {Map<number, Record<string, unknown>>} */
  const byTimestamp = new Map();
  for (const periods of groups) {
    for (const period of periods || []) {
      const timestamp = periodTimestamp(period);
      const existing = byTimestamp.get(timestamp) || { date: period.date };
      byTimestamp.set(timestamp, { ...existing, ...period });
    }
  }
  return [...byTimestamp.values()];
}

export function timeseriesFieldName(dataKey) {
  const short = String(dataKey || '').replace(/^(annual|quarterly|trailing)/, '');
  if (!short) return short;
  if (short === short.toUpperCase()) return short;
  return short[0].toLowerCase() + short.slice(1);
}

export function parseYahooTimeseries(data) {
  const byTimestamp = new Map();
  const results = data?.timeseries?.result || [];

  for (const series of results) {
    const timestamps = series.timestamp || [];
    const dataKey = Object.keys(series).find(
      (key) => key !== 'meta' && key !== 'timestamp',
    );
    if (!dataKey) continue;

    const points = series[dataKey] || [];
    const field = timeseriesFieldName(dataKey);

    for (let i = 0; i < Math.max(timestamps.length, points.length); i += 1) {
      const point = points[i];
      const raw = point?.reportedValue?.raw;
      if (raw == null || !Number.isFinite(raw)) continue;
      let timestamp = timestamps[i];
      if (timestamp == null && point?.asOfDate) {
        timestamp = Math.floor(new Date(point.asOfDate).getTime() / 1000);
      }
      if (timestamp == null) continue;
      const existing = byTimestamp.get(timestamp) || { date: timestamp };
      existing[field] = raw;
      byTimestamp.set(timestamp, existing);
    }
  }

  return [...byTimestamp.values()];
}

function sortPeriodsDesc(periods) {
  return [...(periods || [])].sort(
    (a, b) => periodTimestamp(b) - periodTimestamp(a),
  );
}

function emptyRocResult() {
  return {
    roc: null,
    ebitTtm: null,
    netWorkingCapital: null,
    netFixedAssets: null,
    tangibleCapital: null,
  };
}

/**
 * Greenblatt ROC (TTM) = EBIT_TTM / (Net Working Capital + Net Fixed Assets)
 * EBIT_TTM: sum of last 4 complete quarters
 * Capital: latest quarter with netPPE and working capital
 */
export function computeRocFromQuarterly(periods) {
  const sorted = sortPeriodsDesc(periods);
  const incomePeriods = sorted.filter((period) => ebitFromPeriod(period) != null);
  const capitalPeriods = sorted.filter(
    (period) => tangibleCapitalFromPeriod(period) != null,
  );

  const last4 = incomePeriods.slice(0, 4);
  if (last4.length < 4) return emptyRocResult();

  const ebitTtm = last4.reduce((sum, period) => sum + ebitFromPeriod(period), 0);

  const latestCapital = capitalPeriods[0];
  if (!latestCapital) return { ...emptyRocResult(), ebitTtm };

  const netFixedAssets = finiteNumber(latestCapital.netPPE);
  const netWorkingCapital = workingCapitalFromPeriod(latestCapital);
  const tangibleCapital = tangibleCapitalFromPeriod(latestCapital);

  if (
    netFixedAssets == null ||
    netWorkingCapital == null ||
    tangibleCapital == null ||
    !Number.isFinite(tangibleCapital) ||
    Math.abs(tangibleCapital) < 1e-9
  ) {
    return { ...emptyRocResult(), ebitTtm };
  }

  return {
    roc: ebitTtm / tangibleCapital,
    ebitTtm,
    netWorkingCapital,
    netFixedAssets,
    tangibleCapital,
  };
}
