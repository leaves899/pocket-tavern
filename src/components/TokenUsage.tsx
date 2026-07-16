import type { TokenUsage } from '../lib/tokens'

const format = (value: number) => value.toLocaleString('zh-CN')

export function TokenUsage({ usage }: { usage: TokenUsage }) {
  const label = usage.risk === 'blocked' ? '超出上限' : usage.risk === 'warning' ? '接近上限' : '安全'
  return <div className={`token-usage ${usage.risk}`} aria-live="polite">
    <span>{format(usage.inputTokens)} 输入 / {format(usage.reservedOutputTokens)} 输出 / {format(usage.contextTokens)} 上下文</span>
    <strong>{label}</strong>
    <small>本地 BPE 估算（{usage.encoding}）</small>
  </div>
}
