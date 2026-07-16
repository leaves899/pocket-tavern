import type { AppError } from '../lib/errors'
import { RefreshCw, X } from 'lucide-react'

interface ErrorNoticeProps {
  error?: AppError
  success?: string
  onRetry?: () => void
  onClearError: () => void
  onClearSuccess: () => void
}

export function ErrorNotice({ error, success, onRetry, onClearError, onClearSuccess }: ErrorNoticeProps) {
  return <>
    {error && <div className="notice" role="alert" aria-live="assertive">
      <span>{error.message}</span>
      {(error.code === 'network' || error.code === 'http') && error.retryable && onRetry && <button onClick={onRetry}><RefreshCw />重试</button>}
      <button aria-label="关闭" onClick={onClearError}><X size={16} /></button>
    </div>}
    {success && <div className="notice success" role="status" aria-live="polite">
      <span>{success}</span>
      <button aria-label="关闭" onClick={onClearSuccess}><X size={16} /></button>
    </div>}
  </>
}
