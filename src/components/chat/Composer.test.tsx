// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Composer } from './Composer'
import { getPromptUsage } from '../../lib/tokens'
import { defaultSettings } from '../../types'

const character = { id: 'c', name: 'Luna', data: { name: 'Luna', description: '', personality: '', scenario: '', first_mes: '', mes_example: '' }, rawCard: {}, createdAt: 0, updatedAt: 0 }

describe('Composer', () => {
  it('shows local token usage and blocks an over-limit send', () => {
    const onSend = vi.fn()
    const usage = getPromptUsage([{ role: 'system', content: 'x'.repeat(100) }], { ...defaultSettings, contextTokens: 64, maxTokens: 128 })
    render(<Composer character={character} draft="hello" busy={false} usage={usage} onDraftChange={vi.fn()} onSend={onSend} onStop={vi.fn()} />)
    expect(screen.getByText(/本地 BPE 估算/)).toBeDefined()
    expect(screen.getByText('超出上限')).toBeDefined()
    expect(screen.getByRole('button', { name: '发送' })).toHaveProperty('disabled', true)
    expect(onSend).not.toHaveBeenCalled()
  })
})
