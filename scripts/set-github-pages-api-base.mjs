import { execFileSync } from 'node:child_process';

const apiBase = process.argv[2] || process.env.VITE_API_BASE || '';

if (!apiBase) {
  console.error('Usage: npm run setup:pages-api -- https://your-worker.workers.dev');
  process.exit(1);
}

const gh = `${process.env.HOME}/.local/bin/gh`;

try {
  execFileSync(
    gh,
    ['variable', 'set', 'VITE_API_BASE', '--body', apiBase, '--repo', 'LOLEZ101/Quantly'],
    { stdio: 'inherit' },
  );
  console.log(`[setup] Set VITE_API_BASE=${apiBase} on LOLEZ101/Quantly`);
  console.log('[setup] Re-run the "Deploy to GitHub Pages" workflow to rebuild with live metrics.');
} catch (error) {
  console.error('[setup] Failed to set repo variable. Run: gh auth login -h github.com -s workflow');
  process.exit(1);
}
