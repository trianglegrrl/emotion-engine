# OpenFeelz Claude Code Plugin Conversion — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert OpenFeelz from an OpenClaw plugin to a Claude Code plugin, keeping the core emotional model unchanged and rewriting the integration layer.

**Architecture:** Pure plugin approach — hooks as thin Node scripts calling a shared HookRunner, state-helper CLI for commands, MCP server for external tools. Core model code reused where possible, dead code aggressively removed.

**Tech Stack:** TypeScript, vitest, Node.js 22, Anthropic Messages API, MCP SDK

**Spec:** `docs/superpowers/specs/2026-04-07-claude-code-plugin-conversion-design.md`

---

## Chunk 1: Cleanup, Types & Config Foundation

Delete OpenClaw-specific files, update types for the new config shape, create plugin manifest and config resolver.

### Task 1.1: Delete OpenClaw Files

**Files:**
- Delete: `index.ts` (OpenClaw entry point)
- Delete: `src/hook/hooks.ts` (OpenClaw hook handlers)
- Delete: `src/cli/*.ts` (Commander.js CLI — all 6 files + tests)
- Delete: `src/http/dashboard.ts` (HTML dashboard)
- Delete: `src/http/dashboard-html.generated.ts` (generated HTML blob only consumed by dashboard.ts)
- Delete: `src/paths.ts` (OpenClaw path resolution)
- Delete: `src/migration/migrate-v1.ts` (v1 migration)
- Delete: `openclaw.plugin.json` (OpenClaw manifest)
- Delete: `hooks/openfeelz/` (standalone OpenClaw hook)
- Delete: `scripts/sync-to-openclaw.sh`
- Delete: `src/model/custom-taxonomy.ts` + test (custom taxonomies dropped per spec non-goals)
- Delete: `src/model/goal-modulation.ts` + test (dead code — nothing imports it)
- Delete: `src/tool/emotion-tool.ts` + test (OpenClaw tool API — orphaned after index.ts deletion)
- Delete: `src/analysis/analyzer.ts` + test (background analysis service dropped — nothing calls it)

- [ ] **Step 1: Delete all OpenClaw-specific and dead code files**

```bash
rm -f index.ts openclaw.plugin.json scripts/sync-to-openclaw.sh
rm -rf src/hook src/cli src/http src/migration src/paths.ts
rm -rf hooks/openfeelz
rm -f src/model/custom-taxonomy.ts src/model/custom-taxonomy.test.ts
rm -f src/model/goal-modulation.ts src/model/goal-modulation.test.ts
rm -f src/tool/emotion-tool.ts src/tool/emotion-tool.test.ts
rm -rf src/tool
rm -f src/analysis/analyzer.ts src/analysis/analyzer.test.ts
rm -rf src/analysis
```

- [ ] **Step 2: Verify build still compiles (expect errors — that's fine, we'll fix in next tasks)**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: Errors about missing imports from deleted files. This confirms we removed the right things.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: remove OpenClaw-specific files (index, hooks, cli, paths, migration, dashboard)"
```

### Task 1.2: Update Types for New Config Shape

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: Write test for new config types**

Create `src/config/resolve-config.test.ts` (will be used in Task 1.3, but define expected types now):

```typescript
import { describe, it, expect } from 'vitest'
import type { EmotionEngineConfig } from '../types.js'

