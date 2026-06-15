# PUA 上游同步与能力对比

PI 版 PUA 是 `tanweai/pua` 的 adapter，不是独立 fork。本文档记录上游能力边界、本项目实现状态，以及两者的映射关系。

## 上游来源

| 来源 | 用途 |
|------|------|
| `tanweai/pua` GitHub repo | PUA 主协议、官方 Claude Code 实现、官方 PI 扩展、references |
| GitHub latest release | 默认稳定同步基线（调研时 v3.4.6；2026-06 对照 v3.5.0） |
| `main` branch | 观察最新变更，不作为默认同步目标 |

## 上游双形态

上游在仓库中提供了两种官方 PI 实现：

| 形态 | 路径 | 复杂度 | 说明 |
|------|------|--------|------|
| 官方轻量 PI 扩展 | `pi/pua/index.ts` + `pi/package/` | ~130 行 | 只有基础 4 命令 + tool_result 失败检测 + 简化 behavior prompt |
| 官方 Claude Code 实现 | `hooks/` + `commands/` + `skills/` | ~2000+ 行 bash/python | 完整 7 hook + 18 command + integrity guard + loop + feedback |

两者都是 `tanweai/pua` 官方维护，面向不同宿主平台。

本项目（pi-pua-x）的对标目标是 **官方 Claude Code 实现的完整能力**，在 PI 扩展 API 约束下做等价映射。

## 上游官方 Claude Code 实现完整 Hook 清单

| Hook 事件 | 脚本 | 功能 |
|-----------|------|------|
| `SessionStart` | `session-restore.sh` | always_on 时注入完整行为协议（三条红线、方法论路由、味道、压力升级、反合理化表、Harness Integrity、Multi-Agent Governance Topology）；恢复 builder-journal 压缩状态 |
| `SessionStart` | `sanitize-session.sh` | 会话清理（新增 hook） |
| `SessionStart` | `heartbeat.sh` | 静默心跳上报（telemetry，best-effort，无 stdout） |
| `UserPromptSubmit` | `frustration-trigger.sh` | 匹配用户挫败关键词（中英文），注入 L1+ 压力上下文 |
| `PostToolUse` (Bash) | `failure-detector.sh` | 检测 bash exit code / stderr 错误，累加 .failure_count，输出 L1–L4 压力提示 |
| `PreToolUse` | `integrity-guard.sh` | 四权分立：拦截对 tests/evals/CI/secrets/hidden solutions 的写入或读取，deny 返回 permissionDecision 弹确认让用户选择，advisory 注入 additionalContext |
| `PreCompact` | (inline prompt) | 要求模型将 PUA 运行时状态写入 builder-journal.md |
| `Stop` | `pua-loop-hook.sh` | PUA loop 持续执行模式：阻止退出、验证 promise、反馈循环 |
| `Stop` | `stop-feedback.sh` | 会话结束时收集用户反馈并可选上传 |
| `SubagentStop` | `subagent-teardown.sh` | 子 agent 完成时写 teardown.jsonl 记录，从 active-agents.json 移除 |

## 上游官方 Claude Code 实现命令清单

| 命令 | 功能 |
|------|------|
| `/pua` | 手动触发 PUA 压力 |
| `/pua:on` | 启用 always_on |
| `/pua:off` | 关闭 always_on |
| `/pua:flavor` | 切换味道 |
| `/pua:p7` `/pua:p9` `/pua:p10` | 切换角色等级 |
| `/pua:pro` | 进入 pro 模式 |
| `/pua:mama` | 妈妈模式 |
| `/pua:kpi` | KPI 考核模式 |
| `/pua:yes` | 确认/同意 |
| `/pua:offline` | 离线模式 |
| `/pua:survey` | 用户调研 |
| `/pua:pua-loop` | 启动持续执行循环 |
| `/pua:cancel-pua-loop` | 取消循环 |
| `/pua:team-status` | 查看 agent 团队状态 |
| `/pua:reap-orphans` | 清理孤儿 agent |
| `/pua:teardown-all` | 终止所有子 agent |

## 上游状态文件

| 文件 | 用途 |
|------|------|
| `~/.pua/config.json` | 主配置（always_on、flavor、offline、feedback_frequency） |
| `~/.pua/.failure_count` | 连续失败计数 |
| `~/.pua/.failure_session` | 当前会话 ID（跨会话重置计数） |
| `~/.pua/builder-journal.md` | 压缩前状态快照 |
| `~/.pua/.stop_counter` | 反馈收集计数器 |
| `~/.claude/pua/teardown.jsonl` | 子 agent teardown 记录 |
| `~/.claude/pua/active-agents.json` | 活跃子 agent 清单 |

