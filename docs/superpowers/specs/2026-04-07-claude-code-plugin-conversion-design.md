# OpenFeelz: Claude Code Plugin Conversion

**Date:** 2026-04-07
**Status:** Draft
**Author:** Alaina + Claude

## Summary

Convert OpenFeelz from an OpenClaw plugin to a native Claude Code plugin, distributed via the Claude Code plugin/marketplace system. The core emotional model (PAD+Ekman+OCEAN with decay, rumination, personality) stays unchanged. The integration layer is rewritten to use Claude Code's hooks, commands, and plugin infrastructure.

## Goals

- Ship OpenFeelz as a Claude Code plugin installable via `/plugin install openfeelz`
- Zero-config by default: classification via `claude -p` uses Claude Code's own auth, no API key needed
- Anthropic-only: no OpenAI, no multi-provider support
- Clear separation between agent emotional state (default ON) and user emotion classification (default OFF)
- Unambiguous context injection that never lets the agent confuse its own emotions with the user's

## Non-Goals

- OpenClaw backwards compatibility
- OpenAI/multi-provider support
- v1 migration tooling
- Background decay service (hooks handle decay on-demand)
- Background LLM analysis service (use `/openfeelz status` for on-demand analysis; `analyzer.ts` retained but not called automatically)
- Custom emotion taxonomies (`emotionLabels` config and `custom-taxonomy.ts` dropped; can add back later)

---

## Architecture

### Plugin Manifest

`.claude-plugin/plugin.json` registers hooks, MCP server, commands, and user config.

```json
{
  "name": "openfeelz",
  "version": "2.0.0",
  "description": "Emotional model with personality-influenced decay, rumination, and multi-agent awareness for Claude Code",
  "author": { "name": "trianglegrrl", "url": "https://github.com/trianglegrrl" },
  "license": "MIT",
  "repository": "https://github.com/trianglegrrl/openfeelz",
  "keywords": ["emotion", "personality", "ocean", "pad", "affective-computing"],
  "hooks": "./hooks/hooks.json",
  "mcpServers": {
    "openfeelz": {
      "command": "node",
      "args": ["${CLAUDE_PLUGIN_ROOT}/dist/src/mcp/mcp-server.js"],
      "env": {
        "OPENFEELZ_DATA_DIR": "${CLAUDE_PLUGIN_DATA}"
      }
    }
  },
  "commands": "./commands",
  "userConfig": {
    "decayPreset": {
      "type": "string",
      "title": "Decay Preset",
      "description": "slow (time-based ~12h half-life), fast (time-based ~1h), or turn (turn-based, ~5 turns to baseline)",
      "default": "slow",
      "required": true
    },
    "agentEmotions": {
      "type": "boolean",
      "title": "Agent Emotional Model",
      "description": "Enable the agent's own emotional state with PAD dimensions, personality, and decay",
      "default": true,
      "required": true
    },
    "userEmotions": {
      "type": "boolean",
      "title": "User Emotion Classification",
      "description": "Classify emotions from the user's messages and include in context",
      "default": false
    },
    "syncUserClassification": {
      "type": "boolean",
      "title": "Synchronous User Classification",
      "description": "When user emotions are on: classify synchronously (current-turn, ~1s latency) vs async (one turn behind)",
      "default": false
    },
    "model": {
      "type": "string",
      "title": "Classification Model",
      "description": "Anthropic model for emotion classification",
      "default": "claude-haiku-4-5-20251001"
    }
  }
}
```

Only `decayPreset` and `agentEmotions` are `required: true` (prompted at install). The rest have sensible defaults and are changeable via `/openfeelz config`.

### State Storage

All state lives under `${CLAUDE_PLUGIN_DATA}`:

```
${CLAUDE_PLUGIN_DATA}/
  state.json              # Main agent emotional state
  agents/
    {agent_id}.json       # Per-agent state (for Claude Code teams/subagents)
  classifications.jsonl   # Classification log (optional)
```

`CLAUDE_PLUGIN_DATA` is a persistent directory managed by Claude Code that survives plugin updates.

---

## Hook Lifecycle

Three command hooks registered in `hooks/hooks.json`:

