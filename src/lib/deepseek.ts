import type { AppSettings } from '../types'
import type { PromptMessage } from './prompt'
import { consumeSSE } from './sse'

export async function streamCompletion(settings: AppSettings, apiKey: string, messages: PromptMessage[], signal: AbortSignal, onChunk: (text: string) => void) {
  if (!apiKey.trim()) throw new Error('请先在设置中填写 API Key')
  const url = `${settings.baseUrl.replace(/\/+$/, '')}/chat/completions`
  if (!url.startsWith('https://')) throw new Error('Base URL 必须使用 HTTPS')
  let response: Response
  try {
    response = await fetch(url, { method: 'POST', signal, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` }, body: JSON.stringify({ model: settings.model, messages, stream: true, temperature: settings.temperature, max_tokens: settings.maxTokens }) })
  } catch (e) { if ((e as Error).name === 'AbortError') throw e; throw new Error('无法连接 DeepSeek，请检查网络和 Base URL') }
  if (!response.ok) {
    let detail = ''; try { detail = (await response.json()).error?.message || '' } catch { /* response is not JSON */ }
    throw new Error(detail || `DeepSeek 请求失败 (${response.status})`)
  }
  if (!response.body) throw new Error('响应不支持流式读取')
  await consumeSSE(response.body, onChunk)
}
