import { Send, Square } from 'lucide-react'
import type { Character } from '../../types'
import type { TokenUsage } from '../../lib/tokens'
import { TokenUsage as TokenUsageView } from '../TokenUsage'

interface ComposerProps {
  character: Character
  draft: string
  busy: boolean
  usage: TokenUsage
  onDraftChange: (value: string) => void
  onSend: () => void
  onStop: () => void
}

export function Composer({ character, draft, busy, usage, onDraftChange, onSend, onStop }: ComposerProps) {
  return <div className="composer">
    <div className="composer-main">
      <textarea
        rows={1}
        value={draft}
        placeholder={`给 ${character.name} 发送消息…`}
        onChange={event => onDraftChange(event.target.value)}
        onKeyDown={event => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            if (!busy && usage.risk !== 'blocked') onSend()
          }
        }}
      />
      <button className="send" aria-label={busy ? '停止' : '发送'} disabled={!busy && usage.risk === 'blocked'} onClick={() => busy ? onStop() : onSend()}>
        {busy ? <Square /> : <Send />}
      </button>
    </div>
    <TokenUsageView usage={usage} />
  </div>
}
