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
import {
  formatDividendYield,
  normalizeDividendYield,
  rawYahooNumber,
} from './yahoo/normalize-dividend-yield.js';
import { formatEarningsYield } from './yahoo/earnings-yield.js';
import {
  BAND_LABELS,
  METRIC_CLASSIFY_OPTIONS,
  classifyPeerColumn,
} from './peer-demo/peer-metric-scale.js';
import {
  barLayout,
  barPositionPct,
  overallLeaderboard,
  peerBarScale,
  rankPeerRows,
  zeroBaselinePct,
} from './peer-demo/peer-metric-bar.js';

const MAX_CATEGORY_PEERS = 5;
const MAX_SEARCH_RESULTS = 10;
const YAHOO_CHART_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';
const YAHOO_QUOTE_BASE = 'https://query1.finance.yahoo.com/v7/finance/quote';
const SYMBOL_DIRECTORY_URL = `${import.meta.env.BASE_URL}nasdaq-symbols.json`;
const PROD_API_BASE = import.meta.env.VITE_API_BASE || '';

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

function cacheKeyForSymbol(symbol) {
  return String(symbol || '')
    .trim()
    .replace(/\^/g, '')
    .replace(/\./g, '-');
}

function peerGroupKey(sector, industryGroup, category) {
  return `${sector}\0${industryGroup}\0${category}`;
}

function flattenHierarchyTree(tree) {
  const companies = [];
  if (!tree || typeof tree !== 'object') return companies;

  for (const [sector, groups] of Object.entries(tree)) {
    if (!groups || typeof groups !== 'object') continue;
    for (const [industryGroup, niches] of Object.entries(groups)) {
      if (!niches || typeof niches !== 'object') continue;
      for (const [category, items] of Object.entries(niches)) {
        if (!Array.isArray(items)) continue;
        for (const item of items) {
          companies.push({
            ticker: item.t,
            name: item.n,
            sector,
            industry_group: industryGroup,
            category,
          });
        }
      }
    }
  }

  return companies;
}

function buildCategoryIndex(companies) {
  const byTicker = new Map();
  const byPath = new Map();

  for (const company of companies) {
    const ticker = normalizeTicker(company.ticker);
    const industryGroup = company.industry_group || '';
    const path = peerGroupKey(company.sector, industryGroup, company.category);
    const entry = {
      ticker,
      display_name: company.name,
      sector: company.sector,
      industry_group: industryGroup,
      category: company.category,
      path,
    };
    byTicker.set(ticker, entry);

    const list = byPath.get(path) || [];
    list.push(entry);
    byPath.set(path, list);
  }

  for (const list of byPath.values()) {
    list.sort((a, b) => a.ticker.localeCompare(b.ticker));
  }

  return { byTicker, byPath };
}

const { byTicker: hierarchyByTicker, byPath: hierarchyByPath } =
  buildCategoryIndex(flattenHierarchyTree(quantreeHierarchy.tree));

