import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Filler,
  Tooltip,
} from 'chart.js';
import quantreeHierarchy from './peer-demo/quantree-hierarchy.json';

const MAX_CATEGORY_PEERS = 5;
const MAX_SEARCH_RESULTS = 10;

const INDEX_CONSTITUENT = {
  symbol: '^GSPC',
  name: 'S&P 500',
  yahooSymbol: '^GSPC',
};

/** @type {{ symbol: string, name: string, yahooSymbol?: string }[]} */
let constituents = [INDEX_CONSTITUENT];

function normalizeTicker(ticker) {
  return String(ticker || '')
    .trim()
    .toUpperCase()
    .replace(/\./g, '-');
}

function yahooSymbolFor(item) {
  return item.yahooSymbol || normalizeTicker(item.symbol);
}

function buildCategoryIndex(companies) {
  const byTicker = new Map();
  const byCategory = new Map();

  for (const company of companies) {
    const ticker = normalizeTicker(company.ticker);
    const entry = {
      ticker,
      display_name: company.name,
      sector: company.sector,
      category: company.category,
    };
    byTicker.set(ticker, entry);

    const list = byCategory.get(company.category) || [];
    list.push(entry);
    byCategory.set(company.category, list);
  }

  for (const list of byCategory.values()) {
    list.sort((a, b) => a.ticker.localeCompare(b.ticker));
  }

  return { byTicker, byCategory };
}

const { byTicker: hierarchyByTicker, byCategory: hierarchyByCategory } =
  buildCategoryIndex(quantreeHierarchy.companies || []);

function getCategoryPeerGroup(symbol) {
  const ticker = normalizeTicker(symbol);
  const subject = hierarchyByTicker.get(ticker);
  if (!subject) return null;

  const peers = (hierarchyByCategory.get(subject.category) || []).filter(
    (company) => company.ticker !== ticker,
  );

  return {
    subject,
    peers,
    sector: subject.sector,
    category: subject.category,
  };
}

const PRICE_DATASET_INDEX = 0;

