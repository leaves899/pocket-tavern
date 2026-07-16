import { countTokens } from 'gpt-tokenizer/encoding/cl100k_base'
import type { AppSettings } from '../types'

export type TokenRisk = 'safe' | 'warning' | 'blocked'

export interface TokenMessage {
  role: string
  content: string
}

export interface TokenUsage {
  inputTokens: number
  reservedOutputTokens: number
  totalTokens: number
  contextTokens: number
  remainingTokens: number
  ratio: number
  risk: TokenRisk
  encoding: 'cl100k_base'
}

export const MESSAGE_TOKEN_OVERHEAD = 4
export const PROMPT_TOKEN_OVERHEAD = 2
const TOKEN_CACHE_LIMIT = 2048
const tokenCache = new Map<string, number>()

export function estimateTextTokens(text: string): number {
  const cached = tokenCache.get(text)
  if (cached !== undefined) return cached
  const value = countTokens(text)
  tokenCache.set(text, value)
  if (tokenCache.size > TOKEN_CACHE_LIMIT) tokenCache.delete(tokenCache.keys().next().value as string)
  return value
}

export function estimateMessageTokens(message: TokenMessage): number {
  return estimateTextTokens(message.content) + MESSAGE_TOKEN_OVERHEAD
}

export function estimatePromptTokens(messages: readonly TokenMessage[]): number {
  return PROMPT_TOKEN_OVERHEAD + messages.reduce((total, message) => total + estimateMessageTokens(message), 0)
}

export function getPromptUsage(messages: readonly TokenMessage[], settings: Pick<AppSettings, 'contextTokens' | 'maxTokens'>): TokenUsage {
  const inputTokens = estimatePromptTokens(messages)
  const reservedOutputTokens = Math.max(0, Math.floor(settings.maxTokens))
  const contextTokens = Math.max(1, Math.floor(settings.contextTokens))
  const totalTokens = inputTokens + reservedOutputTokens
  const remainingTokens = contextTokens - totalTokens
  const ratio = totalTokens / contextTokens
  const risk: TokenRisk = totalTokens > contextTokens ? 'blocked' : ratio >= 0.8 ? 'warning' : 'safe'
  return { inputTokens, reservedOutputTokens, totalTokens, contextTokens, remainingTokens, ratio, risk, encoding: 'cl100k_base' }
}

export function getInputBudget(settings: Pick<AppSettings, 'contextTokens' | 'maxTokens'>): number {
  return Math.max(0, Math.floor(settings.contextTokens) - Math.max(0, Math.floor(settings.maxTokens)) - PROMPT_TOKEN_OVERHEAD)
}