```json
{
  "SessionStart": [
    {
      "hooks": [
        {
          "type": "command",
          "command": "node ${CLAUDE_PLUGIN_ROOT}/dist/hooks/on-session-start.js",
          "statusMessage": "Loading emotional state...",
          "timeout": 5
        }
      ]
    }
  ],
  "UserPromptSubmit": [
    {
      "hooks": [
        {
          "type": "command",
          "command": "node ${CLAUDE_PLUGIN_ROOT}/dist/hooks/on-user-prompt.js",
          "statusMessage": "Reading emotions...",
          "timeout": 15
        }
      ]
    }
  ],
  "Stop": [
    {
      "hooks": [
        {
          "type": "command",
          "command": "node ${CLAUDE_PLUGIN_ROOT}/dist/hooks/on-stop.js",
          "statusMessage": "Processing emotions...",
          "timeout": 10,
          "async": true
        }
      ]
    }
  ]
}
```

### Hook Data Flow

```
SESSION START
─────────────
Input:  { session_id, cwd, transcript_path }
Action: Load/create state → apply decay → advance rumination → persist
Output: { hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: "<openfeelz>..." } }

EACH USER TURN (UserPromptSubmit)
─────────────────────────────────
Input:  { session_id, user_message, transcript_path }
Action: Load state → apply decay (time-based or turn-based) → advance rumination
        → if syncUserClassification + userEmotions: classify user_message via Haiku
        → format <openfeelz> block → persist
Output: { hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: "<openfeelz>..." } }

EACH ASSISTANT STOP (async)
───────────────────────────
Input:  { session_id, last_assistant_message, transcript_path }
Action: Load state
        → if agentEmotions: classify last_assistant_message via Haiku
           Fallback chain: (1) last_assistant_message from input, (2) read transcript_path, (3) skip
        → if userEmotions + !syncUserClassification: read last user message from transcript_path, classify
        → update emotion buckets → persist
        → on any classification failure: log warning, skip that classification, persist what we have
Output: {} (async, no context injection)
```

### Hook Architecture: Thin Wrappers + HookRunner

Hook scripts are thin wrappers. All logic lives in `src/hooks/runner.ts`:

```typescript
// hooks/on-user-prompt.ts (thin wrapper)
import { HookRunner } from '../src/hooks/runner.js'
const runner = new HookRunner()
const input = JSON.parse(await readStdin())
const output = await runner.handleUserPrompt(input)
process.stdout.write(JSON.stringify(output))
```

`HookRunner` is a class that:
- Reads config from `CLAUDE_PLUGIN_OPTION_*` env vars
- Resolves paths from `CLAUDE_PLUGIN_DATA` env var
- Delegates to `StateManager` for all state operations
- Delegates to `claude-classify.ts` for classification (via `claude -p`, no API key needed)
- Delegates to `prompt-formatter.ts` for context block formatting

This keeps hooks testable without mocking stdin/stdout.

---

## State Helper

A single CLI entry point for all state reads and mutations. Used by commands and available to hooks.

```
node dist/src/helpers/state-helper.js <action> [args]
```

### Actions

| Action | Args | Description |
|--------|------|-------------|
| `query` | `--format full\|summary\|dimensions\|emotions` | Apply decay, return current state |
| `reset` | `--dimensions pleasure,arousal` (optional) | Reset to baseline |
| `set-personality` | `--trait openness --value 0.8` | Set OCEAN trait, recalculate baselines+rates |
| `get-personality` | | Return OCEAN profile |
| `set-decay` | `--preset slow\|fast\|turn` | Change decay preset |
| `apply-stimulus` | `--emotion happy --intensity 0.7 --trigger "..."` | Apply emotional stimulus |
| `history` | `--limit 20` | Return recent stimuli |

Every action that reads state applies decay first. No stale reads possible.

The state-helper reads `CLAUDE_PLUGIN_DATA` and `CLAUDE_PLUGIN_OPTION_*` from environment (inherited from the plugin system).

### State Helper Output Contract

