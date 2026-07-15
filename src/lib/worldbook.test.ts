import { describe, expect, it } from 'vitest'
import type { WorldBookEntry } from '../types'
import { parseWorldBookExport, stringifyWorldBookExport, WORLD_BOOK_EXPORT_FORMAT, WORLD_BOOK_EXPORT_VERSION } from './worldbook'

const entry: WorldBookEntry = {
  id: 'moon', name: '月港', keywords: ['moon', '月港'], content: '潮汐由月亮牵引。', priority: 4, enabled: false,
  characterIds: ['luna'], createdAt: 100, updatedAt: 120,
}

describe('world book transfer format', () => {
  it('round-trips entry semantics and ignores unknown fields', () => {
    const raw = JSON.parse(stringifyWorldBookExport([entry], 200)) as Record<string, unknown> & { entries: Array<Record<string, unknown>> }
    raw.extra = { ignored: true }
    raw.entries[0].futureField = 'ignored'
    const result = parseWorldBookExport(raw)
    expect(result.entries).toEqual([entry])
    expect(result.remappedIds).toBe(0)
  })

  it('fills defaults for empty or omitted fields', () => {
    const result = parseWorldBookExport({
      format: WORLD_BOOK_EXPORT_FORMAT,
      version: WORLD_BOOK_EXPORT_VERSION,
      entries: [{ id: '', name: ' ', keywords: [' moon ', '', 'moon'], content: '' }],
    }, { now: 123, idFactory: () => 'generated' })
    expect(result.entries[0]).toEqual({
      id: 'generated', name: '未命名条目', keywords: ['moon'], content: '', priority: 0, enabled: true,
      characterIds: [], createdAt: 123, updatedAt: 123,
    })
  })

  it('rejects an illegal priority without coercing it', () => {
    const raw = { format: WORLD_BOOK_EXPORT_FORMAT, version: WORLD_BOOK_EXPORT_VERSION, entries: [{ priority: 'urgent' }] }
    expect(() => parseWorldBookExport(raw)).toThrow('priority')
  })

  it('remaps duplicate IDs from existing data and within one file', () => {
    const ids = ['generated-1', 'generated-2']
    const result = parseWorldBookExport({
      format: WORLD_BOOK_EXPORT_FORMAT,
      version: WORLD_BOOK_EXPORT_VERSION,
      entries: [{ id: 'same', content: 'one' }, { id: 'same', content: 'two' }, { id: 'unique', content: 'three' }],
    }, { existingIds: ['same'], idFactory: () => ids.shift() || 'fallback', now: 100 })
    expect(result.remappedIds).toBe(2)
    expect(result.entries.map(x => x.id)).toEqual(['generated-1', 'generated-2', 'unique'])
    expect(result.entries.map(x => x.content)).toEqual(['one', 'two', 'three'])
  })
})
