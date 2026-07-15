import type { AppSettings, Character, ChatMessage, Persona, Role, WorldBookEntry } from '../types'

export interface PromptMessage { role: Role; content: string }

const estimateTokens = (text: string) => Math.ceil([...text].reduce((n, c) => n + (c.codePointAt(0)! > 255 ? 1 : .25), 0))
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
  const fixedBudget = Math.max(0, settings.contextTokens - settings.maxTokens - estimateTokens(system.content) - estimateTokens(tail))
  const selectedEntries: string[] = []
  let entryTokens = 0
  for (const candidate of worldBookMessage(character, persona, history, entries)) {
    const cost = estimateTokens(candidate.content) + 4
    if (selectedEntries.length < 5 && entryTokens + cost <= fixedBudget) { selectedEntries.push(candidate.content); entryTokens += cost }
  }
  const budget = Math.max(0, fixedBudget - entryTokens)
  const selected: PromptMessage[] = []
  let used = 0
  for (let i = history.length - 1; i >= 0; i--) {
    const content = replace(history[i].content, character, persona)
    const cost = estimateTokens(content) + 4
    if (used + cost > budget && selected.length) break
    if (cost <= budget || !selected.length) { selected.unshift({ role: history[i].role, content }); used += cost }
  }
  if (selectedEntries.length) selected.push({ role: 'system', content: `Relevant world information:\n\n${selectedEntries.join('\n\n')}` })
  if (tail) selected.push({ role: 'system', content: tail })
  return [system, ...selected]
}
