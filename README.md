# Pocket Tavern

Pocket Tavern 是一个无需 SillyTavern 服务端的 Android 移动酒馆 MVP。它使用 React、TypeScript、Vite、Capacitor 和 SQLite，直接调用 DeepSeek Chat Completions。

## 功能

- Character Card V2 PNG/JSON 导入，JSON/PNG 导出，未知字段往返保留
- DeepSeek `deepseek-chat` / `deepseek-reasoner`，支持自定义兼容模型 ID、HTTPS Base URL、SSE 流式回复和停止
- 消息编辑、删除、重试/重新生成，网络与 API 错误提示
- 世界书条目增删改、启停、优先级、角色范围和关键词注入；支持版本化 JSON 导入/导出
- SQLite 保存角色、用户人设、设置、会话和消息；PNG 原件在应用私有目录
- API Key 仅保存在 Capacitor Preferences，不写日志、不进入角色卡或数据导出
- 固定提示词编排、宏替换和按上下文预算裁剪
- 深色/浅色/跟随系统、Android 安全区、软键盘 resize 和返回键导航

当前版本暂不包含扩展生态、群聊、聊天 JSONL、TTS、图片生成、云同步或 iOS。

## 开发

要求 Node.js 20+、JDK 21、Android SDK 35/36。在 PowerShell 中：

```powershell
npm install
npm test
npm run dev
```

浏览器开发模式使用 localStorage 作为同接口回退；Android 包使用 SQLite 和 Preferences。

## 构建 Android debug APK

```powershell
$env:JAVA_HOME = (Get-ChildItem 'C:\Program Files\Eclipse Adoptium' -Directory | Where-Object Name -like 'jdk-21*' | Select-Object -First 1).FullName
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
npm run android:build
```

产物位于 `android/app/build/outputs/apk/debug/app-debug.apk`。安装：

```powershell
& "$env:ANDROID_HOME\platform-tools\adb.exe" install -r android\app\build\outputs\apk\debug\app-debug.apk
```

## 验收路径

1. 安装并启动 APK。
2. 在角色库导入 `samples/luna.card.json` 或兼容 V2 PNG。
3. 设置中填写 DeepSeek API Key，选择模型并保存。
4. 打开角色，发送消息，确认文本逐步出现；发送中可点方形按钮停止。
5. 编辑/删除消息并重新生成最后回复。
6. 强制关闭并重启应用，确认角色、会话、消息和设置恢复。
7. 从角色卡操作区导出 JSON；PNG 来源的角色还可导出包含更新元数据的 PNG。
8. 在设置 → 世界书中导出 `pocket-tavern-world-book.json`，确认文件包含版本号、条目内容和角色范围，但不包含 API Key。
9. 清空浏览器站点数据或重装 APK 后，从设置 → 世界书导入该 JSON；确认条目、停用状态、优先级、关键词和角色范围恢复。
10. 使用一个损坏 JSON 或非法优先级文件导入，确认已有世界书不发生部分写入；导入同 ID 条目时确认界面提示重映射。

## 安全说明

不要把真实 Key 写入源码、测试样例或问题日志。应用不会显示、记录或导出 Authorization 请求头。世界书导出只包含世界书数据，不包含 API Key。卸载应用会清除 SQLite、Preferences 和私有角色资源；已导出的世界书位于 Android Documents 目录，不随应用数据清除。

## 世界书导出格式

导出文件使用版本化 JSON，当前格式标识为 `pocket-tavern.world-book`、版本 `1`。导入采用追加合并，不会覆盖已有条目；已有 ID 或文件内重复 ID 会自动生成新 ID。未知字段会被忽略，缺少的可选字段使用安全默认值；校验失败时不会写入任何条目。

```json
{
  "format": "pocket-tavern.world-book",
  "version": 1,
  "exportedAt": 0,
  "entries": [
    {
      "id": "moon-port",
      "name": "月港",
      "keywords": ["月港", "moon"],
      "content": "潮汐由月亮牵引。",
      "priority": 3,
      "enabled": true,
      "characterIds": [],
      "createdAt": 0,
      "updatedAt": 0
    }
  ]
}
```
