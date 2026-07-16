import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { exportCard, exportCardPng, MAX_CARD_FILE_BYTES, MAX_CARD_METADATA_BYTES, parseCardJson, parseCharacterFile } from './cards'

const signature = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])
const encoder = new TextEncoder()
const concat = (...parts: Uint8Array[]) => {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0))
  let offset = 0
  for (const part of parts) { result.set(part, offset); offset += part.length }
  return result
}
const u32 = (value: number) => Uint8Array.from([(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255])
const crc32 = (bytes: Uint8Array) => {
  let value = 0xffffffff
  for (const byte of bytes) {
    let current = (value ^ byte) & 255
    for (let bit = 0; bit < 8; bit++) current = current & 1 ? 0xedb88320 ^ (current >>> 1) : current >>> 1
    value = current ^ (value >>> 8)
  }
  return (value ^ 0xffffffff) >>> 0
}
const pngChunk = (type: string, data: Uint8Array) => {
  const typeBytes = encoder.encode(type)
  const crcInput = concat(typeBytes, data)
  return concat(u32(data.length), typeBytes, data, u32(crc32(crcInput)))
}
const textPng = (value: string) => concat(signature, pngChunk('tEXt', concat(encoder.encode('chara\0'), encoder.encode(value))), pngChunk('IEND', new Uint8Array()))
const invalidUtf8Png = () => concat(signature, pngChunk('iTXt', concat(encoder.encode('chara\0'), Uint8Array.from([0, 0, 0, 0, 255]))), pngChunk('IEND', new Uint8Array()))
const base64 = (value: string) => btoa(String.fromCharCode(...encoder.encode(value)))

describe('character cards', () => {
  it('preserves unknown V2 fields through export', () => { const card = { spec: 'chara_card_v2', spec_version: '2.0', custom_root: 7, data: { name: 'Alice', description: 'D', personality: '', scenario: '', first_mes: 'Hi', mes_example: '', custom_data: { x: 1 } } }; const parsed = parseCardJson(card); parsed.data.description = 'Changed'; const out = JSON.parse(exportCard(parsed)); expect(out.custom_root).toBe(7); expect(out.data.custom_data).toEqual({ x: 1 }); expect(out.data.description).toBe('Changed') })
  it('accepts V1-style JSON', () => { expect(parseCardJson({ name: 'Bob', first_mes: 'Yo' }).name).toBe('Bob') })
  it('exports an importable PNG while preserving unknown fields', async () => { const card = parseCardJson({ spec: 'chara_card_v2', spec_version: '2.0', unknown_root: 'keep', data: { name: 'PNG Luna', description: '', personality: '', scenario: '', first_mes: '', mes_example: '', unknown_data: 42 } }); const signature = Uint8Array.from([137,80,78,71,13,10,26,10]); const iend = Uint8Array.from([0,0,0,0,73,69,78,68,174,66,96,130]); const source = new Uint8Array(signature.length + iend.length); source.set(signature); source.set(iend, signature.length); const png = exportCardPng(card, source); const parsed = await parseCharacterFile(new File([png as BlobPart], 'card.png', { type: 'image/png' })); expect(parsed.name).toBe('PNG Luna'); expect(parsed.rawCard.unknown_root).toBe('keep'); expect((parsed.data as Record<string, unknown>).unknown_data).toBe(42) })
  it('rejects malformed shapes and dangerous JSON keys', () => {
    expect(() => parseCardJson({ name: 42 })).toThrow('name')
    expect(() => parseCardJson(JSON.parse('{"__proto__":{"polluted":true},"name":"Safe"}'))).toThrow('__proto__')
    expect(() => parseCardJson({ spec: 'chara_card_v2', spec_version: '2.0', data: { name: 'Safe', tags: 'not-an-array' } })).toThrow('tags')
    expect(() => parseCardJson({ spec: 'unknown', name: 'Safe' })).toThrow('spec')
  })
  it('rejects truncated PNG and oversized files before parsing', async () => {
    await expect(parseCharacterFile(new File([Uint8Array.from([137, 80, 78, 71])], 'card.png'))).rejects.toThrow('PNG')
    const oversized = new File([new Uint8Array(MAX_CARD_FILE_BYTES + 1)], 'card.json')
    await expect(parseCharacterFile(oversized)).rejects.toThrow('10 MiB')
  })
  it('turns invalid PNG Base64 and JSON into readable parse errors', async () => {
    await expect(parseCharacterFile(new File([textPng('not-base64!')], 'card.png'))).rejects.toThrow('Base64')
    await expect(parseCharacterFile(new File([textPng(base64('not json'))], 'card.png'))).rejects.toThrow('JSON')
    await expect(parseCharacterFile(new File([invalidUtf8Png()], 'card.png'))).rejects.toThrow('UTF-8')
    await expect(parseCharacterFile(new File(['{not-json}'], 'card.json'))).rejects.toThrow('JSON')
  })
  it('rejects invalid PNG CRCs and oversized embedded metadata', async () => {
    const broken = textPng(base64('{"name":"Broken"}'))
    broken[broken.length - 1] ^= 1
    await expect(parseCharacterFile(new File([broken], 'card.png'))).rejects.toThrow('chunk')
    const huge = { name: 'Huge', description: 'x'.repeat(MAX_CARD_METADATA_BYTES), personality: '', scenario: '', first_mes: '', mes_example: '' }
    expect(() => parseCardJson(huge)).toThrow('2 MiB')
  })
  it('keeps the bundled valid PNG card importable', async () => {
    const bytes = await readFile(new URL('../../samples/luna.card.png', import.meta.url))
    const parsed = await parseCharacterFile(new File([new Uint8Array(bytes)], 'luna.card.png', { type: 'image/png' }))
    expect(parsed.name).toBe('Luna PNG')
  })
})
