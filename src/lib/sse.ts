import { PocketTavernError } from './errors'

export interface DeepSeekChunk { choices?: Array<{ delta?: { content?: string; reasoning_content?: string }; finish_reason?: string | null }>; error?: { message?: string } }

export async function consumeSSE(stream: ReadableStream<Uint8Array>, onChunk: (text: string) => void): Promise<void> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const process = (block: string) => {
    const data = block.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n')
    if (!data || data === '[DONE]') return
    let payload: DeepSeekChunk
    try { payload = JSON.parse(data) } catch { throw new PocketTavernError('parse', '模型服务返回了无效的 SSE 数据。') }
    if (payload.error) throw new PocketTavernError('http', payload.error.message || '模型服务返回错误。', true)
    const delta = payload.choices?.[0]?.delta
    const text = delta?.content || ''
    if (text) onChunk(text)
  }
  while (true) {
    const { value, done } = await reader.read()
    buffer += decoder.decode(value, { stream: !done })
    const blocks = buffer.split(/\r?\n\r?\n/)
    buffer = blocks.pop() || ''
    blocks.forEach(process)
    if (done) {
      if (buffer.trim()) process(buffer)
      break
    }
  }
}
