# User Style Profiling Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add persistent user communication style profiling that calibrates emotion classification intensity, plus token usage tracking for all LLM calls.

**Architecture:** Style profile (4 dimensions) stored per-user in state, updated every 10 messages via batch LLM profiling call in async Stop hook. Profile injected into classification prompt when mature. All LLM calls via `claude -p` with token tracking extracted from response.

**Tech Stack:** TypeScript, vitest, `claude -p` CLI, existing OpenFeelz state infrastructure

**Spec:** `docs/superpowers/specs/2026-04-07-user-style-profiling-design.md`

---

## Chunk 1: Types & Config

### Task 1.1: Create Style Config

**Files:**
- Create: `src/config/style-config.ts`
- Create: `src/config/style-config.test.ts`

- [ ] **Step 1: Write tests for config defaults and overrides**

```typescript
import { describe, it, expect } from 'vitest'
import { DEFAULT_STYLE_CONFIG, type StyleProfileConfig } from './style-config.js'

describe('StyleProfileConfig', () => {
  it('has correct default profilingInterval', () => {
    expect(DEFAULT_STYLE_CONFIG.profilingInterval).toBe(10)
  })
  it('has correct default maxSampleSize', () => {
    expect(DEFAULT_STYLE_CONFIG.maxSampleSize).toBe(100)
  })
  it('has correct default stalenessThresholdDays', () => {
    expect(DEFAULT_STYLE_CONFIG.stalenessThresholdDays).toBe(30)
  })
  it('has correct default stalenessResetSampleSize', () => {
    expect(DEFAULT_STYLE_CONFIG.stalenessResetSampleSize).toBe(30)
  })
  it('has correct default profileMaturityThreshold', () => {
    expect(DEFAULT_STYLE_CONFIG.profileMaturityThreshold).toBe(10)
  })
  it('has correct default excerptTokenLimit', () => {
    expect(DEFAULT_STYLE_CONFIG.excerptTokenLimit).toBe(200)
  })
  it('has correct default emaBaseWeight', () => {
    expect(DEFAULT_STYLE_CONFIG.emaBaseWeight).toBe(5)
  })
  it('has correct default emaMaxWeight', () => {
    expect(DEFAULT_STYLE_CONFIG.emaMaxWeight).toBe(0.5)
  })
  it('allows partial overrides', () => {
    const custom: Partial<StyleProfileConfig> = { profilingInterval: 5 }
    const merged = { ...DEFAULT_STYLE_CONFIG, ...custom }
    expect(merged.profilingInterval).toBe(5)
    expect(merged.maxSampleSize).toBe(100) // unchanged
  })
})
```

- [ ] **Step 2: Run tests — should fail**

Run: `npx vitest run src/config/style-config.test.ts`

- [ ] **Step 3: Implement `src/config/style-config.ts`**

```typescript
export interface StyleProfileConfig {
  profilingInterval: number
  maxSampleSize: number
  stalenessThresholdDays: number
  stalenessResetSampleSize: number
  profileMaturityThreshold: number
  excerptTokenLimit: number
  emaBaseWeight: number
  emaMaxWeight: number
}

export const DEFAULT_STYLE_CONFIG: StyleProfileConfig = {
  profilingInterval: 10,
  maxSampleSize: 100,
  stalenessThresholdDays: 30,
  stalenessResetSampleSize: 30,
  profileMaturityThreshold: 10,
  excerptTokenLimit: 200,
  emaBaseWeight: 5,
  emaMaxWeight: 0.5,
}
```

- [ ] **Step 4: Run tests — should pass**

- [ ] **Step 5: Commit**

```bash
git add src/config/style-config.ts src/config/style-config.test.ts
git commit -m "feat: add StyleProfileConfig with defaults and tests"
```

### Task 1.2: Add Style Types to State

**Files:**
- Modify: `src/types.ts`
- Modify: `src/state/state-file.ts`

- [ ] **Step 1: Read current `src/types.ts` and `src/state/state-file.ts`**

- [ ] **Step 2: Add types to `src/types.ts`**

Add these interfaces:

```typescript
export interface UserStyleProfile {
  hyperboleTendency: number
  casualProfanity: number
  emotionalExpressiveness: number
  sarcasmFrequency: number
  sampleSize: number
  lastUpdated: string
  userOverrides: string[]
}

export interface UserStyleTracker {
  profile: UserStyleProfile
  messagesSinceLastProfile: number
}

export interface ClassificationUsage {
  inputTokens: number
  outputTokens: number
  costUsd: number
  durationMs: number
}

export interface TokenUsageAggregate {
  totalInput: number
  totalOutput: number
  totalCostUsd: number
  classificationCount: number
}
```