describe('EmotionEngineConfig type', () => {
  it('accepts turn as a decay preset', () => {
    const config: EmotionEngineConfig = {
      model: 'claude-haiku-4-5-20251001',
      confidenceMin: 0.35,
      halfLifeHours: 12,
      trendWindowHours: 24,
      maxHistory: 100,
      ruminationEnabled: true,
      ruminationThreshold: 0.7,
      ruminationMaxStages: 4,
      contextEnabled: true,
      agentEmotions: true,
      userEmotions: false,
      syncUserClassification: false,
      maxOtherAgents: 3,
      emotionLabels: ['neutral', 'happy', 'sad'],
      personality: {
        openness: 0.5,
        conscientiousness: 0.5,
        extraversion: 0.5,
        agreeableness: 0.5,
        neuroticism: 0.5,
      },
      decayPreset: 'turn',
      decayRateOverrides: {},
      dimensionBaselineOverrides: {},
    }
    expect(config.decayPreset).toBe('turn')
    expect(config.agentEmotions).toBe(true)
    expect(config.userEmotions).toBe(false)
  })
})
```

- [ ] **Step 2: Run test — should fail (types don't have `turn`, `agentEmotions`, etc. yet)**

Run: `npx vitest run src/config/resolve-config.test.ts`
Expected: Type errors

- [ ] **Step 3: Update `src/types.ts`**

Changes to `EmotionEngineConfig`:
- Change `decayPreset` type from `"fast" | "slow" | "custom"` to `"fast" | "slow" | "turn"`
- Remove: `apiKey`, `baseUrl`, `provider`, `classifierUrl`, `realtimeClassification`, `includeUserEmotions`, `decayServiceEnabled`, `decayServiceIntervalMinutes`, `dashboardEnabled`, `timezone`
- Add: `agentEmotions: boolean`, `userEmotions: boolean`, `syncUserClassification: boolean`

Changes to `EmotionEngineState`:
- Add: `turnCount: number`, `lastDecayTurn: number`
- Remove: `cachedAnalysis?: CachedAnalysis` field (nothing writes to it after analysis service removal)

Types to delete entirely:
- `CachedPersonalityAnalysis` interface
- `CachedEmotionalStateDescription` interface
- `CachedAnalysis` interface

Update `DEFAULT_CONFIG` to match.

- [ ] **Step 4: Run test — should pass**

Run: `npx vitest run src/config/resolve-config.test.ts`
Expected: PASS

- [ ] **Step 5: Fix any other tests broken by type changes**

Run: `npx vitest run 2>&1 | grep FAIL`
Fix imports and type references in existing tests that reference removed fields.

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/config/resolve-config.test.ts
git commit -m "feat: update types for Claude Code plugin (add turn preset, agent/user emotion flags)"
```

### Task 1.3: Create Config Resolver

**Files:**
- Create: `src/config/resolve-config.ts`
- Modify: `src/config/resolve-config.test.ts`

- [ ] **Step 1: Write tests for config resolution from env vars**

Add to `src/config/resolve-config.test.ts`:

```typescript
import { resolveConfig } from './resolve-config.js'

describe('resolveConfig', () => {
  it('returns defaults when no env vars set', () => {
    const config = resolveConfig({})
    expect(config.model).toBe('claude-haiku-4-5-20251001')
    expect(config.decayPreset).toBe('slow')
    expect(config.agentEmotions).toBe(true)
    expect(config.userEmotions).toBe(false)
    expect(config.syncUserClassification).toBe(false)
  })

  it('reads CLAUDE_PLUGIN_OPTION_* env vars', () => {
    const env = {
      CLAUDE_PLUGIN_OPTION_DECAYPRESET: 'turn',
      CLAUDE_PLUGIN_OPTION_AGENTEMOTIONS: 'false',
      CLAUDE_PLUGIN_OPTION_USEREMOTIONS: 'true',
      CLAUDE_PLUGIN_OPTION_SYNCUSERCLASSIFICATION: 'true',
      CLAUDE_PLUGIN_OPTION_MODEL: 'claude-haiku-4-5-20251001',
    }
    const config = resolveConfig(env)
    expect(config.decayPreset).toBe('turn')
    expect(config.agentEmotions).toBe(false)
    expect(config.userEmotions).toBe(true)
    expect(config.syncUserClassification).toBe(true)
  })

  it('reads ANTHROPIC_API_KEY from env', () => {
    const env = { ANTHROPIC_API_KEY: 'sk-ant-test' }
    const config = resolveConfig(env)
    expect(config.apiKey).toBe('sk-ant-test')
  })

  it('resolves data dir from CLAUDE_PLUGIN_DATA', () => {
    const env = { CLAUDE_PLUGIN_DATA: '/tmp/openfeelz-data' }
    const config = resolveConfig(env)
    expect(config.dataDir).toBe('/tmp/openfeelz-data')
  })
})
```

- [ ] **Step 2: Run tests — should fail**

Run: `npx vitest run src/config/resolve-config.test.ts`
Expected: FAIL — module doesn't exist yet

- [ ] **Step 3: Implement `src/config/resolve-config.ts`**

