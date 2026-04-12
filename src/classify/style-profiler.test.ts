import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { UserStyleProfile, EmotionStimulus, ClassificationUsage } from '../types.js'
import type { StyleProfileConfig } from '../config/style-config.js'
import { DEFAULT_STYLE_CONFIG } from '../config/style-config.js'

// Mock callClaude before importing the module under test
vi.mock('../utils/claude-cli.js', () => ({
  callClaude: vi.fn(),
}))

import {
  createDefaultTracker,
  checkStaleness,
  blendProfile,
  runProfiling,
} from './style-profiler.js'
import { callClaude } from '../utils/claude-cli.js'

const mockedCallClaude = vi.mocked(callClaude)

function makeProfile(overrides: Partial<UserStyleProfile> = {}): UserStyleProfile {
  return {
    hyperboleTendency: 0.5,
    casualProfanity: 0.5,
    emotionalExpressiveness: 0.5,
    sarcasmFrequency: 0.5,
    sampleSize: 0,
    lastUpdated: new Date().toISOString(),
    userOverrides: [],
    ...overrides,
  }
}

describe('createDefaultTracker', () => {
  it('returns default profile with all 0.5 dimensions and messagesSinceLastProfile 0', () => {
    const tracker = createDefaultTracker()
    expect(tracker.profile.hyperboleTendency).toBe(0.5)
    expect(tracker.profile.casualProfanity).toBe(0.5)
    expect(tracker.profile.emotionalExpressiveness).toBe(0.5)
    expect(tracker.profile.sarcasmFrequency).toBe(0.5)
    expect(tracker.profile.sampleSize).toBe(0)
    expect(tracker.profile.userOverrides).toEqual([])
    expect(tracker.messagesSinceLastProfile).toBe(0)
  })
})

describe('checkStaleness', () => {
  it('caps sampleSize when stale (>30 days and sampleSize > stalenessResetSampleSize)', () => {
    const staleDate = new Date()
    staleDate.setDate(staleDate.getDate() - 31)
    const profile = makeProfile({
      sampleSize: 80,
      lastUpdated: staleDate.toISOString(),
    })

    const result = checkStaleness(profile, DEFAULT_STYLE_CONFIG)
    expect(result.sampleSize).toBe(DEFAULT_STYLE_CONFIG.stalenessResetSampleSize)
  })

  it('does not cap when profile is fresh', () => {
    const profile = makeProfile({
      sampleSize: 80,
      lastUpdated: new Date().toISOString(),
    })

    const result = checkStaleness(profile, DEFAULT_STYLE_CONFIG)
    expect(result.sampleSize).toBe(80)
  })

  it('does not cap when sampleSize is already below threshold', () => {
    const staleDate = new Date()
    staleDate.setDate(staleDate.getDate() - 31)
    const profile = makeProfile({
      sampleSize: 10,
      lastUpdated: staleDate.toISOString(),
    })

    const result = checkStaleness(profile, DEFAULT_STYLE_CONFIG)
    expect(result.sampleSize).toBe(10)
  })
})