Add to `EmotionEngineState`:
```typescript
userStyles: Record<string, UserStyleTracker>
tokenUsage: TokenUsageAggregate
```

Add to `EmotionStimulus`:
```typescript
sourceExcerpt?: string
classificationTokens?: ClassificationUsage
```

Add a `DEFAULT_STYLE_PROFILE` constant:
```typescript
export const DEFAULT_STYLE_PROFILE: UserStyleProfile = {
  hyperboleTendency: 0.5,
  casualProfanity: 0.5,
  emotionalExpressiveness: 0.5,
  sarcasmFrequency: 0.5,
  sampleSize: 0,
  lastUpdated: new Date().toISOString(),
  userOverrides: [],
}
```

- [ ] **Step 3: Update `buildEmptyState()` in `src/state/state-file.ts`**

Add `userStyles: {}` and `tokenUsage: { totalInput: 0, totalOutput: 0, totalCostUsd: 0, classificationCount: 0 }` to the empty state.

- [ ] **Step 4: Run all tests**

Run: `npx vitest run`
Fix any type errors in existing tests.

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/state/state-file.ts
git commit -m "feat: add UserStyleProfile, ClassificationUsage, TokenUsageAggregate types to state"
```

---

## Chunk 2: Excerpt Builder & Token Tracking

### Task 2.1: Create Excerpt Builder

**Files:**
- Create: `src/utils/excerpt.ts`
- Create: `src/utils/excerpt.test.ts`

- [ ] **Step 1: Write tests**

```typescript
import { describe, it, expect } from 'vitest'
import { buildExcerpt } from './excerpt.js'

describe('buildExcerpt', () => {
  it('returns short messages unchanged', () => {
    expect(buildExcerpt('hello world', 200)).toBe('hello world')
  })

  it('returns first+last tokens for long messages', () => {
    const words = Array.from({ length: 500 }, (_, i) => `word${i}`)
    const text = words.join(' ')
    const excerpt = buildExcerpt(text, 5) // 5 tokens per half
    expect(excerpt).toContain('word0')
    expect(excerpt).toContain('word4')
    expect(excerpt).toContain('[...]')
    expect(excerpt).toContain('word499')
    expect(excerpt).toContain('word495')
  })

  it('handles exact boundary (2x limit)', () => {
    const words = Array.from({ length: 10 }, (_, i) => `w${i}`)
    const text = words.join(' ')
    // 10 tokens, limit 5 per half = exactly 2x, store whole thing
    expect(buildExcerpt(text, 5)).toBe(text)
  })

  it('respects custom token limit', () => {
    const words = Array.from({ length: 100 }, (_, i) => `word${i}`)
    const text = words.join(' ')
    const excerpt = buildExcerpt(text, 3)
    const tokens = excerpt.split(' ')
    // first 3 + [...] + last 3 = 7 tokens
    expect(tokens.length).toBe(7)
  })

  it('handles empty string', () => {
    expect(buildExcerpt('', 200)).toBe('')
  })
})
```

- [ ] **Step 2: Run tests — should fail**

- [ ] **Step 3: Implement**

```typescript
/**
 * Build a message excerpt: first N + last N tokens.
 * Uses whitespace split as a simple token approximation.
 */
export function buildExcerpt(text: string, tokenLimit: number): string {
  if (!text) return ''
  const tokens = text.split(/\s+/).filter(Boolean)
  if (tokens.length <= tokenLimit * 2) return text
  const first = tokens.slice(0, tokenLimit)
  const last = tokens.slice(-tokenLimit)
  return [...first, '[...]', ...last].join(' ')
}
```

- [ ] **Step 4: Run tests — should pass**

- [ ] **Step 5: Commit**

```bash
git add src/utils/excerpt.ts src/utils/excerpt.test.ts
git commit -m "feat: add excerpt builder (first+last N tokens)"
```

### Task 2.2: Extract Shared Claude CLI Utility

**Files:**
- Create: `src/utils/claude-cli.ts`
- Create: `src/utils/claude-cli.test.ts`
- Modify: `src/classify/claude-classify.ts`

- [ ] **Step 1: Read current `src/classify/claude-classify.ts`**

Identify `spawnWithInput` and the JSON response parsing logic. These will be extracted.

- [ ] **Step 2: Write tests for the shared utility**

```typescript
import { describe, it, expect, vi } from 'vitest'
import { parseClaudeResponse, extractUsageFromResponse } from './claude-cli.js'

