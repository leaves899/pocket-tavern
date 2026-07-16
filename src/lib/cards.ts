import type { Character, CharacterData } from '../types'

export const MAX_CARD_FILE_BYTES = 10 * 1024 * 1024
export const MAX_CARD_METADATA_BYTES = 2 * 1024 * 1024
export const MAX_CHARACTER_NAME_LENGTH = 200
const MAX_NESTING_DEPTH = 32
const PNG_SIGNATURE = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])
const dangerousKeys = new Set(['__proto__', 'constructor', 'prototype'])

const readU32 = (bytes: Uint8Array, offset: number) => {
  if (offset < 0 || offset + 4 > bytes.length) throw new Error('PNG chunk 长度字段不完整。')
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset)
}

const latin1 = (bytes: Uint8Array) => new TextDecoder('latin1').decode(bytes)
const utf8 = (bytes: Uint8Array) => new TextDecoder('utf-8', { fatal: true }).decode(bytes)
const isRecord = (value: unknown): value is Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function validateJsonValue(value: unknown, depth = 0, seen = new WeakSet<object>()): void {
  if (depth > MAX_NESTING_DEPTH) throw new Error('角色卡嵌套层级过深。')
  if (!value || typeof value !== 'object') return
  if (seen.has(value)) throw new Error('角色卡包含循环引用。')
  seen.add(value)
  if (Array.isArray(value)) {
    value.forEach(item => validateJsonValue(item, depth + 1, seen))
  } else {
    if (!isRecord(value)) throw new Error('角色卡必须使用普通 JSON 对象。')
    for (const [key, child] of Object.entries(value)) {
      if (dangerousKeys.has(key)) throw new Error(`角色卡包含不安全字段：${key}`)
      validateJsonValue(child, depth + 1, seen)
    }
  }
  seen.delete(value)
}

function ensureMetadataSize(raw: unknown): void {
  try {
    const size = new TextEncoder().encode(JSON.stringify(raw)).byteLength
    if (size > MAX_CARD_METADATA_BYTES) throw new Error('角色卡元数据超过 2 MiB 限制。')
  } catch (error) {
    if (error instanceof Error && error.message.includes('超过')) throw error
    throw new Error('角色卡 JSON 无法安全读取。')
  }
}

const readRequiredString = (record: Record<string, unknown>, field: string, fallback = ''): string => {
  const value = record[field]
  if (value === undefined) return fallback
  if (typeof value !== 'string') throw new Error(`角色卡字段“${field}”必须是字符串。`)
  return value
}

const readOptionalStringList = (record: Record<string, unknown>, field: string): string[] | undefined => {
  const value = record[field]
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) throw new Error(`角色卡字段“${field}”必须是字符串数组。`)
  return value.map(item => item.trim()).filter(Boolean)
}

export function parseCardJson(raw: unknown): Character {
  if (!isRecord(raw)) throw new Error('角色卡 JSON 无效。')
  validateJsonValue(raw)
  ensureMetadataSize(raw)
  const card = structuredClone(raw) as Record<string, unknown>
  const sourceValue = card.spec === 'chara_card_v2' ? card.data : card
  if (!isRecord(sourceValue)) throw new Error('角色卡 V2 的 data 字段无效。')
  const name = readRequiredString(sourceValue, 'name').trim()
  if (!name) throw new Error('角色卡缺少名称。')
  if (name.length > MAX_CHARACTER_NAME_LENGTH) throw new Error(`角色卡名称不能超过 ${MAX_CHARACTER_NAME_LENGTH} 个字符。`)

  const data: CharacterData = {
    ...sourceValue,
    name,
    description: readRequiredString(sourceValue, 'description'),
    personality: readRequiredString(sourceValue, 'personality'),
    scenario: readRequiredString(sourceValue, 'scenario'),
    first_mes: readRequiredString(sourceValue, 'first_mes'),
    mes_example: readRequiredString(sourceValue, 'mes_example'),
  }
  for (const field of ['system_prompt', 'post_history_instructions', 'creator_notes']) {
    if (sourceValue[field] !== undefined) data[field] = readRequiredString(sourceValue, field)
  }
  for (const field of ['alternate_greetings', 'tags']) {
    const values = readOptionalStringList(sourceValue, field)
    if (values) data[field] = values
  }

  const now = Date.now()
  return { id: crypto.randomUUID(), name, data, rawCard: card, createdAt: now, updatedAt: now }
}

