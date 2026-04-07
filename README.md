# OpenFeelz

> *"Let's build robots with Genuine People Personalities, they said. So they tried it out with me. I'm a personality prototype. You can tell can't you?"*
> -- Douglas Adams, *The Hitchhiker's Guide to the Galaxy*

[![CI](https://github.com/trianglegrrl/openfeelz/actions/workflows/ci.yml/badge.svg)](https://github.com/trianglegrrl/openfeelz/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](https://www.typescriptlang.org/)
[![npm](https://img.shields.io/npm/v/openfeelz.svg)](https://www.npmjs.com/package/openfeelz)

A [Claude Code](https://docs.anthropic.com/en/docs/claude-code) plugin that gives AI agents a multidimensional emotional model with personality-influenced decay, rumination, style profiling, and multi-agent awareness.

Most agents vibes-check each message independently and forget everything between turns. OpenFeelz gives them emotional short-term memory -- the agent knows you've been frustrated for the last three messages, and it carries that context forward. It's not sentience, it's just better interaction design. (But it's pretty cool.)

## Features

- **PAD Dimensional Model** -- Pleasure, Arousal, Dominance + Connection, Curiosity, Energy, Trust
- **Ekman Basic Emotions** -- Happiness, Sadness, Anger, Fear, Disgust, Surprise
- **OCEAN Personality** -- Big Five traits influence baselines, decay rates, and response intensity
- **Exponential Decay** -- Emotions fade toward personality-influenced baselines over time, with `slow`, `fast`, and `turn`-based presets
- **Rumination Engine** -- Intense emotions continue to influence state across interactions
- **User Style Profiling** -- Learns your communication style (hyperbole, profanity, expressiveness, sarcasm) and calibrates classification accordingly
- **Token Usage Tracking** -- Tracks classification costs so you always know what the emotional model is spending
- **Multi-Agent Awareness** -- Agents see other agents' emotional states in the system prompt
- **MCP Server** -- Expose emotional state to Cursor, Claude Desktop, and other MCP-compatible clients
- **Slash Commands** -- `/openfeelz status`, `personality`, `reset`, `history`, `decay`, `wizard`, `dashboard`, `config`, `style`
- **Web Dashboard** -- Glassmorphism UI for real-time emotional state visualization

## Installation

From the Claude Code plugin marketplace:

```
/plugin marketplace add trianglegrrl/openfeelz
/plugin install openfeelz
```

Claude Code will prompt you for configuration options during install (decay preset, agent emotions toggle). You can change these later with `/openfeelz config`.

For local development, clone the repo, run `npm run build`, then launch Claude Code with the `--plugin-dir` flag pointing to your checkout:

```bash
claude --plugin-dir /path/to/openfeelz
```

**No API key needed.** Classification runs via `claude -p` (the Claude CLI's prompt mode), which uses your existing Claude Code authentication. No separate Anthropic API key, no OpenAI key, no environment variables to configure.

## How It Works

Every turn, OpenFeelz hooks into the Claude Code lifecycle:

```
User sends a message
    |
    v
  [UserPromptSubmit hook]
    |
    v
  1. Load emotional state from disk
  2. Apply exponential decay (time-based or turn-based)
  3. Advance any active rumination entries
  4. If sync classification is on: classify user emotion (with style profile)
  5. Inject <openfeelz> context via additionalContext
    |
    v
  Agent sees emotional context
    |
    v
  [Agent responds]
    |
    v
  [Stop hook (async)]
    |
    v
  1. Classify agent + user emotions via claude -p
  2. Map to dimensional changes, start rumination if intense
  3. If profiling interval reached: update user style profile
  4. Save state to disk
```

### What the Agent Sees

The plugin injects an `<openfeelz>` block into the agent's context with clearly separated sections:

```xml
The following is your emotional context from OpenFeelz. <agent_emotional_state>
is YOUR state. <user_emotional_state> is the HUMAN's state. Do not confuse them.

<openfeelz>
  <!-- YOUR (the AI agent's) emotional state. This is YOUR internal state, not the user's. -->
  <agent_emotional_state>
    <personality>
      openness: 0.70, conscientiousness: 0.60, extraversion: 0.50,
      agreeableness: 0.80, neuroticism: 0.30
    </personality>
    <dimensions>
      pleasure: lowered (-0.12, baseline: 0.08)
      arousal: elevated (0.18, baseline: 0.00)
      curiosity: elevated (0.72, baseline: 0.60)
    </dimensions>
    <basic_emotions>
      happiness: 0.12
      surprise: 0.08
    </basic_emotions>
    <your_recent_emotions>
      2026-04-07 09:10: Felt moderately focused because working through error logs.
    </your_recent_emotions>
  </agent_emotional_state>

  <!-- The HUMAN USER's emotional state (classified from their messages). This is NOT your emotion. -->
  <user_emotional_state>
    <recent_emotions>
      2026-04-07 09:15: Felt strongly frustrated because deployment keeps failing.
      2026-04-07 08:40: Felt moderately anxious because tight deadline approaching.
    </recent_emotions>
    <trend>mostly frustrated (last 24h)</trend>
  </user_emotional_state>
</openfeelz>
```

- **`<agent_emotional_state>`** -- The agent's own OCEAN personality, dimensional deviations, basic emotions, and recent emotion history. Always present when `agentEmotions` is enabled.
- **`<user_emotional_state>`** -- The human's classified emotions with timestamps, intensity, triggers, and trend. Only present when `userEmotions` is enabled and there's data to show.

The block only appears when there's something to show. Both sections are explicitly labeled with XML comments so the agent never confuses its own emotions with the user's.

## Style Profiling

OpenFeelz learns how you communicate so it can tell the difference between "this user is genuinely furious" and "this user just talks like that."

### The Four Dimensions

| Dimension | What It Measures | 0.0 | 1.0 |
|-----------|-----------------|-----|-----|
| **hyperboleTendency** | Exaggeration in language | Understated, literal | Hyperbolic, dramatic |
| **casualProfanity** | Use of casual swearing | None | Frequent |
| **emotionalExpressiveness** | How much emotion shows in text | Flat, terse | Very expressive |
| **sarcasmFrequency** | Frequency of sarcasm/irony | Straightforward | Frequently sarcastic |

### How It Works

1. **Batch profiling**: Every 10 messages (configurable), OpenFeelz sends recent message excerpts to `claude -p` and asks it to score the four dimensions.
2. **EMA blending**: New observations are blended into the existing profile using an exponential moving average. Early samples carry more weight; the profile stabilizes as sample size grows.
3. **Maturity threshold**: The style profile only influences classification after 10+ samples, so the system doesn't jump to conclusions from a single message.
4. **Staleness**: If 30+ days pass with no new messages, the sample size is reduced so fresh observations carry more weight again. Your profile re-adapts naturally.

### Viewing and Adjusting

```
/openfeelz style
```

Shows your current style profile with all four dimension scores, sample size, and last update time. You can manually override any dimension -- for example, if the system thinks you're more sarcastic than you are. User overrides are protected: the auto-profiler will never change a dimension you've manually set.

## Decay Model

Emotions return to personality-influenced baselines via exponential decay:

```
newValue = baseline + (currentValue - baseline) * e^(-rate * elapsedHours)
halfLife = ln(2) / rate
```

### Presets

| Preset | Mode | Half-Life | Best For |
|--------|------|-----------|----------|
| `slow` | Time-based | ~12h (varies by dimension) | Human-like emotional cadence (default) |
| `fast` | Time-based | ~1h (all dimensions) | AI-style, rapid emotional cycling |
| `turn` | Turn-based | ~5 turns | Per-conversation, wall-clock independent |

### Default Rates (slow preset)

| Dimension / Emotion | Rate (per hour) | Half-Life | Notes |
|---------------------|-----------------|-----------|-------|
| Pleasure | 0.058 | ~12h | |
| Arousal | 0.087 | ~8h | Activation calms quickly |
| Dominance | 0.046 | ~15h | Sense of control shifts slowly |
| Connection | 0.035 | ~20h | Social bonds persist |
| Curiosity | 0.058 | ~12h | |
| Energy | 0.046 | ~15h | |
| Trust | 0.035 | ~20h | Hard-won, slow to fade |
| Happiness | 0.058 | ~12h | |
| Sadness | 0.046 | ~15h | Lingers longer than joy |
| Anger | 0.058 | ~12h | |
| Fear | 0.058 | ~12h | |
| Disgust | 0.046 | ~15h | |
| Surprise | 0.139 | ~5h | Fades the fastest |

### Personality Modulation

OCEAN traits adjust decay rates:

- **High neuroticism** -- Negative emotions linger (~0.84-0.88x decay rate)
- **High extraversion** -- Sadness fades faster (~1.16x), arousal/pleasure recover quicker
- **High agreeableness** -- Anger fades faster (~1.12x), connection decays slower
- **High openness** -- Curiosity and surprise persist longer

### When Decay Runs

Decay is computed on-demand, not on a timer:

1. **`UserPromptSubmit` hook** -- Primary mechanism. Applied based on elapsed time (or turn count) since last update.
2. **MCP tool `query` action** -- Decay applied before reading, so values are always current.

## Configuration

OpenFeelz is configured through the Claude Code plugin system. During installation, you'll be prompted for the key settings:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `decayPreset` | `"slow"` \| `"fast"` \| `"turn"` | `"slow"` | Decay speed: slow (~12h), fast (~1h), or turn-based (~5 turns) |
| `agentEmotions` | boolean | `true` | Enable the agent's own emotional state |
| `userEmotions` | boolean | `false` | Classify emotions from user messages |
| `syncUserClassification` | boolean | `false` | Classify user emotions synchronously (current-turn, ~1s latency) vs async (one turn behind) |
| `model` | string | `claude-haiku-4-5-20251001` | Anthropic model for emotion classification |

Additional configuration is available via `/openfeelz config`, which lets you view and modify all settings including rumination, context injection, personality traits, and per-dimension decay rate overrides.

### Full Options Reference

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `model` | string | `claude-haiku-4-5-20251001` | Classification model (via `claude -p`) |
| `confidenceMin` | number | `0.35` | Min confidence threshold |
| `halfLifeHours` | number | `12` | Global decay half-life (trend window) |
| `trendWindowHours` | number | `24` | Trend computation window |
| `maxHistory` | number | `100` | Max stored stimuli per agent/user |
| `ruminationEnabled` | boolean | `true` | Enable rumination engine |
| `ruminationThreshold` | number | `0.7` | Intensity threshold for rumination |
| `ruminationMaxStages` | number | `4` | Max rumination stages |
| `contextEnabled` | boolean | `true` | Inject emotion context into agent prompt |
| `agentEmotions` | boolean | `true` | Enable agent emotional model |
| `userEmotions` | boolean | `false` | Classify user emotions |
| `syncUserClassification` | boolean | `false` | Sync vs async user classification |
| `decayPreset` | `"fast"` \| `"slow"` \| `"turn"` | `"slow"` | Decay speed preset |
| `maxOtherAgents` | number | `3` | Max other agents shown in context |
| `emotionLabels` | string[] | *(21 built-in)* | Custom label taxonomy |
| `personality` | object | all `0.5` | OCEAN trait values |
| `decayRates` | object | *(see table)* | Per-dimension rate overrides |
| `dimensionBaselines` | object | *(computed)* | Per-dimension baseline overrides |

## Commands

All commands are available as `/openfeelz <command>` in Claude Code:

| Command | Description |
|---------|-------------|
| `/openfeelz status` | Formatted emotional state with bars, dimensions, and token usage |
| `/openfeelz personality` | View or set OCEAN personality traits |
| `/openfeelz reset` | Reset emotional state to personality baseline |
| `/openfeelz history` | Show recent emotional stimuli |
| `/openfeelz decay` | Show or change decay preset (slow/fast/turn) |
| `/openfeelz wizard` | Interactive personality preset picker with 10 famous-personality profiles |
| `/openfeelz dashboard` | Launch the web dashboard |
| `/openfeelz config` | View or change plugin configuration |
| `/openfeelz style` | View or adjust your communication style profile |

### Personality Wizard

`/openfeelz wizard` runs an interactive flow where you pick from 10 personality presets (OCEAN profiles based on biographical research) or go fully custom:

| Preset | Description |
|--------|-------------|
| **Albert Einstein** | Theoretical physicist -- high openness & conscientiousness, introspective |
| **Marie Curie** | Physicist and chemist -- perseverance, solitary focus |
| **Nelson Mandela** | Anti-apartheid leader -- high agreeableness & extraversion, emotional stability |
| **Wangari Maathai** | Environmentalist, Nobel Peace laureate -- visionary, resilient |
| **Frida Kahlo** | Painter -- high openness and emotional intensity |
| **Confucius** | Philosopher and teacher -- high conscientiousness & agreeableness |
| **Simon Bolivar** | Liberator and revolutionary -- visionary, charismatic, driven |
| **Sitting Bull** | Lakota leader -- steadfast, defiant sovereignty, calm under pressure |
| **Sejong the Great** | King and scholar, creator of Hangul -- scholarly, benevolent, humble |
| **Rabindranath Tagore** | Poet and philosopher, Nobel laureate -- very high openness and agreeableness |

After picking a preset (or skipping to custom), you can optionally configure decay speed, rumination, and other settings.

## MCP Server

Works with any MCP-compatible client (Cursor, Claude Desktop, etc.). The plugin registers the MCP server automatically when installed. For standalone use:

```json
{
  "mcpServers": {
    "openfeelz": {
      "command": "npx",
      "args": ["openfeelz/mcp"]
    }
  }
}
```

**Resources:** `emotion://state`, `emotion://personality`

**Tools:** `query_emotion`, `modify_emotion`, `set_personality`

## Token Usage

Every emotion classification call uses tokens. OpenFeelz tracks cumulative usage -- input tokens, output tokens, estimated cost, and total classification count. Run `/openfeelz status` to see your running totals. Classification uses `claude-haiku-4-5` by default, which keeps costs minimal (fractions of a cent per classification).

## Dashboard

`/openfeelz dashboard` launches a glassmorphism-styled web UI for real-time visualization of PAD dimensions, basic emotions, OCEAN profile, recent stimuli, and active rumination.

## Architecture

```
.claude-plugin/
  plugin.json          Plugin manifest: hooks, MCP, commands, userConfig
hooks/
  hooks.json           Hook event registration (SessionStart, UserPromptSubmit, Stop)
  on-session-start.js  SessionStart entry point
  on-user-prompt.js    UserPromptSubmit entry point
  on-stop.js           Stop entry point (async)
commands/
  status.md            /openfeelz status
  personality.md       /openfeelz personality
  reset.md             /openfeelz reset
  history.md           /openfeelz history
  decay.md             /openfeelz decay
  wizard.md            /openfeelz wizard
  dashboard.md         /openfeelz dashboard
  config.md            /openfeelz config
  style.md             /openfeelz style
src/
  types.ts             All interfaces (DimensionalState, BasicEmotions, OCEANProfile, etc.)
  model/
    emotion-model.ts   Core model: clamping, primary detection, intensity, deltas
    personality.ts     OCEAN: baselines, decay rates, rumination probability
    decay.ts           Exponential decay toward personality-influenced baselines
    mapping.ts         Emotion label -> dimension/emotion delta mapping (60+ labels)
    rumination.ts      Multi-stage internal processing for intense emotions
  state/
    state-manager.ts   Orchestrator: classify + map + decay + ruminate + persist
    state-file.ts      Atomic JSON I/O with file locking
    multi-agent.ts     Scan sibling agent states for awareness
  classify/
    claude-classify.ts Emotion classification via claude -p
    prompts.ts         Classification prompt templates
    style-profiler.ts  EMA-based user style profiling
    style-profiler-prompt.ts  Profiling prompt builder
  config/
    resolve-config.ts  Merge env vars + plugin userConfig into resolved config
    decay-presets.ts   Fast/slow/turn decay rate tables
    personality-presets.ts  10 famous-personality OCEAN profiles
    style-config.ts    Style profiling configuration defaults
  hooks/
    runner.ts          HookRunner: SessionStart, UserPromptSubmit, Stop handlers
  format/
    prompt-formatter.ts  <openfeelz> block builder with agent/user sections
    status-markdown.ts   Formatted status output for /openfeelz status
  helpers/
    state-helper.ts    Shared state loading utilities
  utils/
    claude-cli.ts      claude -p wrapper for classification calls
    excerpt.ts         Token-limited excerpt extraction
    message-content.ts Message content parsing
  mcp/
    mcp-server.ts      MCP server: resources + tools
```

## Development

```bash
npm install
npm test              # Run all tests (vitest)
npm run test:watch    # Watch mode
npm run test:coverage # Coverage report
npm run typecheck     # TypeScript strict mode
npm run lint          # oxlint
npm run build         # Compile to dist/
```

## Contributing

Issues, PRs, and questions are all welcome. If you want to poke around the model or improve it, please do -- I'd love to collaborate. :)

## License

[MIT](LICENSE)

---

Made with love by [@trianglegrrl](https://github.com/trianglegrrl)
