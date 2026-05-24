# PUA Extension Enhancement Plan — 4 Hooks

## 目标

将 PI PUA adapter 从"prompt 注入 + 失败计数"升级为"主动约束 + 行为检测"，
对标 Claude Code 版 PUA 的 hook 能力矩阵。

## 对标关系

| Claude Code hook | PI 等价事件 | 实现目标 |
|-----------------|-------------|----------|
| `UserPromptSubmit` frustration-trigger | `input` | 用户挫败检测 + 味道自动切换建议 |
| `PreToolUse` integrity-guard | `tool_call` + `{ block }` | 四权分立 + 连续失败重复检测 |
| `PreCompact` state-save | `session_before_compact` | 压力状态 + 任务上下文保存 |
| `Stop` loop/feedback | `turn_end` + `agent_end` | 空口完成检测 + 原地打转检测 |

## Hook 1: `input` — 挫败检测

### 行为

- 监听用户输入文本
- 匹配挫败关键词（中英文）：
  - "为什么还不行" / "再试试" / "你一直失败"
  - "why still not working" / "try harder" / "stop giving up"
- 匹配到时：
  - 自动将 failure_count 提升到至少 2（触发 L1）
  - 通过 `ctx.ui.notify` 提示已激活压力模式
- 不修改用户输入内容（返回 `{ action: "continue" }`）

### 不做

- 不拦截或变换用户输入
- 不自动切换味道（只建议）

## Hook 2: `tool_call` — 四权分立 + 重复检测

### 行为

**四权分立（integrity guard）**：
- 检测写入目标路径，匹配保护模式：
  - `tests/` / `spec/` / `evals/` → advisory 提示
  - `.github/workflows/` / `ci/` → advisory 提示
  - `.env` / `secrets/` / `credentials` → advisory 提示
- 匹配到时：`ctx.ui.notify` 提示 + 返回 `{ block: false }` （advisory 不 block）
- 对于 contamination patterns（hidden_solution 等）→ `{ block: true }`

**连续失败重复检测**：
- 记录最近 3 次 bash 命令
- 当 L2+ 且新命令与最近命令高度相似时：
  - `ctx.ui.confirm("检测到重复命令模式，确认继续？")`
  - 用户拒绝 → `{ block: true }`

### 不做

- 不做完整权限系统（那是 `pi-permission-system` 的事）
- 不拦截 read/grep/ls 等只读工具
- L0-L1 时不做重复检测（避免打扰）

## Hook 3: `session_before_compact` — 状态保存

### 行为

- 在 context compaction 前，将当前 PUA 运行时状态写入 `~/.pua/builder-journal.md`：
  - pressure_level
  - failure_count
  - current_flavor
  - 最近失败的工具和命令
  - 当前任务摘要（从最近 turn 提取）
- 返回 `undefined`（不取消压缩）

### 不做

- 不阻止压缩
- 不修改压缩行为

## Hook 4: `turn_end` — 空口完成 + 原地打转检测

### 行为

**空口完成检测**：
- 分析本轮 `message` 内容，检测完成声明关键词：
  - "已完成" / "done" / "fixed" / "完成了" / "搞定"
- 检查本轮 `toolResults`：是否有至少一次成功的验证工具调用（bash/test/build）
- 如果声称完成但无验证证据 → 将 failure_count +1 并 notify

**原地打转检测**：
- 维护最近 5 轮的 bash 命令摘要
- 检测模式：连续 3 轮执行相似命令且都失败
- 检测到时 → notify 建议切换方法论

### 不做

- 不修改 assistant 消息内容
- 不阻止 turn 完成
- 关键词检测保守，避免误判

## 实现顺序

1. Hook 3（session_before_compact）— 最简单，独立性最强
2. Hook 1（input）— 逻辑简单，不影响现有流程
3. Hook 4（turn_end）— 需要维护历史状态
4. Hook 2（tool_call block）— 最复杂，需要交互确认

## 配置开关

在 `~/.pua/config.json` 新增：

```json
{
  "enforcement_level": "enforce",
  "integrity_guard": true,
  "frustration_detection": true,
  "loop_detection": true,
  "compact_state_save": true
}
```

`enforcement_level` 三档：
- `"observe"`: 只计数 + notify，不 block 任何工具
- `"suggest"`: 计数 + notify + confirm 弹窗（用户可跳过）
- `"enforce"`: 计数 + notify + 自动 block 重复/违规

## 文件变更预估

| 文件 | 变更 |
|------|------|
| `index.ts` | 新增 4 个 event handler 注册 |
| `enforcement.ts`（新建）| 四权分立规则 + 重复检测 + 挫败匹配 + 打转检测 |
| `docs/DESIGN.md` | 更新设计哲学 + 新增 hook 说明 |
| `README.md` | 更新能力表格 |
| `global.d.ts` | 补充新事件类型声明 |