function assertPngSignature(bytes: Uint8Array): void {
  if (bytes.length < PNG_SIGNATURE.length || !PNG_SIGNATURE.every((value, index) => bytes[index] === value)) throw new Error('仅支持有效的 Character Card V2 PNG/JSON。')
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let value = n
  for (let k = 0; k < 8; k++) value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  return value >>> 0
})

const crc32 = (bytes: Uint8Array) => {
  let value = 0xffffffff
  for (const byte of bytes) value = crcTable[(value ^ byte) & 255] ^ (value >>> 8)
  return (value ^ 0xffffffff) >>> 0
}

const u32 = (value: number) => new Uint8Array([(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255])

function readPngChunks(bytes: Uint8Array, onChunk?: (type: string, data: Uint8Array) => void): number {
  assertPngSignature(bytes)
  let offset = PNG_SIGNATURE.length
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) throw new Error('PNG 文件在 chunk 末尾被截断。')
    const length = readU32(bytes, offset)
    if (length > bytes.length - offset - 12) throw new Error('PNG chunk 长度超出文件边界。')
    const typeBytes = bytes.slice(offset + 4, offset + 8)
    const type = latin1(typeBytes)
    const data = bytes.slice(offset + 8, offset + 8 + length)
    const expectedCrc = readU32(bytes, offset + 8 + length)
    const crcInput = new Uint8Array(typeBytes.length + data.length)
    crcInput.set(typeBytes)
    crcInput.set(data, typeBytes.length)
    if (crc32(crcInput) !== expectedCrc) throw new Error(`PNG chunk ${type} 校验失败。`)
    onChunk?.(type, data)
    offset += length + 12
    if (type === 'IEND') return offset - length - 12
  }
  throw new Error('PNG 文件缺少 IEND chunk。')
}

async function inflateLimited(data: Uint8Array): Promise<Uint8Array> {
  const reader = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate')).getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_CARD_METADATA_BYTES) {
      await reader.cancel()
      throw new Error('PNG 中的角色卡元数据超过 2 MiB 限制。')
    }
    chunks.push(value)
  }
  const result = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length }
  return result
}

function decodeBase64(value: string): string {
  const normalized = value.trim()
  if (!normalized || normalized.length % 4 === 1 || !/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) throw new Error('PNG 中的角色卡 Base64 数据无效。')
  try {
    const binary = atob(normalized)
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0))
    return utf8(bytes)
  } catch (error) {
    throw new Error(`PNG 中的角色卡数据无法解码：${error instanceof Error ? error.message : '未知错误'}`)
  }
}