const hoverMarker = {
  id: 'hoverMarker',
  afterDatasetsDraw(chart) {
    const active = chart
      .getActiveElements()
      .find((el) => el.datasetIndex === PRICE_DATASET_INDEX);
    if (!active) return;

    const { ctx } = chart;
    const { x, y } = active.element;
    if (x == null || y == null) return;

    ctx.save();

    ctx.beginPath();
    ctx.arc(x, y, 18, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(200, 240, 122, 0.16)';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(x, y, 12, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(200, 240, 122, 0.28)';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.fillStyle = '#c8f07a';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#000000';
    ctx.stroke();

    ctx.restore();
  },
};

Chart.register(
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Filler,
  Tooltip,
  hoverMarker,
);

const RANGES = {
  '1d': { range: '1d', interval: '5m', intraday: true },
  '5d': { range: '5d', interval: '15m', intraday: true },
  '1mo': { range: '1mo', interval: '1d', intraday: false },
  '6mo': { range: '6mo', interval: '1d', intraday: false },
  ytd: { range: 'ytd', interval: '1d', intraday: false },
  '1y': { range: '1y', interval: '1d', intraday: false },
  '5y': { range: '5y', interval: '1wk', intraday: false },
  max: { range: 'max', interval: '1mo', intraday: false },
};

const RANGE_ORDER = ['1d', '5d', '1mo', '6mo', 'ytd', '1y', '5y', 'max'];
const RANGE_LABELS = {
  '1d': '1D',
  '5d': '5D',
  '1mo': '1M',
  '6mo': '6M',
  ytd: 'YTD',
  '1y': '1Y',
  '5y': '5Y',
  max: 'MAX',
};

const brandEl = document.getElementById('brand');
const priceEl = document.getElementById('price');
const changeEl = document.getElementById('change');
const statusEl = document.getElementById('status');
const canvas = document.getElementById('chart');
const rangesNav = document.getElementById('ranges');
const rangeThumb = document.getElementById('range-thumb');
const rangeDots = rangesNav?.querySelectorAll('.range-dot') ?? [];
const rangeLabels = rangesNav?.querySelectorAll('.range-label') ?? [];
const rangeDotsEl = rangesNav?.querySelector('.range-dots');
const trendlineToggle = document.getElementById('trendline-toggle');
const searchRoot = document.getElementById('search');
const searchInput = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');
const peerValueCard = document.getElementById('peer-value-card');
const peerValueMetrics = document.getElementById('peer-value-metrics');
const peerValueSector = document.getElementById('peer-value-sector');
const peerValueCategory = document.getElementById('peer-value-category');

let chart;
let showTrendline = true;
let activeRange = '1y';
let activeSymbol = '^GSPC';
let activeName = 'S&P 500';
let requestId = 0;
let peerRequestId = 0;
let highlightedIndex = -1;
let currentMatches = [];
let rangeDragging = false;
let rangeSettleToken = 0;

function formatPrice(value) {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatChange(abs, pct) {
  const sign = abs >= 0 ? '+' : '';
  return `${sign}${formatPrice(abs)} (${sign}${pct.toFixed(2)}%)`;
}

function formatLabel(timestamp, intraday) {
  const date = new Date(timestamp * 1000);
  if (intraday) {
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function logLinearFit(values) {
  const samples = [];
  for (let i = 0; i < values.length; i += 1) {
    const close = values[i];
    if (close == null || !Number.isFinite(close) || close <= 0) continue;
    samples.push({ i, ln: Math.log(close) });
  }

  if (samples.length < 2) return null;

  const n = samples.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;

  for (const { i, ln } of samples) {
    sumX += i;
    sumY += ln;
    sumXY += i * ln;
    sumX2 += i * i;
  }

  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return null;

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  return values.map((_, i) => Math.exp(intercept + slope * i));
}

function sparseLabels(labels, maxTicks = 5) {
  if (labels.length <= maxTicks) return labels;
  const step = (labels.length - 1) / (maxTicks - 1);
  const keep = new Set(
    Array.from({ length: maxTicks }, (_, i) => Math.round(i * step)),
  );
  return labels.map((label, i) => (keep.has(i) ? label : ''));
}

function rawYahooNumber(field) {
  if (field == null) return null;
  if (typeof field === 'number' && Number.isFinite(field)) return field;
  if (typeof field === 'object' && typeof field.raw === 'number') return field.raw;
  return null;
}

function formatTrailingPe(value) {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value.toLocaleString('en-US', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}x`;
}

function formatDividendYield(value) {
  if (value == null || !Number.isFinite(value)) return '—';
  // Yahoo may return a fraction (0.062) or already a percent (6.2).
  const pct = value > 0 && value < 1 ? value * 100 : value;
  return `${pct.toLocaleString('en-US', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

async function fetchQuoteMetrics(symbol) {
  // Dev middleware handles Yahoo crumb/cookie auth; chart proxy alone is not enough.
  const url = `/api/yahoo-metrics/${encodeURIComponent(symbol)}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Yahoo quote metrics returned ${response.status} for ${symbol}`);
  }

  const data = await response.json();
  if (data?.error) {
    throw new Error(data.error);
  }

  const result = data?.quoteSummary?.result?.[0];
  if (!result) {
    throw new Error(
      data?.quoteSummary?.error?.description || `No quote data for ${symbol}`,
    );
  }

  const stats = result.defaultKeyStatistics || {};
  const summary = result.summaryDetail || {};
  const trailingPe =
    rawYahooNumber(summary.trailingPE) ?? rawYahooNumber(stats.trailingPE);
  const dividendYield =
    rawYahooNumber(summary.dividendYield) ??
    rawYahooNumber(summary.trailingAnnualDividendYield) ??
    rawYahooNumber(stats.yield);

  return { symbol, trailingPe, dividendYield };
}

function setPeerNarrative(sector, category) {
  if (peerValueSector) peerValueSector.textContent = sector || '';
  if (peerValueCategory) peerValueCategory.textContent = category || '';
}

function hidePeerValueCard() {
  if (!peerValueCard) return;
  peerValueCard.hidden = true;
  peerValueCard.classList.remove('is-coming-soon');
  if (peerValueMetrics) {
    peerValueMetrics.innerHTML =
      '<p class="peer-value-card__loading" id="peer-value-loading">Loading peer stats…</p>';
  }
  setPeerNarrative('', '');
}

function showComingSoon(sector = '', category = '') {
  if (!peerValueCard || !peerValueMetrics) return;
  peerValueCard.hidden = false;
  peerValueCard.classList.add('is-coming-soon');
  peerValueMetrics.innerHTML =
    '<p class="peer-value-card__coming-soon">Coming soon</p>';
  setPeerNarrative(sector, category || 'Peers');
}

function renderPeerMetricRow(company, metrics, isSubject = false) {
  const article = document.createElement('article');
  article.className = `peer-metric${isSubject ? ' is-subject' : ''}`;

  const head = document.createElement('div');
  head.className = 'peer-metric__head';

  const ticker = document.createElement('span');
  ticker.className = 'peer-metric__ticker';
  ticker.textContent = company.ticker;

  const name = document.createElement('span');
  name.className = 'peer-metric__name';
  name.textContent = company.display_name;

  head.append(ticker, name);

  if (!isSubject) {
    article.classList.add('is-clickable');
    article.tabIndex = 0;
    article.setAttribute('role', 'button');
    article.setAttribute(
      'aria-label',
      `View ${company.display_name} (${company.ticker})`,
    );
    const openPeer = () => {
      selectConstituent({
        symbol: company.ticker,
        name: company.display_name,
      });
    };
    article.addEventListener('click', openPeer);
    article.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openPeer();
      }
    });
  }

  const stats = document.createElement('ul');
  stats.className = 'peer-metric__stats';

  const peItem = document.createElement('li');
  peItem.className = 'peer-metric__stat';
  peItem.innerHTML = `<span class="peer-metric__label">Trailing P/E</span><span class="peer-metric__value">${formatTrailingPe(metrics?.trailingPe)}</span>`;

  const yieldItem = document.createElement('li');
  yieldItem.className = 'peer-metric__stat';
  yieldItem.innerHTML = `<span class="peer-metric__label">Dividend yield</span><span class="peer-metric__value">${formatDividendYield(metrics?.dividendYield)}</span>`;

  stats.append(peItem, yieldItem);
  article.append(head, stats);
  return article;
}

async function loadPeerValueCard(symbol, displayName) {
  if (!peerValueCard || !peerValueMetrics) return;

  if (normalizeTicker(symbol) === '^GSPC') {
    hidePeerValueCard();
    return;
  }

  const id = ++peerRequestId;
  const group = getCategoryPeerGroup(symbol);

  if (!group || group.peers.length === 0) {
    showComingSoon(group?.sector || '', group?.category || '');
    return;
  }

  peerValueCard.hidden = false;
  peerValueCard.classList.remove('is-coming-soon');
  peerValueMetrics.innerHTML =
    '<p class="peer-value-card__loading">Loading peer stats…</p>';
  setPeerNarrative(group.sector, group.category);

  const subject = {
    ticker: group.subject.ticker,
    display_name: displayName || group.subject.display_name,
  };
  const peers = group.peers.slice(0, MAX_CATEGORY_PEERS);
  const companies = [...peers, subject];

  try {
    // Sequential fetches share one Yahoo crumb/session and avoid parallel 429s.
    const results = [];
    for (const company of companies) {
      try {
        const metrics = await fetchQuoteMetrics(company.ticker);
        results.push({ company, metrics });
      } catch (error) {
        console.error(error);
        results.push({ company, metrics: null });
      }
    }

    if (id !== peerRequestId) return;

    peerValueMetrics.innerHTML = '';
    results.forEach(({ company, metrics }) => {
      const isSubject = company.ticker === subject.ticker;
      peerValueMetrics.appendChild(
        renderPeerMetricRow(company, metrics, isSubject),
      );
    });
  } catch (error) {
    if (id !== peerRequestId) return;
    console.error(error);
    peerValueMetrics.innerHTML =
      '<p class="peer-value-card__loading">Could not load peer stats right now.</p>';
  }
}

async function fetchSeries(key, symbol = activeSymbol) {
  const config = RANGES[key];
  const url = `/api/yahoo-chart/${encodeURIComponent(symbol)}?range=${config.range}&interval=${config.interval}`;
  const response = await fetch(url);

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(
      payload?.error || `Yahoo Finance returned ${response.status}`,
    );
  }

  const data = await response.json();
  if (data?.error) {
    throw new Error(data.error);
  }
  const result = data?.chart?.result?.[0];
  if (!result) {
    throw new Error(data?.chart?.error?.description || 'No chart data returned');
  }

  const timestamps = result.timestamp || [];
  const closes = result.indicators?.quote?.[0]?.close || [];
  const points = [];

  for (let i = 0; i < timestamps.length; i += 1) {
    const close = closes[i];
    if (close == null || Number.isNaN(close)) continue;
    points.push({
      t: timestamps[i],
      close,
      label: formatLabel(timestamps[i], config.intraday),
    });
  }

  if (!points.length) {
    throw new Error('No price points available for this range');
  }

  return { points, intraday: config.intraday };
}

function updateHeader(points) {
  const first = points[0].close;
  const last = points[points.length - 1].close;
  const abs = last - first;
  const pct = (abs / first) * 100;

  priceEl.textContent = formatPrice(last);
  changeEl.textContent = formatChange(abs, pct);
  changeEl.classList.toggle('is-up', abs >= 0);
  changeEl.classList.toggle('is-down', abs < 0);
}

function buildGradient(ctx) {
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.parentElement.clientHeight || 400);
  gradient.addColorStop(0, 'rgba(200, 240, 122, 0.28)');
  gradient.addColorStop(1, 'rgba(200, 240, 122, 0)');
  return gradient;
}

