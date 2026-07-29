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

Chart.register(
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Filler,
  Tooltip,
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

const priceEl = document.getElementById('price');
const changeEl = document.getElementById('change');
const statusEl = document.getElementById('status');
const canvas = document.getElementById('chart');
const rangeButtons = document.querySelectorAll('.range-btn');

let chart;
let activeRange = '1y';
let requestId = 0;

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

async function fetchSeries(key) {
  const config = RANGES[key];
  const url = `/api/yahoo/v8/finance/chart/%5EGSPC?range=${config.range}&interval=${config.interval}&includePrePost=false`;
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

function ensureChart(labels, values) {
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.parentElement.clientHeight || 400);
  gradient.addColorStop(0, 'rgba(47, 158, 90, 0.35)');
  gradient.addColorStop(1, 'rgba(47, 158, 90, 0.02)');

  if (chart) {
    chart.data.labels = labels;
    chart.data.datasets[0].data = values;
    chart.data.datasets[0].backgroundColor = gradient;
    chart.update('active');
    return;
  }

  chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          data: values,
          borderColor: '#2f9e5a',
          backgroundColor: gradient,
          borderWidth: 3.5,
          tension: 0.45,
          fill: true,
          pointRadius: 0,
          pointHoverRadius: 7,
          pointHitRadius: 12,
          pointHoverBackgroundColor: '#1a6b3c',
          pointHoverBorderColor: '#ffffff',
          pointHoverBorderWidth: 2,
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
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(20, 48, 31, 0.92)',
          titleFont: { family: "'DM Sans', sans-serif", size: 14, weight: '600' },
          bodyFont: { family: "'DM Sans', sans-serif", size: 15, weight: '500' },
          padding: 12,
          cornerRadius: 10,
          displayColors: false,
          callbacks: {
            label: (ctx) => formatPrice(ctx.parsed.y),
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
loadRange(activeRange);
