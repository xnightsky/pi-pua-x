# 4 Hook 增强决策依据

本文记录 4 个增强 hook 的决策链：从哪来、为什么做、凭什么立得住。

## 决策方法

不是"我们觉得应该做"，而是：

1. **上游已实现**：`tanweai/pua` 在 Claude Code 平台通过 hooks 实现了完整行为约束。
2. **PI 平台已支持**：PI extension API 提供了等价事件。
3. **官方 PI 适配未接入**：`@tanweai/pi-pua` v3.4.6 只用了 3 个事件中最基础的部分。
4. **差距可量化**：Claude Code 版有 7 个 hook 脚本，官方 PI 版只映射了 2 个。

## 逐 Hook 追溯

### Hook 1: `input` — 用户挫败检测

| 维度 | 事实 |
|------|------|
| 上游实现 | `hooks/frustration-trigger.sh`，挂在 Claude Code `UserPromptSubmit` |
| 上游行为 | 检测用户输入中的挫败关键词（中英日），匹配到时注入压力升级 context |
| PI 等价事件 | `input`（`type: "input"`，在用户输入到达 agent 前触发） |
| 官方 PI 适配 | **未使用** `input` 事件 |
| 官方不做的原因 | 官方 PI 适配的设计目标是"轻量、离线、不拥有权限"，只做最小 prompt 注入 |
| 我们做的理由 | PI `input` 事件已稳定暴露，上游逻辑明确，实现成本 < 30 行 |
| 平台限制 | PI print mode (`-p`) 不触发 `input` 事件，仅交互模式生效 |

**上游源码证据**：

```
hooks/hooks.json → "UserPromptSubmit" → frustration-trigger.sh
```

```bash
# hooks/frustration-trigger.sh 核心逻辑（简化）
# 检测用户输入中的挫败信号，匹配到时输出压力升级 context
```

### Hook 2: `tool_call` — 四权分立 + 重复命令检测

| 维度 | 事实 |
|------|------|
| 上游实现 | `hooks/integrity-guard.sh`，挂在 Claude Code `PreToolUse` |
| 上游行为 | 检查工具调用目标路径，对 tests/CI/secrets 做 advisory，对 hidden_solution 做 deny |
| PI 等价事件 | `tool_call`（可返回 `{ block: true, reason }` 阻止执行） |
| 官方 PI 适配 | **未使用** `tool_call` 做拦截（只用于子 agent capsule 注入） |
| 官方不做的原因 | 官方明确声明"不做权限系统"，把安全边界留给 `pi-permission-system` |
| 我们做的理由 | 这不是通用权限系统，是 PUA 视角的四权分立——上游已定义完整规则集 |
| 差异点 | 上游用 Python 脚本 + 200 行正则；我们用 TypeScript 精简为核心模式 |

**上游源码证据**：

```
hooks/hooks.json → "PreToolUse" → integrity-guard.sh
  matcher: "Bash|Read|Grep|Glob|Edit|Write|MultiEdit|WebSearch|WebFetch"
```

上游 `integrity-guard.sh` 实现了：
- `PROTECTED_WRITE_PATTERNS`：tests/evals/CI/scoring/memory/.env
- `CONTAMINATION_PATTERNS`：hidden_tests/hidden_solution/gold_patch
- `SENSITIVE_READ_PATTERNS`：.env/secrets/credentials/private_key
- `WEB_CONTAMINATION`：检测 WebSearch/WebFetch 中搜索 hidden solution
- 四权分立语义：行动权 / 自我评价权 / 评分权 / 环境修改权
- 上游 deny 语义：返回 `permissionDecision: "deny"` → Claude Code 弹确认对话框让用户选择，不是无条件阻止

**重复命令检测**（上游无直接等价，但属于 L2+ 压力升级的执行层）：
- 上游在 `failure-detector.sh` 的 L2 输出中要求"switch to fundamentally different approach"
- 我们把这个要求从 prompt 建议变成 runtime 约束：检测到重复命令时 block

### Hook 3: `session_before_compact` — 压力状态保存

| 维度 | 事实 |
|------|------|
| 上游实现 | `hooks/hooks.json` → `PreCompact` → prompt 注入 |
| 上游行为 | 在 context compaction 前，要求模型把 PUA 运行时状态写入 `~/.pua/builder-journal.md` |
| PI 等价事件 | `session_before_compact`（在压缩前触发，可取消或自定义） |
| 官方 PI 适配 | **未使用** `session_before_compact` |
| 官方不做的原因 | 官方 PI 适配没有状态保存需求（它的状态只有 config + failure_count） |
| 我们做的理由 | 我们维护更多运行时状态（味道、最近失败命令、压力等级），压缩后丢失会导致压力重置 |
| 实现差异 | 上游靠 prompt 让模型自己写文件；我们在 extension 层直接写，不依赖模型配合 |