function ensureChart(labels, values) {
  const ctx = canvas.getContext('2d');
  const gradient = buildGradient(ctx);
  const trendline = logLinearFit(values);

  if (chart) {
    chart.destroy();
    chart = null;
  }

  const existing = Chart.getChart(canvas);
  if (existing) existing.destroy();

  const datasets = [
    {
      data: values,
      borderColor: '#c8f07a',
      backgroundColor: gradient,
      borderWidth: 3,
      borderCapStyle: 'round',
      borderJoinStyle: 'round',
      tension: 0.3,
      fill: true,
      // Chart.js never draws points — hover marker is drawn by our plugin.
      pointRadius: 0,
      pointHoverRadius: 0,
      pointHitRadius: 24,
      pointBorderWidth: 0,
      pointHoverBorderWidth: 0,
      spanGaps: true,
    },
  ];

  if (trendline) {
    datasets.push({
      data: trendline,
      borderColor: '#8a7a4a',
      backgroundColor: 'transparent',
      borderWidth: 2,
      borderDash: [7, 5],
      borderCapStyle: 'round',
      borderJoinStyle: 'round',
      tension: 0,
      fill: false,
      pointRadius: 0,
      pointHoverRadius: 0,
      pointHitRadius: 0,
      pointBorderWidth: 0,
      pointHoverBorderWidth: 0,
      spanGaps: true,
      hidden: !showTrendline,
    });
  }

  chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets,
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 650,
        easing: 'easeOutQuart',
      },
      transitions: {
        active: {
          animation: {
            duration: 200,
            easing: 'easeOutQuad',
          },
        },
      },
      interaction: {
        mode: 'index',
        intersect: false,
      },
      elements: {
        point: {
          radius: 0,
          hoverRadius: 0,
          hitRadius: 24,
          borderWidth: 0,
          hoverBorderWidth: 0,
        },
      },
      plugins: {
        legend: { display: false },
        hoverMarker: {},
        tooltip: {
          backgroundColor: 'rgba(10, 10, 10, 0.94)',
          titleColor: '#f3f0e4',
          bodyColor: '#f3f0e4',
          titleFont: { family: "'DM Sans', sans-serif", size: 14, weight: '600' },
          bodyFont: { family: "'DM Sans', sans-serif", size: 15, weight: '500' },
          padding: 12,
          cornerRadius: 10,
          displayColors: false,
          filter: (item) => item.datasetIndex === PRICE_DATASET_INDEX,
          callbacks: {
            label: (item) => formatPrice(item.parsed.y),
          },
        },
      },
      scales: {
        x: {
          grid: {
            display: false,
            drawBorder: false,
          },
          ticks: {
            autoSkip: false,
            maxRotation: 0,
            color: 'rgba(243, 240, 228, 0.42)',
            font: { family: "'DM Sans', sans-serif", size: 13, weight: '500' },
            padding: 10,
          },
        },
        y: {
          position: 'right',
          border: { display: false },
          grid: {
            color: 'rgba(243, 240, 228, 0.08)',
            drawBorder: false,
          },
          ticks: {
            color: 'rgba(243, 240, 228, 0.42)',
            font: { family: "'DM Sans', sans-serif", size: 13, weight: '500' },
            padding: 10,
            callback: (value) =>
              Number(value).toLocaleString('en-US', {
                maximumFractionDigits: 0,
              }),
          },
        },
      },
    },
  });
}

