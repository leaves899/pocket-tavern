# 对话状态交接文档

最后更新：2026-07-16

## 当前目标

- 已完成世界书功能 PR #1 的合并。
- 下一目标是按 `docs/NEXT_DEVELOPMENT_PLAN.md` 推进世界书导入/导出、Android 持久化验证和发布基线。
- 当前阶段：`P0 世界书导入/导出已合并到 main，下一步进入 P1`。

## 已确认事实

- 仓库：`leaves899/pocket-tavern`
- 工作目录：`C:\Users\Administrator\Documents\类酒馆开发`
- 当前本地分支：`main`
- 功能分支远程提交：`0c5a810ba997ce9a16cf7a29da032ff19e633c70`
- PR：[PR #1](https://github.com/leaves899/pocket-tavern/pull/1)
- PR 状态：`MERGED`
- 合并提交：`17bc538c7162df79bdff226d893e0a88e50a768c`
- 合并方式：普通 merge commit，远程功能分支保留。
- 合并时 GitHub 没有可用的 CI 检查结果。

## 已完成事项

- [x] 世界书数据结构和 Web/Android 存储接口
- [x] 世界书条目增删改、启停和角色范围
- [x] 关键词匹配、优先级排序和每轮最多注入 5 条
- [x] Web 与 SQLite 持久化迁移路径
- [x] 世界书相关单元测试
- [x] PR #1 合并
- [x] 编写下一阶段开发计划
- [x] 世界书版本化 JSON 导入/导出、默认值补全和未知字段忽略
- [x] 重复 ID 重映射、Web 原子写入和 Android SQLite 事务回滚
- [x] Android Documents 导出路径、设置页导入/导出控件和 P0 验收文档

## 验证记录

| 检查 | 结果 |
|---|---|
| `npm test -- --run` | 通过：6 个测试文件、26 个测试 |
| `npm run lint` | 通过 |
| `npm run build` | 通过 |
| `npm ci --ignore-scripts --dry-run` | 通过；当前 `package-lock.json` 与 `package.json` 依赖一致 |
| `android\gradlew.bat --version` | 通过；Gradle 8.14.3 wrapper 可启动 |
| `npm run android:build` | 通过；已生成 `android/app/build/outputs/apk/debug/app-debug.apk` |
| `git diff --check` | 通过；仅有 Windows `autocrlf` 提示 |
| `gh pr view 1 ...` | 已确认 `MERGED`，合并提交 `17bc538c` |
| `git fetch origin main` | 本次核对时网络等待超时；不影响 GitHub 已确认的合并结果 |

## 本地工作区注意事项

- 已确认的原有内容差异包括 `package-lock.json` 和 `android/gradle/wrapper/gradle-wrapper.jar`；它们属于本地生成/依赖基线变更，尚未纳入 PR #1。
- `docs/CONVERSATION_HANDOFF.md`、`docs/NEXT_DEVELOPMENT_PLAN.md` 和 `docs/P0_WORLD_BOOK_ACCEPTANCE.md` 是交接、计划和验收文档。
- `package-lock.json` 已由旧的错误占位内容规范为可用 lockfile；Gradle wrapper 已替换为可启动的 8.14.3 wrapper，这两项已随 P0 合并提交进入 `main`。
- 当前分支从既有本地基线创建，尚未切换到合并后的 `main`；不要丢弃其他本地生成物或强制重置工作区。

## 决策记录

| 编号 | 决策 | 依据 | 状态 |
|---|---|---|---|
| D-001 | PR #1 使用普通 merge commit 合并并保留功能分支 | GitHub 报告 `MERGEABLE/CLEAN`，无待处理检查 | 已确认 |
| D-002 | 下一阶段优先做数据可携带性和 Android 可靠性，再做角色编辑/聊天导出 | 当前世界书已能使用但无法迁移，Android 缺少真实生命周期覆盖 | 已确认 |
| D-003 | P0/P1 暂不扩展云同步、iOS、群聊、TTS、图片生成 | 控制范围，先完成可恢复性和发布基线 | 已确认 |
| D-004 | 世界书导入采用追加合并；已有或文件内重复 ID 自动重映射，坏文件在校验完成前不写入 | 满足迁移场景并避免覆盖已有条目 | 已实现 |
| D-005 | Android 世界书导出写入 Documents；导入使用系统文件选择器 | 导出文件需能在重装后被用户重新选择 | 已实现 |

## 下一步清单

1. 按验收文档执行人工 Web/Android 导入、重装和坏文件回滚验证。
2. 按计划进入 P1：Android SQLite 迁移、重启和世界书注入验证。
3. P1 完成后同步本交接文档，并补充 GitHub Actions。
4. 补充 GitHub Actions；再评估 P2 角色编辑与聊天导出。

详细范围、验收标准和 PR 拆分见 [NEXT_DEVELOPMENT_PLAN.md](NEXT_DEVELOPMENT_PLAN.md)。
