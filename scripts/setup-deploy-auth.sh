#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GH="${HOME}/.local/bin/gh"

echo "== Quantly deploy auth setup =="
echo

if [[ ! -x "$GH" ]]; then
  echo "Install GitHub CLI first: https://cli.github.com/"
  exit 1
fi

echo "1) GitHub (repo + workflow scopes for push and repo variables)"
echo "   Opening browser login..."
"$GH" auth login -h github.com -p https -s repo -s workflow -w

echo
echo "2) Cloudflare (for Yahoo proxy worker)"
echo "   Opening browser login..."
cd "$ROOT"
npx wrangler login

echo
echo "Auth setup complete. Next:"
echo "  npm run deploy:proxy"
echo "  npm run setup:pages-api -- https://stattest-yahoo-proxy.<your-subdomain>.workers.dev"