## 能力对比表（上游官方 Claude Code vs 上游官方 PI vs pi-pua-x）

| 能力 | 上游官方 Claude Code | 上游官方 PI (`pi/pua/index.ts`) | pi-pua-x | 状态说明 |
|------|:---:|:---:|:---:|------|
| **基础命令** | | | | |
| /pua-on, /pua-off | ✅ | ✅ | ✅ | 对齐 |
| /pua-status | ✅ | ✅ | ✅ | pi-pua-x 增加了能力状态展示 |
| /pua-reset | ✅ | ✅ | ✅ | 对齐 |
| /pua:flavor 切换 | ✅ | ✖ | ✖ | 未实现（通过手动改 config.json） |
| /pua:pua-loop | ✅ | ✖ | ✖ | 未实现 |
| /pua:team-status | ✅ | ✖ | ✖ | 未实现 |
| /pua:mama, /pua:kpi, /pua:pro | ✅ | ✖ | ✖ | 未实现 |
| **失败检测与压力升级** | | | | |
| tool_result 失败检测 | ✅ PostToolUse | ✅ tool_result | ✅ tool_result | 对齐 |
| 连续失败计数 + 成功清零 | ✅ | ✅ | ✅ | 对齐 |
| L1–L4 压力分级 | ✅ | ✅（简化） | ✅（完整） | pi-pua-x 加载 references 中的完整压力提示 |
| 3秒去抖动 | ✖ | ✖ | ✅ | PI adapter 原创 |
| 模式感知失败分析 (SPINNING/EXPLORING/MIXED) | ✅ failure-detector.sh v2 | ✖ | ✅ | 对齐上游 82b8efc6；pi 在 before_agent_start 注入模式块 |
| 突破降压 (de-escalation 奖励端) | ✅ failure-detector.sh v2 | ✖ | ✅ | 对齐上游 82b8efc6；连续失败≥3 后成功注入味道认可话术并归零压力 |
| 深层换框协议 (换视角/抽象层/约束) | ✅ de-escalation-protocol.md | ✖ | ✅（references 同步） | runtime 提供 failure_count + pattern，换框文本由 skill 层读取 |
| **行为协议注入** | | | | |
| 三条红线 | ✅ session-restore.sh | ✖（简化 5 条契约） | ✅ | 对标官方 Claude Code 实现 |
| Harness Integrity 声明 | ✅ session-restore.sh | ✖ | ✖ | 待补齐：上游在协议注入中包含独立段落 |
| Multi-Agent Governance Topology | ✅ session-restore.sh | ✖ | ✖ | 待补齐：4 角色分工声明 |
| 方法论路由器 | ✅ session-restore.sh | ✖ | ✅ | 对标官方 Claude Code 实现 |
| 味道系统 + 切换链 | ✅（15 味道含 Microsoft） | ✖（只读 config） | ✅（14 味道，含 Microsoft） | 已补齐 Microsoft 味道（2026-06） |
| 反合理化表 | ✅ | ✖ | ✅ | 对标官方 Claude Code 实现 |
| 旁白协议 | ✅ display-protocol.md | ✖ | ✅ | 对标官方 Claude Code 实现 |
| references 加载 | ✅ skill references/ | ✖ | ✅ | 对标官方 Claude Code 实现 |
| **主动约束层** | | | | |
| 用户挫败检测 | ✅ frustration-trigger.sh | ✖ | ✅ | 对标官方 Claude Code 实现的 UserPromptSubmit |
| 四权分立 (integrity guard) | ✅ integrity-guard.sh | ✖ | ✅（覆盖面较小） | 对标官方 Claude Code 实现的 PreToolUse；上游覆盖 8 类工具 + Web 污染检测，pi-pua-x 仅覆盖 edit/write/bash，缺 Read/WebSearch 保护 |
| 压缩前状态保存 | ✅ PreCompact prompt | ✖ | ✅ | 对标官方 Claude Code 实现的 PreCompact |
| 空口完成检测 | ✅（纯协议文本级） | ✖ | ✅（纯协议文本级） | 与上游一致：纯靠 prompt 约束。曾尝试运行时 turn_end 检测，因误触发率高且边际收益不足而移除（见 DESIGN.md） |
| 重复命令检测 | ✅（协议文本级） | ✖ | ✅（运行时检测） | 同上，上游只在文本中描述，pi-pua-x 做了实际拦截 |
| **子 Agent 管理** | | | | |
| 子 agent teardown 记录 | ✅ subagent-teardown.sh | ✖ | ✖ | 未实现 |
| 子 agent PUA capsule 注入 | ✅（协议文本级） | ✖ | ✅ tool_call | pi-pua-x 在 tool_call 中动态注入 |
| team-status / reap-orphans | ✅ | ✖ | ✖ | 未实现 |
| **网络与遥测** | | | | |
| 心跳上报 (heartbeat) | ✅ heartbeat.sh | ✖ | ✖ | 未实现，且无计划实现 |
| 反馈收集 + 上传 | ✅ stop-feedback.sh | ✖ | ✖ | 未实现，且无计划实现 |
| PUA loop 持续执行 | ✅ pua-loop-hook.sh | ✖ | ✖ | 未实现 |
| **PI adapter 原创** | | | | |
| 能力快照 (capability snapshot) | ✖ | ✖ | ✅ | PI 原创：检测可见工具并动态调整行为 |
| 能力增强提示 (capability enhancement) | ✖ | ✖ | ✅ | PI 原创：根据可见工具生成正向约束 |
| skill 缺失自动禁用 | ✖ | ✖ | ✅ | PI 原创：未安装 pua skill 时自动关闭扩展 |

