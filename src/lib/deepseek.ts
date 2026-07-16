import type { AppSettings } from '../types'
import type { PromptMessage } from './prompt'
import { isAbortError, PocketTavernError } from './errors'
import { consumeSSE } from './sse'

export async function streamCompletion(settings: AppSettings, apiKey: string, messages: PromptMessage[], signal: AbortSignal, onChunk: (text: string) => void) {
  if (!apiKey.trim()) throw new PocketTavernError('validation', '请先在设置中填写 API Key。')
  const url = `${settings.baseUrl.replace(/\/+$/, '')}/chat/completions`
  if (!url.startsWith('https://')) throw new PocketTavernError('validation', 'Base URL 必须使用 HTTPS。')
  let response: Response
  try {
    response = await fetch(url, { method: 'POST', signal, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` }, body: JSON.stringify({ model: settings.model, messages, stream: true, temperature: settings.temperature, max_tokens: settings.maxTokens }) })
  } catch (error) {
    if (isAbortError(error)) throw error
    throw new PocketTavernError('network', '无法连接模型服务，请检查网络和 Base URL。', true, { cause: error })
  }
  if (!response.ok) {
    let detail = ''
    try { detail = (await response.json()).error?.message || '' } catch { /* response is not JSON */ }
    const retryable = response.status === 429 || response.status >= 500
    throw new PocketTavernError('http', detail || `模型服务请求失败（${response.status}）。`, retryable)
  }
  if (!response.body) throw new PocketTavernError('parse', '模型服务没有返回可读取的流式响应。')
  await consumeSSE(response.body, onChunk)
}
