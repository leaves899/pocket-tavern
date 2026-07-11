import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from '@capacitor-community/sqlite'
import type { AppSettings, Character, ChatMessage, ChatSession, Persona, Preset } from '../types'
import { defaultSettings } from '../types'

export interface Snapshot { characters: Character[]; personas: Persona[]; presets: Preset[]; sessions: ChatSession[]; messages: ChatMessage[]; settings: AppSettings }
export const emptySnapshot = (): Snapshot => ({ characters: [], personas: [{ id: 'default', name: 'User', description: '', isDefault: true }], presets: [], sessions: [], messages: [], settings: { ...defaultSettings } })
let db: SQLiteDBConnection | undefined
let web = emptySnapshot()
const native = Capacitor.isNativePlatform()
const KEY = 'pocket-tavern-data-v2'
const OLD_KEY = 'pocket-tavern-data-v1'
const payloads = async <T>(table: string, order = ''): Promise<T[]> => ((await db!.query(`SELECT payload FROM ${table} ${order}`)).values || []).map(row => JSON.parse(row.payload))

async function snapshot(): Promise<Snapshot> {
  if (!native) return structuredClone(web)
  const [characters, personas, presets, sessions, messages, settingRows] = await Promise.all([
    payloads<Character>('characters', 'ORDER BY updated_at DESC'), payloads<Persona>('personas'), payloads<Preset>('presets'),
    payloads<ChatSession>('sessions', 'ORDER BY updated_at DESC'), payloads<ChatMessage>('messages', 'ORDER BY created_at ASC'), payloads<AppSettings>('settings'),
  ])
  return { characters, personas: personas.length ? personas : emptySnapshot().personas, presets, sessions, messages, settings: settingRows[0] || { ...defaultSettings } }
}

async function webPersist(s: Snapshot) { web = structuredClone(s); localStorage.setItem(KEY, JSON.stringify(web)) }
async function upsert(table: string, id: string, value: unknown, extraColumns = '', extraValues: unknown[] = []) {
  const columns = extraColumns ? `,${extraColumns}` : '', marks = extraValues.map(() => '?').join(',')
  const valueMarks = marks ? `,${marks}` : ''
  await db!.run(`INSERT OR REPLACE INTO ${table}(id,payload${columns}) VALUES(?,?${valueMarks})`, [id, JSON.stringify(value), ...extraValues])
}

async function migrateLegacySnapshot() {
  const exists = (await db!.query("SELECT name FROM sqlite_master WHERE type='table' AND name='app_state'")).values?.length
  if (!exists) return
  const row = (await db!.query('SELECT payload FROM app_state WHERE id=1')).values?.[0]
  if (!row) return
  const current = await payloads<Character>('characters')
  if (current.length) return
  const legacy = JSON.parse(row.payload) as Partial<Snapshot>
  for (const x of legacy.characters || []) await upsert('characters', x.id, x, 'updated_at', [x.updatedAt])
  for (const x of legacy.personas || []) await upsert('personas', x.id, x)
  for (const x of legacy.sessions || []) await upsert('sessions', x.id, x, 'character_id,updated_at', [x.characterId, x.updatedAt])
  for (const x of legacy.messages || []) await upsert('messages', x.id, x, 'session_id,created_at', [x.sessionId, x.createdAt])
  if (legacy.settings) await upsert('settings', 'active', legacy.settings)
}