describe('parseClaudeResponse', () => {
  it('extracts result from successful response', () => {
    const response = { type: 'result', subtype: 'success', is_error: false, result: '{"label":"happy"}' }
    expect(parseClaudeResponse(JSON.stringify(response))).toBe('{"label":"happy"}')
  })

  it('throws on error response', () => {
    const response = { type: 'result', subtype: 'error', is_error: true, result: 'something went wrong' }
    expect(() => parseClaudeResponse(JSON.stringify(response))).toThrow()
  })
})

describe('extractUsageFromResponse', () => {
  it('extracts token counts and cost', () => {
    const response = {
      total_cost_usd: 0.07,
      duration_ms: 5000,
      modelUsage: {
        'claude-haiku': { inputTokens: 100, outputTokens: 50 },
      },
    }
    const usage = extractUsageFromResponse(response)
    expect(usage.inputTokens).toBe(100)
    expect(usage.outputTokens).toBe(50)
    expect(usage.costUsd).toBe(0.07)
    expect(usage.durationMs).toBe(5000)
  })

  it('sums across multiple models', () => {
    const response = {
      total_cost_usd: 0.1,
      duration_ms: 3000,
      modelUsage: {
        'model-a': { inputTokens: 100, outputTokens: 50 },
        'model-b': { inputTokens: 200, outputTokens: 30 },
      },
    }
    const usage = extractUsageFromResponse(response)
    expect(usage.inputTokens).toBe(300)
    expect(usage.outputTokens).toBe(80)
  })
})
```

- [ ] **Step 3: Run tests — should fail**

- [ ] **Step 4: Implement `src/utils/claude-cli.ts`**

Extract from `claude-classify.ts`:
- `spawnWithInput(cmd, args, input, timeoutMs)` — the subprocess runner
- `parseClaudeResponse(stdout)` — parse outer JSON, check for errors, return `result` string
- `extractUsageFromResponse(response)` — extract `ClassificationUsage` from `modelUsage` and `total_cost_usd`
- `callClaude(prompt, options: { model, timeoutMs })` — high-level: spawn, parse, return `{ result, usage }`

- [ ] **Step 5: Update `claude-classify.ts` to import from shared utility**

Replace inline `spawnWithInput` and response parsing with imports from `../utils/claude-cli.js`.

- [ ] **Step 6: Run all tests — should pass**

Run: `npx vitest run`

- [ ] **Step 7: Commit**

```bash
git add src/utils/claude-cli.ts src/utils/claude-cli.test.ts src/classify/claude-classify.ts
git commit -m "refactor: extract shared claude -p CLI utility from classifier"
```

### Task 2.3: Verify Token Tracking in Classifier (Verification Only)

**This task is verification only — no code changes expected.** The `ClassificationUsage` interface and `usage` field on `ClassifyResult` already exist from the plugin conversion. Confirm and move on.

**Files:**
- Verify: `src/classify/claude-classify.ts` (should already use `extractUsageFromResponse` after Task 2.2)

- [ ] **Step 1: Verify `ClassificationUsage` matches spec**

Check that it has: `inputTokens`, `outputTokens`, `costUsd`, `durationMs`. These should match the `ClassificationUsage` type added to `src/types.ts` in Task 1.2. If `claude-classify.ts` defines its own duplicate, remove it and import from `types.ts`.

- [ ] **Step 2: Verify tests cover usage extraction**

Run: `npx vitest run src/classify/claude-classify.test.ts`
Expected: All pass, including tests that verify `usage` is returned.

- [ ] **Step 3: Commit only if changes were needed**

---

## Chunk 3: Profiling Engine

### Task 3.1: Create Profiling Prompt

**Files:**
- Create: `src/classify/style-profiler-prompt.ts`
- Create: `src/classify/style-profiler-prompt.test.ts`

- [ ] **Step 1: Write tests**

```typescript
import { describe, it, expect } from 'vitest'
import { buildProfilingPrompt } from './style-profiler-prompt.js'
import type { UserStyleProfile, EmotionStimulus } from '../types.js'