function getCategoryPeerGroup(symbol) {
  const ticker = normalizeTicker(symbol);
  const subject = hierarchyByTicker.get(ticker);
  if (!subject) return null;

  const peers = (hierarchyByPath.get(subject.path) || []).filter(
    (company) => company.ticker !== ticker,
  );

  return {
    subject,
    peers,
    sector: subject.sector,
    industry_group: subject.industry_group,
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
const peerValueGroup = document.getElementById('peer-value-group');
const peerValueCategory = document.getElementById('peer-value-category');

let chart;
let showTrendline = true;
let activeRange = '1y';
let activeSymbol = '^GSPC';
let activeName = 'S&P 500';
let requestId = 0;
let peerRequestId = 0;
let peerMetricIndex = 0;
let peerChartCache = null;
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

function formatRoc(value) {
  if (value == null || !Number.isFinite(value)) return '—';
  const pct = value * 100;
  return `${pct.toLocaleString('en-US', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

const PEER_METRICS = [
  { key: 'earningsYield', label: 'Earnings Yield', format: formatEarningsYield },
  { key: 'roc', label: 'Return on Capital', format: formatRoc },
  { key: 'dividendYield', label: 'Dividend Yield', format: formatDividendYield },
];

const PEER_VIEWS = [
  { key: 'overall', label: 'Leaderboard' },
  ...PEER_METRICS,
];

const PEER_BAR_BAND_CLASS = {
  [BAND_LABELS.veryLow]: 'is-very-low',
  [BAND_LABELS.low]: 'is-low',
  [BAND_LABELS.typical]: 'is-typical',
  [BAND_LABELS.high]: 'is-high',
  [BAND_LABELS.veryHigh]: 'is-very-high',
  [BAND_LABELS.negative]: 'is-negative',
};

function rocFromFundamentals(fundamentals) {
  const roc = fundamentals?.roc;
  return typeof roc === 'number' && Number.isFinite(roc) ? roc : null;
}

function metricsFromPayload(symbol, data) {
  if (data?.error) {
    throw new Error(data.error);
  }

  if (data && ('earningsYield' in data || 'trailingPe' in data || data.fundamentals)) {
    return {
      symbol,
      earningsYield: rawYahooNumber(data.earningsYield),
      dividendYield: rawYahooNumber(data.dividendYield),
      roc: rocFromFundamentals(data.fundamentals),
    };
  }

  const summaryResult = data?.quoteSummary?.result?.[0];
  if (summaryResult) {
    const stats = summaryResult.defaultKeyStatistics || {};
    const summary = summaryResult.summaryDetail || {};
    const price = summaryResult.price || {};
    const dividendYield = normalizeDividendYield({
      summaryDetail: summary,
      price,
      stats,
    });
    return {
      symbol,
      earningsYield: null,
      dividendYield,
      roc: rocFromFundamentals(data.fundamentals),
    };
  }

  const quoteResult = data?.quoteResponse?.result?.[0];
  if (quoteResult) {
    return {
      symbol,
      earningsYield: null,
      dividendYield: rawYahooNumber(quoteResult.dividendYield),
      roc: rocFromFundamentals(data.fundamentals),
    };
  }

  throw new Error(
    data?.quoteSummary?.error?.description ||
      data?.quoteResponse?.error ||
      `No quote data for ${symbol}`,
  );
}

async function fetchQuoteMetrics(symbol) {
  const metricsUrl = import.meta.env.DEV
    ? `/api/yahoo-metrics/${encodeURIComponent(symbol)}`
    : PROD_API_BASE
      ? `${PROD_API_BASE}/api/yahoo-metrics/${encodeURIComponent(symbol)}`
      : null;

  if (metricsUrl) {
    const response = await fetch(metricsUrl);
    if (!response.ok) {
      throw new Error(`Yahoo quote metrics returned ${response.status} for ${symbol}`);
    }
    return metricsFromPayload(symbol, await response.json());
  }

  const url = `${YAHOO_QUOTE_BASE}?symbols=${encodeURIComponent(symbol)}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Yahoo quote returned ${response.status} for ${symbol}`);
  }
  return metricsFromPayload(symbol, await response.json());
}

function setPeerNarrative(sector, industryGroup, category) {
  if (peerValueCategory) peerValueCategory.textContent = category || '';
  if (peerValueGroup) peerValueGroup.textContent = '';
  if (peerValueSector) peerValueSector.textContent = '';
}

function resetPeerChartState() {
  peerMetricIndex = 0;
  peerChartCache = null;
}

function hidePeerValueCard() {
  if (!peerValueCard) return;
  peerValueCard.hidden = true;
  peerValueCard.classList.remove('is-coming-soon');
  resetPeerChartState();
  if (peerValueMetrics) {
    peerValueMetrics.innerHTML =
      '<p class="peer-value-card__loading" id="peer-value-loading">Loading peer stats…</p>';
  }
  setPeerNarrative('', '', '');
}

function showComingSoon(sector = '', industryGroup = '', category = '') {
  if (!peerValueCard || !peerValueMetrics) return;
  peerValueCard.hidden = false;
  peerValueCard.classList.add('is-coming-soon');
  resetPeerChartState();
  peerValueMetrics.innerHTML =
    '<p class="peer-value-card__coming-soon">Coming soon</p>';
  setPeerNarrative(sector, industryGroup, category || 'Peers');
}

function classificationsForPeerMetrics(results) {
  return Object.fromEntries(
    PEER_METRICS.map((metric) => [
      metric.key,
      classifyPeerColumn(
        results.map((row) => row.metrics?.[metric.key]),
        METRIC_CLASSIFY_OPTIONS[metric.key],
      ),
    ]),
  );
}

function renderPeerMetric(classification, formatted, layout, scale) {
  const wrap = document.createElement('div');
  wrap.className = 'peer-metric';
  if (!classification?.label) wrap.classList.add('is-empty');
  if (
    classification?.label === 'NEGATIVE' ||
    classification?.label === 'NO DIVIDEND'
  ) {
    wrap.classList.add('is-semantic');
  }

  const bar = document.createElement('div');
  bar.className = 'peer-bar';
  bar.setAttribute('aria-hidden', 'true');

  const zeroPct = zeroBaselinePct(scale);
  if (zeroPct != null) {
    const zero = document.createElement('span');
    zero.className = 'peer-bar__zero';
    zero.style.left = `${zeroPct}%`;
    bar.append(zero);
  }

  if (layout && layout.widthPct > 0) {
    const fill = document.createElement('span');
    fill.className = 'peer-bar__fill';
    const bandClass = PEER_BAR_BAND_CLASS[classification?.label];
    if (bandClass) fill.classList.add(bandClass);
    fill.style.left = `${layout.startPct}%`;
    fill.style.width = `${layout.widthPct}%`;
    bar.append(fill);
  }

  const value = document.createElement('span');
  value.className = 'peer-metric__value';
  value.textContent = formatted;

  wrap.append(bar, value);

  if (classification?.label && classification?.detail) {
    const tip = document.createElement('span');
    tip.className = 'peer-metric__tooltip';
    tip.setAttribute('role', 'tooltip');

    const tipLabel = document.createElement('span');
    tipLabel.className = 'peer-metric__tooltip-label';
    tipLabel.textContent = classification.label;

    const tipDetail = document.createElement('span');
    tipDetail.className = 'peer-metric__tooltip-detail';
    tipDetail.textContent = classification.detail;

    tip.append(tipLabel, tipDetail);
    wrap.append(tip);
  }

  return wrap;
}

function chevronIcon(direction) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.classList.add('peer-chart-nav__icon');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '2.2');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  path.setAttribute(
    'd',
    direction === 'prev' ? 'M14.5 6 8.5 12l6 6' : 'M9.5 6l6 6-6 6',
  );
  svg.append(path);
  return svg;
}

function mountPeerChart() {
  if (!peerChartCache || !peerValueMetrics) return;
  const { results, subjectTicker, classifications } = peerChartCache;
  peerValueMetrics.innerHTML = '';
  peerValueMetrics.appendChild(
    renderPeerComparisonTable(results, subjectTicker, classifications),
  );
}

function shiftPeerMetric(delta, { focus } = {}) {
  const next = Math.max(
    0,
    Math.min(PEER_VIEWS.length - 1, peerMetricIndex + delta),
  );
  if (next === peerMetricIndex || !peerChartCache) return;
  peerMetricIndex = next;
  mountPeerChart();
  if (!focus || !peerValueMetrics) return;
  const btn = peerValueMetrics.querySelector(`[data-peer-nav="${focus}"]`);
  if (btn && !btn.disabled) {
    btn.focus();
    return;
  }
  peerValueMetrics.querySelector('.peer-chart-nav')?.focus();
}

function renderPeerChartHeader(metric, column) {
  const header = document.createElement('div');
  header.className = 'peer-chart-header';

  const title = document.createElement('div');
  title.className = 'peer-table__metric-name';
  title.setAttribute('role', 'columnheader');
  title.setAttribute('aria-live', 'polite');
  title.textContent = metric.label;
  if (metric.key === 'overall') {
    title.setAttribute(
      'aria-label',
      'Leaderboard, combined earnings yield, return on capital, and dividend yield ranks',
    );
  } else {
    const center = column.find((row) => row.center != null)?.center;
    if (center != null) {
      const medianLabel = metric.format(center);
      title.title = `Peer median ${medianLabel}`;
      title.setAttribute(
        'aria-label',
        `${metric.label}, peer median ${medianLabel}`,
      );
    }
  }
  header.append(title);

  const nav = document.createElement('div');
  nav.className = 'peer-chart-nav';
  nav.setAttribute('role', 'group');
  nav.setAttribute('aria-label', 'Peer metric');
  nav.tabIndex = -1;

  const prev = document.createElement('button');
  prev.type = 'button';
  prev.className = 'peer-chart-nav__btn';
  prev.dataset.peerNav = 'prev';
  prev.setAttribute('aria-label', 'Previous metric');
  prev.disabled = peerMetricIndex <= 0;
  prev.append(chevronIcon('prev'));
  prev.addEventListener('click', () => shiftPeerMetric(-1, { focus: 'prev' }));

  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'peer-chart-nav__btn';
  next.dataset.peerNav = 'next';
  next.setAttribute('aria-label', 'Next metric');
  next.disabled = peerMetricIndex >= PEER_VIEWS.length - 1;
  next.append(chevronIcon('next'));
  next.addEventListener('click', () => shiftPeerMetric(1, { focus: 'next' }));

  nav.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      shiftPeerMetric(-1, { focus: 'prev' });
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      shiftPeerMetric(1, { focus: 'next' });
    }
  });

  nav.append(prev, next);
  header.append(nav);
  return header;
}

function bindPeerCompanyAction(el, company, isSubject) {
  el.dataset.ticker = company.ticker;
  if (isSubject) {
    el.classList.add('is-subject');
    return;
  }

  el.classList.add('is-clickable');
  el.tabIndex = 0;
  el.setAttribute(
    'aria-label',
    `View ${company.display_name} (${company.ticker})`,
  );
  const openPeer = () => {
    selectConstituent({
      symbol: company.ticker,
      name: company.display_name,
    });
  };
  el.addEventListener('click', openPeer);
  el.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openPeer();
    }
  });
}

function bindPeerHover(table) {
  const syncHover = (ticker) => {
    table.querySelectorAll('[data-ticker]').forEach((el) => {
      el.classList.toggle('is-hover', Boolean(ticker) && el.dataset.ticker === ticker);
    });
  };

  table.addEventListener('pointerover', (event) => {
    const node = event.target.closest('[data-ticker]');
    syncHover(node?.dataset.ticker || '');
  });
  table.addEventListener('pointerleave', () => syncHover(''));
}

function renderPeerCompany(company, isSubject, rank) {
  const row = document.createElement('div');
  row.className = 'peer-table__company';
  row.setAttribute('role', 'rowheader');
  bindPeerCompanyAction(row, company, isSubject);

  const ticker = document.createElement('span');
  ticker.className = 'peer-table__ticker';

  const rankEl = document.createElement('span');
  rankEl.className = 'peer-table__rank';
  rankEl.textContent = `${rank}.`;

  const symbol = document.createElement('span');
  symbol.textContent = company.ticker;

  ticker.append(rankEl, symbol);
  row.append(ticker);
  return row;
}

function renderPeerMedianLine(center, scale) {
  const pct = barPositionPct(center, scale);
  if (pct == null) return null;

  const wrap = document.createElement('div');
  wrap.className = 'peer-bar-median';
  wrap.setAttribute('aria-hidden', 'true');
  wrap.style.setProperty('--median-pct', `${pct}%`);

  const line = document.createElement('span');
  line.className = 'peer-bar-median__line';
  wrap.append(line);
  return wrap;
}

function overallRankDetail(ranks, rankSum) {
  if (!ranks) return `Combined rank ${rankSum}`;
  return [
    `Earnings yield #${ranks.earningsYield}`,
    `return on capital #${ranks.roc}`,
    `dividend yield #${ranks.dividendYield}`,
    `combined rank ${rankSum}`,
  ].join(', ');
}

function renderPeerMetricPanel(metric, ranked, column, subjectTicker) {
  const panel = document.createElement('div');
  panel.className = 'peer-table__panel';

  const isOverall = metric.key === 'overall';
  const values = ranked.map((row) =>
    isOverall ? row.overallScore : row.metrics?.[metric.key],
  );
  const scale = peerBarScale(values);
  const center = column.find((row) => row.center != null)?.center;

  ranked.forEach((row) => {
    const { company, metrics, sourceIndex, rank } = row;
    const value = isOverall ? row.overallScore : metrics?.[metric.key];
    const classification = isOverall
      ? {
          ...column[sourceIndex],
          detail: overallRankDetail(row.ranks, row.rankSum),
        }
      : column[sourceIndex];
    const formatted = isOverall ? String(row.rankSum) : metric.format(value);
    const cell = document.createElement('div');
    cell.className = 'peer-table__metric-row';
    cell.setAttribute('role', 'cell');
    bindPeerCompanyAction(
      cell,
      company,
      company.ticker === subjectTicker,
    );
    const ariaParts = [
      `Rank ${rank}`,
      company.ticker,
      metric.label,
      classification?.label || 'unavailable',
      formatted !== '—' ? formatted : null,
      classification?.detail,
    ].filter(Boolean);
    cell.setAttribute('aria-label', ariaParts.join(', '));
    cell.append(
      renderPeerMetric(
        classification,
        formatted,
        barLayout(value, scale),
        scale,
      ),
    );
    panel.append(cell);
  });

  const medianLine = renderPeerMedianLine(center, scale);
  if (medianLine) panel.append(medianLine);

  return panel;
}

function renderPeerComparisonTable(results, subjectTicker, classifications) {
  const table = document.createElement('div');
  table.className = 'peer-table';
  table.setAttribute('role', 'table');

  const metric = PEER_VIEWS[peerMetricIndex] || PEER_VIEWS[0];
  let ranked;
  let column;
  if (metric.key === 'overall') {
    ranked = overallLeaderboard(results);
    column = classifyPeerColumn(
      ranked.map((row) => row.overallScore),
      { floor: 1, metricNoun: 'leaderboard score' },
    );
  } else {
    ranked = rankPeerRows(results, metric.key);
    column = classifications[metric.key] || [];
  }

  const subjectIndex = ranked.findIndex(
    (row) => row.company.ticker === subjectTicker,
  );
  if (subjectIndex >= 0) {
    table.style.setProperty('--subject-index', String(subjectIndex));
  }

  table.append(renderPeerChartHeader(metric, column));

  const companies = document.createElement('div');
  companies.className = 'peer-table__companies';
  for (const { company, rank } of ranked) {
    companies.append(
      renderPeerCompany(company, company.ticker === subjectTicker, rank),
    );
  }

  table.append(
    companies,
    renderPeerMetricPanel(metric, ranked, column, subjectTicker),
  );

  bindPeerHover(table);
  return table;
}

async function loadPeerValueCard(symbol, displayName) {
  if (!peerValueCard || !peerValueMetrics) return;

  if (normalizeTicker(symbol) === '^GSPC') {
    hidePeerValueCard();
    return;
  }

  const id = ++peerRequestId;
  peerMetricIndex = 0;
  peerChartCache = null;
  const group = getCategoryPeerGroup(symbol);

  if (!group || group.peers.length === 0) {
    showComingSoon(
      group?.sector || '',
      group?.industry_group || '',
      group?.category || '',
    );
    return;
  }

  peerValueCard.hidden = false;
  peerValueCard.classList.remove('is-coming-soon');
  peerValueMetrics.innerHTML =
    '<p class="peer-value-card__loading">Loading peer stats…</p>';
  setPeerNarrative(group.sector, group.industry_group, group.category);

  const subject = {
    ticker: group.subject.ticker,
    display_name: displayName || group.subject.display_name,
  };
  const peers = group.peers.slice(0, MAX_CATEGORY_PEERS);
  const companies = [subject, ...peers];

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

    const classifications = classificationsForPeerMetrics(results);
    peerChartCache = { results, subjectTicker: subject.ticker, classifications };
    mountPeerChart();
  } catch (error) {
    if (id !== peerRequestId) return;
    console.error(error);
    peerValueMetrics.innerHTML =
      '<p class="peer-value-card__loading">Could not load peer stats right now.</p>';
  }
}

