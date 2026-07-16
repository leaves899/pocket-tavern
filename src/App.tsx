import { useCallback, useEffect, useRef, useState } from 'react'
import { App as NativeApp } from '@capacitor/app'
import { StatusBar, Style } from '@capacitor/status-bar'
import { ArrowLeft, Download, FileImage, Library, MessageCircle, Plus, Settings as SettingsIcon, Trash2, Upload } from 'lucide-react'
import { ErrorNotice } from './components/ErrorNotice'
import { SettingsView } from './components/SettingsView'
import { Composer } from './components/chat/Composer'
import { MessageList } from './components/chat/MessageList'
import { useAppData } from './hooks/useAppData'
import { useChat } from './hooks/useChat'
import { toAppError, type AppError } from './lib/errors'
import { parseCharacterFile, exportCard, exportCardPng } from './lib/cards'
import { store } from './lib/storage'
import type { Character } from './types'
import './index.css'
import './manage.css'

type Tab = 'library' | 'chat' | 'settings'

const download = (name: string, content: string) => {
  const anchor = document.createElement('a')
  anchor.href = URL.createObjectURL(new Blob([content], { type: 'application/json' }))
  anchor.download = name
  anchor.click()
  URL.revokeObjectURL(anchor.href)
}

const downloadBytes = (name: string, content: Uint8Array) => {
  const anchor = document.createElement('a')
  anchor.href = URL.createObjectURL(new Blob([new Uint8Array(content).buffer], { type: 'image/png' }))
  anchor.download = name
  anchor.click()
  URL.revokeObjectURL(anchor.href)
}

