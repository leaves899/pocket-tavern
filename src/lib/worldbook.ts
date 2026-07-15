import type { WorldBookEntry } from '../types'

export const WORLD_BOOK_EXPORT_FORMAT = 'pocket-tavern.world-book'
export const WORLD_BOOK_EXPORT_VERSION = 1

export interface WorldBookExportEntry {
  id: string
  name: string
  keywords: string[]
  content: string
  priority: number
  enabled: boolean
  characterIds: string[]
  createdAt: number
  updatedAt: number
}

export interface WorldBookExportFile {
  format: typeof WORLD_BOOK_EXPORT_FORMAT
  version: typeof WORLD_BOOK_EXPORT_VERSION
  exportedAt: number
  entries: WorldBookExportEntry[]
}

export interface WorldBookImportResult {
  entries: WorldBookEntry[]
  remappedIds: number
}

export interface WorldBookImportOptions {
  existingIds?: Iterable<string>
  now?: number
  idFactory?: () => string
}

type JsonRecord = Record<string, unknown>

const isRecord = (value: unknown): value is JsonRecord => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const parseInput = (raw: unknown): unknown => {
  if (typeof raw !== 'string') return raw
  try { return JSON.parse(raw) } catch { throw new Error('世界书文件不是有效 JSON') }
}

const fail = (field: string, message: string): never => { throw new Error(`世界书字段“${field}”${message}`) }

const readString = (record: JsonRecord, field: string, fallback: string): string => {
  const value = record[field]
  if (value === undefined) return fallback
  if (typeof value !== 'string') fail(field, '必须是字符串')
  return value as string
}

const readStringList = (record: JsonRecord, field: string): string[] => {
  const value = record[field]
  if (value === undefined) return []
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) fail(field, '必须是字符串数组')
  return [...new Set((value as string[]).map(item => item.trim()).filter(Boolean))]
}

const readNumber = (record: JsonRecord, field: string, fallback: number): number => {
  const value = record[field]
  if (value === undefined) return fallback
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(field, '必须是有限数字')
  return value as number
}

const readTimestamp = (record: JsonRecord, field: string, fallback: number): number => {
  const value = readNumber(record, field, fallback)
  if (value < 0) fail(field, '不能是负数')
  return Math.trunc(value)
}

const readBoolean = (record: JsonRecord, field: string, fallback: boolean): boolean => {
  const value = record[field]
  if (value === undefined) return fallback
  if (typeof value !== 'boolean') fail(field, '必须是布尔值')
  return value as boolean
}

const nextUniqueId = (used: Set<string>, idFactory: () => string): string => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const id = idFactory().trim()
    if (id && !used.has(id)) return id
  }
  throw new Error('无法为世界书条目生成唯一 ID')
}

const normalizeEntry = (raw: unknown, index: number, usedIds: Set<string>, options: Required<Pick<WorldBookImportOptions, 'now' | 'idFactory'>>): { entry: WorldBookEntry; remapped: boolean } => {
  if (!isRecord(raw)) throw new Error(`世界书条目 ${index + 1} 的结构无效`)
  const requestedId = raw.id === undefined ? '' : readString(raw, 'id', '').trim()
  const remapped = Boolean(requestedId && usedIds.has(requestedId))
  const id = requestedId && !usedIds.has(requestedId) ? requestedId : nextUniqueId(usedIds, options.idFactory)
  usedIds.add(id)
  const createdAt = readTimestamp(raw, 'createdAt', options.now)
  const updatedAt = readTimestamp(raw, 'updatedAt', createdAt)
  const name = readString(raw, 'name', '未命名条目').trim() || '未命名条目'
  return {
    remapped,
    entry: {
      id,
      name,
      keywords: readStringList(raw, 'keywords'),
      content: readString(raw, 'content', ''),
      priority: readNumber(raw, 'priority', 0),
      enabled: readBoolean(raw, 'enabled', true),
      characterIds: readStringList(raw, 'characterIds'),
      createdAt,
      updatedAt,
    },
  }
}

export function parseWorldBookExport(raw: unknown, options: WorldBookImportOptions = {}): WorldBookImportResult {
  const value = parseInput(raw)
  if (!isRecord(value)) throw new Error('世界书文件结构无效')
  if (value.format !== WORLD_BOOK_EXPORT_FORMAT) throw new Error('不是 Pocket Tavern 世界书文件')
  if (value.version !== WORLD_BOOK_EXPORT_VERSION) throw new Error(`不支持的世界书文件版本：${String(value.version)}`)
  if (!Array.isArray(value.entries)) throw new Error('世界书文件缺少 entries 数组')

  const now = options.now ?? Date.now()
  const idFactory = options.idFactory ?? (() => crypto.randomUUID())
  const usedIds = new Set(options.existingIds ?? [])
  let remappedIds = 0
  const entries = value.entries.map((entry, index) => {
    const normalized = normalizeEntry(entry, index, usedIds, { now, idFactory })
    if (normalized.remapped) remappedIds += 1
    return normalized.entry
  })
  return { entries, remappedIds }
}

export function stringifyWorldBookExport(entries: WorldBookEntry[], exportedAt = Date.now()): string {
  const file: WorldBookExportFile = {
    format: WORLD_BOOK_EXPORT_FORMAT,
    version: WORLD_BOOK_EXPORT_VERSION,
    exportedAt,
    entries: entries.map(({ id, name, keywords, content, priority, enabled, characterIds, createdAt, updatedAt }) => ({
      id, name, keywords: [...keywords], content, priority, enabled, characterIds: [...characterIds], createdAt, updatedAt,
    })),
  }
  return `${JSON.stringify(file, null, 2)}\n`
}