- **Success**: exit code 0, JSON on stdout: `{ "ok": true, "data": { ... } }`
- **Error**: exit code 1, JSON on stdout: `{ "ok": false, "error": "human-readable message", "code": "STATE_NOT_FOUND" | "INVALID_ARGS" | "WRITE_FAILED" | ... }`
- Command markdown files include instructions for Claude to handle errors gracefully.

---

## Decay Model

Three presets:

| Preset | Mechanism | Default Half-life | Description |
|--------|-----------|-------------------|-------------|
| `slow` | Time-based | ~12h | Human-like emotional rhythms |
| `fast` | Time-based | ~1h | Quick-cycling AI agent |
| `turn` | Turn-based | 5 turns | Emotions decay toward baseline each turn, regardless of wall clock |

### Turn-Based Decay (`turn` preset)

New field in state: `turnCount: number` (incremented on each `UserPromptSubmit`).

Each dimension/emotion tracks `lastStimulusTurn: number`. Decay formula:

```
turnsSince = state.turnCount - lastStimulusTurn
newValue = baseline + (currentValue - baseline) * e^(-rate * turnsSince)
```

Default turn-based rate: `ln(2) / 5 ≈ 0.1386` (half-life of 5 turns).

The `UserPromptSubmit` hook increments `turnCount` before applying decay.

Personality modulation of decay rates applies the same way as time-based — neuroticism slows negative emotion turn-decay, extraversion speeds sadness turn-decay, etc.

### Turn-Based Decay Integration

The existing `DecayPresetId` type changes from `"fast" | "slow" | "custom"` to `"fast" | "slow" | "turn"`. The `"custom"` preset is dropped (per-dimension overrides removed from userConfig).

`getEffectiveDecayRates()` gains a `turn` branch that returns the same rate structure but with turn-based rates (default `ln(2)/5` per dimension). Personality modulation applies the same multipliers.

`StateManager.applyDecay()` gains a branch:

```typescript
if (config.decayPreset === 'turn') {
  // Use turnCount delta instead of elapsedHours
  const turnsSince = state.turnCount - (state.lastDecayTurn ?? 0)
  if (turnsSince <= 0) return { ...state }
  dimensions = decayDimensions(state.dimensions, state.baseline, turnRates, turnsSince)
  basicEmotions = decayBasicEmotions(state.basicEmotions, turnEmotionRates, turnsSince)
} else {
  // Existing time-based path
}
```

New state fields: `turnCount: number` (incremented per UserPromptSubmit), `lastDecayTurn: number` (turn count at last decay application).

---

## Context Injection Format

The `<openfeelz>` block injected via `additionalContext`:

```xml
The following is your emotional context from OpenFeelz. <agent_emotional_state> is YOUR state. <user_emotional_state> is the HUMAN's state. Do not confuse them.

<openfeelz>
  <!-- YOUR (the AI agent's) emotional state. This is YOUR internal state, not the user's. -->
  <agent_emotional_state>
    <personality>
      openness: 0.70, conscientiousness: 0.60, extraversion: 0.50, agreeableness: 0.80, neuroticism: 0.30
    </personality>
    <dimensions>
      pleasure: elevated (0.32, baseline: 0.15), curiosity: elevated (0.72, baseline: 0.55)
    </dimensions>
    <basic_emotions>
      happiness: 0.35, surprise: 0.12
    </basic_emotions>
    <your_recent_emotions>
      2026-04-07 14:15: Felt moderately focused because working through complex design.
      2026-04-07 14:02: Felt mildly curious because exploring new architecture.
    </your_recent_emotions>
  </agent_emotional_state>

  <!-- The HUMAN USER's emotional state (classified from their messages). This is NOT your emotion. -->
  <user_emotional_state>
    <recent_emotions>
      2026-04-07 14:10: Felt moderately frustrated because deployment keeps failing.
    </recent_emotions>
    <trend>mostly frustrated (last 24h)</trend>
  </user_emotional_state>
</openfeelz>
```

Key design decisions:
- `<agent_emotional_state>` has explicit comment: "YOUR internal state, not the user's"
- `<user_emotional_state>` has explicit comment: "The HUMAN USER's emotional state. This is NOT your emotion."
- Preamble text reinforces ownership before the XML block
- `<user_emotional_state>` section only present when `userEmotions` is enabled AND there's data to show
- `<agent_emotional_state>` only present when `agentEmotions` is enabled
- Block is omitted entirely when there's nothing to show

