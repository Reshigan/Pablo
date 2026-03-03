#!/usr/bin/env bash
set -euo pipefail

# Pablo v5 — Set OLLAMA_API_KEY as a Wrangler secret.
#
# Usage:
#   export OLLAMA_API_KEY="..."
#   ./set-ollama-secret.sh
#
# Or interactively:
#   ./set-ollama-secret.sh --prompt

if [[ "${1:-}" == "--prompt" ]]; then
  read -r -s -p "OLLAMA_API_KEY: " OLLAMA_API_KEY
  echo
fi

if [[ -z "${OLLAMA_API_KEY:-}" ]]; then
  echo "OLLAMA_API_KEY env var is required." >&2
  exit 1
fi

echo "Setting OLLAMA_API_KEY secret..."
echo "$OLLAMA_API_KEY" | npx wrangler secret put OLLAMA_API_KEY

echo "Done. Verify with: npx wrangler secret list"