describe('buildProfilingPrompt', () => {
  const history: Array<Pick<EmotionStimulus, 'label' | 'intensity' | 'trigger' | 'sourceExcerpt'>> = [
    { label: 'frustrated', intensity: 0.9, trigger: 'caps and exclamation', sourceExcerpt: 'OMG this is SO annoying' },
    { label: 'happy', intensity: 0.8, trigger: 'positive reaction', sourceExcerpt: 'LMAO yeah that works' },
  ]

  const profile: UserStyleProfile = {
    hyperboleTendency: 0.5, casualProfanity: 0.5,
    emotionalExpressiveness: 0.5, sarcasmFrequency: 0.5,
    sampleSize: 0, lastUpdated: '', userOverrides: [],
  }

  it('includes message history', () => {
    const prompt = buildProfilingPrompt(history, profile)
    expect(prompt).toContain('OMG this is SO annoying')
    expect(prompt).toContain('LMAO yeah that works')
  })

  it('includes current profile values', () => {
    const prompt = buildProfilingPrompt(history, profile)
    expect(prompt).toContain('0.5')
  })

  it('includes scale anchors', () => {
    const prompt = buildProfilingPrompt(history, profile)
    expect(prompt).toContain('hyperboleTendency')
    expect(prompt).toContain('Very literal communicator')
    expect(prompt).toContain('Extremely hyperbolic')
  })

  it('asks for JSON response', () => {
    const prompt = buildProfilingPrompt(history, profile)
    expect(prompt).toContain('Return ONLY JSON')
  })
})
```

- [ ] **Step 2: Run tests — should fail**

- [ ] **Step 3: Implement the prompt builder**

Use the exact prompt from the spec (lines 146-187) with the anchored scales. Format history entries as numbered lines with sourceExcerpt, label, and intensity.

- [ ] **Step 4: Run tests — should pass**

- [ ] **Step 5: Commit**

```bash
git add src/classify/style-profiler-prompt.ts src/classify/style-profiler-prompt.test.ts
git commit -m "feat: add profiling prompt with anchored scales"
```

### Task 3.2: Create Style Profiler

**Files:**
- Create: `src/classify/style-profiler.ts`
- Create: `src/classify/style-profiler.test.ts`

- [ ] **Step 1: Write tests for EMA blending**

```typescript
import { describe, it, expect } from 'vitest'
import { blendProfile, checkStaleness, createDefaultTracker } from './style-profiler.js'
import { DEFAULT_STYLE_CONFIG } from '../config/style-config.js'
import { DEFAULT_STYLE_PROFILE } from '../types.js'

describe('blendProfile', () => {
  const config = DEFAULT_STYLE_CONFIG

  it('applies high weight for low sampleSize', () => {
    const existing = { ...DEFAULT_STYLE_PROFILE, sampleSize: 10 }
    const observed = { hyperboleTendency: 0.9, casualProfanity: 0.8, emotionalExpressiveness: 0.7, sarcasmFrequency: 0.3 }
    const result = blendProfile(existing, observed, 10, config)
    // weight = min(0.5, 5 / (10 + 5)) = 0.333
    // new = 0.5 * (1 - 0.333) + 0.9 * 0.333 ≈ 0.633
    expect(result.hyperboleTendency).toBeCloseTo(0.633, 2)
  })

  it('applies low weight for high sampleSize', () => {
    const existing = { ...DEFAULT_STYLE_PROFILE, sampleSize: 100 }
    const observed = { hyperboleTendency: 0.9, casualProfanity: 0.8, emotionalExpressiveness: 0.7, sarcasmFrequency: 0.3 }
    const result = blendProfile(existing, observed, 10, config)
    // weight = min(0.5, 5 / (100 + 5)) = 0.0476
    // new = 0.5 * (1 - 0.0476) + 0.9 * 0.0476 ≈ 0.519
    expect(result.hyperboleTendency).toBeCloseTo(0.519, 2)
  })

  it('skips dimensions in userOverrides', () => {
    const existing = { ...DEFAULT_STYLE_PROFILE, sampleSize: 10, hyperboleTendency: 0.8, userOverrides: ['hyperboleTendency'] }
    const observed = { hyperboleTendency: 0.2, casualProfanity: 0.8, emotionalExpressiveness: 0.7, sarcasmFrequency: 0.3 }
    const result = blendProfile(existing, observed, 10, config)
    expect(result.hyperboleTendency).toBe(0.8) // unchanged — protected
  })

  it('updates sampleSize', () => {
    const existing = { ...DEFAULT_STYLE_PROFILE, sampleSize: 10 }
    const observed = { hyperboleTendency: 0.5, casualProfanity: 0.5, emotionalExpressiveness: 0.5, sarcasmFrequency: 0.5 }
    const result = blendProfile(existing, observed, 10, config)
    expect(result.sampleSize).toBe(20) // 10 + 10
  })
})

