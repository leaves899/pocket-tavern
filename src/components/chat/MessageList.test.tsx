// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MessageList } from './MessageList'

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count, getItemKey }: { count: number; getItemKey: (index: number) => string | number }) => ({
    getTotalSize: () => count * 96,
    getVirtualItems: () => Array.from({ length: Math.min(count, 10) }, (_, index) => ({ index, key: getItemKey(index), start: index * 96 })),
    measureElement: () => {},
    scrollToIndex: () => {},
  }),
}))

const messages = Array.from({ length: 1000 }, (_, index) => ({ id: String(index), sessionId: 's', role: index % 2 ? 'assistant' as const : 'user' as const, content: `Message ${index}`, createdAt: index, updatedAt: index }))

describe('MessageList', () => {
  it('renders a virtualized long conversation without changing message actions', async () => {
    render(<MessageList messages={messages} busy={false} onSetEditing={vi.fn()} onSaveEdited={vi.fn()} onDelete={vi.fn()} onRollback={vi.fn()} onRegenerate={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('Message 0')).toBeDefined())
    expect(screen.queryByText('Message 999')).toBeNull()
  })
})
