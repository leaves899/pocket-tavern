import { describe, expect, it } from 'vitest'
import { exportCard, exportCardPng, MAX_CARD_FILE_BYTES, parseCardJson, parseCharacterFile } from './cards'
describe('character cards', () => {
  it('preserves unknown V2 fields through export', () => { const card = { spec: 'chara_card_v2', spec_version: '2.0', custom_root: 7, data: { name: 'Alice', description: 'D', personality: '', scenario: '', first_mes: 'Hi', mes_example: '', custom_data: { x: 1 } } }; const parsed = parseCardJson(card); parsed.data.description = 'Changed'; const out = JSON.parse(exportCard(parsed)); expect(out.custom_root).toBe(7); expect(out.data.custom_data).toEqual({ x: 1 }); expect(out.data.description).toBe('Changed') })
  it('accepts V1-style JSON', () => { expect(parseCardJson({ name: 'Bob', first_mes: 'Yo' }).name).toBe('Bob') })
  it('exports an importable PNG while preserving unknown fields', async () => { const card = parseCardJson({ spec: 'chara_card_v2', spec_version: '2.0', unknown_root: 'keep', data: { name: 'PNG Luna', description: '', personality: '', scenario: '', first_mes: '', mes_example: '', unknown_data: 42 } }); const signature = Uint8Array.from([137,80,78,71,13,10,26,10]); const iend = Uint8Array.from([0,0,0,0,73,69,78,68,174,66,96,130]); const source = new Uint8Array(signature.length + iend.length); source.set(signature); source.set(iend, signature.length); const png = exportCardPng(card, source); const parsed = await parseCharacterFile(new File([png as BlobPart], 'card.png', { type: 'image/png' })); expect(parsed.name).toBe('PNG Luna'); expect(parsed.rawCard.unknown_root).toBe('keep'); expect((parsed.data as Record<string, unknown>).unknown_data).toBe(42) })
  it('rejects malformed shapes and dangerous JSON keys', () => {
    expect(() => parseCardJson({ name: 42 })).toThrow('name')
    expect(() => parseCardJson(JSON.parse('{"__proto__":{"polluted":true},"name":"Safe"}'))).toThrow('__proto__')
  })
  it('rejects truncated PNG and oversized files before parsing', async () => {
    await expect(parseCharacterFile(new File([Uint8Array.from([137, 80, 78, 71])], 'card.png'))).rejects.toThrow('PNG')
    const oversized = new File([new Uint8Array(MAX_CARD_FILE_BYTES + 1)], 'card.json')
    await expect(parseCharacterFile(oversized)).rejects.toThrow('10 MiB')
  })
})