async function loadRange(key) {
  const id = ++requestId;
  statusEl.textContent = 'Loading…';

  try {
    const { points } = await fetchSeries(key);
    if (id !== requestId) return;

    const labels = sparseLabels(points.map((p) => p.label));
    const values = points.map((p) => p.close);

    updateHeader(points);
    ensureChart(labels, values);
    statusEl.textContent = '';
  } catch (error) {
    if (id !== requestId) return;
    console.error(error);
    statusEl.textContent = 'Could not load prices. Try again in a moment.';
  }
}

function rangeIndex(key) {
  const index = RANGE_ORDER.indexOf(key);
  return index < 0 ? RANGE_ORDER.indexOf('1y') : index;
}

function syncRangeSlider(key) {
  if (!rangesNav || !rangeThumb) return;
  const index = rangeIndex(key);
  const label = RANGE_LABELS[key] || key;
  rangesNav.style.setProperty('--range-index', String(index));
  rangesNav.style.setProperty('--range-pos', String(index));
  rangeThumb.textContent = label;
  rangeThumb.setAttribute('aria-valuenow', String(index));
  rangeThumb.setAttribute('aria-valuetext', label);
  rangeDots.forEach((dot) => {
    dot.classList.toggle('is-active', dot.dataset.range === key);
  });
  rangeLabels.forEach((item) => {
    item.classList.toggle('is-active', item.dataset.range === key);
  });
}