```typescript
import type { EmotionEngineConfig } from '../types.js'
import { DEFAULT_CONFIG } from '../types.js'

export interface ResolvedConfig extends EmotionEngineConfig {
  apiKey?: string
  dataDir: string
}

function envBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback
  return value.toLowerCase() === 'true'
}

export function resolveConfig(env: Record<string, string | undefined> = process.env): ResolvedConfig {
  return {
    ...DEFAULT_CONFIG,
    model: env.CLAUDE_PLUGIN_OPTION_MODEL ?? DEFAULT_CONFIG.model,
    decayPreset: (env.CLAUDE_PLUGIN_OPTION_DECAYPRESET as ResolvedConfig['decayPreset']) ?? DEFAULT_CONFIG.decayPreset,
    agentEmotions: envBool(env.CLAUDE_PLUGIN_OPTION_AGENTEMOTIONS, DEFAULT_CONFIG.agentEmotions),
    userEmotions: envBool(env.CLAUDE_PLUGIN_OPTION_USEREMOTIONS, DEFAULT_CONFIG.userEmotions),
    syncUserClassification: envBool(env.CLAUDE_PLUGIN_OPTION_SYNCUSERCLASSIFICATION, DEFAULT_CONFIG.syncUserClassification),
    apiKey: env.ANTHROPIC_API_KEY,
    dataDir: env.CLAUDE_PLUGIN_DATA ?? env.OPENFEELZ_DATA_DIR ?? '/tmp/openfeelz',
  }
}
```

- [ ] **Step 4: Run tests — should pass**

Run: `npx vitest run src/config/resolve-config.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/config/resolve-config.ts src/config/resolve-config.test.ts
git commit -m "feat: add config resolver for CLAUDE_PLUGIN_OPTION_* env vars"
```

### Task 1.4: Create Plugin Manifest and Hooks Config

**Files:**
- Create: `.claude-plugin/plugin.json`
- Create: `hooks/hooks.json`

- [ ] **Step 1: Create `.claude-plugin/plugin.json`**

Copy the manifest JSON from the spec verbatim (lines 36-90 of the spec).

- [ ] **Step 2: Create `hooks/hooks.json`**

Copy the hooks JSON from the spec verbatim (lines 115-154 of the spec).

- [ ] **Step 3: Validate JSON is well-formed**

```bash
node -e "JSON.parse(require('fs').readFileSync('.claude-plugin/plugin.json', 'utf8')); console.log('plugin.json OK')"
node -e "JSON.parse(require('fs').readFileSync('hooks/hooks.json', 'utf8')); console.log('hooks.json OK')"
```

- [ ] **Step 4: Commit**

```bash
git add .claude-plugin/plugin.json hooks/hooks.json
git commit -m "feat: add Claude Code plugin manifest and hooks config"
```

---

## Chunk 2: Turn-Based Decay

Add the `turn` decay preset. Key insight: the existing `decayDimensions()` and `decayBasicEmotions()` functions are generic — they take a "units" parameter (called `elapsedHours` but the math is `exp(-rate * units)`). We reuse them directly, passing turn count instead of hours. No new decay file needed.

### Task 2.1: Add Turn Half-Life Constant to Decay Presets

**Files:**
- Modify: `src/config/decay-presets.ts`

- [ ] **Step 1: Add `TURN_HALF_LIFE` constant and turn-based rates**

Add to `src/config/decay-presets.ts`:

```typescript
export const TURN_HALF_LIFE = 5
export const DEFAULT_TURN_RATE = Math.LN2 / TURN_HALF_LIFE
```

- [ ] **Step 2: Commit**

```bash
git add src/config/decay-presets.ts
git commit -m "feat: add turn half-life constant (5 turns)"
```

### Task 2.2: Integrate Turn Preset into Decay Presets

**Files:**
- Modify: `src/config/decay-presets.ts`
- Modify: `src/config/decay-presets.test.ts`

- [ ] **Step 1: Add test for `turn` preset in `decay-presets.test.ts`**

```typescript
it('returns turn-based rates for turn preset', () => {
  const state = createTestState()
  const config = { ...DEFAULT_CONFIG, decayPreset: 'turn' as const }
  const { dimensionRates, emotionDecayRates } = getEffectiveDecayRates(state, config)
  // Turn rates should be based on ln(2)/5 ≈ 0.1386, modulated by personality
  expect(dimensionRates.pleasure).toBeGreaterThan(0)
  expect(dimensionRates.pleasure).toBeLessThan(1)
})
```

- [ ] **Step 2: Run test — should fail**