export const store = {
  async init() {
    if (!native) {
      try { web = JSON.parse(localStorage.getItem(KEY) || localStorage.getItem(OLD_KEY) || '') } catch { web = emptySnapshot() }
      web.presets ||= []; web.personas ||= emptySnapshot().personas; web.settings ||= { ...defaultSettings }; await webPersist(web); return
    }
    const sqlite = new SQLiteConnection(CapacitorSQLite)
    db = await sqlite.createConnection('pocket_tavern', false, 'no-encryption', 2, false)
    await db.open()
    await db.execute(`
      PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS characters(id TEXT PRIMARY KEY NOT NULL,payload TEXT NOT NULL,updated_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS personas(id TEXT PRIMARY KEY NOT NULL,payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS presets(id TEXT PRIMARY KEY NOT NULL,payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY NOT NULL,payload TEXT NOT NULL,character_id TEXT NOT NULL,updated_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY NOT NULL,payload TEXT NOT NULL,session_id TEXT NOT NULL,created_at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS idx_sessions_character ON sessions(character_id);
      CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id,created_at);
      CREATE TABLE IF NOT EXISTS settings(id TEXT PRIMARY KEY NOT NULL,payload TEXT NOT NULL);
    `)
    await migrateLegacySnapshot()
    const s = await snapshot()
    if (!(await payloads<Persona>('personas')).length) await upsert('personas', s.personas[0].id, s.personas[0])
    if (!(await payloads<AppSettings>('settings')).length) await upsert('settings', 'active', defaultSettings)
  },
  snapshot,
  async saveCharacter(x: Character) { if (native) await upsert('characters', x.id, x, 'updated_at', [x.updatedAt]); else { const s = await snapshot(); const i = s.characters.findIndex(v => v.id === x.id); if (i < 0) s.characters.unshift(x); else s.characters[i] = x; await webPersist(s) } },
  async savePersona(x: Persona) { if (native) { if (x.isDefault) { const all = await payloads<Persona>('personas'); for (const p of all) if (p.id !== x.id && p.isDefault) await upsert('personas', p.id, { ...p, isDefault: false }) } await upsert('personas', x.id, x) } else { const s = await snapshot(); if (x.isDefault) s.personas = s.personas.map(p => ({ ...p, isDefault: p.id === x.id })); const i = s.personas.findIndex(v => v.id === x.id); if (i < 0) s.personas.push(x); else s.personas[i] = x; await webPersist(s) } },
  async deletePersona(id: string) { const s = await snapshot(); if (s.personas.length <= 1) throw new Error('至少保留一个用户人设'); if (native) await db!.run('DELETE FROM personas WHERE id=?', [id]); else { s.personas = s.personas.filter(x => x.id !== id); if (!s.personas.some(x => x.isDefault)) s.personas[0].isDefault = true; await webPersist(s) } const next = await snapshot(); if (!next.personas.some(x => x.isDefault)) await this.savePersona({ ...next.personas[0], isDefault: true }) },
  async savePreset(x: Preset) { if (native) await upsert('presets', x.id, x); else { const s = await snapshot(); const i = s.presets.findIndex(v => v.id === x.id); if (i < 0) s.presets.push(x); else s.presets[i] = x; await webPersist(s) } },
  async deletePreset(id: string) { if (native) await db!.run('DELETE FROM presets WHERE id=?', [id]); else { const s = await snapshot(); s.presets = s.presets.filter(x => x.id !== id); await webPersist(s) } },
  async saveAsset(file: File, id: string) { const bytes = new Uint8Array(await file.arrayBuffer()); let binary = ''; for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); const base64 = btoa(binary); if (!native) return { avatar: `data:${file.type};base64,${base64}`, assetPath: '' }; try { await Filesystem.mkdir({ path: 'characters', directory: Directory.Data, recursive: true }) } catch { /* exists */ } const assetPath = `characters/${id}.png`; await Filesystem.writeFile({ path: assetPath, directory: Directory.Data, data: base64 }); const uri = await Filesystem.getUri({ path: assetPath, directory: Directory.Data }); return { avatar: Capacitor.convertFileSrc(uri.uri), assetPath } },
  async readAsset(assetPath: string) { const result = await Filesystem.readFile({ path: assetPath, directory: Directory.Data }); const raw = String(result.data); const bin = atob(raw.includes(',') ? raw.split(',')[1] : raw); return Uint8Array.from(bin, c => c.charCodeAt(0)) },
  async deleteCharacter(id: string) { const s = await snapshot(); const c = s.characters.find(x => x.id === id); if (native && c?.assetPath) try { await Filesystem.deleteFile({ path: c.assetPath, directory: Directory.Data }) } catch { /* removed */ } if (native) { const ids = (await db!.query('SELECT id FROM sessions WHERE character_id=?', [id])).values?.map(x => x.id) || []; for (const sid of ids) await db!.run('DELETE FROM messages WHERE session_id=?', [sid]); await db!.run('DELETE FROM sessions WHERE character_id=?', [id]); await db!.run('DELETE FROM characters WHERE id=?', [id]) } else { s.characters = s.characters.filter(x => x.id !== id); const ids = new Set(s.sessions.filter(x => x.characterId === id).map(x => x.id)); s.sessions = s.sessions.filter(x => x.characterId !== id); s.messages = s.messages.filter(x => !ids.has(x.sessionId)); await webPersist(s) } },
  async saveSession(x: ChatSession) { if (native) await upsert('sessions', x.id, x, 'character_id,updated_at', [x.characterId, x.updatedAt]); else { const s = await snapshot(); const i = s.sessions.findIndex(v => v.id === x.id); if (i < 0) s.sessions.unshift(x); else s.sessions[i] = x; await webPersist(s) } },
  async saveMessage(x: ChatMessage) { if (native) { await upsert('messages', x.id, x, 'session_id,created_at', [x.sessionId, x.createdAt]); const s = (await snapshot()).sessions.find(v => v.id === x.sessionId); if (s) await this.saveSession({ ...s, updatedAt: Date.now() }) } else { const s = await snapshot(); const i = s.messages.findIndex(v => v.id === x.id); if (i < 0) s.messages.push(x); else s.messages[i] = x; const chat = s.sessions.find(v => v.id === x.sessionId); if (chat) chat.updatedAt = Date.now(); await webPersist(s) } },
  async deleteMessage(id: string) { if (native) await db!.run('DELETE FROM messages WHERE id=?', [id]); else { const s = await snapshot(); s.messages = s.messages.filter(x => x.id !== id); await webPersist(s) } },
  async rollbackSession(sessionId: string, messageIds: string[]) {
    if (!messageIds.length) return
    if (native) {
      const marks = messageIds.map(() => '?').join(',')
      await db!.execute('BEGIN TRANSACTION')
      try {
        await db!.run(`DELETE FROM messages WHERE session_id=? AND id IN (${marks})`, [sessionId, ...messageIds])
        const session = (await snapshot()).sessions.find(x => x.id === sessionId), updatedAt = Date.now()
        if (session) await upsert('sessions', session.id, { ...session, updatedAt }, 'character_id,updated_at', [session.characterId, updatedAt])
        await db!.execute('COMMIT')
      } catch (error) {
        await db!.execute('ROLLBACK')
        throw error
      }
    } else {
      const s = await snapshot(), ids = new Set(messageIds)
      s.messages = s.messages.filter(x => x.sessionId !== sessionId || !ids.has(x.id))
      const session = s.sessions.find(x => x.id === sessionId)
      if (session) session.updatedAt = Date.now()
      await webPersist(s)
    }
  },
  async saveSettings(x: AppSettings) { if (native) await upsert('settings', 'active', x); else { const s = await snapshot(); s.settings = x; await webPersist(s) } },
  async getApiKey() { return (await Preferences.get({ key: 'deepseek_api_key' })).value || '' },
  async setApiKey(value: string) { await Preferences.set({ key: 'deepseek_api_key', value }) },
}
