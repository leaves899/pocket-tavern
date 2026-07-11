import type { Character, CharacterData } from '../types'

const readU32 = (b: Uint8Array, o: number) => new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(o)
const latin1 = (b: Uint8Array) => new TextDecoder('latin1').decode(b)
const decode64 = (s: string) => { const bin = atob(s); return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0))) }
async function inflate(data: Uint8Array) { const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate')); return new Uint8Array(await new Response(stream).arrayBuffer()) }

export function parseCardJson(raw: unknown): Character {
  if (!raw || typeof raw !== 'object') throw new Error('角色卡 JSON 无效')
  const card = structuredClone(raw) as Record<string, unknown>
  const source = (card.spec === 'chara_card_v2' && card.data && typeof card.data === 'object' ? card.data : card) as CharacterData
  if (!source.name || typeof source.name !== 'string') throw new Error('角色卡缺少名称')
  const data: CharacterData = { ...source, name: source.name, description: source.description || '', personality: source.personality || '', scenario: source.scenario || '', first_mes: source.first_mes || '', mes_example: source.mes_example || '' }
  return { id: crypto.randomUUID(), name: data.name, data, rawCard: card, createdAt: Date.now(), updatedAt: Date.now() }
}

export async function parseCharacterFile(file: File): Promise<Character> {
  if (file.name.toLowerCase().endsWith('.json')) return parseCardJson(JSON.parse(await file.text()))
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (latin1(bytes.slice(1, 4)) !== 'PNG') throw new Error('仅支持 Character Card V2 PNG/JSON')
  let o = 8; let encoded = ''
  while (o + 12 <= bytes.length) {
    const len = readU32(bytes, o), type = latin1(bytes.slice(o + 4, o + 8)), data = bytes.slice(o + 8, o + 8 + len); o += len + 12
    if (type === 'tEXt') { const z = data.indexOf(0); if (latin1(data.slice(0, z)) === 'chara') encoded = latin1(data.slice(z + 1)) }
    if (type === 'iTXt') { const z = data.indexOf(0); if (latin1(data.slice(0, z)) === 'chara') { let p = z + 3; p = data.indexOf(0, p) + 1; p = data.indexOf(0, p) + 1; encoded = new TextDecoder().decode(data.slice(p)) } }
    if (type === 'zTXt') { const z = data.indexOf(0); if (latin1(data.slice(0, z)) === 'chara') encoded = latin1(await inflate(data.slice(z + 2))) }
    if (type === 'IEND') break
  }
  if (!encoded) throw new Error('PNG 中未找到 chara 元数据')
  return parseCardJson(JSON.parse(decode64(encoded)))
}

export function exportCard(character: Character) {
  const raw = structuredClone(character.rawCard)
  if (raw.spec === 'chara_card_v2') raw.data = { ...((raw.data || {}) as object), ...character.data, name: character.name }
  else Object.assign(raw, character.data, { name: character.name })
  return JSON.stringify(raw, null, 2)
}

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
const crc32 = (data: Uint8Array) => { let c = 0xffffffff; for (const b of data) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
const u32 = (n: number) => new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255])
export function exportCardPng(character: Character, source: Uint8Array): Uint8Array {
  const json = exportCard(character), encoded = btoa(String.fromCharCode(...new TextEncoder().encode(json)))
  const type = new TextEncoder().encode('tEXt'), payload = new Uint8Array(6 + encoded.length)
  payload.set(new TextEncoder().encode('chara\0'), 0); payload.set(new TextEncoder().encode(encoded), 6)
  const crcInput = new Uint8Array(type.length + payload.length); crcInput.set(type); crcInput.set(payload, type.length)
  const chunk = new Uint8Array(12 + payload.length); chunk.set(u32(payload.length)); chunk.set(type, 4); chunk.set(payload, 8); chunk.set(u32(crc32(crcInput)), 8 + payload.length)
  let iend = 8
  while (iend + 12 <= source.length) { const len = readU32(source, iend); if (latin1(source.slice(iend + 4, iend + 8)) === 'IEND') break; iend += len + 12 }
  const out = new Uint8Array(source.length + chunk.length); out.set(source.slice(0, iend)); out.set(chunk, iend); out.set(source.slice(iend), iend + chunk.length); return out
}
