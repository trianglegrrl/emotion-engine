#!/usr/bin/env bash
set -euo pipefail

# Seed OpenFeelz Claude plugin state from the live OpenClaw/OpenFeelz state,
# WITHOUT mutating the live state file.
#
# We copy:
#   /home/a/.openclaw/workspace/openfeelz.json
# to:
#   <seed_dir>/state.json
#
# The Claude plugin reads/writes state at $CLAUDE_PLUGIN_DATA/state.json.

LIVE_STATE="${OPENFEELZ_LIVE_STATE:-/home/a/.openclaw/workspace/openfeelz.json}"
SEED_DIR="${OPENFEELZ_SEED_DIR:-/home/a/.openclaw/workspace/openfeelz-claude-seed}"

mkdir -p "$SEED_DIR"

if [[ ! -f "$LIVE_STATE" ]]; then
  echo "Live state not found: $LIVE_STATE" >&2
  exit 1
fi

cp -av "$LIVE_STATE" "$SEED_DIR/state.json"

# Keep a marker so it's obvious this is a copy.
echo "Seeded at $(date -Is) from $LIVE_STATE" > "$SEED_DIR/SEEDED_FROM_OPENCLAW.txt"

echo "OK: seeded Claude plugin state."
echo "  Live: $LIVE_STATE"
echo "  Seed: $SEED_DIR/state.json"