describe('checkStaleness', () => {
  const config = DEFAULT_STYLE_CONFIG

  it('caps sampleSize when stale', () => {
    const thirtyOneDaysAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString()
    const profile = { ...DEFAULT_STYLE_PROFILE, sampleSize: 100, lastUpdated: thirtyOneDaysAgo }
    const result = checkStaleness(profile, config)
    expect(result.sampleSize).toBe(30)
  })

  it('does not cap when fresh', () => {
    const now = new Date().toISOString()
    const profile = { ...DEFAULT_STYLE_PROFILE, sampleSize: 100, lastUpdated: now }
    const result = checkStaleness(profile, config)
    expect(result.sampleSize).toBe(100)
  })

  it('does not cap when sampleSize already below threshold', () => {
    const thirtyOneDaysAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString()
    const profile = { ...DEFAULT_STYLE_PROFILE, sampleSize: 20, lastUpdated: thirtyOneDaysAgo }
    const result = checkStaleness(profile, config)
    expect(result.sampleSize).toBe(20)
  })
})

describe('createDefaultTracker', () => {
  it('returns tracker with default profile and zero counter', () => {
    const tracker = createDefaultTracker()
    expect(tracker.profile.hyperboleTendency).toBe(0.5)
    expect(tracker.messagesSinceLastProfile).toBe(0)
  })
})
```

- [ ] **Step 2: Run tests — should fail**

- [ ] **Step 3: Implement `src/classify/style-profiler.ts`**

Export functions:
- `createDefaultTracker(): UserStyleTracker`
- `checkStaleness(profile: UserStyleProfile, config: StyleProfileConfig): UserStyleProfile`
- `blendProfile(existing: UserStyleProfile, observed: ObservedStyle, messageCount: number, config: StyleProfileConfig): UserStyleProfile`
- `runProfiling(history: EmotionStimulus[], currentProfile: UserStyleProfile, config: StyleProfileConfig, model?: string): Promise<{ profile: UserStyleProfile, usage?: ClassificationUsage }>`

`runProfiling` calls `claude -p` via the same `spawnWithInput` pattern from `claude-classify.ts`. Extract that into a shared utility first — read `src/classify/claude-classify.ts` and factor out the spawn logic if it isn't already shared.

- [ ] **Step 4: Run tests — should pass**

- [ ] **Step 5: Run all tests**

Run: `npx vitest run`

- [ ] **Step 6: Commit**

```bash
git add src/classify/style-profiler.ts src/classify/style-profiler.test.ts
git commit -m "feat: add style profiler with EMA blending, staleness check, and claude -p integration"
```

---

## Chunk 4: Prompt Integration

### Task 4.1: Add Style Profile to User Classification Prompt

**Files:**
- Modify: `src/classify/prompts.ts`
- Modify: `src/classify/prompts.test.ts`

- [ ] **Step 1: Write tests**

```typescript
// Add to existing prompts.test.ts
describe('buildUserPrompt with style profile', () => {
  const labels = ['neutral', 'happy', 'frustrated']
  const matureProfile = {
    hyperboleTendency: 0.8, casualProfanity: 0.9,
    emotionalExpressiveness: 0.7, sarcasmFrequency: 0.3,
    sampleSize: 20, lastUpdated: '', userOverrides: [],
  }

  it('includes style section when profile is mature', () => {
    const prompt = buildUserPrompt('hello', labels, matureProfile, 10)
    expect(prompt).toContain('communication style profile')
    expect(prompt).toContain('Hyperbole tendency: 0.8')
    expect(prompt).toContain('Calibrate your intensity')
  })

  it('omits style section when profile is immature', () => {
    const immatureProfile = { ...matureProfile, sampleSize: 5 }
    const prompt = buildUserPrompt('hello', labels, immatureProfile, 10)
    expect(prompt).not.toContain('communication style profile')
  })

  it('omits style section when no profile provided', () => {
    const prompt = buildUserPrompt('hello', labels)
    expect(prompt).not.toContain('communication style profile')
  })
})
```

- [ ] **Step 2: Run tests — should fail**

- [ ] **Step 3: Update `buildUserPrompt` signature**

Add optional params: `style?: UserStyleProfile`, `maturityThreshold?: number`. When `style` is provided and `style.sampleSize >= maturityThreshold`, inject the style context block per the spec (lines 230-241).

- [ ] **Step 4: Run tests — should pass**

- [ ] **Step 5: Run all tests**

Run: `npx vitest run`

- [ ] **Step 6: Commit**

```bash
git add src/classify/prompts.ts src/classify/prompts.test.ts
git commit -m "feat: inject style profile into user classification prompt when mature"
```

---

## Chunk 5: HookRunner Integration

### Task 5.1: Wire Style Profiling into HookRunner

**Files:**
- Modify: `src/hooks/runner.ts`
- Modify: `src/hooks/runner.test.ts`

- [ ] **Step 1: Read current `src/hooks/runner.ts` and its test**

- [ ] **Step 2: Write tests for new behavior**

```typescript
// Add to existing runner.test.ts

