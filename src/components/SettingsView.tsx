import { useRef, useState } from 'react'
import { Download, Pencil, Plus, Trash2, Upload } from 'lucide-react'
import { store } from '../lib/storage'
import type { AppSettings, Character, Persona, Preset, WorldBookEntry } from '../types'

interface SettingsViewProps {
  settings: AppSettings
  setSettings: (value: AppSettings) => void
  apiKey: string
  setApiKey: (value: string) => void
  personas: Persona[]
  presets: Preset[]
  characters: Character[]
  worldBookEntries: WorldBookEntry[]
  reload: () => Promise<void>
  save: () => Promise<void>
  reportError: (error: unknown, fallback?: string) => void
  reportSuccess: (message: string) => void
}

const uid = () => crypto.randomUUID()
const download = (name: string, content: string) => {
  const anchor = document.createElement('a')
  anchor.href = URL.createObjectURL(new Blob([content], { type: 'application/json' }))
  anchor.download = name
  anchor.click()
  URL.revokeObjectURL(anchor.href)
}

export function SettingsView({ settings, setSettings, apiKey, setApiKey, personas, presets, characters, worldBookEntries, reload, save, reportError, reportSuccess }: SettingsViewProps) {
  const [personaName, setPersonaName] = useState('')
  const [personaDescription, setPersonaDescription] = useState('')
  const [presetName, setPresetName] = useState('')
  const [worldBookName, setWorldBookName] = useState('')
  const [worldBookKeywords, setWorldBookKeywords] = useState('')
  const [worldBookContent, setWorldBookContent] = useState('')
  const [worldBookPriority, setWorldBookPriority] = useState('0')
  const [worldBookCharacters, setWorldBookCharacters] = useState<string[]>([])
  const [editingWorldBook, setEditingWorldBook] = useState<string>()
  const worldBookFileRef = useRef<HTMLInputElement>(null)

  const set = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => setSettings({ ...settings, [key]: value })
  const resetWorldBookForm = () => {
    setWorldBookName('')
    setWorldBookKeywords('')
    setWorldBookContent('')
    setWorldBookPriority('0')
    setWorldBookCharacters([])
    setEditingWorldBook(undefined)
  }

  const saveWorldBook = async () => {
    const name = worldBookName.trim()
    const content = worldBookContent.trim()
    const keywords = [...new Set(worldBookKeywords.split(/[\n,，]/).map(item => item.trim()).filter(Boolean))]
    if (!name || !content || !keywords.length) {
      reportError(new Error('请填写条目名称、关键词和内容。'), '世界书条目不能为空。')
      return
    }
    try {
      const now = Date.now()
      const current = worldBookEntries.find(item => item.id === editingWorldBook)
      await store.saveWorldBookEntry({ id: current?.id || uid(), name, content, keywords, priority: Number(worldBookPriority) || 0, enabled: current?.enabled ?? true, characterIds: worldBookCharacters, createdAt: current?.createdAt || now, updatedAt: now })
      resetWorldBookForm()
      await reload()
    } catch (error) {
      reportError(error, '世界书条目保存失败。')
    }
  }

  const editWorldBook = (entry: WorldBookEntry) => {
    setEditingWorldBook(entry.id)
    setWorldBookName(entry.name)
    setWorldBookKeywords(entry.keywords.join(', '))
    setWorldBookContent(entry.content)
    setWorldBookPriority(String(entry.priority))
    setWorldBookCharacters(entry.characterIds)
  }

  const importWorldBook = async (file?: File) => {
    if (!file) return
    try {
      const result = await store.importWorldBook(await file.text())
      await reload()
      reportSuccess(`已导入 ${result.imported} 条世界书${result.remappedIds ? `，重映射 ${result.remappedIds} 个重复 ID` : ''}`)
    } catch (error) {
      reportError(error, '世界书导入失败。')
    } finally {
      if (worldBookFileRef.current) worldBookFileRef.current.value = ''
    }
  }

  const exportWorldBook = async () => {
    try {
      const result = await store.exportWorldBookFile()
      if (result.uri) reportSuccess('世界书已导出到 Android Documents 目录')
      else {
        download('pocket-tavern-world-book.json', result.content)
        reportSuccess('世界书 JSON 已下载')
      }
    } catch (error) {
      reportError(error, '世界书导出失败。')
    }
  }

  const savePersona = async () => {
    if (!personaName.trim()) return
    try {
      await store.savePersona({ id: uid(), name: personaName.trim(), description: personaDescription.trim(), isDefault: !personas.length })
      setPersonaName('')
      setPersonaDescription('')
      await reload()
    } catch (error) {
      reportError(error, '人设保存失败。')
    }
  }

  const savePreset = async () => {
    if (!presetName.trim()) return
    try {
      await store.savePreset({ id: uid(), name: presetName.trim(), systemPrompt: settings.systemPrompt, temperature: settings.temperature, maxTokens: settings.maxTokens, contextTokens: settings.contextTokens })
      setPresetName('')
      await reload()
    } catch (error) {
      reportError(error, '预设保存失败。')
    }
  }

  return <section className="settings">
    <h1>模型连接</h1>
    <div className="panel">
      <label>API Key<input type="password" autoComplete="off" value={apiKey} onChange={event => setApiKey(event.target.value)} placeholder="sk-…" /><small>仅保存在本机 Preferences，不参与导出</small></label>
      <label>Base URL<input type="url" value={settings.baseUrl} onChange={event => set('baseUrl', event.target.value)} /></label>
      <label>模型<input list="deepseek-models" value={settings.model} onChange={event => set('model', event.target.value)} placeholder="模型 ID" /><datalist id="deepseek-models"><option value="deepseek-chat">DeepSeek Chat</option><option value="deepseek-reasoner">DeepSeek Reasoner</option></datalist><small>可填写兼容 OpenAI Chat Completions 的自定义模型 ID</small></label>
    </div>

    <h1>生成参数</h1>
    <div className="panel">
      <label>系统提示<textarea rows={4} value={settings.systemPrompt} onChange={event => set('systemPrompt', event.target.value)} placeholder="可选的全局指令" /></label>
      <label>温度 <output>{settings.temperature.toFixed(1)}</output><input type="range" min="0" max="2" step="0.1" value={settings.temperature} onChange={event => set('temperature', Number(event.target.value))} /></label>
      <div className="split">
        <label>最大输出<input type="number" min="64" max="8192" value={settings.maxTokens} onChange={event => set('maxTokens', Math.max(64, Math.min(8192, Number(event.target.value) || 64)))} /></label>
        <label>上下文长度<input type="number" min="1024" max="128000" value={settings.contextTokens} onChange={event => set('contextTokens', Math.max(1024, Math.min(128000, Number(event.target.value) || 1024)))} /></label>
      </div>
    </div>

    <h1>生成预设</h1>
    <div className="panel">
      <div className="inline-form"><input value={presetName} onChange={event => setPresetName(event.target.value)} placeholder="预设名称" /><button className="primary" onClick={() => void savePreset()}><Plus />保存当前</button></div>
      {presets.map(preset => <div className="manage-row" key={preset.id}><span><strong>{preset.name}</strong><small>{preset.temperature.toFixed(1)} · {preset.maxTokens} / {preset.contextTokens}</small></span><button onClick={() => setSettings({ ...settings, systemPrompt: preset.systemPrompt, temperature: preset.temperature, maxTokens: preset.maxTokens, contextTokens: preset.contextTokens })}>应用</button><button className="danger" aria-label="删除预设" onClick={() => void (async () => { try { await store.deletePreset(preset.id); await reload() } catch (error) { reportError(error, '预设删除失败。') } })()}><Trash2 /></button></div>)}
    </div>

    <h1>用户人设</h1>
    <div className="panel">
      <div className="persona-form"><input value={personaName} onChange={event => setPersonaName(event.target.value)} placeholder="名称" /><textarea rows={2} value={personaDescription} onChange={event => setPersonaDescription(event.target.value)} placeholder="角色看到的用户身份与背景" /><button className="primary" onClick={() => void savePersona()}><Plus />新增人设</button></div>
      {personas.map(persona => <div className="manage-row persona-row" key={persona.id}>
        <span><strong>{persona.name}{persona.isDefault && <em>默认</em>}</strong><small>{persona.description || '未填写描述'}</small></span>
        {!persona.isDefault && <button onClick={() => void (async () => { try { await store.savePersona({ ...persona, isDefault: true }); await reload() } catch (error) { reportError(error, '默认人设设置失败。') } })()}>设为默认</button>}
        <button aria-label="编辑人设" onClick={() => void (async () => { const name = prompt('人设名称', persona.name); if (!name) return; const description = prompt('人设描述', persona.description); if (description === null) return; try { await store.savePersona({ ...persona, name: name.trim(), description }); await reload() } catch (error) { reportError(error, '人设编辑失败。') } })()}><Pencil /></button>
        <button className="danger" aria-label="删除人设" onClick={() => void (async () => { try { await store.deletePersona(persona.id); await reload() } catch (error) { reportError(error, '人设删除失败。') } })()}><Trash2 /></button>
      </div>)}
    </div>

    <h1>世界书</h1>
    <div className="panel">
      <div className="worldbook-transfer"><input ref={worldBookFileRef} hidden type="file" accept=".json,application/json" onChange={event => void importWorldBook(event.target.files?.[0])} /><button onClick={() => worldBookFileRef.current?.click()}><Upload />导入 JSON</button><button onClick={() => void exportWorldBook()}><Download />导出 JSON</button><small>导出文件只包含世界书条目，不包含 API Key；Android 会保存到 Documents 目录。</small></div>
      <div className="worldbook-form"><input value={worldBookName} onChange={event => setWorldBookName(event.target.value)} placeholder="条目名称" /><input value={worldBookKeywords} onChange={event => setWorldBookKeywords(event.target.value)} placeholder="关键词，使用逗号或换行分隔" /><textarea rows={4} value={worldBookContent} onChange={event => setWorldBookContent(event.target.value)} placeholder="命中关键词后注入的世界设定" /><label>优先级<input type="number" value={worldBookPriority} onChange={event => setWorldBookPriority(event.target.value)} /><small>数值越大越优先；每轮最多注入 5 条。</small></label>
        <div className="worldbook-characters"><small>适用角色（不选则全局生效）</small>{characters.map(character => <label key={character.id}><input type="checkbox" checked={worldBookCharacters.includes(character.id)} onChange={() => setWorldBookCharacters(ids => ids.includes(character.id) ? ids.filter(id => id !== character.id) : [...ids, character.id])} />{character.name}</label>)}</div>
        <div className="inline-form"><button className="primary" onClick={() => void saveWorldBook()}><Plus />{editingWorldBook ? '保存修改' : '新增条目'}</button>{editingWorldBook && <button onClick={resetWorldBookForm}>取消</button>}</div>
      </div>
      {worldBookEntries.map(entry => <div className="manage-row worldbook-row" key={entry.id}><span><strong>{entry.name}{!entry.enabled && <em>已停用</em>}</strong><small>{entry.keywords.join(' · ')}{entry.characterIds.length ? ` · ${entry.characterIds.map(id => characters.find(character => character.id === id)?.name || '已删除角色').join('、')}` : ' · 全局'}</small></span><button onClick={() => void (async () => { try { await store.saveWorldBookEntry({ ...entry, enabled: !entry.enabled, updatedAt: Date.now() }); await reload() } catch (error) { reportError(error, '世界书状态更新失败。') } })()}>{entry.enabled ? '停用' : '启用'}</button><button aria-label="编辑世界书条目" onClick={() => editWorldBook(entry)}><Pencil /></button><button className="danger" aria-label="删除世界书条目" onClick={() => void (async () => { if (!confirm(`删除世界书条目“${entry.name}”？`)) return; try { await store.deleteWorldBookEntry(entry.id); if (editingWorldBook === entry.id) resetWorldBookForm(); await reload() } catch (error) { reportError(error, '世界书条目删除失败。') } })()}><Trash2 /></button></div>)}
    </div>

    <h1>外观</h1>
    <div className="panel segmented"><button className={settings.theme === 'system' ? 'active' : ''} onClick={() => set('theme', 'system')}>跟随系统</button><button className={settings.theme === 'light' ? 'active' : ''} onClick={() => set('theme', 'light')}>浅色</button><button className={settings.theme === 'dark' ? 'active' : ''} onClick={() => set('theme', 'dark')}>深色</button></div>
    <button className="primary save" onClick={() => void save()}>保存设置</button>
    <p className="scope">Pocket Tavern MVP · 数据仅保存在当前设备</p>
  </section>
}
