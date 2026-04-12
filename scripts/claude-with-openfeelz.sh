#!/usr/bin/env bash
set -euo pipefail

# Launch Claude Code with the OpenFeelz inline plugin enabled, using a seeded
# *copy* of the OpenClaw/OpenFeelz state.
#
# Usage:
#   scripts/claude-with-openfeelz.sh
#   scripts/claude-with-openfeelz.sh -d hooks

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLUGIN_DIR="$ROOT_DIR/.claude-plugin"

LIVE_STATE="${OPENFEELZ_LIVE_STATE:-/home/a/.openclaw/workspace/openfeelz.json}"
SEED_DIR="${OPENFEELZ_SEED_DIR:-/home/a/.openclaw/workspace/openfeelz-claude-seed}"

# Seed state (copy, not link)
OPENFEELZ_LIVE_STATE="$LIVE_STATE" OPENFEELZ_SEED_DIR="$SEED_DIR" \
  "$ROOT_DIR/scripts/seed-claude-plugin-state.sh" >/dev/null

export CLAUDE_PLUGIN_DATA="$SEED_DIR"

echo "Launching Claude with OpenFeelz plugin:"
echo "  Plugin dir: $PLUGIN_DIR"
echo "  Plugin data: $CLAUDE_PLUGIN_DATA"
echo "  (seeded copy of $LIVE_STATE)"
echo

aexec=(claude --plugin-dir "$PLUGIN_DIR")

# Pass through any args (e.g., -d hooks)
exec "${aexec[@]}" "$@"
