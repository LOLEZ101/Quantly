import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'public');
const outFile = path.join(outDir, 'nasdaq-symbols.json');

const NASDAQ_TRADED_URL =
  'https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqtraded.txt';

function cleanSecurityName(name) {
  return String(name || '')
    .replace(/\s+-\s+Common Stock\s*$/i, '')
    .replace(/\s+Common Stock\s*$/i, '')
    .trim();
}

function parseNasdaqTraded(text) {
  const symbols = [];
  const lines = String(text || '').split(/\r?\n/);

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line) continue;
    if (i === 0 && line.startsWith('Nasdaq Traded|')) continue;
    if (line.startsWith('File Creation Time:')) continue;

    const cols = line.split('|');
    if (cols.length < 8) continue;

    const symbol = cols[1]?.trim();
    const securityName = cols[2]?.trim();
    const testIssue = cols[7]?.trim();
    if (!symbol || testIssue === 'Y') continue;

    symbols.push({
      symbol,
      name: cleanSecurityName(securityName),
      yahooSymbol: symbol.replace(/\./g, '-'),
    });
  }

  return symbols;
}

async function loadSp500Fallback() {
  const raw = await readFile(path.join(root, 'src/sp500.json'), 'utf8');
  const rows = JSON.parse(raw);
  return rows
    .filter((row) => row.symbol !== '^GSPC')
    .map((row) => ({
      symbol: row.symbol,
      name: row.name,
      yahooSymbol: String(row.symbol).replace(/\./g, '-'),
    }));
}

async function main() {
  let symbols = [];

  try {
    const response = await fetch(NASDAQ_TRADED_URL);
    if (!response.ok) {
      throw new Error(`NASDAQ directory returned ${response.status}`);
    }
    symbols = parseNasdaqTraded(await response.text());
    if (!symbols.length) {
      throw new Error('NASDAQ directory parsed empty');
    }
    console.log(`[build] loaded ${symbols.length} NASDAQ symbols`);
  } catch (error) {
    console.warn('[build] NASDAQ fetch failed, using S&P 500 fallback:', error);
    symbols = await loadSp500Fallback();
    console.log(`[build] loaded ${symbols.length} S&P 500 symbols`);
  }

  await mkdir(outDir, { recursive: true });
  await writeFile(outFile, `${JSON.stringify(symbols)}\n`, 'utf8');
  console.log(`[build] wrote ${outFile}`);
}

main().catch((error) => {
  console.error('[build] failed to generate symbol directory:', error);
  process.exit(1);
});
