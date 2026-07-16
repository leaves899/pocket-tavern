import { afterEach, describe, expect, it, vi } from 'vitest'
import { streamCompletion } from './deepseek'
import { defaultSettings } from '../types'
const stream = (text: string) => new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(text)); c.close() } })
describe('DeepSeek client', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('posts the selected model and emits final content only', async () => { let request: RequestInit | undefined; vi.stubGlobal('fetch', vi.fn(async (_url, init) => { request = init; return new Response(stream('data: {"choices":[{"delta":{"reasoning_content":"hidden"}}]}\n\ndata: {"choices":[{"delta":{"content":"visible"}}]}\n\ndata: [DONE]\n\n'), { status: 200 }) })); let out = ''; await streamCompletion({ ...defaultSettings, model: 'deepseek-reasoner' }, 'test-key', [{ role: 'user', content: 'Hi' }], new AbortController().signal, x => out += x); expect(request).toBeDefined(); const body = JSON.parse(String(request!.body)); expect(body.model).toBe('deepseek-reasoner'); expect(body.stream).toBe(true); expect((request!.headers as Record<string, string>).Authorization).toBe('Bearer test-key'); expect(out).toBe('visible') })
  it('rejects non-HTTPS custom endpoints before fetch', async () => { const fetch = vi.fn(); vi.stubGlobal('fetch', fetch); await expect(streamCompletion({ ...defaultSettings, baseUrl: 'http://example.test' }, 'key', [], new AbortController().signal, () => {})).rejects.toThrow('HTTPS'); expect(fetch).not.toHaveBeenCalled() })
  it('maps structured API errors without exposing credentials', async () => { vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { message: 'invalid model' } }), { status: 400, headers: { 'Content-Type': 'application/json' } }))); await expect(streamCompletion(defaultSettings, 'never-print-this', [], new AbortController().signal, () => {})).rejects.toThrow('invalid model') })
  it('marks temporary server errors as retryable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('temporary failure', { status: 503 })))
    await expect(streamCompletion(defaultSettings, 'test-key', [], new AbortController().signal, () => {})).rejects.toMatchObject({ code: 'http', retryable: true })
  })
  it('preserves cancellation without converting it to a network error', async () => {
    const abortError = new DOMException('Aborted', 'AbortError')
    vi.stubGlobal('fetch', vi.fn(async () => { throw abortError }))
    await expect(streamCompletion(defaultSettings, 'test-key', [], new AbortController().signal, () => {})).rejects.toBe(abortError)
  })
  it('requires an API key', async () => { await expect(streamCompletion(defaultSettings, '', [], new AbortController().signal, () => {})).rejects.toThrow('API Key') })
})
