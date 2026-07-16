export type AppErrorCode =
  | 'initialization'
  | 'validation'
  | 'network'
  | 'http'
  | 'parse'
  | 'storage'
  | 'cancelled'
  | 'unexpected'

export interface AppError {
  code: AppErrorCode
  message: string
  retryable: boolean
}

export interface ErrorNormalizationOptions {
  code?: AppErrorCode
  retryable?: boolean
}

export class PocketTavernError extends Error {
  readonly code: AppErrorCode
  readonly retryable: boolean

  constructor(code: AppErrorCode, message: string, retryable = false, options?: ErrorOptions) {
    super(message, options)
    this.name = 'PocketTavernError'
    this.code = code
    this.retryable = retryable
  }
}

const retryableCodes = new Set<AppErrorCode>(['network', 'http', 'storage', 'unexpected'])

const sanitizeMessage = (message: string): string => message
  .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
  .replace(/(["']?(?:api[_ -]?key|authorization|access[_ -]?token|token)["']?\s*[:=]\s*["']?)[^"',;\s}]+(["']?)/gi, '$1[redacted]$2')
  .replace(/(["']?(?:request\s*body|body|请求体)["']?\s*[:=]\s*)[\s\S]*$/gi, '$1[redacted]')
  .trim()

export const isAbortError = (error: unknown): boolean => error instanceof DOMException
  ? error.name === 'AbortError'
  : Boolean(error && typeof error === 'object' && 'name' in error && error.name === 'AbortError')

export function toAppError(
  error: unknown,
  fallbackMessage = '操作失败，请稍后重试。',
  options: ErrorNormalizationOptions = {},
): AppError {
  if (isAbortError(error)) return { code: 'cancelled', message: '', retryable: false }
  if (error instanceof PocketTavernError) return { code: error.code, message: sanitizeMessage(error.message) || fallbackMessage, retryable: error.retryable }

  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : ''
  const code = options.code || 'unexpected'
  return {
    code,
    message: sanitizeMessage(message) || fallbackMessage,
    retryable: options.retryable ?? retryableCodes.has(code),
  }
}

export function errorMessage(error: unknown, fallbackMessage = '操作失败，请稍后重试。'): string {
  return toAppError(error, fallbackMessage).message
}
