import { useVirtualizer } from '@tanstack/react-virtual'
import { memo, useEffect, useRef } from 'react'
import { Pencil, RefreshCw, RotateCcw, Trash2 } from 'lucide-react'
import type { ChatMessage } from '../../types'

interface MessageListProps {
  messages: ChatMessage[]
  busy: boolean
  editing?: string
  onSetEditing: (id: string) => void
  onSaveEdited: (message: ChatMessage, content: string) => void
  onDelete: (id: string) => void
  onRollback: (message: ChatMessage) => void
  onRegenerate: () => void
}

export function MessageList({ messages, busy, editing, onSetEditing, onSaveEdited, onDelete, onRollback, onRegenerate }: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const atBottom = useRef(true)
  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 96,
    getItemKey: index => messages[index]?.id || index,
    overscan: 8,
  })

  useEffect(() => {
    if (atBottom.current && messages.length) virtualizer.scrollToIndex(messages.length - 1, { align: 'end' })
  }, [messages.length, virtualizer])

  return <div
    className="messages"
    ref={scrollRef}
    onScroll={() => {
      const element = scrollRef.current
      if (element) atBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80
    }}
  >
    <div className="messages-inner" style={{ height: `${virtualizer.getTotalSize()}px` }}>
      {virtualizer.getVirtualItems().map(item => {
        const message = messages[item.index]
        return <div
          className="message-virtual-row"
          data-index={item.index}
          key={item.key}
          ref={virtualizer.measureElement}
          style={{ transform: `translateY(${item.start}px)` }}
        >
          <MessageRow
            message={message}
            busy={busy}
            editing={editing === message.id}
            lastAssistant={message.role === 'assistant' && messages.slice(item.index + 1).every(next => next.role !== 'assistant')}
            onSetEditing={onSetEditing}
            onSaveEdited={onSaveEdited}
            onDelete={onDelete}
            onRollback={onRollback}
            onRegenerate={onRegenerate}
          />
        </div>
      })}
    </div>
  </div>
}

interface MessageRowProps {
  message: ChatMessage
  busy: boolean
  editing: boolean
  lastAssistant: boolean
  onSetEditing: (id: string) => void
  onSaveEdited: (message: ChatMessage, content: string) => void
  onDelete: (id: string) => void
  onRollback: (message: ChatMessage) => void
  onRegenerate: () => void
}

const MessageRow = memo(function MessageRow({ message, busy, editing, lastAssistant, onSetEditing, onSaveEdited, onDelete, onRollback, onRegenerate }: MessageRowProps) {
  const saved = useRef(false)
  useEffect(() => { saved.current = false }, [message.id, editing])
  const save = (content: string) => {
    if (saved.current) return
    saved.current = true
    onSaveEdited(message, content)
  }

  return <div className={`message-row ${message.role}`} data-message-id={message.id}>
    <div className="bubble">
      {editing
        ? <textarea autoFocus defaultValue={message.content} onKeyDown={event => { if (event.key === 'Enter' && event.ctrlKey) save(event.currentTarget.value) }} onBlur={event => save(event.currentTarget.value)} />
        : <div className="message-text">{message.content || (busy && lastAssistant ? <span className="typing">···</span> : '')}</div>}
      {!busy && !editing && <div className="message-tools">
        {message.role === 'user' && <button title="回档到此处前" aria-label="回档到此处前" onClick={() => onRollback(message)}><RotateCcw /></button>}
        <button title="编辑" aria-label="编辑" onClick={() => onSetEditing(message.id)}><Pencil /></button>
        <button title="删除" aria-label="删除" onClick={() => onDelete(message.id)}><Trash2 /></button>
        {message.role === 'assistant' && lastAssistant && <button title="重新生成" aria-label="重新生成" onClick={onRegenerate}><RefreshCw /></button>}
      </div>}
    </div>
  </div>
})
