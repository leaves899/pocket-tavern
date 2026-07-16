// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
    const onSetEditing = vi.fn()
    const onDelete = vi.fn()
    const onRollback = vi.fn()
    render(<MessageList messages={messages} busy={false} onSetEditing={onSetEditing} onSaveEdited={vi.fn()} onDelete={onDelete} onRollback={onRollback} onRegenerate={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('Message 0')).toBeDefined())
    expect(screen.queryByText('Message 999')).toBeNull()
    fireEvent.click(screen.getAllByRole('button', { name: '编辑' })[0])
    fireEvent.click(screen.getAllByRole('button', { name: '删除' })[0])
    fireEvent.click(screen.getAllByRole('button', { name: '回档到此处前' })[0])
    expect(onSetEditing).toHaveBeenCalledWith('0')
    expect(onDelete).toHaveBeenCalledWith('0')
    expect(onRollback).toHaveBeenCalledWith(messages[0])
  })
})