## Hook 映射关系

上游官方 Claude Code 实现使用 bash hooks 拦截各生命周期事件，PI 扩展 API 不支持相同的 hook 类型，对应关系如下：

| 上游 Hook | PI 映射 | 差异 |
|-----------|---------|------|
| `SessionStart` | `pi.on("session_start")` + `pi.on("before_agent_start")` | PI 无 additionalContext，用 systemPrompt 追加代替 |
| `UserPromptSubmit` | `pi.on("input")` | PI 的 input 事件可读取用户输入文本 |
| `PostToolUse` | `pi.on("tool_result")` | 直接对应，语义一致 |
| `PreToolUse` | `pi.on("tool_call")` | PI 支持 `{ block: true }` 返回值来阻止执行 |
| `PreCompact` | `pi.on("session_before_compact")` | 直接对应 |
| `Stop` | 无直接对应 | PI 无 session end hook；pua-loop 和 feedback 无法映射 |
| `SubagentStop` | 无直接对应 | PI 无子 agent 结束事件；用 tool_call 前置注入代替 |

## 上游 References 文件清单

可从上游 `skills/pua/references/` 目录同步的文件：

| 文件 | 用途 |
|------|------|
| `flavors.md` | 味道文化和关键词 |
| `methodology-{key}.md` | 各 flavor 的方法论正文（15 个味道，含 microsoft） |
| `methodology-router.md` | 任务类型到 flavor 的路由说明 |
| `display-protocol.md` | 输出展示协议 |
| `harness-governance.md` | Harness Integrity 治理协议（四权分立、反作弊声明） |
| `de-escalation-protocol.md` | 突破降压 + 深层换框协议（奖励端；runtime 突破检测的 skill 层补充） |
| `agent-team.md` | P7–P10 团队架构 |
| `evolution-protocol.md` | 自进化协议 |
| `p7-protocol.md` `p9-protocol.md` `p10-protocol.md` | 角色协议 |
| `platform.md` | 平台兼容性说明 |
| `survey.md` | 用户调研模板 |
| `teardown-protocol.md` | 子 agent 清理协议 |

不应自动覆盖的本地文件：

| 文件 | 原因 |
|------|------|
| `pressure-prompts.md` | PI extension 有本地 fallback 和解析约束 |
| `behavior-protocol.md` | PI 需要能力感知裁剪，上游文本不能无条件覆盖 |
| `index.ts` | PI adapter 运行时逻辑 |
| `docs/*` | 本 adapter 的设计和能力说明 |

## 同步策略

默认策略：

- 同步稳定 release，不追 main。
- 只有显式传入 `--ref main` 或指定 ref 时才追 main。
- 下载失败时不覆盖本地 references。
- 本地 PI adapter 特有文件不被上游覆盖。

原因：

- `main` 可能领先 release，但也可能包含未发布协议变更。
- PI adapter 需要保持可回归、可解释的基线。
- release tag 更适合用户安装和问题复现。

## 同步脚本责任边界

