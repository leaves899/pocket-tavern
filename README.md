# Pocket Tavern

Pocket Tavern 是一个无需 SillyTavern 服务端的 Android 移动酒馆 MVP，使用 React、TypeScript、Vite、Capacitor 和 SQLite，直接调用兼容 OpenAI Chat Completions 的模型服务。

## 功能

- Character Card V2 PNG/JSON 导入，JSON/PNG 导出，并保留未知字段。
- DeepSeek Chat Completions、HTTPS Base URL、SSE 流式回复、停止和重试。
- 消息编辑、删除、回档和重新生成。
- 世界书条目管理、关键词匹配、优先级、角色范围和 versioned JSON 导入/导出。
- SQLite/Preferences 持久化；API Key 只保存在本机 Preferences，不进入导出文件。
- 本地 BPE Token 估算、上下文风险提示、长对话变量高度虚拟列表。
- 深色/浅色/跟随系统主题，以及 Android 安全区和软键盘适配。

## 开发环境

- Node.js 20+
- JDK 21
- Android SDK 35/36（仅构建 Android 时需要）

```bash
npm ci
npm test
npm run lint
npm run build
npm run dev
```

## 构建 Android debug APK

构建入口会自动执行 Web 构建、Capacitor 同步和 Gradle debug 构建，支持 Windows、macOS 和 Linux：

```bash
npm run android:build
```

APK 输出在：

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

POSIX 环境需要确保 `JAVA_HOME` 和 Android SDK 已配置；如果 `android/gradlew` 没有执行权限，构建脚本会自动通过 `sh` 调用它。

## Token 估算

聊天界面使用 `gpt-tokenizer` 的 `cl100k_base` BPE 编码估算输入 Token，并为输出预留 `maxTokens`。该数值比字符启发式更接近真实请求，但 DeepSeek 服务端可能使用不同 tokenizer，因此界面会明确标注为本地估算。

超过上下文容量时，应用会阻止请求并提示缩短消息或降低最大输出；接近容量时会显示风险提示。

## 安全与数据

- 只接受 HTTPS 模型 Base URL。
- API Key 不写入日志、角色卡、业务快照或世界书导出文件。
- 角色卡文件有大小、PNG chunk、元数据、JSON 类型和危险字段校验。
- 不要把真实 API Key 提交到源码、测试、Issue 或日志中。

## 验收

```bash
npm ci
npm test
npm run lint
npm run build
npm run android:build
git diff --check
```

详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 当前范围

当前版本聚焦本地角色卡、聊天、世界书、Android 持久化和可靠性。云同步、iOS、群聊、TTS、图片生成和聊天导出暂不在本版本范围内。
