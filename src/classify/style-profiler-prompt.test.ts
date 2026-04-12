import { describe, it, expect } from 'vitest'
import { buildProfilingPrompt } from './style-profiler-prompt.js'
import type { UserStyleProfile } from '../types.js'

describe('buildProfilingPrompt', () => {
  const history = [
    {
      label: 'frustrated',
      intensity: 0.8,
      trigger: 'broken build',
      sourceExcerpt: 'ugh this stupid build is killing me',
    },
    {
      label: 'happy',
      intensity: 0.6,
      trigger: 'test passed',
      sourceExcerpt: 'nice, tests are green!',
    },
  ]

  const currentProfile: UserStyleProfile = {
    hyperboleTendency: 0.7,
    casualProfanity: 0.3,
    emotionalExpressiveness: 0.6,
    sarcasmFrequency: 0.2,
    sampleSize: 20,
    lastUpdated: '2026-01-01T00:00:00.000Z',
    userOverrides: [],
  }

  it('includes history entries with sourceExcerpt, label, and intensity', () => {
    const prompt = buildProfilingPrompt(history, currentProfile)
    expect(prompt).toContain('ugh this stupid build is killing me')
    expect(prompt).toContain('frustrated')
    expect(prompt).toContain('0.8')
    expect(prompt).toContain('nice, tests are green!')
    expect(prompt).toContain('happy')
    expect(prompt).toContain('0.6')
  })

  it('includes current profile values', () => {
    const prompt = buildProfilingPrompt(history, currentProfile)
    expect(prompt).toContain('hyperboleTendency: 0.7')
    expect(prompt).toContain('casualProfanity: 0.3')
    expect(prompt).toContain('emotionalExpressiveness: 0.6')
    expect(prompt).toContain('sarcasmFrequency: 0.2')
  })

  it('includes anchored scale descriptions', () => {
    const prompt = buildProfilingPrompt(history, currentProfile)
    expect(prompt).toContain('Very literal')
    expect(prompt).toContain('Extremely hyperbolic')
    expect(prompt).toContain('Never swears')
    expect(prompt).toContain('Profanity is just vocabulary')
    expect(prompt).toContain('Very understated')
    expect(prompt).toContain('Very dramatic')
    expect(prompt).toContain('Almost always literal')
    expect(prompt).toContain('Heavy sarcasm')
  })

  it('includes JSON-only return instruction', () => {
    const prompt = buildProfilingPrompt(history, currentProfile)
    expect(prompt).toContain('Return ONLY JSON')
    expect(prompt).toContain('no markdown')
    expect(prompt).toContain('hyperboleTendency')
    expect(prompt).toContain('casualProfanity')
    expect(prompt).toContain('emotionalExpressiveness')
    expect(prompt).toContain('sarcasmFrequency')
  })

  it('includes non-judgmental framing', () => {
    const prompt = buildProfilingPrompt(history, currentProfile)
    expect(prompt).toContain('communication style')
    expect(prompt).toContain('non-judgmental')
    expect(prompt).toContain('kind')
  })

  it('formats history as numbered list', () => {
    const prompt = buildProfilingPrompt(history, currentProfile)
    expect(prompt).toContain('1.')
    expect(prompt).toContain('2.')
  })
})