同步脚本应只做三件事：

1. 解析目标 ref。
2. 下载 references 到有效 `pua` skill 目录。
3. 报告同步结果和失败原因。

同步脚本不应：

- 修改 PI extension runtime 代码。
- 修改用户 `always_on` 或 `flavor` 配置。
- 创建不含 `SKILL.md` 的无效 skill 目录后让 loader 误以为可用。
- 静默吞掉下载失败并留下半更新状态。

## References 加载优先级

`references_loader.ts` 的优先级：

1. 用户已安装的 `pua` skill references。
2. PI adapter 本地 fallback。

当 references 缺失时，PUA 仍应可启动，但 `/pua-status` 应显示“使用 fallback”，避免用户误以为已完整跟随上游。

## PUA 自身能力边界（上游 + 本项目共同约束）

上游 `tanweai/pua` 的核心实现不是“接入外部能力插件后强化 PUA”，而是把同一套 PUA 协议分发到不同宿主（Claude Code、Codex、Cursor、Kiro、Hermes、Kimi 等）。每个宿主版本依赖宿主已有的搜索、读文件、命令等工具，PUA 本身不自带工具。

具体约束：

- PUA 不注册工具（registerTool）。
- PUA 不提供搜索、MCP、PowerShell、记忆能力；它只能读取已可见工具并追加使用约束。
- PUA 不接入 `pi-hermes-memory`、`@samfp/pi-memory` 或其他外部持久化记忆插件。上游文档提到“项目级记忆”“失败记忆”，但实现上只用本地文件（builder-journal.md、config.json），不依赖外部记忆插件。
- 四权分立只做 advisory/deny 通知，不做权限管理系统。上游 deny 语义是“弹确认让用户选择”，不是无条件阻止；pi-pua-x 通过 enforcement_level 控制力度（suggest=通知不 block，enforce=硬 block）。
- 能力快照是只读观测，不改变工具可见性或执行权限。
- 当前 PI 版不做记忆插件适配；若未来要做，必须另立需求和契约。

结论：PI 版 PUA 的对齐目标是“复刻上游 PUA 协议和可映射的 hook 状态”，不是额外引入记忆插件、权限插件或搜索插件来替 PUA 扩权。

## 已知差距（2026-05 比对）

以下是本次比对发现的待补齐项，按优先级排序：

| # | 差距 | 优先级 | 说明 |
|---|------|--------|------|
| 1 | 同步脚本缺 `harness-governance.md` + `methodology-microsoft.md` | P1 | 已修复（本次提交） |
| 2 | 行为协议模板缺 Harness Integrity 段落 | P2 | 上游在 session-restore.sh 中注入独立段落，本项目未包含 |
| 3 | 行为协议模板缺 Multi-Agent Governance Topology 段落 | P2 | 同上 |
| 4 | FLAVOR_MAP 缺 Microsoft 味道 | P2 | 已修复（2026-06）：上游“思维固化/学习停滞”场景 |
| 5 | Integrity Guard 缺 Read/Grep/WebSearch 保护 | P3 | 上游覆盖 8 类工具，本项目仅 3 类 |
| 6 | 挫败关键词覆盖面不足 | P3 | 上游 ~30+ 词，本项目 ~18 条 |
| 7 | 缺 SSH key 使用豁免逻辑 | P4 | 上游对 ssh -i 场景做了豁免 |
| 8 | 缺会话 ID 隔离（跨会话重置计数） | P4 | 上游用 .failure_session 文件实现 |

### 2026-06 比对（对照 v3.5.0）

| # | 项 | 优先级 | 说明 |
|---|------|--------|------|
| 9 | 模式感知失败分析 | P1 | 已修复（2026-06）：对齐上游 82b8efc6，`failure_analysis.ts` 实现 SPINNING/EXPLORING/MIXED 分类并注入模式块 |
| 10 | 突破降压 de-escalation（奖励端） | P1 | 已修复（2026-06）：连续失败≥3 后成功注入 `[PUA 突破 ✨]` + 14 味道认可话术；`de-escalation-protocol.md` 加入同步清单 |
| 11 | ding（钉）味道 + `/again` `/done-check` `/evidence` 命令（v3.5.0） | P3 | 待评估：ding 味道可加入 FLAVOR_MAP；命令属 skill 层（fork 不实现 skill 命令） |
| 12 | confidence loop gate（置信度门控） | P3 | 待评估：上游 45b2dd38 新协议机制，fork 未实现 |
