#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import YahooFinance from 'yahoo-finance2';
import { adrMetadataFor, formatDividendYield, normalizeDividendYield } from '../src/yahoo/normalize-dividend-yield.js';

const yahooFinance = new YahooFinance({
  suppressNotices: ['yahooSurvey'],
  queue: { concurrency: 2, interval: 300 },
});

const hierarchy = JSON.parse(
  readFileSync(new URL('../src/peer-demo/quantree-hierarchy.json', import.meta.url)),
);

const tickers = [];
for (const groups of Object.values(hierarchy.tree)) {
  for (const niches of Object.values(groups)) {
    for (const items of Object.values(niches)) {
      for (const item of items) tickers.push(item.t);
    }
  }
}

const uniqueTickers = [...new Set(tickers)];
const flagged = [];

for (const symbol of uniqueTickers) {
  try {
    const result = await yahooFinance.quoteSummary(symbol, {
      modules: ['summaryDetail', 'price', 'defaultKeyStatistics'],
    });
    const summaryDetail = result.summaryDetail || {};
    const price = result.price || {};
    const stats = result.defaultKeyStatistics || {};
    const normalized = normalizeDividendYield({ summaryDetail, price, stats });

    const legacy =
      summaryDetail.dividendYield?.raw ??
      summaryDetail.dividendYield ??
      summaryDetail.trailingAnnualDividendYield?.raw ??
      summaryDetail.trailingAnnualDividendYield ??
      null;
    let legacyDisplay = legacy;
    if (legacyDisplay != null && legacyDisplay > 0 && legacyDisplay < 1) {
      legacyDisplay *= 100;
    }

    const suspiciousLegacy = legacyDisplay != null && legacyDisplay > 10;
    const missingNormalized = normalized == null;
    const hasAdrMeta = adrMetadataFor(symbol) != null;

    if (suspiciousLegacy || (missingNormalized && hasAdrMeta)) {
      flagged.push({
        symbol,
        legacyDisplayPct:
          legacyDisplay != null
            ? `${legacyDisplay.toLocaleString('en-US', { maximumFractionDigits: 1 })}%`
            : null,
        normalizedDisplay: formatDividendYield(normalized),
        hasAdrMeta,
        underlying: adrMetadataFor(symbol)?.underlying ?? null,
      });
    }
  } catch {
    // Skip symbols Yahoo does not resolve.
  }
}

console.log(`Scanned ${uniqueTickers.length} hierarchy tickers`);
console.log(`Flagged ${flagged.length} suspicious/missing dividend yields`);
for (const row of flagged.slice(0, 50)) {
  console.log(JSON.stringify(row));
}
if (flagged.length > 50) {
  console.log(`... and ${flagged.length - 50} more`);
}
