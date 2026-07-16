import { readFile, writeFile } from 'node:fs/promises'
import { exportCardPng, parseCardJson } from '../src/lib/cards'

const json = JSON.parse(await readFile(new URL('../samples/luna.card.json', import.meta.url), 'utf8'))
json.data.name = 'Luna PNG'
json.data.extensions.png_round_trip_marker = 'preserve-me'
const transparentPng = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=', 'base64'))
await writeFile(new URL('../samples/luna.card.png', import.meta.url), exportCardPng(parseCardJson(json), transparentPng))
