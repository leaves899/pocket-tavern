import { useEffect, useRef, useState } from 'react'
import { App as NativeApp } from '@capacitor/app'
import { StatusBar, Style } from '@capacitor/status-bar'
import { Download, FileImage, Library, MessageCircle, Plus, Send, Settings as SettingsIcon, Square, Trash2, Upload, X, Pencil, RefreshCw, ArrowLeft, RotateCcw } from 'lucide-react'
import { parseCharacterFile, exportCard, exportCardPng } from './lib/cards'
import { composePrompt } from './lib/prompt'
import { streamCompletion } from './lib/deepseek'
import { store } from './lib/storage'
import type { AppSettings, Character, ChatMessage, ChatSession, Persona, Preset, WorldBookEntry } from './types'
import { defaultSettings } from './types'
import './index.css'
import './manage.css'

type Tab = 'library' | 'chat' | 'settings'
const uid = () => crypto.randomUUID()
const download = (name: string, content: string) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([content], { type: 'application/json' })); a.download = name; a.click(); URL.revokeObjectURL(a.href) }
const downloadBytes = (name: string, content: Uint8Array) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([new Uint8Array(content).buffer], { type: 'image/png' })); a.download = name; a.click(); URL.revokeObjectURL(a.href) }

export default function App() {
  const [ready, setReady] = useState(false), [tab, setTab] = useState<Tab>('library')
  const [characters, setCharacters] = useState<Character[]>([]), [personas, setPersonas] = useState<Persona[]>([])
  const [presets, setPresets] = useState<Preset[]>([])
  const [worldBookEntries, setWorldBookEntries] = useState<WorldBookEntry[]>([])
  const [sessions, setSessions] = useState<ChatSession[]>([]), [messages, setMessages] = useState<ChatMessage[]>([])
  const [settings, setSettings] = useState<AppSettings>(defaultSettings), [apiKey, setApiKey] = useState('')
  const [active, setActive] = useState<string>(), [draft, setDraft] = useState(''), [busy, setBusy] = useState(false)
  const [error, setError] = useState(''), [success, setSuccess] = useState(''), [canRetry, setCanRetry] = useState(false), [editing, setEditing] = useState<string>(), controller = useRef<AbortController | undefined>(undefined)
  const fileRef = useRef<HTMLInputElement>(null), bottomRef = useRef<HTMLDivElement>(null)
  const session = sessions.find(x => x.id === active), character = characters.find(x => x.id === session?.characterId)
  const chatMessages = messages.filter(x => x.sessionId === active).sort((a, b) => a.createdAt - b.createdAt)

  const reload = async () => { const s = await store.snapshot(); setCharacters(s.characters); setPersonas(s.personas); setPresets(s.presets); setWorldBookEntries(s.worldBookEntries); setSessions(s.sessions); setMessages(s.messages); setSettings(s.settings) }
  useEffect(() => { store.init().then(async () => { await reload(); setApiKey(await store.getApiKey()); setReady(true) }).catch(e => setError(String(e))) }, [])
  useEffect(() => { document.documentElement.dataset.theme = settings.theme; bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); const dark = settings.theme === 'dark' || (settings.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches); StatusBar.setStyle({ style: dark ? Style.Light : Style.Dark }).catch(() => {}) }, [settings.theme, messages])
  useEffect(() => { let removed = false; let remove: (() => Promise<void>) | undefined; NativeApp.addListener('backButton', () => { if (tab === 'chat' && active) { setActive(undefined); setTab('library') } else if (tab !== 'library') setTab('library'); else NativeApp.exitApp() }).then(handle => { if (removed) handle.remove(); else remove = () => handle.remove() }).catch(() => {}); return () => { removed = true; remove?.() } }, [tab, active])

  async function importFile(file?: File) { if (!file) return; setError(''); try { const c = await parseCharacterFile(file); if (file.name.toLowerCase().endsWith('.png')) Object.assign(c, await store.saveAsset(file, c.id)); await store.saveCharacter(c); await reload() } catch (e) { setError((e as Error).message) } finally { if (fileRef.current) fileRef.current.value = '' } }
  async function openChat(c: Character) {
    let s = sessions.find(x => x.characterId === c.id)
    if (!s) { const now = Date.now(); s = { id: uid(), characterId: c.id, title: c.name, createdAt: now, updatedAt: now }; await store.saveSession(s); if (c.data.first_mes) await store.saveMessage({ id: uid(), sessionId: s.id, role: 'assistant', content: c.data.first_mes.replaceAll('{{char}}', c.name).replaceAll('{{user}}', personas[0]?.name || 'User'), createdAt: now, updatedAt: now }); await reload() }
    setActive(s.id); setTab('chat')
  }
  async function generate(mode: 'send' | 'regenerate' | 'retry' = 'send') {
    if (!character || !session || busy) return
    setError(''); setCanRetry(false); let history = chatMessages
    if (mode === 'send') { if (!draft.trim()) return; const m: ChatMessage = { id: uid(), sessionId: session.id, role: 'user', content: draft.trim(), createdAt: Date.now(), updatedAt: Date.now() }; await store.saveMessage(m); history = [...history, m]; setDraft('') }
    else if (mode === 'regenerate') { const last = [...history].reverse().find(x => x.role === 'assistant'); if (last) { await store.deleteMessage(last.id); history = history.filter(x => x.id !== last.id) } }
    const reply: ChatMessage = { id: uid(), sessionId: session.id, role: 'assistant', content: '', createdAt: Date.now(), updatedAt: Date.now() }
    await store.saveMessage(reply); await reload(); controller.current = new AbortController(); setBusy(true)
    try { await streamCompletion(settings, apiKey, composePrompt(character, personas.find(x => x.isDefault), history, settings, worldBookEntries), controller.current.signal, text => { reply.content += text; reply.updatedAt = Date.now(); setMessages(old => old.map(x => x.id === reply.id ? { ...reply } : x)) }); await store.saveMessage(reply) }
    catch (e) { if ((e as Error).name !== 'AbortError') { setError((e as Error).message); setCanRetry(true) } if (!reply.content) await store.deleteMessage(reply.id); else await store.saveMessage(reply) }
    finally { setBusy(false); await reload() }
  }
  async function saveEdited(m: ChatMessage, content: string) { await store.saveMessage({ ...m, content, updatedAt: Date.now() }); setEditing(undefined); await reload() }
  async function rollback(m: ChatMessage) {
    const start = chatMessages.findIndex(x => x.id === m.id)
    if (start < 0 || !confirm('回档将删除这条消息及之后的所有对话，且无法恢复。')) return
    await store.rollbackSession(m.sessionId, chatMessages.slice(start).map(x => x.id))
    await reload()
  }
  async function saveSettings(next = settings) { await store.saveSettings(next); await store.setApiKey(apiKey.trim()); setError(''); setSuccess('设置已保存'); setTimeout(() => setSuccess(''), 1500) }

  if (!ready) return <main className="loading">Pocket Tavern</main>
  return <div className="app">
    <header className="topbar">
      {tab === 'chat' && active ? <button className="icon" aria-label="返回" onClick={() => { setActive(undefined); setTab('library') }}><ArrowLeft /></button> : <span className="brandmark">PT</span>}
      <div><strong>{tab === 'chat' && character ? character.name : tab === 'library' ? '角色库' : tab === 'settings' ? '设置' : '聊天'}</strong><small>{tab === 'chat' && character ? '沉浸式对话' : 'Pocket Tavern'}</small></div>
      {tab === 'library' && <button className="icon" aria-label="导入角色" onClick={() => fileRef.current?.click()}><Upload /></button>}
    </header>
    {error && <div className="notice"><span>{error}</span>{canRetry && <button onClick={() => generate('retry')}><RefreshCw/>重试</button>}<button aria-label="关闭" onClick={() => setError('')}><X size={16}/></button></div>}
    {success && <div className="notice success"><span>{success}</span><button aria-label="关闭" onClick={() => setSuccess('')}><X size={16}/></button></div>}
    <main className="content">
      {tab === 'library' && <section className="library">
        <div className="section-title"><div><h1>你的角色</h1><p>{characters.length ? `${characters.length} 位角色，点击继续对话` : '导入一张角色卡开始'}</p></div><button className="primary" onClick={() => fileRef.current?.click()}><Plus/>导入</button></div>
        <input ref={fileRef} hidden type="file" accept=".json,.png,application/json,image/png" onChange={e => importFile(e.target.files?.[0])}/>
        <div className="character-grid">{characters.map(c => <article className="character-card" key={c.id} onClick={() => openChat(c)}>
          <div className="avatar">{c.avatar ? <img src={c.avatar}/> : c.name.slice(0, 1).toUpperCase()}</div>
          <div className="char-info"><h2>{c.name}</h2><p>{c.data.description || c.data.personality || '等待与你相遇'}</p><div className="tags">{(c.data.tags || []).slice(0, 2).map(t => <span key={t}>{t}</span>)}</div></div>
          <div className="card-actions"><button className="icon small" title="导出 JSON" onClick={e => { e.stopPropagation(); download(`${c.name}.json`, exportCard(c)) }}><Download/></button>{c.assetPath && <button className="icon small" title="导出 PNG" onClick={async e => { e.stopPropagation(); downloadBytes(`${c.name}.png`, exportCardPng(c, await store.readAsset(c.assetPath!))) }}><FileImage/></button>}<button className="icon small danger" title="删除" onClick={async e => { e.stopPropagation(); if (confirm(`删除 ${c.name} 及其聊天记录？`)) { await store.deleteCharacter(c.id); await reload() } }}><Trash2/></button></div>
        </article>)}</div>
        {!characters.length && <div className="empty"><Library/><h2>酒馆还很安静</h2><p>支持 Character Card V2 PNG 和 JSON，未知字段会原样保留。</p><button className="primary" onClick={() => fileRef.current?.click()}><Upload/>选择角色卡</button></div>}
      </section>}
      {tab === 'chat' && !active && <section className="chat-list"><h1>最近聊天</h1>{sessions.map(s => { const c = characters.find(x => x.id === s.characterId); return c && <button key={s.id} onClick={() => { setActive(s.id); setTab('chat') }}><span className="avatar mini">{c.name[0]}</span><span><strong>{s.title}</strong><small>{new Date(s.updatedAt).toLocaleString()}</small></span></button> })}{!sessions.length && <div className="empty"><MessageCircle/><p>从角色库选择角色开始聊天</p></div>}</section>}
      {tab === 'chat' && active && character && <section className="conversation">
        <div className="messages">{chatMessages.map(m => <div className={`message-row ${m.role}`} data-message-id={m.id} key={m.id}>
          <div className="bubble">{editing === m.id ? <textarea autoFocus defaultValue={m.content} onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) saveEdited(m, e.currentTarget.value) }} onBlur={e => saveEdited(m, e.currentTarget.value)}/> : <div className="message-text">{m.content || (busy && m === chatMessages.at(-1) ? <span className="typing">···</span> : '')}</div>}
            {!busy && <div className="message-tools">{m.role === 'user' && <button title="回档到此处前" aria-label="回档到此处前" onClick={() => rollback(m)}><RotateCcw/></button>}<button title="编辑" onClick={() => setEditing(m.id)}><Pencil/></button><button title="删除" onClick={async () => { await store.deleteMessage(m.id); await reload() }}><Trash2/></button>{m.role === 'assistant' && m === [...chatMessages].reverse().find(x => x.role === 'assistant') && <button title="重新生成" onClick={() => generate('regenerate')}><RefreshCw/></button>}</div>}
          </div></div>)}<div ref={bottomRef}/></div>
        <div className="composer"><textarea rows={1} value={draft} placeholder={`给 ${character.name} 发送消息…`} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); generate() } }}/><button className="send" aria-label={busy ? '停止' : '发送'} onClick={() => busy ? controller.current?.abort() : generate()}>{busy ? <Square/> : <Send/>}</button></div>
      </section>}
      {tab === 'settings' && <SettingsView settings={settings} setSettings={setSettings} apiKey={apiKey} setApiKey={setApiKey} personas={personas} presets={presets} characters={characters} worldBookEntries={worldBookEntries} reload={reload} save={() => saveSettings()} onError={setError} onSuccess={message => { setError(''); setSuccess(message); setTimeout(() => setSuccess(''), 1800) }}/>}
    </main>
    {!(tab === 'chat' && active) && <nav className="bottom-nav"><button className={tab === 'library' ? 'active' : ''} onClick={() => setTab('library')}><Library/><span>角色</span></button><button className={tab === 'chat' ? 'active' : ''} onClick={() => setTab('chat')}><MessageCircle/><span>聊天</span></button><button className={tab === 'settings' ? 'active' : ''} onClick={() => setTab('settings')}><SettingsIcon/><span>设置</span></button></nav>}
  </div>
}

