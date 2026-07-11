export interface DeepSeekChunk { choices?: Array<{ delta?: { content?: string; reasoning_content?: string }; finish_reason?: string | null }>; error?: { message?: string } }

export async function consumeSSE(stream: ReadableStream<Uint8Array>, onChunk: (text: string) => void): Promise<void> {
  const reader = stream.getReader(); const decoder = new TextDecoder(); let buffer = ''
  const process = (block: string) => {
    const data = block.split(/\r?\n/).filter(l => l.startsWith('data:')).map(l => l.slice(5).trimStart()).join('\n')
    if (!data || data === '[DONE]') return
    let payload: DeepSeekChunk
    try { payload = JSON.parse(data) } catch { throw new Error('服务返回了无效的 SSE 数据') }
    if (payload.error) throw new Error(payload.error.message || 'DeepSeek 返回错误')
    const delta = payload.choices?.[0]?.delta
    const text = delta?.content || ''
    if (text) onChunk(text)
  }
  while (true) {
    const { value, done } = await reader.read(); buffer += decoder.decode(value, { stream: !done })
    const blocks = buffer.split(/\r?\n\r?\n/); buffer = blocks.pop() || ''
    blocks.forEach(process)
    if (done) { if (buffer.trim()) process(buffer); break }
  }
}