describe('style profiling integration', () => {
  it('increments messagesSinceLastProfile on user prompt', async () => {
    const runner = createTestRunner({ userEmotions: true, syncUserClassification: true })
    await runner.handleUserPrompt({
      session_id: 'test', user_message: 'hello', transcript_path: '/tmp/t',
    })
    const state = runner.getLastSavedState()
    expect(state.userStyles['test']?.messagesSinceLastProfile).toBe(1)
  })

  it('passes style profile to classification when mature', async () => {
    const runner = createTestRunner({ userEmotions: true, syncUserClassification: true })
    // Pre-seed a mature profile
    runner.seedStyleProfile('test', { sampleSize: 20, hyperboleTendency: 0.8 })
    await runner.handleUserPrompt({
      session_id: 'test', user_message: 'BRO WHAT', transcript_path: '/tmp/t',
    })
    // Verify classify was called with style profile
    expect(runner.lastClassifyCall?.style).toBeDefined()
    expect(runner.lastClassifyCall?.style?.hyperboleTendency).toBe(0.8)
  })

  it('stores sourceExcerpt on stimulus', async () => {
    const runner = createTestRunner({ userEmotions: true, syncUserClassification: true })
    await runner.handleUserPrompt({
      session_id: 'test', user_message: 'I am frustrated', transcript_path: '/tmp/t',
    })
    const state = runner.getLastSavedState()
    const latest = state.users['test']?.latest
    expect(latest?.sourceExcerpt).toContain('frustrated')
  })

  it('updates token usage aggregate', async () => {
    const runner = createTestRunner({ userEmotions: true, syncUserClassification: true })
    await runner.handleUserPrompt({
      session_id: 'test', user_message: 'hello', transcript_path: '/tmp/t',
    })
    const state = runner.getLastSavedState()
    expect(state.tokenUsage.classificationCount).toBeGreaterThan(0)
  })

  it('triggers profiling after profilingInterval messages', async () => {
    const runner = createTestRunner({ userEmotions: true })
    // Pre-seed tracker at interval - 1
    runner.seedStyleTracker('test', { messagesSinceLastProfile: 9 })
    await runner.handleStop({
      session_id: 'test', last_assistant_message: 'Sure', transcript_path: '/tmp/t',
    })
    // Profiling should have been triggered
    expect(runner.profilingCallCount).toBe(1)
    const state = runner.getLastSavedState()
    expect(state.userStyles['test']?.messagesSinceLastProfile).toBe(0) // reset
  })
})
```

- [ ] **Step 3: Run tests — should fail**

- [ ] **Step 4: Create test helpers**

The tests reference helpers that don't exist yet. Before implementing HookRunner changes, create a `TestHookRunner` helper in the test file (or extend the existing test factory):

- `createTestRunner(configOverrides)` — already exists, extend to accept style config
- `runner.seedStyleProfile(sessionId, profileOverrides)` — write a `UserStyleTracker` into the mock state's `userStyles` field
- `runner.seedStyleTracker(sessionId, trackerOverrides)` — same, but set `messagesSinceLastProfile`
- `runner.getLastSavedState()` — already exists
- `runner.lastClassifyCall` — expose the last args passed to the mocked `classifyEmotion`, including `style`
- `runner.profilingCallCount` — counter for how many times `runProfiling` was called (mock it)

These are test-only. The real HookRunner doesn't expose them.

- [ ] **Step 5: Implement changes to HookRunner**

In `handleUserPrompt`:
1. Get or create `UserStyleTracker` for `session_id`
2. Increment `messagesSinceLastProfile`
3. When classifying user message: pass `style` to `buildUserPrompt` if mature, store `sourceExcerpt` via `buildExcerpt`
4. After classification: update `tokenUsage` aggregate from `result.usage`

In `handleStop`:
1. After classification: update `tokenUsage` from usage
2. Check `messagesSinceLastProfile >= config.profilingInterval`
3. If triggered: call `runProfiling`, blend result, reset counter, update `tokenUsage`

- [ ] **Step 5: Run tests — should pass**

- [ ] **Step 6: Run all tests**

Run: `npx vitest run`

- [ ] **Step 7: Commit**

```bash
git add src/hooks/runner.ts src/hooks/runner.test.ts
git commit -m "feat: wire style profiling and token tracking into HookRunner lifecycle"
```

---

## Chunk 6: State Helper & Commands

### Task 6.1: Add Style Actions to State Helper

**Files:**
- Modify: `src/helpers/state-helper.ts`
- Modify: `src/helpers/state-helper.test.ts`

- [ ] **Step 1: Write tests for new actions**

```typescript
describe('get-style action', () => {
  it('returns default profile for unknown user', async () => {
    const result = await runAction(manager, { action: 'get-style' })
    expect(result.ok).toBe(true)
    expect(result.data.profile.hyperboleTendency).toBe(0.5)
  })
})

