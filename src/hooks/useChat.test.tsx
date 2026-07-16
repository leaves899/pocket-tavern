// @vitest-environment jsdom
import { act, render, waitFor } from '@testing-library/react'
import { useCallback, useEffect, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useChat } from './useChat'
import { streamCompletion } from '../lib/deepseek'
import { defaultSettings, type Character, type ChatMessage, type ChatSession } from '../types'

const persisted = vi.hoisted(() => ({ messages: [] as ChatMessage[] }))

vi.mock('../lib/deepseek', () => ({ streamCompletion: vi.fn() }))
vi.mock('../lib/storage', () => ({
  store: {
    saveMessage: vi.fn(async (message: ChatMessage) => {
      const index = persisted.messages.findIndex(item => item.id === message.id)
      if (index < 0) persisted.messages.push({ ...message })
      else persisted.messages[index] = { ...message }
    }),
    deleteMessage: vi.fn(async (id: string) => { persisted.messages = persisted.messages.filter(item => item.id !== id) }),
    snapshot: vi.fn(async () => ({ messages: [...persisted.messages] })),
  },
}))

const completion = vi.mocked(streamCompletion)
const character: Character = { id: 'character', name: 'Luna', data: { name: 'Luna', description: '', personality: '', scenario: '', first_mes: '', mes_example: '' }, rawCard: {}, createdAt: 0, updatedAt: 0 }
const session: ChatSession = { id: 'session', characterId: character.id, title: character.name, createdAt: 0, updatedAt: 0 }

interface HarnessProps {
  initialMessages: ChatMessage[]
  onReady: (chat: ReturnType<typeof useChat>) => void
  reportError: (error: unknown, fallback?: string) => void
  settings?: typeof defaultSettings
}

function Harness({ initialMessages, onReady, reportError, settings = defaultSettings }: HarnessProps) {
  const [messages, setMessages] = useState(initialMessages)
  const reload = useCallback(async () => { setMessages([...persisted.messages]) }, [])
  const chat = useChat({
    characters: [character], personas: [{ id: 'persona', name: 'Kai', description: '', isDefault: true }],
    sessions: [session], messages, settings, apiKey: 'test-key', worldBookEntries: [], reload, setMessages, reportError,
  })
  useEffect(() => onReady(chat), [chat, onReady])
  return null
}

function message(id: string, role: ChatMessage['role'], content: string): ChatMessage {
  return { id, sessionId: session.id, role, content, createdAt: Number(id.replace(/\D/g, '')) || 1, updatedAt: 1 }
}

describe('useChat', () => {
  let current: ReturnType<typeof useChat> | undefined
  let reportError: (error: unknown, fallback?: string) => void
  let reportErrorMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    persisted.messages = []
    completion.mockReset()
    reportErrorMock = vi.fn()
    reportError = reportErrorMock as unknown as (error: unknown, fallback?: string) => void
  })

  afterEach(() => vi.clearAllMocks())

  const mount = (initialMessages: ChatMessage[] = [], settings = defaultSettings) => {
    const onReady = (chat: ReturnType<typeof useChat>) => { current = chat }
    render(<Harness initialMessages={initialMessages} settings={settings} onReady={onReady} reportError={reportError} />)
    return async () => { await waitFor(() => expect(current).toBeDefined()) }
  }

  const openAndDraft = async (draft: string) => {
    await act(async () => { await current!.openChat(character) })
    await act(async () => { current!.setDraft(draft) })
  }

  it('sends a message and persists the streamed reply', async () => {
    completion.mockImplementation(async (_settings, _apiKey, _messages, _signal, onChunk) => { onChunk('hello back') })
    const ready = mount()
    await ready()
    await openAndDraft('hello')
    await act(async () => { await current!.generate() })

    expect(persisted.messages.map(item => [item.role, item.content])).toEqual([['user', 'hello'], ['assistant', 'hello back']])
    expect(reportErrorMock).not.toHaveBeenCalled()
  })

  it('keeps partial content when the user stops a request without reporting an error', async () => {
    let pending: Promise<void> | undefined
    completion.mockImplementation(async (_settings, _apiKey, _messages, signal, onChunk) => {
      onChunk('partial')
      pending = new Promise<void>((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true }))
      await pending
    })
    const ready = mount()
    await ready()
    await openAndDraft('stop')
    let generation: Promise<void> | undefined
    act(() => { generation = current!.generate() })
    await waitFor(() => expect(current!.busy).toBe(true))
    act(() => current!.stop())
    await act(async () => { await generation })

    expect(persisted.messages.some(item => item.role === 'assistant' && item.content === 'partial')).toBe(true)
    expect(reportErrorMock).not.toHaveBeenCalled()
  })

  it('removes a failed partial reply before retrying', async () => {
    completion
      .mockImplementationOnce(async (_settings, _apiKey, _messages, _signal, onChunk) => { onChunk('failed part'); throw new Error('temporary network failure') })
      .mockImplementationOnce(async (_settings, _apiKey, _messages, _signal, onChunk) => { onChunk('recovered') })
    const ready = mount()
    await ready()
    await openAndDraft('retry')
    await act(async () => { await current!.generate() })
    expect(persisted.messages.filter(item => item.role === 'assistant')).toHaveLength(1)
    expect(persisted.messages.find(item => item.role === 'assistant')?.content).toBe('failed part')
    expect(current!.retryAvailable).toBe(true)

    await act(async () => { await current!.generate('retry') })
    expect(persisted.messages.filter(item => item.role === 'assistant').map(item => item.content)).toEqual(['recovered'])
  })

  it('deletes the previous assistant response before regenerating', async () => {
    completion.mockImplementation(async (_settings, _apiKey, _messages, _signal, onChunk) => { onChunk('new response') })
    const ready = mount([message('user-1', 'user', 'question'), message('assistant-1', 'assistant', 'old response')])
    await ready()
    await act(async () => { await current!.openChat(character) })
    await act(async () => { await current!.generate('regenerate') })

    expect(persisted.messages.filter(item => item.role === 'assistant').map(item => item.content)).toEqual(['new response'])
  })

  it('blocks a request when the system prompt alone exceeds the context budget', async () => {
    const settings = { ...defaultSettings, systemPrompt: 'system '.repeat(500), contextTokens: 128, maxTokens: 64 }
    const ready = mount([], settings)
    await ready()
    await openAndDraft('blocked')
    await act(async () => { await current!.generate() })

    expect(completion).not.toHaveBeenCalled()
    expect(reportErrorMock).toHaveBeenCalled()
    expect(persisted.messages).toEqual([])
  })
})