Run: `npx vitest run src/config/decay-presets.test.ts`
Expected: FAIL — `turn` not handled

- [ ] **Step 3: Update `getEffectiveDecayRates()` to handle `turn`**

Add a `turn` case that returns rates based on `DEFAULT_TURN_RATE` with personality modulation (same multipliers as `slow`).

- [ ] **Step 4: Run tests — should pass**

Run: `npx vitest run src/config/decay-presets.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/config/decay-presets.ts src/config/decay-presets.test.ts
git commit -m "feat: integrate turn preset into getEffectiveDecayRates()"
```

### Task 2.3: Add Turn-Based Decay to StateManager

**Files:**
- Modify: `src/state/state-manager.ts`

- [ ] **Step 1: Add test for turn-based decay in StateManager**

Add to existing state-manager tests or create new test file:

```typescript
describe('applyDecay with turn preset', () => {
  it('decays by turns instead of hours', () => {
    const config = { ...DEFAULT_CONFIG, decayPreset: 'turn' as const }
    const manager = new StateManager('/tmp/test.json', config)
    const state = createTestState({ turnCount: 10, lastDecayTurn: 5 })
    // Set pleasure above baseline
    state.dimensions.pleasure = 0.8
    state.baseline.pleasure = 0.0

    const decayed = manager.applyDecay(state)
    expect(decayed.dimensions.pleasure).toBeLessThan(0.8)
    expect(decayed.dimensions.pleasure).toBeGreaterThan(0)
    expect(decayed.lastDecayTurn).toBe(10)
  })
})
```

- [ ] **Step 2: Run test — should fail**

- [ ] **Step 3: Update `StateManager.applyDecay()` with turn branch**

Per the spec: when `config.decayPreset === 'turn'`, compute `turnsSince = state.turnCount - (state.lastDecayTurn ?? 0)` and pass it to the existing `decayDimensions()` / `decayBasicEmotions()` — these functions use generic `exp(-rate * units)` math, so turns work identically to hours. Update `lastDecayTurn` in returned state.

- [ ] **Step 4: Run tests — should pass**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/state/state-manager.ts
git commit -m "feat: add turn-based decay branch to StateManager.applyDecay()"
```

---

## Chunk 3: Classifier Simplification

Strip OpenAI and HTTP classifier backends. Add separate agent/user prompts.

### Task 3.1: Create Classification Prompts

**Files:**
- Create: `src/classify/prompts.ts`
- Create: `src/classify/prompts.test.ts`

- [ ] **Step 1: Write tests**

```typescript
import { describe, it, expect } from 'vitest'
import { buildAgentPrompt, buildUserPrompt, CLASSIFY_SYSTEM } from './prompts.js'

