#!/bin/bash
# bootstrap-docs.sh
# One-time bootstrap: extract all doc artifacts and ingest them into a local backend.
# Requires:
#   - Local backend running at :3001  (cd backend && npm start)
#   - Local CrystalOS running at :8001 (cd crystalos && make run-dev)
#   - AGENTS_INTERNAL_KEY env var set (defaults to dev key if absent)
#
# Usage:
#   AGENTS_INTERNAL_KEY=my-key bash scripts/bootstrap-docs.sh
#   bash scripts/bootstrap-docs.sh   # uses default dev-internal-key-change-in-prod

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CRYSTALOS_URL="${CRYSTALOS_URL:-http://localhost:8001}"
BACKEND_URL="${BACKEND_URL:-http://localhost:3001}"
AGENTS_INTERNAL_KEY="${AGENTS_INTERNAL_KEY:-dev-internal-key-change-in-prod}"

echo "Bootstrap configuration:"
echo "  Repo root:     $REPO_ROOT"
echo "  CrystalOS URL: $CRYSTALOS_URL"
echo "  Backend URL:   $BACKEND_URL"
echo ""

cd "$REPO_ROOT"

# ── Extract artifacts ─────────────────────────────────────────────────────────

echo "Extracting route artifacts..."
npx tsx scripts/extract-routes.ts

echo ""
echo "Extracting skill artifacts..."
python crystalos/scripts/extract-skills.py

echo ""
echo "Parsing tracker..."
python scripts/parse-tracker.py

echo ""
echo "Extracting changelog..."
npx tsx scripts/extract-changelog.ts

# ── Generate docs via CrystalOS ───────────────────────────────────────────────

echo ""
echo "Calling doc-writer (requires CrystalOS at $CRYSTALOS_URL)..."
CRYSTALOS_URL="$CRYSTALOS_URL" \
AGENTS_INTERNAL_KEY="$AGENTS_INTERNAL_KEY" \
python scripts/call-doc-writer.py

# ── Ingest into backend ───────────────────────────────────────────────────────

echo ""
echo "Ingesting docs (requires backend at $BACKEND_URL)..."
BACKEND_URL="$BACKEND_URL" \
AGENTS_INTERNAL_KEY="$AGENTS_INTERNAL_KEY" \
python scripts/ingest-docs.py

echo ""
echo "Ingesting changelog..."
BACKEND_URL="$BACKEND_URL" \
AGENTS_INTERNAL_KEY="$AGENTS_INTERNAL_KEY" \
python scripts/ingest-changelog.py

echo ""
echo "Bootstrap complete!"