async function fetchSeries(key, symbol = activeSymbol) {
  const config = RANGES[key];
  let data;

  if (import.meta.env.DEV) {
    const url = `/api/yahoo-chart/${encodeURIComponent(symbol)}?range=${config.range}&interval=${config.interval}`;
    const response = await fetch(url);

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(
        payload?.error || `Yahoo Finance returned ${response.status}`,
      );
    }

    data = await response.json();
    if (data?.error) {
      throw new Error(data.error);
    }
  } else if (PROD_API_BASE) {
    const url = `${PROD_API_BASE}/api/yahoo-chart/${encodeURIComponent(symbol)}?range=${config.range}&interval=${config.interval}`;
    const response = await fetch(url);
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload?.error || `Yahoo Finance returned ${response.status}`);
    }
    data = await response.json();
  } else {
    const cacheUrl = `${import.meta.env.BASE_URL}chart/${cacheKeyForSymbol(symbol)}-${key}.json`;
    const cached = await fetch(cacheUrl);
    if (!cached.ok) {
      throw new Error('Live quotes are unavailable on the demo site for this symbol.');
    }
    data = await cached.json();
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
    const url = import.meta.env.DEV
      ? '/api/nasdaq-symbols'
      : SYMBOL_DIRECTORY_URL;
    const response = await fetch(url);
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