describe('classification prompts', () => {
  const labels = ['neutral', 'happy', 'frustrated']

  it('buildAgentPrompt includes labels and text', () => {
    const prompt = buildAgentPrompt('Hello world', labels)
    expect(prompt).toContain('neutral, happy, frustrated')
    expect(prompt).toContain('Hello world')
    expect(prompt).toContain('AI ASSISTANT')
  })

  it('buildUserPrompt includes labels and text', () => {
    const prompt = buildUserPrompt('I am annoyed', labels)
    expect(prompt).toContain('neutral, happy, frustrated')
    expect(prompt).toContain('I am annoyed')
    expect(prompt).toContain('HUMAN USER')
  })

  it('CLASSIFY_SYSTEM mentions JSON only', () => {
    expect(CLASSIFY_SYSTEM).toContain('JSON')
    expect(CLASSIFY_SYSTEM).not.toContain('markdown')
  })
})
```

- [ ] **Step 2: Run tests — should fail**

- [ ] **Step 3: Implement `src/classify/prompts.ts`**

Use the prompts from the spec (lines 384-402).

- [ ] **Step 4: Run tests — should pass**

- [ ] **Step 5: Commit**

```bash
git add src/classify/prompts.ts src/classify/prompts.test.ts
git commit -m "feat: add separate agent/user classification prompts"
```

### Task 3.2: Simplify Classifier to Anthropic-Only

**Files:**
- Modify: `src/classify/classifier.ts`
- Modify: `src/classify/classifier.test.ts`

- [ ] **Step 1: Update tests — remove OpenAI and HTTP endpoint tests**

Remove tests for `classifyViaOpenAI`, `classifyViaEndpoint`, `detectProvider`, `isReasoningModel`. Update remaining tests to only use Anthropic backend. Keep `parseClassifierResponse` and `coerceClassificationResult` tests (they're provider-agnostic).

- [ ] **Step 2: Run updated tests — some should fail (code still has old paths)**

- [ ] **Step 3: Rewrite `classifier.ts`**

Remove:
- `classifyViaOpenAI` function
- `classifyViaEndpoint` function
- `detectProvider` function
- `isReasoningModel` function and `REASONING_MODELS` array
- `ClassifyOptions.baseUrl`, `ClassifyOptions.provider`, `ClassifyOptions.classifierUrl` fields

Keep:
- `classifyViaAnthropic` (rename to just the main path)
- `parseClassifierResponse`
- `coerceClassificationResult`
- `logClassification`

Update `ClassifyOptions` to accept a `role: 'agent' | 'user'` field. Use `buildAgentPrompt` or `buildUserPrompt` from `prompts.ts` based on role.

- [ ] **Step 4: Run tests — should pass**

Run: `npx vitest run src/classify/classifier.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/classify/classifier.ts src/classify/classifier.test.ts
git commit -m "refactor: simplify classifier to Anthropic-only, use role-specific prompts"
```

---

## Chunk 4: Context Formatter Update

New `<openfeelz>` format with explicit agent/user ownership.

### Task 4.1: Update Prompt Formatter

**Files:**
- Modify: `src/format/prompt-formatter.ts`
- Modify: `src/format/prompt-formatter.test.ts` (create if not exists)

- [ ] **Step 1: Write tests for new format**

```typescript
import { describe, it, expect } from 'vitest'
import { formatEmotionBlock } from './prompt-formatter.js'

describe('formatEmotionBlock (new format)', () => {
  it('wraps output in <openfeelz> tags', () => {
    const result = formatEmotionBlock(testState, 'user1', 'main', {
      ...defaultOptions,
      agentEmotions: true,
    })
    expect(result).toContain('<openfeelz>')
    expect(result).toContain('</openfeelz>')
    expect(result).not.toContain('<emotion_state>')
  })

  it('includes agent ownership comment', () => {
    const result = formatEmotionBlock(testState, 'user1', 'main', {
      ...defaultOptions,
      agentEmotions: true,
    })
    expect(result).toContain('YOUR (the AI agent\'s) emotional state')
    expect(result).toContain('<agent_emotional_state>')
  })

  it('includes user ownership comment when userEmotions enabled', () => {
    const result = formatEmotionBlock(testStateWithUser, 'user1', 'main', {
      ...defaultOptions,
      agentEmotions: true,
      userEmotions: true,
    })
    expect(result).toContain('HUMAN USER')
    expect(result).toContain('<user_emotional_state>')
  })

  it('omits user section when userEmotions disabled', () => {
    const result = formatEmotionBlock(testState, 'user1', 'main', {
      ...defaultOptions,
      agentEmotions: true,
      userEmotions: false,
    })
    expect(result).not.toContain('<user_emotional_state>')
  })

  it('omits agent section when agentEmotions disabled', () => {
    const result = formatEmotionBlock(testState, 'user1', 'main', {
      ...defaultOptions,
      agentEmotions: false,
      userEmotions: true,
    })
    expect(result).not.toContain('<agent_emotional_state>')
  })

  it('returns empty when both disabled', () => {
    const result = formatEmotionBlock(testState, 'user1', 'main', {
      ...defaultOptions,
      agentEmotions: false,
      userEmotions: false,
    })
    expect(result).toBe('')
  })

  it('includes preamble text', () => {
    const result = formatEmotionBlock(testState, 'user1', 'main', {
      ...defaultOptions,
      agentEmotions: true,
    })
    expect(result).toContain('Do not confuse them')
  })
})
```

- [ ] **Step 2: Run tests — should fail**

- [ ] **Step 3: Rewrite `formatEmotionBlock`**

Update `FormatOptions` to include `agentEmotions: boolean` and `userEmotions: boolean` (replacing `includeUserEmotions`).

Rewrite the function to produce the new XML format per spec lines 297-326. Use `<openfeelz>` root, `<agent_emotional_state>`, `<user_emotional_state>` with ownership comments and preamble.

- [ ] **Step 4: Run tests — should pass**

Run: `npx vitest run src/format/`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/format/prompt-formatter.ts src/format/prompt-formatter.test.ts
git commit -m "feat: new <openfeelz> context format with explicit agent/user ownership"
```

