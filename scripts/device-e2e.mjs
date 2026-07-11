import { readFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'

const port = process.env.CDP_PORT || '9222'
const pages = await fetch(`http://127.0.0.1:${port}/json`).then(r => r.json())
if (!pages[0]?.webSocketDebuggerUrl) throw new Error('No debuggable Pocket Tavern WebView found')
const ws = new WebSocket(pages[0].webSocketDebuggerUrl)
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject })
let seq = 0
const waiting = new Map()
ws.onmessage = event => { const message = JSON.parse(event.data); if (message.id && waiting.has(message.id)) { const { resolve, reject } = waiting.get(message.id); waiting.delete(message.id); if (message.error) reject(new Error(message.error.message)); else resolve(message.result) } }
const command = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; waiting.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })) })
const evaluate = async expression => { const result = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.text); return result.result.value }
const waitFor = async (expression, timeout = 8000) => { const end = Date.now() + timeout; while (Date.now() < end) { if (await evaluate(expression)) return; await new Promise(r => setTimeout(r, 150)) } throw new Error(`Timed out: ${expression}`) }

await command('Runtime.enable')
const stage = process.argv[2] || 'import'
if (stage === 'import') {
  const base64 = (await readFile(new URL('../samples/luna.card.json', import.meta.url))).toString('base64')
  await evaluate(`(() => { const bytes=Uint8Array.from(atob('${base64}'),c=>c.charCodeAt(0)); const file=new File([bytes],'luna.card.json',{type:'application/json'}); const input=document.querySelector('input[type=file]'); const dt=new DataTransfer(); dt.items.add(file); input.files=dt.files; input.dispatchEvent(new Event('change',{bubbles:true})); return true })()`)
  await waitFor(`document.body.innerText.includes('Luna')`)
  await evaluate(`document.querySelector('.character-card').click()`)
  await waitFor(`document.body.innerText.includes('Rough weather')`)
  await evaluate(`document.querySelector('.icon[aria-label="返回"]').click()`)
  await waitFor(`document.querySelectorAll('.bottom-nav button').length===3`)
  await evaluate(`document.querySelectorAll('.bottom-nav button')[2].click()`)
  await waitFor(`document.querySelector('input[list="deepseek-models"]')?.value==='deepseek-chat'`)
  const state = await evaluate(`({model:document.querySelector('input[list="deepseek-models"]')?.value,hasReasoner:[...document.querySelectorAll('#deepseek-models option')].some(x=>x.value==='deepseek-reasoner')})`)
  if (state.model !== 'deepseek-chat' || !state.hasReasoner) throw new Error(`DeepSeek model options invalid: ${JSON.stringify(state)}`)
  console.log(JSON.stringify({ stage, imported: true, sessionCreated: true, model: state.model, hasReasoner: state.hasReasoner }))
} else if (stage === 'restore') {
  await waitFor(`document.body.innerText.includes('Luna')`)
  await evaluate(`document.querySelectorAll('.bottom-nav button')[1].click()`)
  await waitFor(`document.body.innerText.includes('Luna')`)
  await evaluate(`[...document.querySelectorAll('.chat-list button')].find(x=>x.innerText.includes('Luna')).click()`)
  await waitFor(`document.body.innerText.includes('Rough weather')`)
  await evaluate(`document.querySelector('.icon[aria-label="返回"]').click()`)
  await waitFor(`document.querySelectorAll('.bottom-nav button').length===3`)
  await evaluate(`document.querySelectorAll('.bottom-nav button')[2].click()`)
  await waitFor(`document.querySelector('input[list="deepseek-models"]')?.value==='deepseek-chat'`)
  const state = await evaluate(`({model:document.querySelector('input[list="deepseek-models"]')?.value,hasReasoner:[...document.querySelectorAll('#deepseek-models option')].some(x=>x.value==='deepseek-reasoner')})`)
  console.log(JSON.stringify({ stage, characterRestored: true, sessionRestored: true, firstMessageRestored: true, ...state }))
} else if (stage === 'settings') {
  await waitFor(`!!document.querySelector('input[placeholder="预设名称"]')`)
  const setValue = (selector, value, type = 'input') => `(() => { const e=document.querySelector(${JSON.stringify(selector)}); const p=e instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(p,'value').set.call(e,${JSON.stringify(value)}); e.dispatchEvent(new Event('${type}',{bubbles:true})) })()`
  await evaluate(setValue('input[placeholder="预设名称"]', 'Device Preset'))
  await evaluate(`[...document.querySelectorAll('button')].find(x=>x.innerText.includes('保存当前')).click()`)
  await waitFor(`document.body.innerText.includes('Device Preset')`)
  await evaluate(setValue('input[placeholder="名称"]', 'Device Persona'))
  await evaluate(setValue('textarea[placeholder*="用户身份"]', 'A traveler verified on Android.'))
  await evaluate(`[...document.querySelectorAll('button')].find(x=>x.innerText.includes('新增人设')).click()`)
  await waitFor(`document.body.innerText.includes('Device Persona')`)
  await evaluate(`[...document.querySelectorAll('.manage-row')].find(x=>x.innerText.includes('Device Persona')).querySelector('button').click()`)
  await waitFor(`[...document.querySelectorAll('.manage-row')].find(x=>x.innerText.includes('Device Persona'))?.innerText.includes('默认')`)
  await evaluate(`document.querySelectorAll('.bottom-nav button')[0].click()`)
  await waitFor(`!!document.querySelector('.character-card')`)
  await evaluate(`document.querySelector('.character-card').click()`)
  await waitFor(`!!document.querySelector('.composer textarea')`)
  await evaluate(setValue('.composer textarea', 'Hello from device'))
  await evaluate(`document.querySelector('.send').click()`)
  await waitFor(`document.querySelector('.notice')?.innerText.includes('API Key')`)
  const errorState = await evaluate(`({message:document.querySelector('.notice').innerText,hasRetry:[...document.querySelectorAll('.notice button')].some(x=>x.innerText.includes('重试'))})`)
  if (!errorState.hasRetry) throw new Error('Retry action missing after API error')
  console.log(JSON.stringify({ stage, presetSaved: true, personaSavedAndSelected: true, apiKeyErrorHandled: true, retryVisible: true }))
} else if (stage === 'key-save') {
  await evaluate(`document.querySelector('.icon[aria-label="返回"]')?.click()`)
  await waitFor(`document.querySelectorAll('.bottom-nav button').length===3`)
  await evaluate(`document.querySelectorAll('.bottom-nav button')[2].click()`)
  await waitFor(`!!document.querySelector('input[type="password"]')`)
  await evaluate(`(() => { const e=document.querySelector('input[type="password"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'pt-e2e-not-a-real-key'); e.dispatchEvent(new Event('input',{bubbles:true})) })()`)
  await evaluate(`[...document.querySelectorAll('button')].find(x=>x.innerText.includes('保存设置')).click()`)
  await waitFor(`document.body.innerText.includes('设置已保存')`)
  console.log(JSON.stringify({ stage, placeholderKeySaved: true }))
} else if (stage === 'key-restore') {
  await evaluate(`document.querySelectorAll('.bottom-nav button')[2].click()`)
  await waitFor(`!!document.querySelector('input[type="password"]')`)
  const restored = await evaluate(`document.querySelector('input[type="password"]').value==='pt-e2e-not-a-real-key'`)
  if (!restored) throw new Error('Preferences key did not survive restart')
  await evaluate(`(() => { const e=document.querySelector('input[type="password"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,''); e.dispatchEvent(new Event('input',{bubbles:true})); [...document.querySelectorAll('button')].find(x=>x.innerText.includes('保存设置')).click() })()`)
  await waitFor(`document.body.innerText.includes('设置已保存')`)
  console.log(JSON.stringify({ stage, placeholderKeyRestored: true, placeholderKeyCleared: true }))
} else if (stage === 'png') {
  await evaluate(`document.querySelectorAll('.bottom-nav button')[0].click()`)
  await waitFor(`!!document.querySelector('input[type=file]')`)
  const base64 = (await readFile(new URL('../samples/luna.card.png', import.meta.url))).toString('base64')
  await evaluate(`(() => { const bytes=Uint8Array.from(atob('${base64}'),c=>c.charCodeAt(0)); const file=new File([bytes],'luna.card.png',{type:'image/png'}); const input=document.querySelector('input[type=file]'); const dt=new DataTransfer(); dt.items.add(file); input.files=dt.files; input.dispatchEvent(new Event('change',{bubbles:true})) })()`)
  await waitFor(`document.body.innerText.includes('Luna PNG')`)
  const avatarLoaded = await evaluate(`(() => { const card=[...document.querySelectorAll('.character-card')].find(x=>x.innerText.includes('Luna PNG')); const img=card?.querySelector('img'); return !!img && img.complete && img.naturalWidth>0 })()`)
  if (!avatarLoaded) throw new Error('Private PNG avatar did not render')
  console.log(JSON.stringify({ stage, pngImported: true, privateAvatarRendered: true }))
} else if (stage === 'png-restore') {
  await evaluate(`document.querySelectorAll('.bottom-nav button')[0].click()`)
  await waitFor(`document.body.innerText.includes('Luna PNG')`)
  await waitFor(`(() => { const card=[...document.querySelectorAll('.character-card')].find(x=>x.innerText.includes('Luna PNG')); const img=card?.querySelector('img'); return !!img && img.complete && img.naturalWidth>0 })()`)
  console.log(JSON.stringify({ stage, pngCharacterRestored: true, privateAvatarRestored: true }))
} else if (stage === 'stream') {
  const baseUrl = process.env.MOCK_BASE_URL
  if (!baseUrl?.startsWith('https://')) throw new Error('MOCK_BASE_URL must be HTTPS')
  await evaluate(`document.querySelector('.icon[aria-label="返回"]')?.click()`)
  await waitFor(`document.querySelectorAll('.bottom-nav button').length===3`)
  await evaluate(`document.querySelectorAll('.bottom-nav button')[2].click()`)
  await waitFor(`!!document.querySelector('input[type="password"]')`)
  const assign = (selector, value) => `(() => { const e=document.querySelector(${JSON.stringify(selector)}); const p=e instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(p,'value').set.call(e,${JSON.stringify(value)}); e.dispatchEvent(new Event('input',{bubbles:true})) })()`
  await evaluate(assign('input[type="password"]', 'stream-e2e-placeholder'))
  await evaluate(assign('input[type="url"]', baseUrl))
  await evaluate(`[...document.querySelectorAll('button')].find(x=>x.innerText.includes('保存设置')).click()`)
  await waitFor(`document.body.innerText.includes('设置已保存')`)
  await evaluate(`document.querySelectorAll('.bottom-nav button')[0].click()`)
  await waitFor(`!!document.querySelector('.character-card')`)
  await evaluate(`document.querySelector('.character-card').click()`)
  await waitFor(`!!document.querySelector('.composer textarea')`)
  const send = async text => { await evaluate(assign('.composer textarea', text)); await evaluate(`document.querySelector('.send').click()`) }
  const nonce = Date.now(), fullMarker = `Full-${nonce}`, stopMarker = `Stop-${nonce}`
  await send(fullMarker)
  await waitFor(`document.body.innerText.includes('Reply ${fullMarker} part-one') && !document.body.innerText.includes('Reply ${fullMarker} part-one part-two part-three.')`, 10000)
  await waitFor(`document.body.innerText.includes('Reply ${fullMarker} part-one part-two part-three.')`, 10000)
  await waitFor(`document.querySelector('.send')?.getAttribute('aria-label')==='发送'`, 5000)
  await send(stopMarker)
  await waitFor(`document.querySelector('.send')?.getAttribute('aria-label')==='停止' && document.body.innerText.includes('Reply ${stopMarker} part-one')`, 10000)
  await evaluate(`document.querySelector('.send').click()`)
  await waitFor(`document.querySelector('.send')?.getAttribute('aria-label')==='发送'`, 5000)
  await new Promise(r => setTimeout(r, 1800))
  const stoppedBeforeSecondChunk = await evaluate(`!document.body.innerText.includes('Reply ${stopMarker} part-one part-two')`)
  if (!stoppedBeforeSecondChunk) throw new Error('SSE continued after stop')
  await evaluate(`document.querySelector('.icon[aria-label="返回"]').click()`); await waitFor(`document.querySelectorAll('.bottom-nav button').length===3`); await evaluate(`document.querySelectorAll('.bottom-nav button')[2].click()`)
  await waitFor(`!!document.querySelector('input[type="url"]')`)
  await evaluate(assign('input[type="password"]', '')); await evaluate(assign('input[type="url"]', 'https://api.deepseek.com'))
  await evaluate(`[...document.querySelectorAll('button')].find(x=>x.innerText.includes('保存设置')).click()`)
  console.log(JSON.stringify({ stage, httpsCustomBaseUrl: true, ssePartialObserved: true, sseCompleted: true, stopAborted: true, credentialsCleared: true }))
} else if (stage === 'inspect') {
  console.log(JSON.stringify(await evaluate(`({text:document.body.innerText,send:document.querySelector('.send')?.getAttribute('aria-label'),baseUrl:document.querySelector('input[type="url"]')?.value})`)))
} else if (stage === 'mutations') {
  const baseUrl = process.env.MOCK_BASE_URL
  if (!baseUrl?.startsWith('https://')) throw new Error('MOCK_BASE_URL must be HTTPS')
  const assign = (selector, value) => `(() => { const e=document.querySelector(${JSON.stringify(selector)}); const p=e instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(p,'value').set.call(e,${JSON.stringify(value)}); e.dispatchEvent(new Event('input',{bubbles:true})) })()`
  const openSettings = async () => { await evaluate(`document.querySelector('.icon[aria-label="返回"]')?.click()`); await waitFor(`document.querySelectorAll('.bottom-nav button').length===3`); await evaluate(`document.querySelectorAll('.bottom-nav button')[2].click()`); await waitFor(`!!document.querySelector('input[type="url"]')`) }
  const configure = async url => { await openSettings(); await evaluate(assign('input[type="password"]', url ? 'mutation-placeholder-key' : '')); await evaluate(assign('input[type="url"]', url || 'https://api.deepseek.com')); await evaluate(`[...document.querySelectorAll('button')].find(x=>x.innerText.includes('保存设置')).click()`); await waitFor(`document.body.innerText.includes('设置已保存')`) }
  const openConversation = async () => { await evaluate(`document.querySelectorAll('.bottom-nav button')[1].click()`); await waitFor(`!![...document.querySelectorAll('.chat-list button')].find(x=>x.innerText.includes('Luna PNG'))`); await evaluate(`[...document.querySelectorAll('.chat-list button')].find(x=>x.innerText.includes('Luna PNG')).click()`); await waitFor(`!!document.querySelector('.composer textarea')`) }
  const send = async text => { await evaluate(assign('.composer textarea', text)); await evaluate(`document.querySelector('.send').click()`) }
  const nonce = Date.now(), original = `Edit-${nonce}`, edited = `Edited-${nonce}`, retryMarker = `Retry-${nonce}`
  await configure(baseUrl); await openConversation(); await send(original)
  await waitFor(`document.body.innerText.includes('Reply ${original} part-one part-two part-three.')`, 12000); await waitFor(`document.querySelector('.send')?.getAttribute('aria-label')==='发送'`)
  await evaluate(`(() => { const row=[...document.querySelectorAll('.message-row.user')].find(x=>x.innerText.includes('${original}')); row.querySelector('button[title="编辑"]').click() })()`)
  await waitFor(`!![...document.querySelectorAll('.message-row.user textarea')].find(x=>x.value.includes('${original}'))`)
  await evaluate(`(() => { const e=[...document.querySelectorAll('.message-row.user textarea')].find(x=>x.value.includes('${original}')); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,'${edited}'); e.dispatchEvent(new Event('input',{bubbles:true})); e.blur() })()`)
  await waitFor(`[...document.querySelectorAll('.message-row.user')].some(x=>x.innerText.includes('${edited}')) && ![...document.querySelectorAll('.message-row.user')].some(x=>x.innerText.includes('${original}'))`)
  const oldAssistantId = await evaluate(`[...document.querySelectorAll('.message-row.assistant')].at(-1).dataset.messageId`)
  await evaluate(`[...document.querySelectorAll('.message-row.assistant')].at(-1).querySelector('button[title="重新生成"]').click()`)
  await waitFor(`document.querySelector('.send')?.getAttribute('aria-label')==='停止'`); await waitFor(`document.body.innerText.includes('Reply ${edited} part-one part-two part-three.')`, 12000); await waitFor(`document.querySelector('.send')?.getAttribute('aria-label')==='发送'`)
  const newAssistantId = await evaluate(`[...document.querySelectorAll('.message-row.assistant')].at(-1).dataset.messageId`)
  if (oldAssistantId === newAssistantId) throw new Error('Regenerate did not replace assistant message')
  await configure('https://127.0.0.1:1'); await openConversation(); await send(retryMarker)
  await waitFor(`document.querySelector('.notice')?.innerText.includes('无法连接')`, 10000)
  await configure(baseUrl); await openConversation(); await waitFor(`!![...document.querySelectorAll('.notice button')].find(x=>x.innerText.includes('重试'))`); await evaluate(`[...document.querySelectorAll('.notice button')].find(x=>x.innerText.includes('重试')).click()`)
  await waitFor(`document.body.innerText.includes('Reply ${retryMarker} part-one part-two part-three.')`, 12000); await waitFor(`document.querySelector('.send')?.getAttribute('aria-label')==='发送'`)
  await evaluate(`(() => { const row=[...document.querySelectorAll('.message-row.user')].find(x=>x.innerText.includes('${edited}')); row.querySelector('button[title="删除"]').click() })()`)
  await waitFor(`![...document.querySelectorAll('.message-row.user')].some(x=>x.innerText.includes('${edited}'))`)
  await configure('')
  console.log(JSON.stringify({ stage, editPersisted: true, deletePersisted: true, regenerateReplacedMessageId: true, retryRecoveredFromNetworkError: true, credentialsCleared: true, editedMarker: edited, retryMarker }))
} else if (stage === 'system') {
  const adb = process.env.ADB_PATH
  if (!adb) throw new Error('ADB_PATH is required')
  await evaluate(`document.querySelector('.icon[aria-label="返回"]')?.click()`); await waitFor(`document.querySelectorAll('.bottom-nav button').length===3`)
  await evaluate(`document.querySelectorAll('.bottom-nav button')[1].click()`); await waitFor(`!!document.querySelector('.chat-list button')`); await evaluate(`document.querySelector('.chat-list button').click()`); await waitFor(`!!document.querySelector('.composer textarea')`)
  const before = await evaluate(`visualViewport.height`), viewport = await evaluate(`(() => { const r=document.querySelector('.composer textarea').getBoundingClientRect(); return {w:innerWidth,x:r.left+r.width/2,y:r.top+r.height/2} })()`)
  const size = execFileSync(adb, ['shell', 'wm', 'size'], { encoding: 'utf8' }).match(/(\d+)x(\d+)/).slice(1).map(Number), physicalWidth = Math.max(...size), scale = physicalWidth / viewport.w
  execFileSync(adb, ['shell', 'input', 'tap', String(Math.round(viewport.x * scale)), String(Math.round(viewport.y * scale + 105))])
  await waitFor(`document.activeElement===document.querySelector('.composer textarea')`); await new Promise(r => setTimeout(r, 1200)); const after = await evaluate(`visualViewport.height`)
  const inputMethod = execFileSync(adb, ['shell', 'dumpsys', 'input_method'], { encoding: 'utf8' }), inputShown = /mInputShown=true/.test(inputMethod), composerVisible = await evaluate(`document.querySelector('.composer').getBoundingClientRect().bottom<=visualViewport.height+1`), resized = after < before * .9
  if (!inputShown || (!resized && !composerVisible)) throw new Error(`Keyboard incompatible: shown=${inputShown}, resized=${resized}, composerVisible=${composerVisible}, ${before} -> ${after}`)
  await evaluate(`document.activeElement.blur()`); await new Promise(r => setTimeout(r, 500))
  execFileSync(adb, ['shell', 'input', 'keyevent', '4']); await waitFor(`document.body.innerText.includes('你的角色')`, 5000)
  await evaluate(`document.querySelectorAll('.bottom-nav button')[2].click()`); await waitFor(`document.body.innerText.includes('跟随系统')`)
  await evaluate(`[...document.querySelectorAll('.segmented button')].find(x=>x.innerText==='深色').click()`); await waitFor(`document.documentElement.dataset.theme==='dark'`); const darkBg = await evaluate(`getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()`)
  await evaluate(`[...document.querySelectorAll('.segmented button')].find(x=>x.innerText==='浅色').click()`); await waitFor(`document.documentElement.dataset.theme==='light'`); const lightBg = await evaluate(`getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()`)
  if (darkBg === lightBg) throw new Error('Light and dark theme colors are identical')
  await evaluate(`[...document.querySelectorAll('.segmented button')].find(x=>x.innerText==='跟随系统').click()`); await waitFor(`document.documentElement.dataset.theme==='system'`); await evaluate(`[...document.querySelectorAll('button')].find(x=>x.innerText.includes('保存设置')).click()`); await waitFor(`document.body.innerText.includes('设置已保存')`)
  console.log(JSON.stringify({ stage, keyboardShown: inputShown, keyboardMode: resized ? 'resize' : 'floating', composerVisible, androidBackReturnedToLibrary: true, darkTheme: darkBg, lightTheme: lightBg, systemThemeRestored: true }))
} else if (stage === 'custom-import') {
  const cardPath = process.argv[3]
  if (!cardPath) throw new Error('A Character Card JSON path is required')
  const text = await readFile(cardPath, 'utf8')
  const card = JSON.parse(text), name = String(card.data?.name || card.name || '')
  if (!name) throw new Error('Character Card is missing a name')
  const base64 = Buffer.from(text).toString('base64')
  await evaluate(`document.querySelectorAll('.bottom-nav button')[0]?.click()`)
  await waitFor(`!!document.querySelector('input[type=file]')`)
  await evaluate(`(() => { const input=document.querySelector('input[type=file]'); const bytes=Uint8Array.from(atob('${base64}'),c=>c.charCodeAt(0)); const file=new File([bytes],'import.card.json',{type:'application/json'}); const dt=new DataTransfer(); dt.items.add(file); input.files=dt.files; input.dispatchEvent(new Event('change',{bubbles:true})) })()`)
  await waitFor(`[...document.querySelectorAll('.character-card h2')].some(x=>x.textContent===${JSON.stringify(name)})`)
  await evaluate(`[...document.querySelectorAll('.character-card')].find(x=>x.querySelector('h2')?.textContent===${JSON.stringify(name)}).click()`)
  await waitFor(`!!document.querySelector('.composer textarea')`)
  console.log(JSON.stringify({ stage, imported: name, conversationOpened: true }))
} else throw new Error(`Unknown stage: ${stage}`)
ws.close()