export default function App() {
  const [tab, setTab] = useState<Tab>('library')
  const [error, setError] = useState<AppError>()
  const [success, setSuccess] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const reportError = useCallback((cause: unknown, fallback = '操作失败，请稍后重试。') => {
    const next = toAppError(cause, fallback)
    if (next.code === 'cancelled') return
    setSuccess('')
    setError(next)
  }, [])
  const reportSuccess = useCallback((message: string) => {
    setError(undefined)
    setSuccess(message)
    window.setTimeout(() => setSuccess(''), 1800)
  }, [])
  const runAction = useCallback(async (action: () => Promise<void>, fallback?: string) => {
    try {
      await action()
    } catch (cause) {
      reportError(cause, fallback)
    }
  }, [reportError])

  const data = useAppData(cause => reportError(cause, '应用数据初始化失败，请重新加载。'))
  const chat = useChat({ ...data, reportError })
  const { active: activeChat, setActive: setActiveChat } = chat

  useEffect(() => {
    document.documentElement.dataset.theme = data.settings.theme
    const dark = data.settings.theme === 'dark' || (data.settings.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
    void StatusBar.setStyle({ style: dark ? Style.Light : Style.Dark }).catch(() => {})
  }, [data.settings.theme])

  useEffect(() => {
    let removed = false
    let remove: (() => Promise<void>) | undefined
    void NativeApp.addListener('backButton', () => {
      if (tab === 'chat' && activeChat) {
        setActiveChat(undefined)
        setTab('library')
      } else if (tab !== 'library') setTab('library')
      else NativeApp.exitApp()
    }).then(handle => {
      if (removed) void handle.remove()
      else remove = () => handle.remove()
    }).catch(() => {})
    return () => {
      removed = true
      void remove?.()
    }
  }, [activeChat, setActiveChat, tab])

  const saveSettings = useCallback(async () => {
    await store.saveSettings(data.settings)
    await store.setApiKey(data.apiKey.trim())
    reportSuccess('设置已保存')
  }, [data.apiKey, data.settings, reportSuccess])

  const importFile = async (file?: File) => {
    if (!file) return
    try {
      const character = await parseCharacterFile(file)
      if (file.name.toLowerCase().endsWith('.png')) Object.assign(character, await store.saveAsset(file, character.id))
      await store.saveCharacter(character)
      await data.reload()
      reportSuccess(`已导入角色 ${character.name}`)
    } catch (cause) {
      reportError(cause, '角色卡导入失败。')
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const deleteCharacter = (character: Character) => void runAction(async () => {
    if (!confirm(`删除 ${character.name} 及其聊天记录？`)) return
    await store.deleteCharacter(character.id)
    await data.reload()
  }, '角色删除失败。')

  if (!data.ready) return <main className="loading">Pocket Tavern</main>

  return <div className="app">
    <header className="topbar">
      {tab === 'chat' && chat.active ? <button className="icon" aria-label="返回" onClick={() => { chat.setActive(undefined); setTab('library') }}><ArrowLeft /></button> : <span className="brandmark">PT</span>}
      <div><strong>{tab === 'chat' && chat.character ? chat.character.name : tab === 'library' ? '角色库' : tab === 'settings' ? '设置' : '聊天'}</strong><small>{tab === 'chat' && chat.character ? '沉浸式对话' : 'Pocket Tavern'}</small></div>
      {tab === 'library' && <button className="icon" aria-label="导入角色" onClick={() => fileRef.current?.click()}><Upload /></button>}
    </header>

    <ErrorNotice error={error} success={success} onRetry={chat.retryAvailable ? () => void chat.generate('retry') : undefined} onClearError={() => setError(undefined)} onClearSuccess={() => setSuccess('')} />

    <main className="content">
      {tab === 'library' && <section className="library">
        <div className="section-title"><div><h1>你的角色</h1><p>{data.characters.length ? `${data.characters.length} 位角色，点击继续对话` : '导入一张角色卡开始'}</p></div><button className="primary" onClick={() => fileRef.current?.click()}><Plus />导入</button></div>
        <input ref={fileRef} hidden type="file" accept=".json,.png,application/json,image/png" onChange={event => void importFile(event.target.files?.[0])} />
        <div className="character-grid">{data.characters.map(character => <article className="character-card" key={character.id} onClick={() => void runAction(async () => { await chat.openChat(character); setTab('chat') }, '聊天打开失败。')}>
          <div className="avatar">{character.avatar ? <img src={character.avatar} alt="" /> : character.name.slice(0, 1).toUpperCase()}</div>
          <div className="char-info"><h2>{character.name}</h2><p>{character.data.description || character.data.personality || '等待与你相遇'}</p><div className="tags">{(character.data.tags || []).slice(0, 2).map(tag => <span key={tag}>{tag}</span>)}</div></div>
          <div className="card-actions"><button className="icon small" title="导出 JSON" aria-label="导出 JSON" onClick={event => { event.stopPropagation(); download(`${character.name}.json`, exportCard(character)) }}><Download /></button>{character.assetPath && <button className="icon small" title="导出 PNG" aria-label="导出 PNG" onClick={event => { event.stopPropagation(); void runAction(async () => downloadBytes(`${character.name}.png`, exportCardPng(character, await store.readAsset(character.assetPath!))), '角色 PNG 导出失败。') }}><FileImage /></button>}<button className="icon small danger" title="删除" aria-label="删除" onClick={event => { event.stopPropagation(); deleteCharacter(character) }}><Trash2 /></button></div>
        </article>)}</div>
        {!data.characters.length && <div className="empty"><Library /><h2>酒馆还很安静</h2><p>支持 Character Card V2 PNG 和 JSON，未知字段会原样保留。</p><button className="primary" onClick={() => fileRef.current?.click()}><Upload />选择角色卡</button></div>}
      </section>}

      {tab === 'chat' && !chat.active && <section className="chat-list"><h1>最近聊天</h1>{data.sessions.map(session => { const character = data.characters.find(item => item.id === session.characterId); return character && <button key={session.id} onClick={() => { chat.setActive(session.id); setTab('chat') }}><span className="avatar mini">{character.name[0]}</span><span><strong>{session.title}</strong><small>{new Date(session.updatedAt).toLocaleString()}</small></span></button> })}{!data.sessions.length && <div className="empty"><MessageCircle /><p>从角色库选择角色开始聊天</p></div>}</section>}

      {tab === 'chat' && chat.active && chat.character && <section className="conversation">
        <MessageList messages={chat.chatMessages} busy={chat.busy} editing={chat.editing} onSetEditing={chat.setEditing} onSaveEdited={(message, content) => void chat.saveEdited(message, content)} onDelete={id => void chat.deleteMessage(id)} onRollback={message => void chat.rollback(message)} onRegenerate={() => void chat.generate('regenerate')} />
        <Composer character={chat.character} draft={chat.draft} busy={chat.busy} usage={chat.previewUsage} onDraftChange={chat.setDraft} onSend={() => void chat.generate()} onStop={chat.stop} />
      </section>}

      {tab === 'settings' && <SettingsView settings={data.settings} setSettings={data.setSettings} apiKey={data.apiKey} setApiKey={data.setApiKey} personas={data.personas} presets={data.presets} characters={data.characters} worldBookEntries={data.worldBookEntries} reload={data.reload} save={saveSettings} reportError={reportError} reportSuccess={reportSuccess} />}
    </main>

    {!(tab === 'chat' && chat.active) && <nav className="bottom-nav"><button className={tab === 'library' ? 'active' : ''} onClick={() => setTab('library')}><Library /><span>角色</span></button><button className={tab === 'chat' ? 'active' : ''} onClick={() => setTab('chat')}><MessageCircle /><span>聊天</span></button><button className={tab === 'settings' ? 'active' : ''} onClick={() => setTab('settings')}><SettingsIcon /><span>设置</span></button></nav>}
  </div>
}
