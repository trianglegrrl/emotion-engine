import { describe, it, expect } from 'vitest'
import { buildAgentPrompt, buildUserPrompt, CLASSIFY_SYSTEM } from './prompts.js'
import type { UserStyleProfile } from '../types.js'

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
  })
})

describe('buildUserPrompt with style profile', () => {
  const labels = ['neutral', 'happy', 'frustrated']
  const matureProfile: UserStyleProfile = {
    hyperboleTendency: 0.8,
    casualProfanity: 0.9,
    emotionalExpressiveness: 0.7,
    sarcasmFrequency: 0.3,
    sampleSize: 20,
    lastUpdated: '',
    userOverrides: [],
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

  it('uses correct descriptors for high values', () => {
    const prompt = buildUserPrompt('hello', labels, matureProfile, 10)
    expect(prompt).toContain('0.8') // hyperbole
    expect(prompt).toContain('0.9') // profanity
  })
})