---

## Chunk 5: HookRunner & Hook Scripts

The core integration layer — HookRunner class and thin hook wrappers.

### Task 5.1: Create HookRunner

**Files:**
- Create: `src/hooks/runner.ts`
- Create: `src/hooks/runner.test.ts`

- [ ] **Step 1: Write tests for handleSessionStart**

```typescript
import { describe, it, expect, vi } from 'vitest'
import { HookRunner } from './runner.js'

describe('HookRunner.handleSessionStart', () => {
  it('returns additionalContext with emotion block', async () => {
    const runner = createTestRunner({ agentEmotions: true })
    const result = await runner.handleSessionStart({
      session_id: 'test',
      cwd: '/tmp',
      transcript_path: '/tmp/transcript',
    })
    expect(result.hookSpecificOutput?.hookEventName).toBe('SessionStart')
    expect(result.hookSpecificOutput?.additionalContext).toContain('<openfeelz>')
  })

  it('returns empty when both features disabled', async () => {
    const runner = createTestRunner({ agentEmotions: false, userEmotions: false })
    const result = await runner.handleSessionStart({
      session_id: 'test',
      cwd: '/tmp',
      transcript_path: '/tmp/transcript',
    })
    expect(result.hookSpecificOutput?.additionalContext).toBeUndefined()
  })
})
```

- [ ] **Step 2: Write tests for handleUserPrompt**

```typescript
describe('HookRunner.handleUserPrompt', () => {
  it('increments turnCount for turn preset', async () => {
    const runner = createTestRunner({ decayPreset: 'turn' })
    // Mock state with turnCount = 5
    await runner.handleUserPrompt({
      session_id: 'test',
      user_message: 'hello',
      transcript_path: '/tmp/transcript',
    })
    // Verify turnCount incremented in saved state
    const savedState = runner.getLastSavedState()
    expect(savedState.turnCount).toBe(6)
  })

  it('classifies user message when sync + userEmotions enabled', async () => {
    const runner = createTestRunner({
      userEmotions: true,
      syncUserClassification: true,
    })
    await runner.handleUserPrompt({
      session_id: 'test',
      user_message: 'I am so frustrated!',
      transcript_path: '/tmp/transcript',
    })
    expect(runner.classifyCalls).toHaveLength(1)
    expect(runner.classifyCalls[0].role).toBe('user')
  })

  it('does not classify when sync disabled', async () => {
    const runner = createTestRunner({
      userEmotions: true,
      syncUserClassification: false,
    })
    await runner.handleUserPrompt({
      session_id: 'test',
      user_message: 'hello',
      transcript_path: '/tmp/transcript',
    })
    expect(runner.classifyCalls).toHaveLength(0)
  })
})
```

- [ ] **Step 3: Write tests for handleStop**

```typescript
describe('HookRunner.handleStop', () => {
  it('classifies assistant message when agentEmotions enabled', async () => {
    const runner = createTestRunner({ agentEmotions: true })
    await runner.handleStop({
      session_id: 'test',
      last_assistant_message: 'Here is the solution...',
      transcript_path: '/tmp/transcript',
    })
    expect(runner.classifyCalls).toHaveLength(1)
    expect(runner.classifyCalls[0].role).toBe('agent')
  })

  it('classifies user from transcript when async userEmotions enabled', async () => {
    const runner = createTestRunner({
      agentEmotions: true,
      userEmotions: true,
      syncUserClassification: false,
    })
    // Mock transcript reader
    runner.mockTranscriptUserMessage('I need help')
    await runner.handleStop({
      session_id: 'test',
      last_assistant_message: 'Sure, let me help.',
      transcript_path: '/tmp/transcript',
    })
    expect(runner.classifyCalls).toHaveLength(2)
  })

  it('skips gracefully when last_assistant_message missing', async () => {
    const runner = createTestRunner({ agentEmotions: true })
    const result = await runner.handleStop({
      session_id: 'test',
      transcript_path: '/tmp/transcript',
    })
    // Should not throw
    expect(result).toBeDefined()
  })
})
```

- [ ] **Step 4: Run all tests — should fail**