function previewRangeAt(pos) {
  if (!rangesNav || !rangeThumb) return;
  const key = keyFromPos(pos);
  const nearest = rangeIndex(key);
  const label = RANGE_LABELS[key] || key;
  rangesNav.style.setProperty('--range-pos', String(pos));
  rangeThumb.textContent = label;
  rangeThumb.setAttribute('aria-valuenow', String(nearest));
  rangeThumb.setAttribute('aria-valuetext', label);
  rangeDots.forEach((dot) => {
    dot.classList.toggle('is-active', dot.dataset.range === key);
  });
  rangeLabels.forEach((item) => {
    item.classList.toggle('is-active', item.dataset.range === key);
  });
}

function setRangesOpen(open) {
  if (!rangesNav) return;
  rangesNav.classList.toggle('is-open', open);
  rangesNav.setAttribute('aria-expanded', String(open));
}

function commitRange(key, { close = true } = {}) {
  const next = RANGE_ORDER.includes(key) ? key : activeRange;
  const changed = next !== activeRange;
  activeRange = next;
  syncRangeSlider(next);
  if (changed) loadRange(next);
  if (close) setRangesOpen(false);
}

function posFromClientX(clientX) {
  if (!rangeDotsEl) return rangeIndex(activeRange);
  const rect = rangeDotsEl.getBoundingClientRect();
  if (rect.width <= 0) return rangeIndex(activeRange);
  const t = (clientX - rect.left) / rect.width;
  return Math.min(
    RANGE_ORDER.length - 1,
    Math.max(0, t * (RANGE_ORDER.length - 1)),
  );
}

function keyFromPos(pos) {
  const index = Math.round(pos);
  return RANGE_ORDER[
    Math.min(RANGE_ORDER.length - 1, Math.max(0, index))
  ];
}

function currentRangePos() {
  if (!rangesNav) return rangeIndex(activeRange);
  const raw = rangesNav.style.getPropertyValue('--range-pos');
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : rangeIndex(activeRange);
}

