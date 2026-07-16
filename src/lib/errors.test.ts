import { describe, expect, it } from 'vitest'
import { PocketTavernError, toAppError } from './errors'

describe('error normalization', () => {
  it('preserves typed error codes and retry behavior', () => {
    const result = toAppError(new PocketTavernError('network', '暂时不可用', true))
    expect(result).toEqual({ code: 'network', message: '暂时不可用', retryable: true })
  })

  it('redacts bearer credentials from user-facing messages', () => {
    const result = toAppError(new Error('Authorization: Bearer secret-key'))
    expect(result.message).not.toContain('secret-key')
    expect(result.message).toContain('[redacted]')
  })

  it('redacts credential and request-body fields', () => {
    const result = toAppError(new Error('apiKey=secret-key request body={"messages":["private"]}'))
    expect(result.message).not.toContain('secret-key')
    expect(result.message).not.toContain('private')
    expect(result.message).toContain('[redacted]')
  })

  it('normalizes unknown thrown values', () => {
    expect(toAppError({ unexpected: true }, 'fallback')).toMatchObject({ code: 'unexpected', message: 'fallback' })
  })
})