function SettingsView({ settings, setSettings, apiKey, setApiKey, personas, presets, characters, worldBookEntries, reload, save, onError, onSuccess }: { settings: AppSettings; setSettings: (x: AppSettings) => void; apiKey: string; setApiKey: (x: string) => void; personas: Persona[]; presets: Preset[]; characters: Character[]; worldBookEntries: WorldBookEntry[]; reload: () => Promise<void>; save: () => void; onError: (message: string) => void; onSuccess: (message: string) => void }) {
  const [personaName, setPersonaName] = useState(''), [personaDescription, setPersonaDescription] = useState(''), [presetName, setPresetName] = useState('')
  const [worldBookName, setWorldBookName] = useState(''), [worldBookKeywords, setWorldBookKeywords] = useState(''), [worldBookContent, setWorldBookContent] = useState(''), [worldBookPriority, setWorldBookPriority] = useState('0'), [worldBookCharacters, setWorldBookCharacters] = useState<string[]>([]), [editingWorldBook, setEditingWorldBook] = useState<string>()
  const worldBookFileRef = useRef<HTMLInputElement>(null)
  const set = <K extends keyof AppSettings>(k: K, v: AppSettings[K]) => setSettings({ ...settings, [k]: v })
  const resetWorldBookForm = () => { setWorldBookName(''); setWorldBookKeywords(''); setWorldBookContent(''); setWorldBookPriority('0'); setWorldBookCharacters([]); setEditingWorldBook(undefined) }
  const saveWorldBook = async () => {
    const name = worldBookName.trim(), content = worldBookContent.trim(), keywords = [...new Set(worldBookKeywords.split(/[\n,，]/).map(x => x.trim()).filter(Boolean))]
    if (!name || !content || !keywords.length) return
    const now = Date.now(), current = worldBookEntries.find(x => x.id === editingWorldBook)
    await store.saveWorldBookEntry({ id: current?.id || uid(), name, content, keywords, priority: Number(worldBookPriority) || 0, enabled: current?.enabled ?? true, characterIds: worldBookCharacters, createdAt: current?.createdAt || now, updatedAt: now })
    resetWorldBookForm(); await reload()
  }
  const editWorldBook = (entry: WorldBookEntry) => { setEditingWorldBook(entry.id); setWorldBookName(entry.name); setWorldBookKeywords(entry.keywords.join(', ')); setWorldBookContent(entry.content); setWorldBookPriority(String(entry.priority)); setWorldBookCharacters(entry.characterIds) }
  const importWorldBook = async (file?: File) => { if (!file) return; onError(''); try { const result = await store.importWorldBook(await file.text()); await reload(); onSuccess(`已导入 ${result.imported} 条世界书${result.remappedIds ? `，重映射 ${result.remappedIds} 个重复 ID` : ''}`) } catch (e) { onError(e instanceof Error ? e.message : String(e)) } finally { if (worldBookFileRef.current) worldBookFileRef.current.value = '' } }
  const exportWorldBook = async () => { onError(''); try { const result = await store.exportWorldBookFile(); if (result.uri) onSuccess('世界书已导出到 Android Documents 目录'); else { download('pocket-tavern-world-book.json', result.content); onSuccess('世界书 JSON 已下载') } } catch (e) { onError(e instanceof Error ? e.message : String(e)) } }
  return <section className="settings"><h1>模型连接</h1><div className="panel"><label>API Key<input type="password" autoComplete="off" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="sk-…"/><small>仅保存在本机 Preferences，不参与导出</small></label><label>Base URL<input type="url" value={settings.baseUrl} onChange={e => set('baseUrl', e.target.value)} /></label><label>模型<input list="deepseek-models" value={settings.model} onChange={e => set('model', e.target.value)} placeholder="模型 ID"/><datalist id="deepseek-models"><option value="deepseek-chat">DeepSeek Chat</option><option value="deepseek-reasoner">DeepSeek Reasoner</option></datalist><small>可填写兼容 OpenAI Chat Completions 的自定义模型 ID</small></label></div>
    <h1>生成参数</h1><div className="panel"><label>系统提示<textarea rows={4} value={settings.systemPrompt} onChange={e => set('systemPrompt', e.target.value)} placeholder="可选的全局指令"/></label><label>温度 <output>{settings.temperature.toFixed(1)}</output><input type="range" min="0" max="2" step="0.1" value={settings.temperature} onChange={e => set('temperature', +e.target.value)}/></label><div className="split"><label>最大输出<input type="number" min="64" max="8192" value={settings.maxTokens} onChange={e => set('maxTokens', +e.target.value)}/></label><label>上下文长度<input type="number" min="1024" max="128000" value={settings.contextTokens} onChange={e => set('contextTokens', +e.target.value)}/></label></div></div>
    <h1>生成预设</h1><div className="panel"><div className="inline-form"><input value={presetName} onChange={e => setPresetName(e.target.value)} placeholder="预设名称"/><button className="primary" onClick={async () => { if (!presetName.trim()) return; await store.savePreset({ id: uid(), name: presetName.trim(), systemPrompt: settings.systemPrompt, temperature: settings.temperature, maxTokens: settings.maxTokens, contextTokens: settings.contextTokens }); setPresetName(''); await reload() }}><Plus/>保存当前</button></div>{presets.map(p => <div className="manage-row" key={p.id}><span><strong>{p.name}</strong><small>{p.temperature.toFixed(1)} · {p.maxTokens} / {p.contextTokens}</small></span><button onClick={() => setSettings({ ...settings, systemPrompt: p.systemPrompt, temperature: p.temperature, maxTokens: p.maxTokens, contextTokens: p.contextTokens })}>应用</button><button className="danger" aria-label="删除预设" onClick={async () => { await store.deletePreset(p.id); await reload() }}><Trash2/></button></div>)}</div>
    <h1>用户人设</h1><div className="panel"><div className="persona-form"><input value={personaName} onChange={e => setPersonaName(e.target.value)} placeholder="名称"/><textarea rows={2} value={personaDescription} onChange={e => setPersonaDescription(e.target.value)} placeholder="角色看到的用户身份与背景"/><button className="primary" onClick={async () => { if (!personaName.trim()) return; await store.savePersona({ id: uid(), name: personaName.trim(), description: personaDescription.trim(), isDefault: !personas.length }); setPersonaName(''); setPersonaDescription(''); await reload() }}><Plus/>新增人设</button></div>{personas.map(p => <div className="manage-row persona-row" key={p.id}><span><strong>{p.name}{p.isDefault && <em>默认</em>}</strong><small>{p.description || '未填写描述'}</small></span>{!p.isDefault && <button onClick={async () => { await store.savePersona({ ...p, isDefault: true }); await reload() }}>设为默认</button>}<button aria-label="编辑人设" onClick={async () => { const name = prompt('人设名称', p.name); if (!name) return; const description = prompt('人设描述', p.description); if (description === null) return; await store.savePersona({ ...p, name, description }); await reload() }}><Pencil/></button><button className="danger" aria-label="删除人设" onClick={async () => { try { await store.deletePersona(p.id); await reload() } catch (e) { alert((e as Error).message) } }}><Trash2/></button></div>)}</div>
    <h1>世界书</h1><div className="panel"><div className="worldbook-transfer"><input ref={worldBookFileRef} hidden type="file" accept=".json,application/json" onChange={e => importWorldBook(e.target.files?.[0])}/><button onClick={() => worldBookFileRef.current?.click()}><Upload/>导入 JSON</button><button onClick={exportWorldBook}><Download/>导出 JSON</button><small>导出文件只包含世界书条目，不包含 API Key；Android 会保存到 Documents 目录。</small></div><div className="worldbook-form"><input value={worldBookName} onChange={e => setWorldBookName(e.target.value)} placeholder="条目名称"/><input value={worldBookKeywords} onChange={e => setWorldBookKeywords(e.target.value)} placeholder="关键词，使用逗号或换行分隔"/><textarea rows={4} value={worldBookContent} onChange={e => setWorldBookContent(e.target.value)} placeholder="命中关键词后注入的世界设定"/><label>优先级<input type="number" value={worldBookPriority} onChange={e => setWorldBookPriority(e.target.value)}/><small>数值越大越优先；每轮最多注入 5 条。</small></label><div className="worldbook-characters"><small>适用角色（不选则全局生效）</small>{characters.map(c => <label key={c.id}><input type="checkbox" checked={worldBookCharacters.includes(c.id)} onChange={() => setWorldBookCharacters(ids => ids.includes(c.id) ? ids.filter(id => id !== c.id) : [...ids, c.id])}/>{c.name}</label>)}</div><div className="inline-form"><button className="primary" onClick={saveWorldBook}><Plus/>{editingWorldBook ? '保存修改' : '新增条目'}</button>{editingWorldBook && <button onClick={resetWorldBookForm}>取消</button>}</div></div>{worldBookEntries.map(entry => <div className="manage-row worldbook-row" key={entry.id}><span><strong>{entry.name}{!entry.enabled && <em>已停用</em>}</strong><small>{entry.keywords.join(' · ')}{entry.characterIds.length ? ` · ${entry.characterIds.map(id => characters.find(c => c.id === id)?.name || '已删除角色').join('、')}` : ' · 全局'}</small></span><button onClick={async () => { await store.saveWorldBookEntry({ ...entry, enabled: !entry.enabled, updatedAt: Date.now() }); await reload() }}>{entry.enabled ? '停用' : '启用'}</button><button aria-label="编辑世界书条目" onClick={() => editWorldBook(entry)}><Pencil/></button><button className="danger" aria-label="删除世界书条目" onClick={async () => { if (confirm(`删除世界书条目“${entry.name}”？`)) { await store.deleteWorldBookEntry(entry.id); if (editingWorldBook === entry.id) resetWorldBookForm(); await reload() } }}><Trash2/></button></div>)}</div>
    <h1>外观</h1><div className="panel segmented"><button className={settings.theme === 'system' ? 'active' : ''} onClick={() => set('theme', 'system')}>跟随系统</button><button className={settings.theme === 'light' ? 'active' : ''} onClick={() => set('theme', 'light')}>浅色</button><button className={settings.theme === 'dark' ? 'active' : ''} onClick={() => set('theme', 'dark')}>深色</button></div><button className="primary save" onClick={save}>保存设置</button><p className="scope">Pocket Tavern MVP · 数据仅保存在当前设备</p></section>
}
