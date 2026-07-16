import { describe, expect, it } from 'vitest'
import { estimatePromptTokens, estimateTextTokens, getPromptUsage } from './tokens'
import { defaultSettings } from '../types'

describe('token estimation', () => {
  it('uses deterministic BPE counts for multilingual and code text', () => {
    expect(estimateTextTokens('')).toBe(0)
    expect(estimateTextTokens('Hello, world!')).toBeGreaterThan(0)
    expect(estimateTextTokens('你好，世界')).toBeGreaterThan(0)
    expect(estimateTextTokens('const answer = () => 42')).toBeGreaterThan(3)
    expect(estimateTextTokens('Hello, world!')).toBe(estimateTextTokens('Hello, world!'))
  })

  it('includes message framing overhead', () => {
    const content = 'short message'
    expect(estimatePromptTokens([{ role: 'user', content }])).toBe(estimateTextTokens(content) + 6)
  })

  it('reports safe, warning and blocked context states', () => {
    const messages = [{ role: 'system', content: 'x'.repeat(100) }]
    expect(getPromptUsage(messages, { ...defaultSettings, contextTokens: 8192, maxTokens: 128 }).risk).toBe('safe')
    expect(getPromptUsage(messages, { ...defaultSettings, contextTokens: 170, maxTokens: 128 }).risk).toBe('warning')
    expect(getPromptUsage(messages, { ...defaultSettings, contextTokens: 64, maxTokens: 128 }).risk).toBe('blocked')
  })
})