---

## Commands (Slash Commands)

Markdown files in `commands/` that become `/openfeelz <name>` commands.

| Command | Description | Mechanism |
|---------|-------------|-----------|
| `/openfeelz status` | Show current emotional state | Calls `state-helper.js query --format full`, Claude formats output |
| `/openfeelz personality` | Show/set OCEAN profile | `state-helper.js get-personality` or `set-personality --trait X --value Y` |
| `/openfeelz reset` | Reset to baseline | `state-helper.js reset [--dimensions ...]` |
| `/openfeelz history` | Recent stimuli | `state-helper.js history --limit 20` |
| `/openfeelz decay` | Show/change decay preset | `state-helper.js set-decay --preset slow\|fast\|turn` |
| `/openfeelz wizard` | Interactive personality preset picker | Claude walks through presets, calls `state-helper.js set-personality` |
| `/openfeelz dashboard` | Launch web dashboard | Calls MCP tool to start Svelte app on local port |
| `/openfeelz config` | View/change plugin config | Claude reads/writes plugin config options (model, userEmotions, syncUserClassification) |

Each command markdown file instructs Claude to call the state-helper via Bash and format the results. All state reads go through the helper, which applies decay first. No stale reads.

---

## MCP Server

Unchanged resources and tools, with path updates:

- **Resources:** `emotion://state`, `emotion://personality`
- **Tools:** `query_emotion`, `modify_emotion`, `set_personality`
- **State path:** Read from `OPENFEELZ_DATA_DIR` env var (set by plugin manifest to `${CLAUDE_PLUGIN_DATA}`)
- **Dashboard:** Svelte app served on local port, launched via MCP tool

---

## Classification

### `claude -p` Based Classifier

