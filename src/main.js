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
import constituents from './sp500.json';

const hoverMarker = {
  id: 'hoverMarker',
  afterDatasetsDraw(chart) {
    const active = chart.getActiveElements();
    if (!active.length) return;

    const { ctx } = chart;
    const { x, y } = active[0].element;
    if (x == null || y == null) return;

    ctx.save();

    ctx.beginPath();
    ctx.arc(x, y, 18, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(47, 158, 90, 0.16)';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(x, y, 12, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(47, 158, 90, 0.28)';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.fillStyle = '#1a6b3c';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ffffff';
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

const brandEl = document.getElementById('brand');
const priceEl = document.getElementById('price');
const changeEl = document.getElementById('change');
const statusEl = document.getElementById('status');
const canvas = document.getElementById('chart');
const rangeButtons = document.querySelectorAll('.range-btn');
const searchRoot = document.getElementById('search');
const searchInput = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');

let chart;
let activeRange = '1y';
let activeSymbol = '^GSPC';
let activeName = 'S&P 500';
let requestId = 0;
let highlightedIndex = -1;
let currentMatches = [];

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

function sparseLabels(labels, maxTicks = 5) {
  if (labels.length <= maxTicks) return labels;
  const step = (labels.length - 1) / (maxTicks - 1);
  const keep = new Set(
    Array.from({ length: maxTicks }, (_, i) => Math.round(i * step)),
  );
  return labels.map((label, i) => (keep.has(i) ? label : ''));
}

async function fetchSeries(key, symbol = activeSymbol) {
  const config = RANGES[key];
  const url = `/api/yahoo/v8/finance/chart/${encodeURIComponent(symbol)}?range=${config.range}&interval=${config.interval}&includePrePost=false`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Yahoo Finance returned ${response.status}`);
  }

  const data = await response.json();
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
  gradient.addColorStop(0, 'rgba(47, 158, 90, 0.35)');
  gradient.addColorStop(1, 'rgba(47, 158, 90, 0.02)');
  return gradient;
}

function ensureChart(labels, values) {
  const ctx = canvas.getContext('2d');
  const gradient = buildGradient(ctx);

  if (chart) {
    chart.destroy();
    chart = null;
  }

  const existing = Chart.getChart(canvas);
  if (existing) existing.destroy();

  chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          data: values,
          borderColor: '#2f9e5a',
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
      ],
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
          backgroundColor: 'rgba(20, 48, 31, 0.92)',
          titleFont: { family: "'DM Sans', sans-serif", size: 14, weight: '600' },
          bodyFont: { family: "'DM Sans', sans-serif", size: 15, weight: '500' },
          padding: 12,
          cornerRadius: 10,
          displayColors: false,
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
            color: 'rgba(20, 48, 31, 0.55)',
            font: { family: "'DM Sans', sans-serif", size: 13, weight: '500' },
            padding: 10,
          },
        },
        y: {
          position: 'right',
          border: { display: false },
          grid: {
            color: 'rgba(20, 48, 31, 0.08)',
            drawBorder: false,
          },
          ticks: {
            color: 'rgba(20, 48, 31, 0.55)',
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

function setActiveButton(key) {
  rangeButtons.forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.range === key);
  });
}

function filterConstituents(query) {
  const q = query.trim().toLowerCase();
  if (!q) return constituents.slice(0, 8);

  return constituents
    .filter((item) => {
      const symbol = item.symbol.toLowerCase();
      const name = item.name.toLowerCase();
      return symbol.includes(q) || name.includes(q);
    })
    .slice(0, 8);
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
  activeSymbol = item.symbol;
  activeName = item.name;
  brandEl.textContent = item.name;
  searchInput.value = `${item.symbol} · ${item.name}`;
  closeSearchResults();
  loadRange(activeRange);
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
});

rangeButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const key = btn.dataset.range;
    if (!key) return;
    activeRange = key;
    setActiveButton(key);
    loadRange(key);
  });
});

setActiveButton(activeRange);
brandEl.textContent = activeName;
loadRange(activeRange);
