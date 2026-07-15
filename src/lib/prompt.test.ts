import { describe, expect, it } from 'vitest'
import { composePrompt } from './prompt'
import { defaultSettings } from '../types'
const character: any = { name: 'Luna', data: { name: 'Luna', description: 'Talks to {{user}}', personality: 'calm', scenario: '', first_mes: '', mes_example: '' } }
describe('composePrompt', () => {
  it('orders system then history and expands macros', () => { const p = composePrompt(character, { id: 'p', name: 'Kai', description: 'traveler', isDefault: true }, [{ id: '1', sessionId: 's', role: 'user', content: 'Hi {{char}}', createdAt: 1, updatedAt: 1 }], defaultSettings); expect(p[0].role).toBe('system'); expect(p[0].content).toContain('Talks to Kai'); expect(p[1].content).toBe('Hi Luna') })
  it('trims oldest history', () => { const history = Array.from({ length: 20 }, (_, i) => ({ id: String(i), sessionId: 's', role: 'user' as const, content: '长'.repeat(150), createdAt: i, updatedAt: i })); const p = composePrompt(character, undefined, history, { ...defaultSettings, contextTokens: 1100, maxTokens: 800 }); expect(p.length).toBeLessThan(history.length + 1) })
  it('injects matching world book entries after history in priority order', () => {
    const history = [{ id: '1', sessionId: 's', role: 'user' as const, content: 'Tell me about the Moon City', createdAt: 1, updatedAt: 1 }]
    const entries: any[] = [
      { id: 'low', name: 'Moon', keywords: ['moon'], content: 'Low priority', priority: 1, enabled: true, characterIds: [], createdAt: 1 },
      { id: 'high', name: 'City', keywords: ['city'], content: 'High priority for {{user}}', priority: 2, enabled: true, characterIds: [], createdAt: 2 },
      { id: 'other', name: 'Other', keywords: ['moon'], content: 'Not for Luna', priority: 9, enabled: true, characterIds: ['other'], createdAt: 1 },
    ]
    const p = composePrompt(character, { id: 'p', name: 'Kai', description: '', isDefault: true }, history, defaultSettings, entries)
    expect(p[1].content).toContain('Moon City')
    expect(p[2]).toMatchObject({ role: 'system' })
    expect(p[2].content).toContain('High priority for Kai')
    expect(p[2].content.indexOf('High priority')).toBeLessThan(p[2].content.indexOf('Low priority'))
    expect(p[2].content).not.toContain('Not for Luna')
  })
  it('limits world book entries to five and ignores disabled entries', () => {
    const history = [{ id: '1', sessionId: 's', role: 'user' as const, content: 'key', createdAt: 1, updatedAt: 1 }]
    const entries: any[] = Array.from({ length: 6 }, (_, i) => ({ id: String(i), name: `Entry ${i}`, keywords: ['key'], content: `content ${i}`, priority: i, enabled: true, characterIds: [], createdAt: i }))
    entries[5].enabled = false
    const p = composePrompt(character, undefined, history, defaultSettings, entries)
    const world = p.at(-1)?.content || ''
    expect(world).toContain('content 4')
    expect(world).not.toContain('content 5')
    expect(world).toContain('content 0')
  })
})