function settleThenCommit(key) {
  const token = ++rangeSettleToken;
  const target = rangeIndex(key);
  const alreadyThere = Math.abs(currentRangePos() - target) < 0.02;
  let finished = false;

  rangesNav?.classList.remove('is-dragging');
  rangesNav?.style.setProperty('--range-pos', String(target));

  const snapAndCommit = () => {
    if (token !== rangeSettleToken || finished) return;
    rangesNav?.classList.remove('is-settling');
    if (!rangeThumb) {
      finished = true;
      commitRange(key);
      return;
    }
    rangeThumb.classList.remove('is-snapping');
    void rangeThumb.offsetWidth;
    rangeThumb.classList.add('is-snapping');

    const done = () => {
      if (token !== rangeSettleToken || finished) return;
      finished = true;
      rangeThumb.removeEventListener('animationend', done);
      rangeThumb.classList.remove('is-snapping');
      commitRange(key);
    };
    rangeThumb.addEventListener('animationend', done);
    window.setTimeout(done, 220);
  };

  if (alreadyThere || !rangeThumb) {
    snapAndCommit();
    return;
  }

  rangesNav.classList.add('is-settling');

  const onEnd = (event) => {
    if (event.target !== rangeThumb || event.propertyName !== 'left') return;
    rangeThumb.removeEventListener('transitionend', onEnd);
    snapAndCommit();
  };
  rangeThumb.addEventListener('transitionend', onEnd);
  window.setTimeout(() => {
    rangeThumb.removeEventListener('transitionend', onEnd);
    if (token === rangeSettleToken && rangesNav.classList.contains('is-settling')) {
      snapAndCommit();
    }
  }, 400);
}

function matchRank(item, q) {
  const symbol = item.symbol.toLowerCase();
  const yahoo = yahooSymbolFor(item).toLowerCase();
  const name = item.name.toLowerCase();

  if (symbol === q || yahoo === q) return 0;
  if (symbol.startsWith(q) || yahoo.startsWith(q)) return 1;
  if (name.startsWith(q)) return 2;
  if (symbol.includes(q) || yahoo.includes(q) || name.includes(q)) return 3;
  return Infinity;
}

function filterConstituents(query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  return constituents
    .map((item) => ({ item, rank: matchRank(item, q) }))
    .filter(({ rank }) => rank !== Infinity)
    .sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      const lengthDelta = a.item.symbol.length - b.item.symbol.length;
      if (lengthDelta !== 0) return lengthDelta;
      return a.item.symbol.localeCompare(b.item.symbol);
    })
    .slice(0, MAX_SEARCH_RESULTS)
    .map(({ item }) => item);
}

function closeSearchResults() {
  searchResults.hidden = true;
  searchInput.setAttribute('aria-expanded', 'false');
  highlightedIndex = -1;
  currentMatches = [];
  searchResults.innerHTML = '';
}

function renderSearchResults(matches) {
  currentMatches = matches;
  highlightedIndex = matches.length ? 0 : -1;
  searchResults.innerHTML = '';

  if (!matches.length) {
    closeSearchResults();
    return;
  }

  matches.forEach((item, index) => {
    const li = document.createElement('li');
    li.setAttribute('role', 'presentation');

    const button = document.createElement('button');
    button.type = 'button';
    button.className = `search-option${index === 0 ? ' is-active' : ''}`;
    button.setAttribute('role', 'option');
    button.dataset.index = String(index);

    const symbol = document.createElement('span');
    symbol.className = 'search-option-symbol';
    symbol.textContent = item.symbol;

    const name = document.createElement('span');
    name.className = 'search-option-name';
    name.textContent = item.name;

    button.append(symbol, name);
    button.addEventListener('mousedown', (event) => {
      event.preventDefault();
      selectConstituent(item);
    });

    li.appendChild(button);
    searchResults.appendChild(li);
  });

  searchResults.hidden = false;
  searchInput.setAttribute('aria-expanded', 'true');
}

function updateHighlight() {
  const options = searchResults.querySelectorAll('.search-option');
  options.forEach((option, index) => {
    option.classList.toggle('is-active', index === highlightedIndex);
  });
}

function selectConstituent(item) {
  activeSymbol = yahooSymbolFor(item);
  activeName = item.name;
  brandEl.textContent = item.name;
  searchInput.value = item.symbol;
  closeSearchResults();
  loadRange(activeRange);

  loadPeerValueCard(activeSymbol, item.name);
}

