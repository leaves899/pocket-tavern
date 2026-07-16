import { useCallback, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { composePrompt } from '../lib/prompt'
import { streamCompletion } from '../lib/deepseek'
import { isAbortError, PocketTavernError, toAppError } from '../lib/errors'
import { getPromptUsage, type TokenUsage } from '../lib/tokens'
import { store } from '../lib/storage'
import type { AppSettings, Character, ChatMessage, ChatSession, Persona, WorldBookEntry } from '../types'

type GenerateMode = 'send' | 'regenerate' | 'retry'

interface UseChatOptions {
  characters: Character[]
  personas: Persona[]
  sessions: ChatSession[]
  messages: ChatMessage[]
  settings: AppSettings
  apiKey: string
  worldBookEntries: WorldBookEntry[]
  reload: () => Promise<void>
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>
  reportError: (error: unknown, fallback?: string) => void
}

export function useChat({ characters, personas, sessions, messages, settings, apiKey, worldBookEntries, reload, setMessages, reportError }: UseChatOptions) {
  const [active, setActive] = useState<string>()
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<string>()
  const [retryAvailable, setRetryAvailable] = useState(false)
  const controller = useRef<AbortController | undefined>(undefined)
  const requestId = useRef<number>(0)
  const failedReplyId = useRef<string | undefined>(undefined)

  const session = sessions.find(item => item.id === active)
  const character = characters.find(item => item.id === session?.characterId)
  const chatMessages = useMemo(
    () => messages.filter(item => item.sessionId === active).sort((a, b) => a.createdAt - b.createdAt),
    [active, messages],
  )
  const defaultPersona = personas.find(item => item.isDefault)
  const previewHistory = useMemo(() => {
    if (!session || !draft.trim()) return chatMessages
    const now = Date.now()
    return [...chatMessages, { id: 'draft-preview', sessionId: session.id, role: 'user' as const, content: draft.trim(), createdAt: now, updatedAt: now }]
  }, [chatMessages, draft, session])
  const previewPrompt = useMemo(
    () => character && session ? composePrompt(character, defaultPersona, previewHistory, settings, worldBookEntries) : [],
    [character, defaultPersona, previewHistory, session, settings, worldBookEntries],
  )
  const previewUsage = useMemo<TokenUsage>(() => getPromptUsage(previewPrompt, settings), [previewPrompt, settings])

  const openChat = useCallback(async (nextCharacter: Character) => {
    let nextSession = sessions.find(item => item.characterId === nextCharacter.id)
    if (!nextSession) {
      const now = Date.now()
      nextSession = { id: crypto.randomUUID(), characterId: nextCharacter.id, title: nextCharacter.name, createdAt: now, updatedAt: now }
      await store.saveSession(nextSession)
      if (nextCharacter.data.first_mes) {
        const userName = personas.find(item => item.isDefault)?.name || 'User'
        await store.saveMessage({ id: crypto.randomUUID(), sessionId: nextSession.id, role: 'assistant', content: nextCharacter.data.first_mes.replaceAll('{{char}}', nextCharacter.name).replaceAll('{{user}}', userName), createdAt: now, updatedAt: now })
      }
      await reload()
    }
    setActive(nextSession.id)
  }, [personas, reload, sessions])

  const generate = useCallback(async (mode: GenerateMode = 'send') => {
    if (!character || !session || busy) return
    let history = chatMessages
    let pendingUser: ChatMessage | undefined
    try {
      if (mode === 'send') {
        const content = draft.trim()
        if (!content) return
        const now = Date.now()
        pendingUser = { id: crypto.randomUUID(), sessionId: session.id, role: 'user', content, createdAt: now, updatedAt: now }
        history = [...history, pendingUser]
      } else if (mode === 'regenerate') {
        const last = [...history].reverse().find(item => item.role === 'assistant')
        if (last) {
          await store.deleteMessage(last.id)
          history = history.filter(item => item.id !== last.id)
        }
      } else if (mode === 'retry') {
        const failedId = failedReplyId.current
        if (failedId) {
          await store.deleteMessage(failedId)
          history = history.filter(item => item.id !== failedId)
        }
      }

      const prompt = composePrompt(character, defaultPersona, history, settings, worldBookEntries)
      const usage = getPromptUsage(prompt, settings)
      if (usage.risk === 'blocked') throw new PocketTavernError('validation', '当前上下文已超过上限，请缩短消息或降低最大输出 Token。')

      if (pendingUser) {
        await store.saveMessage(pendingUser)
        setDraft('')
      }
      const reply: ChatMessage = { id: crypto.randomUUID(), sessionId: session.id, role: 'assistant', content: '', createdAt: Date.now(), updatedAt: Date.now() }
      await store.saveMessage(reply)
      await reload()

      const currentRequest = ++requestId.current
      const abortController = new AbortController()
      controller.current = abortController
      failedReplyId.current = undefined
      setRetryAvailable(false)
      setBusy(true)
      try {
        await streamCompletion(settings, apiKey, prompt, abortController.signal, text => {
          if (requestId.current !== currentRequest) return
          reply.content += text
          reply.updatedAt = Date.now()
          // Keep the streamed reply responsive without reloading the entire snapshot.
          setMessages(old => old.map(item => item.id === reply.id ? { ...reply } : item))
        })
        await store.saveMessage(reply)
      } catch (error) {
        if (!isAbortError(error)) {
          const normalized = toAppError(error, '聊天请求失败，请检查网络和模型设置。')
          failedReplyId.current = reply.content ? reply.id : undefined
          setRetryAvailable(normalized.retryable)
          reportError(error, '聊天请求失败，请检查网络和模型设置。')
        }
        if (!reply.content) {
          try { await store.deleteMessage(reply.id) } catch { /* preserve the original request error */ }
        } else {
          await store.saveMessage(reply)
        }
      } finally {
        if (requestId.current === currentRequest) {
          controller.current = undefined
          setBusy(false)
          await reload()
        }
      }
    } catch (error) {
      reportError(error, '无法发送消息，请稍后重试。')
    }
  }, [apiKey, busy, chatMessages, character, defaultPersona, draft, reload, reportError, session, setMessages, settings, worldBookEntries])

  const stop = useCallback(() => controller.current?.abort(), [])

  const saveEdited = useCallback(async (message: ChatMessage, content: string) => {
    try {
      await store.saveMessage({ ...message, content, updatedAt: Date.now() })
      setEditing(undefined)
      await reload()
    } catch (error) {
      reportError(error, '消息保存失败。')
    }
  }, [reload, reportError])

  const deleteMessage = useCallback(async (id: string) => {
    try {
      await store.deleteMessage(id)
      await reload()
    } catch (error) {
      reportError(error, '消息删除失败。')
    }
  }, [reload, reportError])

  const rollback = useCallback(async (message: ChatMessage) => {
    const start = chatMessages.findIndex(item => item.id === message.id)
    if (start < 0 || !confirm('回档将删除这条消息及之后的所有对话，且无法恢复。')) return
    try {
      await store.rollbackSession(message.sessionId, chatMessages.slice(start).map(item => item.id))
      await reload()
    } catch (error) {
      reportError(error, '回档失败。')
    }
  }, [chatMessages, reload, reportError])

  return { active, setActive, draft, setDraft, busy, editing, setEditing, retryAvailable, session, character, chatMessages, previewUsage, openChat, generate, stop, saveEdited, deleteMessage, rollback }
}