Run: `npx vitest run src/hooks/runner.test.ts`
Expected: FAIL — module doesn't exist

- [ ] **Step 5: Implement `src/hooks/runner.ts`**

Class with three public methods: `handleSessionStart`, `handleUserPrompt`, `handleStop`. Constructor takes optional config override (for testing) or reads from env via `resolveConfig()`. Delegates to `StateManager`, `classifyEmotion`, `formatEmotionBlock`.

- [ ] **Step 6: Run tests — should pass**

Run: `npx vitest run src/hooks/runner.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/hooks/runner.ts src/hooks/runner.test.ts
git commit -m "feat: add HookRunner with session-start, user-prompt, and stop handlers"
```

### Task 5.2: Create Thin Hook Wrapper Scripts

**Files:**
- Create: `hooks/on-session-start.ts`
- Create: `hooks/on-user-prompt.ts`
- Create: `hooks/on-stop.ts`

- [ ] **Step 1: Create shared stdin reader**

Create `hooks/lib/stdin.ts`:

```typescript
export async function readStdin(): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) {
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}
```

- [ ] **Step 2: Create `hooks/on-session-start.ts`**

```typescript
import { readStdin } from './lib/stdin.js'
import { HookRunner } from '../src/hooks/runner.js'

async function main() {
  const input = JSON.parse(await readStdin())
  const runner = new HookRunner()
  const output = await runner.handleSessionStart(input)
  process.stdout.write(JSON.stringify(output))
}

main().catch((err) => {
  console.error('[openfeelz] SessionStart hook error:', err)
  process.exit(1)
})
```

- [ ] **Step 3: Create `hooks/on-user-prompt.ts`**

Same pattern, calling `runner.handleUserPrompt(input)`.

- [ ] **Step 4: Create `hooks/on-stop.ts`**

Same pattern, calling `runner.handleStop(input)`.

- [ ] **Step 5: Verify hooks compile**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add hooks/on-session-start.ts hooks/on-user-prompt.ts hooks/on-stop.ts hooks/lib/stdin.ts
git commit -m "feat: add thin hook wrapper scripts for SessionStart, UserPromptSubmit, Stop"
```

---

## Chunk 6: State Helper & Commands

State helper CLI for mutations/queries, plus command markdown files.

### Task 6.1: Create State Helper CLI

**Files:**
- Create: `src/helpers/state-helper.ts`
- Create: `src/helpers/state-helper.test.ts`

- [ ] **Step 1: Write tests for state helper actions**

Test `query`, `reset`, `set-personality`, `get-personality`, `set-decay`, `history` actions. Verify JSON output contract: `{ ok: true, data: ... }` on success, `{ ok: false, error: ..., code: ... }` on error.

- [ ] **Step 2: Run tests — should fail**

- [ ] **Step 3: Implement `src/helpers/state-helper.ts`**

Parse `process.argv` for action and args. Create StateManager from env-based paths. Apply decay before every read. Output JSON to stdout. Exit 0 on success, 1 on error.

- [ ] **Step 4: Run tests — should pass**

Run: `npx vitest run src/helpers/state-helper.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/helpers/state-helper.ts src/helpers/state-helper.test.ts
git commit -m "feat: add state-helper CLI for state reads/mutations"
```

### Task 6.2: Create Command Markdown Files

**Files:**
- Create: `commands/status.md`
- Create: `commands/personality.md`
- Create: `commands/reset.md`
- Create: `commands/history.md`
- Create: `commands/decay.md`
- Create: `commands/wizard.md`
- Create: `commands/dashboard.md`
- Create: `commands/config.md`

- [ ] **Step 1: Create all 8 command files**

Each command file follows this pattern:

```markdown
---
name: <command-name>
description: <one-line description>
allowed-tools: Bash, Read, Write
---

