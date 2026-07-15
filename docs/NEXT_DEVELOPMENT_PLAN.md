# Pocket Tavern 下一阶段开发计划

最后更新：2026-07-16

## 目标

在世界书功能合并后，优先完成数据可携带性、Android 稳定性和可发布性，再扩展角色编辑与聊天导出。

## 当前基线

- PR #1「feat: add character-aware world book entries」已合并。
- 合并提交：`17bc538c7162df79bdff226d893e0a88e50a768c`
- 已具备：世界书条目增删改、启停、关键词匹配、优先级、角色范围、每轮最多注入 5 条，以及 Web/Android 持久化。
- P0 已实现：世界书版本化 JSON 导入/导出、字段校验、默认值补全、重复 ID 重映射、Web/SQLite 原子回滚和 Android Documents 导出。
- 已验证：`npm test -- --run`（6 个测试文件、26 个测试通过）、`npm run lint`、`npm run build`、`npm run android:build` 和 `git diff --check`。
- 已生成 Android debug APK：`android/app/build/outputs/apk/debug/app-debug.apk`；真机/模拟器的重装后导入仍需按验收文档人工执行。

## 开发顺序

### P0：数据基线与世界书导入/导出（已完成）

目标：让用户可以备份、迁移和恢复世界书，并清理下一次开发前的仓库状态。

工作项：

1. [x] 核对当前本地生成的 `package-lock.json` 和 `android/gradle/wrapper/gradle-wrapper.jar`，确认并纳入开发基线。
2. [x] 增加世界书 JSON 导出与导入，定义带版本号的文件格式，包含条目名称、关键词、正文、优先级、启用状态和角色范围。
3. [x] 导入时执行结构校验、字段默认值补全、重复 ID 重映射和失败回滚；导出内容不包含 API Key。
4. [x] 更新 README、验收路径和设置页说明，并检查源码、构建产物和 Android 包中的中文编码显示。

验收标准：

- Web 导出的文件可在全新浏览器存储中导入，并保留条目语义和角色范围。
- Android 导出的文件可在重装后的应用中导入；坏文件不会造成已有数据部分写入。
- 导入后关键词匹配、优先级排序、停用条目和“最多 5 条”规则与导出前一致。
- 新增单元测试覆盖空字段、非法优先级、重复 ID、未知字段和跨平台往返。

建议 PR：`feat: import and export world book data`。

当前状态：P0 实现、自动化验证和合并均已完成；`main` 已包含 PR #1 和 PR #2，下一阶段进入 P1。

### P1：Android 存储与重启可靠性

目标：把当前 Web 单元测试覆盖扩展到 SQLite、迁移和应用生命周期。

工作项：

1. 增加旧版 `app_state` 到分表结构的迁移 fixture，验证角色、会话、消息、人设、设置和世界书均不丢失。
2. 增加 Android 测试或可重复的 `adb` 流程，覆盖应用重启、SQLite 恢复、世界书注入和角色范围过滤。
3. 覆盖 API 失败、流式回复中止、键盘弹出/收起和返回键导航等现有关键路径。
4. 将 Web 检查、Android debug 构建和可用的模拟器测试接入 GitHub Actions；真实 API Key 只使用测试桩。

验收标准：

- 旧数据迁移后所有实体数量和关键字段一致，重复初始化不会重复导入。
- 强制停止并重启应用后，角色、会话、消息、设置和世界书仍可用。
- Android 测试失败时能定位到具体场景，而不是只有“构建失败”。
- CI 至少执行测试、lint、Web build；Android 环境可用时执行 debug build。

建议 PR：`test: cover android persistence and world book lifecycle`，随后单独提交 CI 配置。

### P2：角色编辑与聊天数据可携带性

目标：提高日常使用价值，但控制范围，不同时引入群聊、云同步等大功能。

工作项：

1. 增加角色卡基础字段编辑，继续保留未知字段；明确 JSON 编辑和 PNG 回写的边界。
2. 增加会话重命名、删除和 JSON/JSONL 导出，导出中不包含 API Key。
3. 增加导出文件的分享/保存路径，并为导出失败提供可定位提示。
4. 根据实际使用反馈再决定是否加入世界书批量编辑或搜索过滤。

验收标准：

- 编辑后的 V2 卡片可再次导入，未知字段和非编辑字段不被破坏。
- 会话导出可在本地解析，角色、时间、消息角色和消息顺序完整。
- 删除和导出操作有明确确认/错误反馈，并覆盖 Web 与 Android。

建议 PR：按“角色编辑”和“聊天导出”拆成两个小 PR。

### P3：发布流程

目标：形成可重复的版本发布路径。

工作项：

- 增加版本号、CHANGELOG 和发布验收清单。
- 明确 debug/release APK、签名材料和密钥管理边界。
- 补充隐私说明、数据删除说明和兼容 Android 版本说明。
- 在 P0/P1 稳定后再评估 iOS、云同步、TTS、图片生成和群聊。

## 分支与 PR 规则

每个阶段使用独立的 `codex/` 分支；一个 PR 只解决一个可验收目标。提交前执行：

```powershell
npm test
npm run lint
npm run build
git diff --check
```

涉及 Android 时追加：

```powershell
npm run android:build
```

不要提交真实 API Key、临时构建产物或未确认归属的本地依赖变更。每个 PR 合并后更新 `docs/CONVERSATION_HANDOFF.md`。

## 暂不纳入本轮

云同步、iOS、群聊、TTS、图片生成和扩展生态暂不进入 P0/P1；先完成数据可靠性和可恢复性。
