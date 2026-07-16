import type { AppSettings, Character, ChatMessage, Persona, Role, WorldBookEntry } from '../types'
import { estimateMessageTokens, getInputBudget } from './tokens'

export interface PromptMessage { role: Role; content: string }

const replace = (value: string, character: Character, persona?: Persona) => value
  .replaceAll('{{char}}', character.name).replaceAll('{{user}}', persona?.name || 'User')

const worldBookMessage = (character: Character, persona: Persona | undefined, history: ChatMessage[], entries: WorldBookEntry[]) => {
  const haystack = history.slice(-10).map(x => x.content).join('\n').toLocaleLowerCase()
  const applicable = entries
    .filter(x => x.enabled && (!x.characterIds.length || x.characterIds.includes(character.id)) && x.keywords.some(keyword => haystack.includes(keyword.toLocaleLowerCase())))
    .sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt)
  return applicable.map(x => ({ entry: x, content: replace(`World book — ${x.name}:\n${x.content}`, character, persona) }))
}

export function composePrompt(character: Character, persona: Persona | undefined, history: ChatMessage[], settings: AppSettings, entries: WorldBookEntry[] = []): PromptMessage[] {
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
  const inputBudget = getInputBudget(settings)
  const tailMessage = tail ? { role: 'system' as const, content: tail } : undefined
  let usedTokens = estimateMessageTokens(system) + (tailMessage ? estimateMessageTokens(tailMessage) : 0)
  const selectedEntries: string[] = []
  for (const candidate of worldBookMessage(character, persona, history, entries)) {
    if (selectedEntries.length >= 5) break
    const content = `Relevant world information:\n\n${[...selectedEntries, candidate.content].join('\n\n')}`
    const cost = estimateMessageTokens({ role: 'system', content })
    if (usedTokens + cost <= inputBudget) selectedEntries.push(candidate.content)
  }
  if (selectedEntries.length) usedTokens += estimateMessageTokens({ role: 'system', content: `Relevant world information:\n\n${selectedEntries.join('\n\n')}` })
  const selected: PromptMessage[] = []
  for (let i = history.length - 1; i >= 0; i--) {
    const content = replace(history[i].content, character, persona)
    const message = { role: history[i].role, content }
    const cost = estimateMessageTokens(message)
    if (usedTokens + cost > inputBudget) {
      if (!selected.length) selected.unshift(message)
      break
    }
    selected.unshift(message)
    usedTokens += cost
  }
  if (selectedEntries.length) selected.push({ role: 'system', content: `Relevant world information:\n\n${selectedEntries.join('\n\n')}` })
  if (tailMessage) selected.push(tailMessage)
  return [system, ...selected]
}
