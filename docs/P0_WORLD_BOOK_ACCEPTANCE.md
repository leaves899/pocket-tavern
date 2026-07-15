# P0 世界书导入/导出验收路径

## 自动化检查

在项目根目录执行：

```powershell
npm test -- --run
npm run lint
npm run build
git diff --check
```

重点覆盖：

- 版本化格式和未知字段忽略；
- 空字段默认值补全；
- 非法优先级拒绝；
- 已有数据和文件内重复 ID 重映射；
- Web 导出/导入往返；
- API Key 不出现在世界书导出内容；
- 校验失败时没有部分写入。

## Web 验收

1. 启动 `npm run dev`，在设置 → 世界书新增一个全局条目和一个指定角色条目，并停用其中一条。
2. 点击“导出 JSON”，保存 `pocket-tavern-world-book.json`。
3. 清空站点数据或使用新的浏览器配置，再导入该文件。
4. 确认名称、关键词、正文、优先级、启用状态和角色范围均恢复；发送包含关键词的消息，确认注入规则不变。
5. 修改导出文件：加入未知字段、重复 ID、缺少可选字段，再次导入，确认未知字段被忽略、重复 ID 被重映射且默认值补全。
6. 导入 JSON 语法错误或非法优先级文件，确认原有条目数量和内容不变。

## Android 验收

1. 设置 JDK 21 和 Android SDK 后执行 `npm run android:build`，安装 `android/app/build/outputs/apk/debug/app-debug.apk`。
2. 新增至少一个带角色范围的世界书条目，点击“导出 JSON”，确认文件写入 Android `Documents` 目录。
3. 卸载并重新安装同一 APK，从设置 → 世界书使用系统文件选择器导入已保存的 JSON。
4. 确认世界书条目、停用状态、优先级、关键词和角色范围恢复；坏文件不会清除或部分覆盖已有数据。
5. Android 10 设备重点检查 Documents 写入；Android 11+ 重点检查文件选择器能重新选择导出文件。

真实 API Key 只用于手动联调，不写入测试文件、截图、日志或导出 JSON。
