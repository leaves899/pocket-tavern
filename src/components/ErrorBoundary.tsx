import { Component, type ErrorInfo, type ReactNode } from 'react'
import { toAppError } from '../lib/errors'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  error?: Error
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {}

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const normalized = toAppError(error, '应用渲染失败。', { code: 'unexpected', retryable: false })
    console.error('Pocket Tavern render error', normalized.message, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return <main className="error-fallback" role="alert">
      <h1>应用遇到问题</h1>
      <p>当前页面无法正常显示。重新加载后会重新初始化应用。</p>
      <button className="primary" onClick={() => window.location.reload()}>重新加载</button>
    </main>
  }
}