**上游源码证据**：

```json
"PreCompact": [{
  "matcher": "*",
  "hooks": [{
    "type": "prompt",
    "prompt": "[PUA v2 PreCompact — State Checkpoint]\n\n...You MUST immediately dump your PUA v2 runtime state to ~/.pua/builder-journal.md..."
  }]
}]
```

**关键改进**：上游靠 prompt 让模型"自觉"写状态文件——模型可能不执行。我们在 extension 层直接写，**确保状态不丢失**。

### Hook 4: `turn_end` — 空口完成 + 原地打转检测

| 维度 | 事实 |
|------|------|
| 上游实现 | `hooks/pua-loop-hook.sh` + `hooks/stop-feedback.sh`，挂在 Claude Code `Stop` |
| 上游行为 | 会话结束时检测循环模式、收集反馈、记录到 evolution.md |
| PI 等价事件 | `turn_end`（每轮结束后触发，携带 message + toolResults） |
| 官方 PI 适配 | **未使用** `turn_end` 或 `agent_end` |
| 官方不做的原因 | 官方 PI 适配只做失败计数，不做行为模式分析 |
| 我们做的理由 | PUA 三条红线中“空口完成”是核心违规，上游在 prompt 层约束，我们在 runtime 层检测 |
| 平台限制 | PI print mode (`-p`) 不触发 `turn_end`，仅交互模式生效 |

**上游源码证据**：

```json
"Stop": [{
  "matcher": "*",
  "hooks": [
    { "type": "command", "command": "bash \"${CLAUDE_PLUGIN_ROOT}/hooks/pua-loop-hook.sh\"" },
    { "type": "command", "command": "bash \"${CLAUDE_PLUGIN_ROOT}/hooks/stop-feedback.sh\"", "timeout": 10 }
  ]
}]
```

**我们的实现差异**：
- 上游在会话结束时检测；我们在每轮结束时检测（更早发现问题）
- 上游只做反馈收集；我们做行为检测 + 失败计数累加
- 上游不能阻止模型输出；我们也不能（PI 无 PreResponse），但能通过累加失败影响下一轮压力

## 汇总对照表

| Claude Code Hook | 上游脚本 | PI 等价事件 | 官方 PI 用了？ | 我们用了？ | 理由 |
|-----------------|----------|-------------|------------|----------|------|
| `UserPromptSubmit` | frustration-trigger.sh | `input` | ✖ | ✔ | 上游已实现，PI 已支持，实现成本低 |
| `PreToolUse` | integrity-guard.sh | `tool_call` + block | ✖ | ✔ | 上游核心能力，四权分立是 PUA 治理基础 |
| `PreCompact` | (prompt injection) | `session_before_compact` | ✖ | ✔ | 上游靠 prompt 让模型写，我们直接写，更可靠 |
| `PostToolUse` | failure-detector.sh | `tool_result` | ✔（极简） | ✔（已有） | 官方和我们都做了 |
| `Stop` | pua-loop-hook.sh | `turn_end` | ✖ | ✔ | 空口完成是 PUA 三条红线之一 |
| `SessionStart` | session-restore.sh | `session_start` | ✔（极简） | ✔（已有） | 官方和我们都做了 |
| `SubagentStop` | subagent-teardown.sh | `tool_execution_end` | ✖ | ✖（未来可做） | 当前用 tool_call capsule 注入代替 |

## 决策原则

我们不是“觉得应该做”，而是：

1. **上游已验证**：每个 hook 在 Claude Code 版本中已经跑在生产环境，有真实用户反馈。
2. **平台已支持**：每个 hook 对应的 PI 事件已在官方 types.d.ts 中导出，不是实验性 API。
3. **官方未接入的原因可解释**：官方的设计目标是“轻量、离线、不拥有权限”，不是“平台不支持”。
4. **实现成本可控**：每个 hook 的核心逻辑 < 50 行，总共 ~370 行纯逻辑代码。
5. **可独立开关**：每个 hook 有单独配置开关，用户可按需启用。

## 不做的事和原因

| 不做 | 原因 |
|------|------|
| `SubagentStop` 拆解 | 当前用 `tool_call` capsule 注入已覆盖子 agent 治理需求 |
| 通用权限系统 | 那是 `pi-permission-system` 的职责，不越界 |
| 记忆插件适配 | 上游也没做，且引入记忆插件会大幅扩大实现面 |
| `PreResponse` 强制 Banner | PI 平台不支持，做了也是 workaround |
| 反馈收集/上报 | 上游的 `stop-feedback.sh` 涉及网络上报，与“离线优先”原则冲突 |