async function loadSymbolDirectory() {
  try {
    const response = await fetch('/api/nasdaq-symbols');
    if (!response.ok) {
      throw new Error(`Symbol directory returned ${response.status}`);
    }
    const rows = await response.json();
    if (!Array.isArray(rows)) {
      throw new Error('Symbol directory was not a list');
    }
    constituents = [INDEX_CONSTITUENT, ...rows];
  } catch (error) {
    console.error(error);
    constituents = [INDEX_CONSTITUENT];
  }
}

function openSearchFromQuery() {
  renderSearchResults(filterConstituents(searchInput.value));
}

searchInput.addEventListener('input', () => {
  openSearchFromQuery();
});

searchInput.addEventListener('focus', () => {
  openSearchFromQuery();
});

searchInput.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeSearchResults();
    searchInput.blur();
    return;
  }

  if (event.key === 'ArrowDown') {
    event.preventDefault();
    if (!currentMatches.length) openSearchFromQuery();
    if (!currentMatches.length) return;
    highlightedIndex = (highlightedIndex + 1) % currentMatches.length;
    updateHighlight();
    return;
  }

  if (event.key === 'ArrowUp') {
    event.preventDefault();
    if (!currentMatches.length) return;
    highlightedIndex =
      (highlightedIndex - 1 + currentMatches.length) % currentMatches.length;
    updateHighlight();
    return;
  }

  if (event.key === 'Enter') {
    event.preventDefault();
    if (!currentMatches.length) openSearchFromQuery();
    if (highlightedIndex >= 0 && currentMatches[highlightedIndex]) {
      selectConstituent(currentMatches[highlightedIndex]);
    }
  }
});

document.addEventListener('click', (event) => {
  if (!searchRoot.contains(event.target)) {
    closeSearchResults();
  }
  if (rangesNav && !rangesNav.contains(event.target)) {
    setRangesOpen(false);
  }
});

function syncTrendlineToggle() {
  if (!trendlineToggle) return;
  trendlineToggle.classList.toggle('is-active', showTrendline);
  trendlineToggle.setAttribute('aria-pressed', String(showTrendline));
}

trendlineToggle?.addEventListener('click', () => {
  showTrendline = !showTrendline;
  syncTrendlineToggle();
  if (chart && chart.data.datasets.length > 1) {
    chart.setDatasetVisibility(1, showTrendline);
    chart.update();
  }
});

rangeDots.forEach((dot) => {
  dot.addEventListener('click', () => {
    const key = dot.dataset.range;
    if (!key) return;
    commitRange(key);
  });
});

rangeThumb?.addEventListener('pointerdown', (event) => {
  if (event.button != null && event.button !== 0) return;

  const hovering = rangesNav?.matches(':hover');
  const wasOpen = rangesNav?.classList.contains('is-open');
  if (!wasOpen && !hovering) {
    setRangesOpen(true);
    return;
  }

  rangeSettleToken += 1;
  rangeDragging = true;
  rangesNav?.classList.remove('is-settling');
  rangesNav?.classList.add('is-dragging');
  rangeThumb.classList.remove('is-snapping');
  rangeThumb.setPointerCapture(event.pointerId);
  previewRangeAt(posFromClientX(event.clientX));
  event.preventDefault();
});

rangeThumb?.addEventListener('pointermove', (event) => {
  if (!rangeDragging) return;
  previewRangeAt(posFromClientX(event.clientX));
});

function endRangeDrag(event) {
  if (!rangeDragging) return;
  rangeDragging = false;
  if (rangeThumb.hasPointerCapture?.(event.pointerId)) {
    rangeThumb.releasePointerCapture(event.pointerId);
  }
  settleThenCommit(keyFromPos(posFromClientX(event.clientX)));
}

rangeThumb?.addEventListener('pointerup', endRangeDrag);
rangeThumb?.addEventListener('pointercancel', endRangeDrag);

rangeThumb?.addEventListener('keydown', (event) => {
  const index = rangeIndex(activeRange);
  if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
    event.preventDefault();
    if (index <= 0) return;
    commitRange(RANGE_ORDER[index - 1], { close: false });
    return;
  }
  if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
    event.preventDefault();
    if (index >= RANGE_ORDER.length - 1) return;
    commitRange(RANGE_ORDER[index + 1], { close: false });
  }
});

syncRangeSlider(activeRange);
brandEl.textContent = activeName;
loadRange(activeRange);
loadSymbolDirectory();
