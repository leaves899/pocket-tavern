import { describe, expect, it } from 'vitest'
import { composePrompt } from './prompt'
import { defaultSettings } from '../types'
const character: any = { name: 'Luna', data: { name: 'Luna', description: 'Talks to {{user}}', personality: 'calm', scenario: '', first_mes: '', mes_example: '' } }
describe('composePrompt', () => {
  it('orders system then history and expands macros', () => { const p = composePrompt(character, { id: 'p', name: 'Kai', description: 'traveler', isDefault: true }, [{ id: '1', sessionId: 's', role: 'user', content: 'Hi {{char}}', createdAt: 1, updatedAt: 1 }], defaultSettings); expect(p[0].role).toBe('system'); expect(p[0].content).toContain('Talks to Kai'); expect(p[1].content).toBe('Hi Luna') })
  it('trims oldest history', () => { const history = Array.from({ length: 20 }, (_, i) => ({ id: String(i), sessionId: 's', role: 'user' as const, content: '长'.repeat(150), createdAt: i, updatedAt: i })); const p = composePrompt(character, undefined, history, { ...defaultSettings, contextTokens: 1100, maxTokens: 800 }); expect(p.length).toBeLessThan(history.length + 1) })
})
