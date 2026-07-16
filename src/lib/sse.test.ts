import { describe, expect, it } from 'vitest'
import { consumeSSE } from './sse'
const stream = (...parts: string[]) => new ReadableStream({ start(c) { parts.forEach(x => c.enqueue(new TextEncoder().encode(x))); c.close() } })
describe('consumeSSE', () => {
  it('handles events split across chunks', async () => { let out = ''; await consumeSSE(stream('data: {"choices":[{"delta":{"content":"你"}}]}\n', '\ndata: {"choices":[{"delta":{"content":"好"}}]}\n\ndata: [DONE]\n\n'), x => out += x); expect(out).toBe('你好') })
  it('surfaces API stream errors', async () => { await expect(consumeSSE(stream('data: {"error":{"message":"quota"}}\n\n'), () => {})).rejects.toThrow('quota') })
  it('converts malformed SSE payloads into parse errors', async () => {
    await expect(consumeSSE(stream('data: {not-json}\n\n'), () => {})).rejects.toThrow('SSE')
  })
})
