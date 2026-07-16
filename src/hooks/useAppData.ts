import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { store } from '../lib/storage'
import { defaultSettings, type AppSettings, type Character, type ChatMessage, type ChatSession, type Persona, type Preset, type WorldBookEntry } from '../types'

export interface AppData {
  ready: boolean
  characters: Character[]
  personas: Persona[]
  presets: Preset[]
  worldBookEntries: WorldBookEntry[]
  sessions: ChatSession[]
  messages: ChatMessage[]
  settings: AppSettings
  apiKey: string
  reload: () => Promise<void>
  setApiKey: (value: string) => void
  setSettings: (value: AppSettings) => void
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>
}

export function useAppData(onInitializationError: (error: unknown) => void): AppData {
  const [ready, setReady] = useState(false)
  const [characters, setCharacters] = useState<Character[]>([])
  const [personas, setPersonas] = useState<Persona[]>([])
  const [presets, setPresets] = useState<Preset[]>([])
  const [worldBookEntries, setWorldBookEntries] = useState<WorldBookEntry[]>([])
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [settings, setSettings] = useState<AppSettings>({ ...defaultSettings })
  const [apiKey, setApiKey] = useState('')

  const reload = useCallback(async () => {
    const snapshot = await store.snapshot()
    setCharacters(snapshot.characters)
    setPersonas(snapshot.personas)
    setPresets(snapshot.presets)
    setWorldBookEntries(snapshot.worldBookEntries)
    setSessions(snapshot.sessions)
    setMessages(snapshot.messages)
    setSettings(snapshot.settings)
  }, [])

  useEffect(() => {
    let disposed = false
    void store.init().then(async () => {
      await reload()
      const key = await store.getApiKey()
      if (disposed) return
      setApiKey(key)
      setReady(true)
    }).catch(error => {
      if (!disposed) onInitializationError(error)
    })
    return () => { disposed = true }
  }, [onInitializationError, reload])

  return { ready, characters, personas, presets, worldBookEntries, sessions, messages, settings, apiKey, reload, setApiKey, setSettings, setMessages }
}