describe('blendProfile', () => {
  const config = DEFAULT_STYLE_CONFIG

  it('applies high weight for low sampleSize', () => {
    const existing = makeProfile({ sampleSize: 10, hyperboleTendency: 0.5 })
    const observed = {
      hyperboleTendency: 0.8,
      casualProfanity: 0.5,
      emotionalExpressiveness: 0.5,
      sarcasmFrequency: 0.5,
    }

    // weight = min(0.5, 5 / (10 + 5)) = min(0.5, 0.333...) = 0.333...
    const result = blendProfile(existing, observed, 1, config)
    const expectedWeight = config.emaBaseWeight / (10 + config.emaBaseWeight)
    const expected = 0.5 * (1 - expectedWeight) + 0.8 * expectedWeight
    expect(result.hyperboleTendency).toBeCloseTo(expected, 4)
  })

  it('applies low weight for high sampleSize', () => {
    const existing = makeProfile({ sampleSize: 100, hyperboleTendency: 0.5 })
    const observed = {
      hyperboleTendency: 0.8,
      casualProfanity: 0.5,
      emotionalExpressiveness: 0.5,
      sarcasmFrequency: 0.5,
    }

    // weight = min(0.5, 5 / (100 + 5)) = min(0.5, 0.04762) = 0.04762
    const result = blendProfile(existing, observed, 1, config)
    const expectedWeight = config.emaBaseWeight / (100 + config.emaBaseWeight)
    const expected = 0.5 * (1 - expectedWeight) + 0.8 * expectedWeight
    expect(result.hyperboleTendency).toBeCloseTo(expected, 4)
  })

  it('skips dimensions listed in userOverrides', () => {
    const existing = makeProfile({
      sampleSize: 10,
      hyperboleTendency: 0.3,
      userOverrides: ['hyperboleTendency'],
    })
    const observed = {
      hyperboleTendency: 0.9,
      casualProfanity: 0.7,
      emotionalExpressiveness: 0.5,
      sarcasmFrequency: 0.5,
    }

    const result = blendProfile(existing, observed, 1, config)
    expect(result.hyperboleTendency).toBe(0.3) // unchanged
    expect(result.casualProfanity).not.toBe(0.5) // blended
  })

  it('updates sampleSize by adding messageCount', () => {
    const existing = makeProfile({ sampleSize: 10 })
    const observed = {
      hyperboleTendency: 0.5,
      casualProfanity: 0.5,
      emotionalExpressiveness: 0.5,
      sarcasmFrequency: 0.5,
    }

    const result = blendProfile(existing, observed, 5, config)
    expect(result.sampleSize).toBe(15)
  })

  it('updates lastUpdated timestamp', () => {
    const oldDate = '2020-01-01T00:00:00.000Z'
    const existing = makeProfile({ sampleSize: 10, lastUpdated: oldDate })
    const observed = {
      hyperboleTendency: 0.5,
      casualProfanity: 0.5,
      emotionalExpressiveness: 0.5,
      sarcasmFrequency: 0.5,
    }

    const result = blendProfile(existing, observed, 1, config)
    expect(result.lastUpdated).not.toBe(oldDate)
  })
})

describe('runProfiling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls callClaude and returns blended profile with usage', async () => {
    const usage: ClassificationUsage = {
      inputTokens: 100,
      outputTokens: 50,
      costUsd: 0.001,
      durationMs: 200,
    }

    mockedCallClaude.mockResolvedValue({
      result: JSON.stringify({
        hyperboleTendency: 0.7,
        casualProfanity: 0.4,
        emotionalExpressiveness: 0.8,
        sarcasmFrequency: 0.3,
      }),
      usage,
    })

    const history: EmotionStimulus[] = [
      {
        id: '1',
        timestamp: new Date().toISOString(),
        label: 'frustrated',
        intensity: 0.8,
        trigger: 'broken build',
        confidence: 0.9,
        sourceRole: 'user',
        sourceExcerpt: 'this is so annoying',
      },
    ]

    const currentProfile = makeProfile({ sampleSize: 10 })

    const result = await runProfiling(history, currentProfile, DEFAULT_STYLE_CONFIG)

    expect(mockedCallClaude).toHaveBeenCalledOnce()
    expect(mockedCallClaude).toHaveBeenCalledWith(
      expect.stringContaining('communication style'),
      { model: 'haiku' },
    )
    expect(result.usage).toEqual(usage)
    // Profile should be blended (not raw observed values)
    expect(result.profile.hyperboleTendency).not.toBe(0.5) // changed from default
    expect(result.profile.sampleSize).toBe(11) // 10 + 1 message
  })

  it('uses custom model when provided', async () => {
    mockedCallClaude.mockResolvedValue({
      result: JSON.stringify({
        hyperboleTendency: 0.5,
        casualProfanity: 0.5,
        emotionalExpressiveness: 0.5,
        sarcasmFrequency: 0.5,
      }),
      usage: { inputTokens: 0, outputTokens: 0, costUsd: 0, durationMs: 0 },
    })

    const history: EmotionStimulus[] = []
    const currentProfile = makeProfile()

    await runProfiling(history, currentProfile, DEFAULT_STYLE_CONFIG, 'sonnet')

    expect(mockedCallClaude).toHaveBeenCalledWith(
      expect.any(String),
      { model: 'sonnet' },
    )
  })
})
