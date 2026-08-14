import { cp, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');

async function main() {
  await cp(path.join(dist, 'index.source.html'), path.join(root, 'index.html'));
  await rm(path.join(root, 'assets'), { recursive: true, force: true });
  await cp(path.join(dist, 'assets'), path.join(root, 'assets'), {
    recursive: true,
  });
  await cp(
    path.join(dist, 'nasdaq-symbols.json'),
    path.join(root, 'nasdaq-symbols.json'),
  );
  console.log('[build] published dist/ to repo root for GitHub Pages');
}

main().catch((error) => {
  console.error('[build] failed to publish GitHub Pages root files:', error);
  process.exit(1);
});
