const DAY_MS = 24 * 60 * 60 * 1000;
const SESSION_GAP_MS = 6 * 60 * 60 * 1000;

const RANGE_MS = {
  // Pad past weekends/holidays so 1d still reaches the last regular session.
  '1d': 5 * DAY_MS,
  '5d': 7 * DAY_MS,
  '1mo': 31 * DAY_MS,
  '6mo': 183 * DAY_MS,
  '1y': 365 * DAY_MS,
  '5y': 5 * 365 * DAY_MS,
};

export function period1ForRange(range, now = new Date()) {
  if (range === 'ytd') {
    return new Date(now.getFullYear(), 0, 1);
  }
  if (range === 'max') {
    return new Date('1970-01-01T00:00:00.000Z');
  }
  const ms = RANGE_MS[range];
  if (!ms) {
    throw new Error(`Unsupported range: ${range}`);
  }
  return new Date(now.getTime() - ms);
}

export function clipToLastSession(points, gapMs = SESSION_GAP_MS) {
  if (!Array.isArray(points) || points.length < 2) {
    return points || [];
  }

  let start = 0;
  for (let i = 1; i < points.length; i += 1) {
    if (points[i].t * 1000 - points[i - 1].t * 1000 > gapMs) {
      start = i;
    }
  }
  return points.slice(start);
}

export function chartPointsFromQuotes(quotes, range) {
  const points = [];
  for (const quote of quotes || []) {
    if (quote?.date == null || quote.close == null) continue;
    const t = Math.floor(new Date(quote.date).getTime() / 1000);
    if (!Number.isFinite(t) || !Number.isFinite(quote.close)) continue;
    points.push({ t, close: quote.close });
  }

  return range === '1d' ? clipToLastSession(points) : points;
}
