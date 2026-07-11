import type { AppSettings, Character, ChatMessage, Persona, Role } from '../types'

export interface PromptMessage { role: Role; content: string }

const estimateTokens = (text: string) => Math.ceil([...text].reduce((n, c) => n + (c.codePointAt(0)! > 255 ? 1 : .25), 0))
const replace = (value: string, character: Character, persona?: Persona) => value
  .replaceAll('{{char}}', character.name).replaceAll('{{user}}', persona?.name || 'User')

export function composePrompt(character: Character, persona: Persona | undefined, history: ChatMessage[], settings: AppSettings): PromptMessage[] {
  const d = character.data
  const blocks = [settings.systemPrompt, d.system_prompt,
    `You are ${character.name}. Stay in character and continue the roleplay naturally.`,
    d.description && `Character description:\n${d.description}`,
    d.personality && `Personality:\n${d.personality}`,
    d.scenario && `Scenario:\n${d.scenario}`,
    persona?.description && `User persona (${persona.name}):\n${persona.description}`,
    d.mes_example && `Example dialogue:\n${d.mes_example}`,
  ].filter(Boolean).map(x => replace(String(x), character, persona))
  const tail = d.post_history_instructions ? replace(d.post_history_instructions, character, persona) : ''
  const system: PromptMessage = { role: 'system', content: blocks.join('\n\n') }
  const budget = Math.max(256, settings.contextTokens - settings.maxTokens - estimateTokens(system.content) - estimateTokens(tail))
  const selected: PromptMessage[] = []
  let used = 0
  for (let i = history.length - 1; i >= 0; i--) {
    const content = replace(history[i].content, character, persona)
    const cost = estimateTokens(content) + 4
    if (used + cost > budget && selected.length) break
    if (cost <= budget || !selected.length) { selected.unshift({ role: history[i].role, content }); used += cost }
  }
  if (tail) selected.push({ role: 'system', content: tail })
  return [system, ...selected]
}
