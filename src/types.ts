export type Role = 'user' | 'assistant' | 'system'

export interface CharacterData {
  name: string
  description: string
  personality: string
  scenario: string
  first_mes: string
  mes_example: string
  system_prompt?: string
  post_history_instructions?: string
  alternate_greetings?: string[]
  tags?: string[]
  creator_notes?: string
  [key: string]: unknown
}

export interface Character {
  id: string
  name: string
  data: CharacterData
  rawCard: Record<string, unknown>
  avatar?: string
  assetPath?: string
  createdAt: number
  updatedAt: number
}

export interface Persona { id: string; name: string; description: string; isDefault: boolean }
export interface Preset { id: string; name: string; systemPrompt: string; temperature: number; maxTokens: number; contextTokens: number }
export interface ChatSession { id: string; characterId: string; title: string; createdAt: number; updatedAt: number }
export interface ChatMessage { id: string; sessionId: string; role: Role; content: string; createdAt: number; updatedAt: number }

export interface AppSettings {
  baseUrl: string
  model: string
  systemPrompt: string
  temperature: number
  maxTokens: number
  contextTokens: number
  theme: 'light' | 'dark' | 'system'
}

export const defaultSettings: AppSettings = {
  baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat', systemPrompt: '',
  temperature: 0.8, maxTokens: 1024, contextTokens: 8192, theme: 'system',
}