Instead of making direct Anthropic API calls (which would require a separate API key), classification uses `claude -p` (Claude Code's non-interactive print mode). This piggybacks on Claude Code's own authentication and billing — zero config needed.

```bash
echo "<prompt>" | claude -p --model haiku --output-format json --max-turns 1
```

Returns structured JSON with:
- `result` — the LLM's text response (contains the classification JSON)
- `usage` — full token breakdown (input, output, cache)
- `total_cost_usd` — cost of the call
- `duration_ms` — wall clock time

**No API key needed.** No `ANTHROPIC_API_KEY` in config or env. Same billing as the main Claude Code session.

### Classifier Module

The old `classifier.ts` (Anthropic + OpenAI + HTTP backends) is replaced by `src/classify/claude-classify.ts`:

- Spawns `claude -p` as a child process
- Pipes the classification prompt to stdin
- Parses the JSON response, extracts `result`, strips markdown code blocks
- Extracts `usage` and `total_cost_usd` for token tracking
- Returns `ClassificationResult` with `usage` field
- Falls back to neutral on any failure (subprocess error, parse error, timeout)

Default model: `haiku` (configurable via `userConfig.model`).

### Separate Prompts for Agent vs User

Classification prompts live in `src/classify/prompts.ts` for easy iteration:

```typescript
export const AGENT_CLASSIFY_PROMPT = 
  "Classify the emotional tone of this AI ASSISTANT response. " +
  "Focus on the assistant's stance, engagement level, and emotional coloring — " +
  "not the content it's describing, but how it's expressing itself.\n\n" +
  "Available labels: {labels}\n\n" +
  "Return ONLY valid JSON, no markdown: " +
  "{\"label\": \"...\", \"intensity\": 0-1, \"reason\": \"short phrase\", \"confidence\": 0-1}\n\n" +
  "Assistant message:\n{text}"

export const USER_CLASSIFY_PROMPT = 
  "Classify the emotion expressed by this HUMAN USER in their message. " +
  "Focus on what the human is feeling — frustration, curiosity, excitement, etc. " +
  "Look for emotional signals in tone, word choice, punctuation, and context.\n\n" +
  "Available labels: {labels}\n\n" +
  "Return ONLY valid JSON, no markdown: " +
  "{\"label\": \"...\", \"intensity\": 0-1, \"reason\": \"short phrase\", \"confidence\": 0-1}\n\n" +
  "User message:\n{text}"
```

These are separate because:
- Agent classification evaluates AI tone/stance/engagement (how it's expressing itself)
- User classification evaluates human emotional expression (what the person is feeling)
- Both are actively being iterated on for quality — these are starting points, not final

---

## File Structure

```
openfeelz/
├── .claude-plugin/
│   └── plugin.json
├── hooks/
│   ├── hooks.json
│   ├── on-session-start.ts      # Thin wrapper → HookRunner.handleSessionStart()
│   ├── on-user-prompt.ts        # Thin wrapper → HookRunner.handleUserPrompt()
│   └── on-stop.ts               # Thin wrapper → HookRunner.handleStop()
├── commands/
│   ├── status.md
│   ├── personality.md
│   ├── reset.md
│   ├── history.md
│   ├── decay.md
│   ├── wizard.md
│   ├── dashboard.md
│   └── config.md
├── src/
│   ├── types.ts                 # Updated: add turn preset, turnCount, config changes
│   ├── hooks/
│   │   └── runner.ts            # HookRunner: all hook logic, testable
│   ├── helpers/
│   │   └── state-helper.ts      # CLI for state reads/mutations (always applies decay)
│   ├── model/                   # MOSTLY UNCHANGED
│   │   ├── emotion-model.ts     # UNCHANGED
│   │   ├── personality.ts       # UNCHANGED
│   │   ├── decay.ts             # UNCHANGED (reused for turn-based — math is generic)
│   │   ├── mapping.ts           # UNCHANGED
│   │   └── rumination.ts        # UNCHANGED
│   ├── state/                   # MOSTLY UNCHANGED
│   │   ├── state-manager.ts
│   │   ├── state-file.ts
│   │   └── multi-agent.ts       # Simplified: scan CLAUDE_PLUGIN_DATA/agents/
│   ├── classify/
│   │   ├── claude-classify.ts   # NEW: classify via claude -p (replaces classifier.ts)
│   │   └── prompts.ts           # NEW: separate agent/user classification prompts
│   ├── format/
│   │   └── prompt-formatter.ts  # Updated: <openfeelz> format with clear ownership
│   ├── config/
│   │   ├── decay-presets.ts     # Updated: add turn preset
│   │   ├── personality-presets.ts
│   │   └── resolve-config.ts    # NEW: build config from CLAUDE_PLUGIN_OPTION_* env vars
│   ├── mcp/
│   │   └── mcp-server.ts        # Updated: read OPENFEELZ_DATA_DIR
│   └── utils/
│       └── message-content.ts   # UNCHANGED
├── dashboard-app/               # UNCHANGED
├── package.json                 # Updated: remove openclaw, update exports
├── tsconfig.json
├── tsconfig.build.json
└── vitest.config.ts
```

### Files Deleted

| File | Reason |
|------|--------|
| `index.ts` | OpenClaw plugin entry point |
| `src/hook/hooks.ts` | OpenClaw hook handlers |
| `src/cli/cli.ts` | Commander.js CLI |
| `src/cli/configure-wizard.ts` | TUI wizard |
| `src/cli/configure-validation.ts` | OpenClaw config validation |
| `src/cli/backup-openclaw-config.ts` | OpenClaw config backup |
| `src/http/dashboard.ts` | HTML string dashboard |
| `src/paths.ts` | OpenClaw path resolution |
| `src/migration/migrate-v1.ts` | v1→v2 migration |
| `openclaw.plugin.json` | OpenClaw manifest |
| `hooks/openfeelz/handler.ts` | Standalone OpenClaw hook |
| `hooks/openfeelz/HOOK.md` | OpenClaw hook docs |
| `scripts/sync-to-openclaw.sh` | OpenClaw sync script |
| `src/model/custom-taxonomy.ts` | Custom taxonomies dropped (spec non-goal) |
| `src/model/goal-modulation.ts` | Dead code — nothing imports it |
| `src/tool/emotion-tool.ts` | OpenClaw tool API — orphaned after index.ts deletion |
| `src/analysis/analyzer.ts` | Background analysis service dropped — nothing calls it |
| `src/http/dashboard-html.generated.ts` | Generated HTML blob only consumed by deleted dashboard.ts |
| `src/classify/classifier.ts` + test | Replaced by `claude-classify.ts` (uses `claude -p` instead of direct API calls) |

### Files Unchanged

`src/model/emotion-model.ts`, `src/model/personality.ts`, `src/model/decay.ts` (reused for turn-based — math is generic), `src/model/mapping.ts`, `src/model/rumination.ts`, `src/state/state-manager.ts`, `src/state/state-file.ts`, `src/config/personality-presets.ts`, `src/utils/message-content.ts`, `dashboard-app/`, and their tests.

---

## Agent vs User Emotion: Feature Matrix

| Config | agentEmotions: ON | agentEmotions: OFF |
|--------|-------------------|---------------------|
| **userEmotions: ON** | Both classified. Context block has both sections. | Only user emotions classified and shown. |
| **userEmotions: OFF** | Agent emotions only. Default configuration. | Plugin does nothing. Hooks return empty. |

These are independently controlled via `userConfig` and `/openfeelz config`.

---

## Multi-Agent Lifecycle

When Claude Code spawns subagents (teams), each gets its own emotional state:

- **Agent ID**: Read from `agent_id` field in hook input JSON. Defaults to `"main"` when absent.
- **State paths**: Main agent uses `${CLAUDE_PLUGIN_DATA}/state.json`. Subagents use `${CLAUDE_PLUGIN_DATA}/agents/{agent_id}.json`.
- **Directory creation**: The `agents/` directory is created lazily by `state-file.ts` on first write (existing behavior via `mkdirSync` with `recursive: true`).
- **Discovery**: `multi-agent.ts` scans `${CLAUDE_PLUGIN_DATA}/agents/*.json` to find sibling agent states. Same pattern as before, simpler path.
- **Concurrency**: File locking per path (existing `acquireLock`/`releaseLock` in `state-file.ts`). Two agents writing different files don't contend. Same agent writing its own file is serialized by the lock.
- **Shared CLAUDE_PLUGIN_DATA**: All agents in a team share the same plugin data directory. This is a Claude Code plugin system guarantee — plugins are installed once, not per-agent.

---

## Configuration Field Mapping

Fate of every existing `EmotionEngineConfig` field in the new system:

| Old Field | New Location | Notes |
|-----------|-------------|-------|
| `apiKey` | **Removed** | Classification uses `claude -p` which inherits Claude Code's own auth — no API key needed |
| `baseUrl` | **Removed** | Anthropic-only, no custom base URL |
| `model` | `userConfig.model` | Default: `claude-haiku-4-5-20251001` |
| `provider` | **Removed** | Always Anthropic |
| `classifierUrl` | **Removed** | No external HTTP classifier |
| `confidenceMin` | Hardcoded `0.35` | Rarely changed, can expose later |
| `halfLifeHours` | Derived from `decayPreset` | `slow`=12, `fast`=1, `turn`=N/A |
| `trendWindowHours` | Hardcoded `24` | Rarely changed |
| `maxHistory` | Hardcoded `100` | Rarely changed |
| `ruminationEnabled` | Hardcoded `true` | Core feature, always on |
| `ruminationThreshold` | Hardcoded `0.7` | Rarely changed |
| `ruminationMaxStages` | Hardcoded `4` | Rarely changed |
| `realtimeClassification` | **Removed** | Replaced by `syncUserClassification` |
| `contextEnabled` | Derived from `agentEmotions` | Context injected when agent emotions on |
| `includeUserEmotions` | `userConfig.userEmotions` | Renamed for clarity |
| `decayServiceEnabled` | **Removed** | No background service, decay on-demand |
| `decayServiceIntervalMinutes` | **Removed** | No background service |
| `dashboardEnabled` | Always available via `/openfeelz dashboard` | On-demand, not always-on |
| `timezone` | System timezone | No override needed |
| `maxOtherAgents` | Hardcoded `3` | Rarely changed |
| `emotionLabels` | Hardcoded default set | Custom taxonomies dropped in v2, can add back |
| `personality` | Via `/openfeelz personality` or `/openfeelz wizard` | Set per-session, not at install |
| `decayPreset` | `userConfig.decayPreset` | Now includes `turn` option |
| `decayRateOverrides` | **Removed** | Presets replace per-dimension overrides |
| `dimensionBaselineOverrides` | **Removed** | Computed from personality |

---

## Breaking Changes (v1.x → v2.0.0)

1. **OpenClaw dependency removed** — no longer an OpenClaw plugin, requires Claude Code
2. **Context format changed** — `<emotion_state>` replaced by `<openfeelz>` with `<agent_emotional_state>` and `<user_emotional_state>` subsections
3. **OpenAI/multi-provider removed** — Anthropic API only
4. **Custom taxonomies removed** — `emotionLabels` config and `custom-taxonomy.ts` dropped
5. **Per-dimension decay overrides removed** — use presets (`slow`, `fast`, `turn`)
6. **Background services removed** — no decay service or analysis service; both happen on-demand
7. **CLI removed** — replaced by slash commands (`/openfeelz status`, etc.)
8. **State location changed** — from `~/.openclaw/workspace/openfeelz.json` to `${CLAUDE_PLUGIN_DATA}/state.json`
9. **Config location changed** — from `openclaw.json` plugin config to Claude Code plugin `userConfig`

---

## Distribution

- Package as a Claude Code plugin with `.claude-plugin/plugin.json` manifest
- Publish to a GitHub-based marketplace repository
- Users install via `/plugin install openfeelz@marketplace`
- Plugin config prompted at install (decayPreset, agentEmotions only)
- Additional config via `/openfeelz config`
- Updates via `/plugin update openfeelz`

**Note:** Until the Claude Code marketplace is widely available, users can install from the GitHub repo directly via `/plugin marketplace add trianglegrrl/openfeelz` then `/plugin install openfeelz`. Local development install: clone the repo, `npm run build`, and use `--plugin-dir` flag.

---

## Testing Strategy

### Unit Tests (vitest, existing framework)

- **HookRunner** — test each handler (`handleSessionStart`, `handleUserPrompt`, `handleStop`) with mocked StateManager, classifier, and config. Verify correct `additionalContext` output shape.
- **State helper** — test each action with mocked StateManager. Verify JSON output contract (ok/error shapes, exit codes).
- **Turn-based decay** — test `decayByTurns()` with known turn counts, verify convergence to baseline at 5-turn half-life.
- **Prompt formatter** — test new `<openfeelz>` format with agent-only, user-only, and both-enabled scenarios. Verify ownership comments are present.
- **Classifier** — test Anthropic-only path (mock fetch). Verify OpenAI code paths are gone.
- **Config resolver** — test `CLAUDE_PLUGIN_OPTION_*` env var parsing, defaults, type coercion.

### Integration Tests

- **Hook script execution** — spawn hook scripts as child processes with piped JSON stdin, verify stdout JSON output. Test with realistic hook input shapes matching Claude Code's actual schemas.
- **State-helper CLI** — run `node dist/src/helpers/state-helper.js` as subprocess, pipe args, verify JSON output.
- **MCP server** — existing MCP tests, updated for new state path.

### Smoke Test Checklist (Manual, Real Claude Code Session)

- [ ] `/plugin install openfeelz` — prompted for decayPreset and agentEmotions
- [ ] First message — SessionStart hook fires, emotional context appears in conversation
- [ ] Subsequent messages — UserPromptSubmit injects updated context
- [ ] `/openfeelz status` — shows current state with decay applied
- [ ] `/openfeelz personality set openness 0.8` — updates and recalculates
- [ ] `/openfeelz wizard` — walks through presets
- [ ] `/openfeelz reset` — resets to baseline
- [ ] `/openfeelz config` — shows and modifies config options
- [ ] Enable `userEmotions` via config — user emotions appear in context block
- [ ] Switch `decayPreset` to `turn` — verify turn-based decay
- [ ] MCP tools respond correctly
- [ ] `/openfeelz dashboard` — launches web UI
