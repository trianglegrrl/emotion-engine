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
  })
})