async function readCharacterMetadata(bytes: Uint8Array): Promise<string> {
  let encoded = ''
  readPngChunks(bytes, (type, data) => {
    if (type === 'tEXt') {
      const separator = data.indexOf(0)
      if (separator < 1) throw new Error('PNG tEXt chunk 格式无效。')
      if (latin1(data.slice(0, separator)) === 'chara') encoded = latin1(data.slice(separator + 1))
    }
    if (type === 'zTXt') {
      const separator = data.indexOf(0)
      if (separator < 1 || separator + 2 > data.length) throw new Error('PNG zTXt chunk 格式无效。')
      if (latin1(data.slice(0, separator)) === 'chara') {
        if (data[separator + 1] !== 0) throw new Error('PNG zTXt 压缩方式不受支持。')
        // The asynchronous decompression is completed below by the second pass.
      }
    }
  })

  const chunks: Array<{ type: string; data: Uint8Array }> = []
  readPngChunks(bytes, (type, data) => chunks.push({ type, data }))
  for (const chunk of chunks) {
    const { type, data } = chunk
    if (type === 'zTXt') {
      const separator = data.indexOf(0)
      if (separator >= 1 && latin1(data.slice(0, separator)) === 'chara') encoded = latin1(await inflateLimited(data.slice(separator + 2)))
    }
    if (type === 'iTXt') {
      const keywordEnd = data.indexOf(0)
      if (keywordEnd < 1 || keywordEnd + 2 >= data.length) throw new Error('PNG iTXt chunk 格式无效。')
      const keyword = latin1(data.slice(0, keywordEnd))
      if (keyword !== 'chara') continue
      const compressionFlag = data[keywordEnd + 1]
      if (compressionFlag !== 0 && compressionFlag !== 1) throw new Error('PNG iTXt 压缩标记无效。')
      let cursor = keywordEnd + 3
      const languageEnd = data.indexOf(0, cursor)
      if (languageEnd < 0) throw new Error('PNG iTXt 语言字段不完整。')
      cursor = languageEnd + 1
      const translatedEnd = data.indexOf(0, cursor)
      if (translatedEnd < 0) throw new Error('PNG iTXt 翻译字段不完整。')
      cursor = translatedEnd + 1
      encoded = compressionFlag === 1 ? latin1(await inflateLimited(data.slice(cursor))) : utf8(data.slice(cursor))
    }
  }
  if (!encoded) throw new Error('PNG 中未找到 chara 元数据。')
  return decodeBase64(encoded)
}

export async function parseCharacterFile(file: File): Promise<Character> {
  if (file.size > MAX_CARD_FILE_BYTES) throw new Error('角色卡文件不能超过 10 MiB。')
  if (file.name.toLowerCase().endsWith('.json')) {
    try { return parseCardJson(JSON.parse(await file.text())) } catch (error) {
      if (error instanceof Error && !error.message.includes('JSON')) throw error
      throw new Error('角色卡 JSON 无效。')
    }
  }
  const bytes = new Uint8Array(await file.arrayBuffer())
  return parseCardJson(JSON.parse(await readCharacterMetadata(bytes)))
}

export function exportCard(character: Character): string {
  const raw = structuredClone(character.rawCard)
  if (raw.spec === 'chara_card_v2') raw.data = { ...((raw.data || {}) as object), ...character.data, name: character.name }
  else Object.assign(raw, character.data, { name: character.name })
  return JSON.stringify(raw, null, 2)
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  return btoa(binary)
}

export function exportCardPng(character: Character, source: Uint8Array): Uint8Array {
  if (source.length > MAX_CARD_FILE_BYTES) throw new Error('角色卡文件不能超过 10 MiB。')
  const iendOffset = readPngChunks(source)
  const encoded = encodeBase64(new TextEncoder().encode(exportCard(character)))
  const type = new TextEncoder().encode('tEXt')
  const payload = new Uint8Array(6 + encoded.length)
  payload.set(new TextEncoder().encode('chara\0'), 0)
  payload.set(new TextEncoder().encode(encoded), 6)
  const crcInput = new Uint8Array(type.length + payload.length)
  crcInput.set(type)
  crcInput.set(payload, type.length)
  const chunk = new Uint8Array(12 + payload.length)
  chunk.set(u32(payload.length))
  chunk.set(type, 4)
  chunk.set(payload, 8)
  chunk.set(u32(crc32(crcInput)), 8 + payload.length)
  const output = new Uint8Array(source.length + chunk.length)
  output.set(source.slice(0, iendOffset))
  output.set(chunk, iendOffset)
  output.set(source.slice(iendOffset), iendOffset + chunk.length)
  return output
}