<Instructions for Claude on what to do, including the exact state-helper.js command to run and how to format the output.>
```

Key: every command that reads state calls `node ${CLAUDE_PLUGIN_ROOT}/dist/src/helpers/state-helper.js <action>` which applies decay first. Every mutation command calls the appropriate state-helper action.

The `wizard.md` command is special — it lists the 10 personality presets and instructs Claude to walk through selection, then call `state-helper.js set-personality` for each trait.

The `config.md` command instructs Claude to read/display current plugin options and help the user modify them.

- [ ] **Step 2: Verify markdown files are valid**

```bash
ls commands/*.md | wc -l
```
Expected: 8

- [ ] **Step 3: Commit**

```bash
git add commands/
git commit -m "feat: add slash command markdown files for all /openfeelz commands"
```

---

## Chunk 7: MCP, Package & Final Wiring

Update MCP server paths, update package.json, ensure everything builds and tests pass.

### Task 7.1: Update MCP Server

**Files:**
- Modify: `src/mcp/mcp-server.ts`
- Modify: `src/mcp/mcp-server.test.ts`

- [ ] **Step 1: Update MCP server to read `OPENFEELZ_DATA_DIR` for state path**

Replace any OpenClaw workspace path resolution with:

```typescript
const dataDir = process.env.OPENFEELZ_DATA_DIR ?? process.env.CLAUDE_PLUGIN_DATA ?? '/tmp/openfeelz'
const statePath = path.join(dataDir, 'state.json')
```

Also remove `cachedAnalysis: state.cachedAnalysis` from the query resource response (field no longer exists on state).

- [ ] **Step 2: Update MCP tests**

- [ ] **Step 3: Run MCP tests — should pass**

Run: `npx vitest run src/mcp/`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/mcp/mcp-server.ts src/mcp/mcp-server.test.ts
git commit -m "refactor: update MCP server to use OPENFEELZ_DATA_DIR for state path"
```

### Task 7.2: Update multi-agent.ts

**Files:**
- Modify: `src/state/multi-agent.ts`

- [ ] **Step 1: Simplify to scan `CLAUDE_PLUGIN_DATA/agents/`**

Replace OpenClaw config-based agent discovery with simple directory scanning:

```typescript
import fs from 'node:fs'
import path from 'node:path'

export async function loadOtherAgentStates(
  dataDir: string,
  currentAgentId: string,
  maxAgents: number,
): Promise<Array<{ id: string; latest: EmotionStimulus }>> {
  const agentsDir = path.join(dataDir, 'agents')
  if (!fs.existsSync(agentsDir)) return []

  const files = fs.readdirSync(agentsDir).filter(f => f.endsWith('.json'))
  // ... read and filter, excluding currentAgentId
}
```

- [ ] **Step 2: Update tests**

- [ ] **Step 3: Run tests — should pass**

- [ ] **Step 4: Commit**

```bash
git add src/state/multi-agent.ts
git commit -m "refactor: simplify multi-agent discovery to scan CLAUDE_PLUGIN_DATA/agents/"
```

### Task 7.3: Update package.json

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Update package.json**

Changes:
- Remove `openclaw` section
- Remove `peerDependencies.openclaw`
- Remove `commander` from dependencies (no longer needed for CLI)
- Remove `@clack/prompts` from dependencies (no longer needed for wizard TUI)
- Update `description` to mention Claude Code
- Update `keywords`: remove `openclaw`, add `claude-code`, `plugin`
- Update `files` array: replace `openclaw.plugin.json` with `.claude-plugin`, add `hooks`, `commands`
- Add `bin` entry for state-helper if needed
- Update `exports` field

- [ ] **Step 2: Run `npm install` to update lockfile**

Run: `npm install`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: update package.json for Claude Code plugin (remove openclaw deps)"
```

### Task 7.4: Update tsconfig for hooks

**Files:**
- Modify: `tsconfig.build.json`

- [ ] **Step 1: Ensure hooks/ directory is included in build**

Add `hooks/**/*.ts` to the `include` array in `tsconfig.build.json` so hook scripts compile to `dist/hooks/`.

- [ ] **Step 2: Verify full build**

Run: `npm run build`
Expected: Compiles cleanly

- [ ] **Step 3: Commit**

```bash
git add tsconfig.build.json
git commit -m "chore: include hooks/ in TypeScript build config"
```

### Task 7.5: Full Test Suite & Build Verification

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: No errors

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: Clean build

- [ ] **Step 4: Run lint**

Run: `npm run lint`
Expected: Clean

- [ ] **Step 5: Verify dist/ has expected hook entry points**

```bash
ls dist/hooks/on-session-start.js dist/hooks/on-user-prompt.js dist/hooks/on-stop.js
ls dist/src/helpers/state-helper.js
ls dist/src/mcp/mcp-server.js
```

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat: OpenFeelz 2.0.0 — Claude Code plugin conversion complete"
```