describe('set-style action', () => {
  it('sets a dimension and adds to overrides', async () => {
    const result = await runAction(manager, {
      action: 'set-style',
      flags: { dimension: 'hyperboleTendency', value: '0.9', user: 'test' },
    })
    expect(result.ok).toBe(true)
    expect(result.data.profile.hyperboleTendency).toBe(0.9)
    expect(result.data.profile.userOverrides).toContain('hyperboleTendency')
  })

  it('rejects invalid dimension', async () => {
    const result = await runAction(manager, {
      action: 'set-style',
      flags: { dimension: 'bogus', value: '0.5' },
    })
    expect(result.ok).toBe(false)
    expect(result.code).toBe('INVALID_DIMENSION')
  })
})

describe('reset-style action', () => {
  it('resets profile to defaults', async () => {
    // First set something
    await runAction(manager, {
      action: 'set-style',
      flags: { dimension: 'hyperboleTendency', value: '0.9' },
    })
    const result = await runAction(manager, { action: 'reset-style' })
    expect(result.ok).toBe(true)
    expect(result.data.profile.hyperboleTendency).toBe(0.5)
    expect(result.data.profile.userOverrides).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests — should fail**

- [ ] **Step 3: Implement the three actions**

`get-style`: load state, return `userStyles[user]?.profile ?? DEFAULT_STYLE_PROFILE`

`set-style`: validate dimension name, load state, update profile dimension, add to `userOverrides`, save

`reset-style`: load state, reset `userStyles[user]` to default tracker, save

- [ ] **Step 4: Run tests — should pass**

- [ ] **Step 5: Commit**

```bash
git add src/helpers/state-helper.ts src/helpers/state-helper.test.ts
git commit -m "feat: add get-style, set-style, reset-style actions to state helper"
```

### Task 6.2: Create Style Command

**Files:**
- Create: `commands/style.md`

- [ ] **Step 1: Create `commands/style.md`**

```markdown
---
name: style
description: View or adjust your communication style profile
allowed-tools: Bash
---

OpenFeelz builds a profile of your communication style over time to calibrate emotion classification. This profile is non-judgmental — it just helps the classifier understand HOW you communicate.

**View your profile:**
\`\`\`bash
node $CLAUDE_PLUGIN_ROOT/dist/src/helpers/state-helper.js get-style
\`\`\`

Display the profile with bar visualizations and human-readable descriptions:
- Hyperbole tendency (0-1): how much you exaggerate for effect
- Casual profanity (0-1): whether swearing signals anger or is just vocabulary
- Emotional expressiveness (0-1): how dramatic your communication is
- Sarcasm frequency (0-1): how often you say the opposite of what you mean

Show sample size and last updated date.

**Set a dimension** (e.g., "set hyperbole 0.9"):
Map short names to full dimension names:
- hyperbole → hyperboleTendency
- profanity → casualProfanity
- expressiveness → emotionalExpressiveness
- sarcasm → sarcasmFrequency

\`\`\`bash
node $CLAUDE_PLUGIN_ROOT/dist/src/helpers/state-helper.js set-style --dimension <fullName> --value <0-1>
\`\`\`

Confirm the change and note that this dimension is now protected from automatic updates.

**Reset profile:**
\`\`\`bash
node $CLAUDE_PLUGIN_ROOT/dist/src/helpers/state-helper.js reset-style
\`\`\`

Confirm the reset.
```

- [ ] **Step 2: Verify file count**

```bash
ls commands/*.md | wc -l
```
Expected: 9

- [ ] **Step 3: Commit**

```bash
git add commands/style.md
git commit -m "feat: add /openfeelz style slash command"
```

### Task 6.3: Update Status Command for Token Usage

**Files:**
- Modify: `commands/status.md`

- [ ] **Step 1: Read current `commands/status.md`**

- [ ] **Step 2: Add token usage display**

Add a note to the status command instructions: after displaying emotional state, also show token usage if present: "Classifications: N calls, X input tokens, Y output tokens, $Z.ZZ total cost"

- [ ] **Step 3: Commit**

```bash
git add commands/status.md
git commit -m "feat: show token usage in /openfeelz status"
```

---

## Chunk 7: Documentation

### Task 7.1: Full README Rewrite for Claude Code Plugin

The existing README is written for an OpenClaw plugin that no longer exists. It needs a full rewrite for the Claude Code plugin, covering all features including style profiling.

**Files:**
- Rewrite: `README.md`

- [ ] **Step 1: Read current README.md**

Note what structure and content to preserve (project description, license, badges) and what's obsolete (OpenClaw installation, openclaw CLI commands, OpenClaw config, openclaw.plugin.json).

- [ ] **Step 2: Rewrite README.md**

New structure:
1. **Header** — project name, tagline (keep the Douglas Adams quote), badges (update CI, npm, etc.)
2. **Features** — updated list including style profiling and token tracking
3. **Installation** — Claude Code plugin: `/plugin marketplace add trianglegrrl/openfeelz` then `/plugin install openfeelz`. Or local dev via `--plugin-dir`.
4. **How It Works** — updated lifecycle diagram using Claude Code hook events (SessionStart, UserPromptSubmit, Stop) instead of OpenClaw hooks. Include style profiling trigger in Stop.
5. **What the Agent Sees** — updated `<openfeelz>` XML format with `<agent_emotional_state>` and `<user_emotional_state>` sections
6. **Style Profiling** — NEW section:
   - 4 dimensions explained (hyperbole, casual profanity, expressiveness, sarcasm)
   - How it works (batch every 10 messages, EMA blending, staleness reset)
   - Viewing and adjusting (`/openfeelz style`)
   - User overrides protected from auto-update
7. **Decay Model** — keep existing content, add `turn` preset
8. **Configuration** — plugin userConfig fields (decayPreset, agentEmotions, userEmotions, syncUserClassification, model). No more openclaw.json.
9. **Commands** — `/openfeelz status|personality|reset|history|decay|wizard|dashboard|config|style`
10. **MCP Server** — keep existing, update paths
11. **Token Usage** — NEW section: `/openfeelz status` shows classification costs
12. **Architecture** — updated file tree matching current codebase
13. **Development** — keep npm scripts section
14. **License** — keep

- [ ] **Step 3: Verify no references to OpenClaw remain**

```bash
grep -i openclaw README.md
```
Expected: No matches (or only in migration/history context).

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: full README rewrite for Claude Code plugin v2.0.0"
```

---

## Chunk 8: Build & Verify

### Task 8.1: Full Build & Smoke Test

- [ ] **Step 1: Run all tests**

Run: `npx vitest run`
Expected: All pass

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Build**

Run: `npm run build`

- [ ] **Step 4: Lint**

Run: `npx oxlint .`

- [ ] **Step 5: Integration smoke test**

```bash
# Clean state
rm -rf /tmp/openfeelz-style-test

# Apply a few stimuli to create history
for msg in "OMG WHAT THE FUCK" "LMAO that is hilarious" "ugh fine whatever" "BRO SERIOUSLY" "okay actually that is cool"; do
  echo "{\"session_id\":\"test\",\"user_message\":\"$msg\",\"transcript_path\":\"/tmp/t\"}" | \
    CLAUDE_PLUGIN_DATA=/tmp/openfeelz-style-test \
    CLAUDE_PLUGIN_OPTION_AGENTEMOTIONS=true \
    CLAUDE_PLUGIN_OPTION_USEREMOTIONS=true \
    CLAUDE_PLUGIN_OPTION_SYNCUSERCLASSIFICATION=true \
    node dist/hooks/on-user-prompt.js 2>/dev/null > /dev/null
done

# Check style profile
CLAUDE_PLUGIN_DATA=/tmp/openfeelz-style-test node dist/src/helpers/state-helper.js get-style

# Check token usage
CLAUDE_PLUGIN_DATA=/tmp/openfeelz-style-test node dist/src/helpers/state-helper.js query --format full 2>/dev/null | node -e "
  const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).data;
  console.log('Token usage:', JSON.stringify(d.tokenUsage));
"
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: user style profiling complete — calibrated emotion classification"
```
