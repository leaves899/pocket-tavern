# Contributing to Pocket Tavern

感谢参与 Pocket Tavern。请先阅读 Issue 和现有文档，保持每个 PR 聚焦一个可验证目标。

## 环境

- Node.js 20+
- JDK 21
- Android SDK 35/36（Android 构建需要）

安装依赖并运行基础检查：

```bash
npm ci
npm test
npm run lint
npm run build
```

Android debug 构建：

```bash
npm run android:build
```

## 分支和提交

- 功能分支默认使用 `codex/` 前缀。
- 一个 PR 只解决一个明确的行为或维护目标。
- PR 描述应包含变更摘要、测试命令和已知限制。
- 不要提交 `dist`、本地密钥、临时构建产物或 IDE 配置。

## 测试要求

提交前至少运行：

```bash
npm test
npm run lint
npm run build
git diff --check
```

涉及 Android 构建脚本、Capacitor、SQLite 或原生资源时，还应运行 `npm run android:build`。

新增逻辑应覆盖正常路径、边界输入和失败路径。角色卡、SSE、存储和 Token 预算的行为应优先使用单元测试保护。

## 安全

- 不要提交真实 API Key、Authorization Header、模型响应中的隐私数据或测试日志。
- API Key 只能通过本地设置输入，不应写入业务快照、角色卡或导出文件。
- 发现安全问题时，请避免在公开 Issue 中粘贴凭据或完整敏感数据。

## 代码风格

保持 TypeScript 类型明确，优先复用现有存储、错误和导入导出接口。修改公共数据格式前必须补充迁移、兼容性说明和回归测试。
