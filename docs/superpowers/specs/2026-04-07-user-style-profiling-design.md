# OpenFeelz: User Style Profiling & Classification Token Tracking

**Date:** 2026-04-07
**Status:** Draft
**Author:** Alaina + Claude

## Summary

Add a persistent user communication style profile that calibrates the emotion classifier. The profile learns over time that some users use hyperbolic language, casual profanity, sarcasm, etc., and adjusts classification intensity accordingly. Also track token usage from all classification and profiling LLM calls.

## Goals

- Stop the classifier from overreacting to hyperbolic/casual language
- Build a non-judgmental, kind impression of each user's style over time
- Let users see and correct their profile
- Track token costs of all LLM classification calls

## Non-Goals

- Real-time style detection (per-message is overkill; batch every 10 messages)
- Agent style profiling (only profiling the human user)
- Changing the emotion labels or taxonomy
- Multi-user identity tracking (Claude Code hooks don't expose user email/identity; profiles are keyed by `session_id`, which in practice means one profile per local user)

## Limitations

- **Single-user assumption:** Claude Code's hook input doesn't include user identity (no email, no user ID). Profiles are keyed by `session_id`. In typical local usage this is one person. In team/shared contexts, different sessions naturally get separate profiles, but there's no way to link them as "the same person." This is a Claude Code platform constraint.

---

## User Style Profile

### Data Model

```typescript
interface UserStyleProfile {
  /** Exaggerates for effect? 0 = literal, 1 = extreme hyperbole */
  hyperboleTendency: number
  /** Is profanity emotional or casual? 0 = signals anger, 1 = just vocabulary */
  casualProfanity: number
  /** How expressive? 0 = understated ("hmm" = excitement), 1 = dramatic */
  emotionalExpressiveness: number
  /** Says the opposite of what they mean? 0 = literal, 1 = frequently sarcastic */
  sarcasmFrequency: number
  /** Messages analyzed so far */
  sampleSize: number
  /** ISO timestamp of last profile update */
  lastUpdated: string
  /** Dimensions the user explicitly set (protected from auto-update) */
  userOverrides: string[]
}

/** Operational counter — separate from the profile itself */
interface UserStyleTracker {
  /** The style profile (what we've learned) */
  profile: UserStyleProfile
  /** Messages since last profiling run (operational, not profile data) */
  messagesSinceLastProfile: number
}
```

Default values: all dimensions 0.5 (neutral/unknown), sampleSize 0, no overrides, messagesSinceLastProfile 0.

### Configuration

All tuning constants are exposed via a `StyleProfileConfig` object with defaults. Every value is configurable and unit-tested.

```typescript
interface StyleProfileConfig {
  /** Messages between profiling runs. Default: 10 */
  profilingInterval: number
  /** Max sampleSize cap. Default: 100 */
  maxSampleSize: number
  /** Days of inactivity before sampleSize is reduced for re-adaptation. Default: 30 */
  stalenessThresholdDays: number
  /** sampleSize cap after staleness reset. Default: 30 */
  stalenessResetSampleSize: number
  /** Min sampleSize before style profile is injected into classification prompt. Default: 10 */
  profileMaturityThreshold: number
  /** Max tokens per excerpt half (first N + last N). Default: 200 */
  excerptTokenLimit: number
  /** Base EMA numerator — controls how quickly early profiles adapt. Default: 5 */
  emaBaseWeight: number
  /** Max EMA weight (caps influence of a single profiling run). Default: 0.5 */
  emaMaxWeight: number
}

const DEFAULT_STYLE_CONFIG: StyleProfileConfig = {
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

These defaults live in a dedicated file `src/config/style-config.ts` and are passed into the profiler and HookRunner. Unit tests verify each default value and that overrides are respected.

When `lastUpdated` is more than `stalenessThresholdDays` ago and `sampleSize > stalenessResetSampleSize`, cap `sampleSize` to `stalenessResetSampleSize`. This allows the EMA weights to increase, so the profile can re-adapt if the user's style has changed.

### Storage

Lives in `EmotionEngineState` under a new field:

```typescript
/** Per-user communication style trackers (profile + operational counters) */
userStyles: Record<string, UserStyleTracker>
```

Keyed by `session_id` from the hook input. In typical local Claude Code usage, this is one user. Different sessions get separate trackers. Persists across sessions in `state.json`.

---

## Profiling Engine

### Module

New file: `src/classify/style-profiler.ts`

### When It Runs

Every `config.profilingInterval` user messages (default: 10). The `messagesSinceLastProfile` counter increments on each classified user message. When it reaches the interval, profiling triggers in the Stop hook (which is async — zero user-facing latency).

### What It Analyzes

The last `config.profilingInterval` to `config.profilingInterval * 2` entries from `state.users[userKey].history`, using the `sourceExcerpt` field alongside the classified label and intensity.

### How It Calls the LLM

Via `claude -p` (same as classification — no API key, uses Claude Code's own auth):

```bash
echo "<profiling prompt>" | claude -p --model haiku --output-format json --max-turns 1
```

Token usage and cost are extracted from the response and added to the aggregate totals.

### Profiling Prompt

Separate file: `src/classify/style-profiler-prompt.ts`

```
You are analyzing a person's communication style based on their recent
messages and the emotions detected in them. Your goal is to understand
HOW they communicate, not WHAT they feel. Be non-judgmental and kind.

Here are their recent classified messages:
{history entries with sourceExcerpt, label, intensity, trigger}

Current style profile (update incrementally, don't replace from scratch):
{current profile values with descriptions}

Rate each dimension using these anchored scales:

hyperboleTendency:
  0.0-0.2 = Very literal communicator, rarely exaggerates
  0.3-0.4 = Occasional mild exaggeration
  0.5     = Average (neutral/unknown)
  0.6-0.7 = Regularly uses dramatic language for effect
  0.8-1.0 = Extremely hyperbolic ("literally dying", "WORST THING EVER")

casualProfanity:
  0.0-0.2 = Never swears, or swearing always signals real anger
  0.3-0.4 = Occasional casual swearing
  0.5     = Average
  0.6-0.7 = Swears fairly often in casual context
  0.8-1.0 = Profanity is just vocabulary ("what the fuck" = "oh interesting")

emotionalExpressiveness:
  0.0-0.2 = Very understated ("hmm" = strong interest)
  0.3-0.4 = Reserved but clear
  0.5     = Average
  0.6-0.7 = Expressive, uses punctuation and caps for emphasis
  0.8-1.0 = Very dramatic communicator, big reactions to everything

sarcasmFrequency:
  0.0-0.2 = Almost always literal
  0.3-0.4 = Occasional light sarcasm
  0.5     = Average
  0.6-0.7 = Regular use of irony
  0.8-1.0 = Heavy sarcasm, frequently says the opposite of what they mean

Return ONLY JSON: {"hyperboleTendency": 0-1, "casualProfanity": 0-1,
"emotionalExpressiveness": 0-1, "sarcasmFrequency": 0-1}
```

### Profile Update Blending

New values are blended with the existing profile using exponential moving average weighted by sample size:

```
weight = min(config.emaMaxWeight, config.emaBaseWeight / (sampleSize + config.emaBaseWeight))
newValue = existingValue * (1 - weight) + observedValue * weight
```

With defaults (`emaBaseWeight: 5`, `emaMaxWeight: 0.5`):
- First profiling call (sampleSize ~10): weight ~0.33, high influence
- After 50+ messages: weight ~0.09, profile stabilizes
- After 100+ messages: weight ~0.05, very stable

Dimensions listed in `userOverrides` are skipped during auto-update (user corrections are protected).

### Staleness Check

Before applying the EMA blend, check for staleness:

```
daysSinceUpdate = (now - lastUpdated) / (1000 * 60 * 60 * 24)
if (daysSinceUpdate > config.stalenessThresholdDays && sampleSize > config.stalenessResetSampleSize) {
  sampleSize = config.stalenessResetSampleSize
}
```

This increases the EMA weight from ~0.05 (at sampleSize 100) back to ~0.14 (at sampleSize 30), allowing the profile to re-adapt if the user's communication style has evolved.

After update, `sampleSize += messagesSinceLastProfile`, `messagesSinceLastProfile = 0`.

---

## Classification Prompt Integration

When classifying a user message, the style profile is injected into the prompt if mature (`sampleSize >= config.profileMaturityThreshold`).

In `src/classify/prompts.ts`, `buildUserPrompt` gains an optional `style?: UserStyleProfile` parameter:

```
IMPORTANT - This user's communication style profile:
- Hyperbole tendency: 0.8/1.0 (they frequently exaggerate for effect —
  dramatic language often means mild feelings)
- Casual profanity: 0.9/1.0 (swearing is just how they talk,
  not a signal of anger)
- Emotional expressiveness: 0.7/1.0 (naturally dramatic communicator)
- Sarcasm frequency: 0.3/1.0 (mostly literal)

Calibrate your intensity ratings accordingly. A message like "BRO WHAT
THE FUCK" from this user likely indicates mild surprise or amusement,
not rage.
```

When the profile is immature (`sampleSize < config.profileMaturityThreshold`), this section is omitted entirely.

**Only affects user classification.** The agent classification prompt (`buildAgentPrompt`) is unchanged.

---

## Source Excerpt on EmotionStimulus

`EmotionStimulus` gains a new field:

```typescript
/** Excerpt of the original message for style profiling (first + last N tokens) */
sourceExcerpt?: string
```

### Excerpt Strategy

Store the **first `EXCERPT_TOKEN_LIMIT` tokens** and the **last `EXCERPT_TOKEN_LIMIT` tokens** of the original message, separated by ` [...] ` if truncated. This captures style signals at both ends of the message (hyperbolic openings AND hyperbolic closings).

Token limit per excerpt half is `config.excerptTokenLimit` (default: 200).

Token counting uses a simple whitespace split (not a real tokenizer — close enough for excerpting, and avoids a dependency). If the message is shorter than `2 * config.excerptTokenLimit` tokens, store the whole thing.

Set during classification in HookRunner when the message text is available. Persisted in history alongside the classification result.

---

## Token Usage Tracking

All classification and profiling calls go through `claude -p --output-format json`, which returns token usage and cost for free in its response.

### Per-Classification

`ClassificationResult` gains:

```typescript
interface ClassificationUsage {
  inputTokens: number
  outputTokens: number
  costUsd: number
  durationMs: number
}
```

```typescript
// Added to ClassificationResult
usage?: ClassificationUsage
```

Extracted from the `claude -p` JSON response fields: `usage.input_tokens`, `usage.output_tokens` (summed across model entries from `modelUsage`), `total_cost_usd`, `duration_ms`.

### Per-Stimulus

`EmotionStimulus` gains:

```typescript
classificationTokens?: ClassificationUsage
```

### Aggregate in State

`EmotionEngineState` gains:

```typescript
tokenUsage: {
  totalInput: number
  totalOutput: number
  totalCostUsd: number
  classificationCount: number
}
```

Running totals updated after every classification and profiling call. Displayed in `/openfeelz status`.

---

## Hook Lifecycle Integration

### UserPromptSubmit Hook

1. Load state, apply decay, advance rumination (existing)
2. Increment `userStyles[key].messagesSinceLastProfile` (on the tracker, not the profile)
3. If sync classification enabled:
   - Look up style profile for this user
   - If mature (sampleSize >= config.profileMaturityThreshold): inject into classification prompt
   - Classify, store `sourceExcerpt` on stimulus
   - Update token usage aggregate
4. Format context, persist, return (existing)

### Stop Hook

1. Classify agent message (existing) — update token usage
2. Classify user message if async (existing) — inject style profile, store excerpt, update tokens
3. **NEW:** Check if `messagesSinceLastProfile >= config.profilingInterval`
   - If yes: run profiling LLM call (same async context)
   - Parse result, blend into profile with EMA
   - Reset `messagesSinceLastProfile = 0`
   - Update token usage aggregate for profiling call
4. Persist (existing)

---

## `/openfeelz style` Command

New file: `commands/style.md`

### View

`/openfeelz style` — shows the current profile:

```
Your communication style profile (based on 47 messages):

Hyperbole:      ████████░░ 0.82 — You frequently exaggerate for effect
Profanity:      █████████░ 0.91 — Swearing is just how you talk
Expressiveness: ███████░░░ 0.68 — You're a fairly expressive communicator
Sarcasm:        ███░░░░░░░ 0.31 — You're mostly literal

Last updated: 2026-04-07 14:30
```

### Set

`/openfeelz style set hyperbole 0.9` — overrides a dimension. Added to `userOverrides` to protect from auto-update.

### Reset

`/openfeelz style reset` — clears profile back to defaults (all 0.5, sampleSize 0, no overrides).

### State Helper Actions

New actions in `state-helper.ts`:

| Action | Args | Description |
|--------|------|-------------|
| `get-style` | `--user <userKey>` (optional, default "unknown") | Return style profile |
| `set-style` | `--user <userKey> --dimension <name> --value <0-1>` | Set a style dimension, add to userOverrides |
| `reset-style` | `--user <userKey>` (optional) | Reset profile to defaults |

---

## File Changes

### New Files

| File | Purpose |
|------|---------|
| `src/config/style-config.ts` | `StyleProfileConfig` interface, `DEFAULT_STYLE_CONFIG` defaults |
| `src/config/style-config.test.ts` | Tests: verify all defaults, verify overrides respected |
| `src/classify/style-profiler.ts` | Profiling engine: analyze history, update profile with EMA |
| `src/classify/style-profiler.test.ts` | Tests for profiler |
| `src/classify/style-profiler-prompt.ts` | LLM prompt for style analysis |
| `commands/style.md` | `/openfeelz style` slash command |

### Modified Files

| File | Change |
|------|--------|
| `src/types.ts` | Add `UserStyleProfile`, `ClassificationUsage`, `userStyles` on state, `sourceExcerpt` and `classificationTokens` on stimulus, `tokenUsage` on state |
| `src/classify/prompts.ts` | `buildUserPrompt` gains optional `style` parameter |
| `src/classify/claude-classify.ts` | Extract `usage` and `total_cost_usd` from `claude -p` JSON response, return in `ClassificationResult` |
| `src/hooks/runner.ts` | Integrate style profile into classification, trigger profiling in Stop, track token usage, store sourceExcerpt |
| `src/helpers/state-helper.ts` | Add `get-style`, `set-style`, `reset-style` actions |
| `src/state/state-file.ts` | `buildEmptyState` includes `userStyles: {}` and `tokenUsage: { totalInput: 0, totalOutput: 0, classificationCount: 0 }` |

---

## Testing Strategy

### Unit Tests

- **Style config:** Test all `DEFAULT_STYLE_CONFIG` values match documented defaults. Test that overrides are applied correctly (e.g., `{ profilingInterval: 5 }` overrides the default while keeping others).
- **Style profiler:** Test EMA blending with known inputs at various config values, verify weight curve matches formula, verify userOverrides protection, verify staleness reset at configurable threshold
- **Excerpt builder:** Test first+last token extraction at various `excerptTokenLimit` values, test short messages stored whole, test truncation marker `[...]`
- **Prompt integration:** Test `buildUserPrompt` with and without style profile, verify profile section included/omitted based on configurable `profileMaturityThreshold`
- **Token tracking:** Test that classifier extracts usage from mock API response, verify aggregate accumulation
- **State helper:** Test `get-style`, `set-style`, `reset-style` actions

### Integration Tests

- Run profiling with mock LLM response, verify profile updates in state
- Run classification with style profile injected, verify prompt contains style context
- Verify messagesSinceLastProfile counter increments and resets

### Smoke Test

- [ ] Send 10+ messages with hyperbolic language
- [ ] Verify profiling triggers after 10th message
- [ ] `/openfeelz style` shows updated profile
- [ ] Next classification has lower intensity for hyperbolic messages
- [ ] `/openfeelz style set hyperbole 0.9` works
- [ ] `/openfeelz status` shows token usage totals
