const ALLOWED_ORIGINS = new Set([
  'https://lolez101.github.io',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]);

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const allowOrigin = ALLOWED_ORIGINS.has(origin) ? origin : ALLOWED_ORIGINS.values().next().value;
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function jsonResponse(request, status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(request),
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

async function proxyYahooChart(request, symbol, searchParams) {
  const range = searchParams.get('range') || '1y';
  const interval = searchParams.get('interval') || '1d';
  const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${encodeURIComponent(range)}&interval=${encodeURIComponent(interval)}`;
  const response = await fetch(yahooUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; QuantlyStatTest/1.0)',
    },
  });

  if (!response.ok) {
    return jsonResponse(request, response.status, {
      error: `Yahoo Finance returned ${response.status}`,
    });
  }

  const data = await response.json();
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      ...corsHeaders(request),
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

async function proxyYahooQuote(request, symbol) {
  const yahooUrl = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}`;
  const response = await fetch(yahooUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; QuantlyStatTest/1.0)',
    },
  });

  if (!response.ok) {
    return jsonResponse(request, response.status, {
      error: `Yahoo quote returned ${response.status}`,
    });
  }

  const data = await response.json();
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      ...corsHeaders(request),
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    const url = new URL(request.url);
    const { pathname, searchParams } = url;

    const chartMatch = pathname.match(/^\/api\/yahoo-chart\/([^/]+)\/?$/);
    if (chartMatch) {
      return proxyYahooChart(request, decodeURIComponent(chartMatch[1]), searchParams);
    }

    const quoteMatch = pathname.match(/^\/api\/yahoo-quote\/([^/]+)\/?$/);
    if (quoteMatch) {
      return proxyYahooQuote(request, decodeURIComponent(quoteMatch[1]));
    }

    if (pathname === '/health') {
      return jsonResponse(request, 200, { ok: true });
    }

    return jsonResponse(request, 404, { error: 'Not found' });
  },
};
