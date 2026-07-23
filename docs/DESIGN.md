# PI PUA Adapter 设计

本文记录 PI 版 PUA 的内部设计。用户安装和运行说明见 `../INSTALL.md`,能力矩阵见 `CAPABILITIES.md`,上游同步策略见 `UPSTREAM.md`,4 hook 增强的决策依据见 [`plans/enhance-4-hooks-rationale.md`](./plans/enhance-4-hooks-rationale.md)。

## 设计哲学

本模块的定位是 **PI 生态中 PUA 行为协议的完整 runtime 实现**,不是官方 `@tanweai/pi-pua` 的 fork 或补丁。

官方 PI 适配(`@tanweai/pi-pua` v3.4.6)是一个 ~100 行的最小占位符,只做 prompt 注入和基础计数。本模块在此基础上提供:

1. **完整味道系统**:13 种 methodology + 路由 + Banner 协议 + 失败切换链。
2. **能力感知**:按 PI active tools 正向增强,不假设不可见工具。
3. **主动约束**:通过 `tool_call` block、`input` 挫败检测、`turn_end` 原地打转检测、`session_before_compact` 状态保存,将 PUA 从"建议"升级为"约束"。
4. **子 agent 治理**:通过 `tool_call` capsule 注入确保子 agent 继承 PUA 约束。

与官方的关系:**替代而非叠加**。两个扩展不能共存(命令和 hook 冲突),本模块完整覆盖官方功能并大幅扩展。

## 目标与非目标

目标:

- 作为 `tanweai/pua` 的 PI adapter,对标 Claude Code PUA 插件的完整 hook 能力矩阵。
- 利用 PI extension lifecycle 全部可用事件,实现从 prompt 注入到行为约束的完整闭环。
- 根据当前 active tools 和 loaded skills 做能力状态观测与正向增强,避免把外部插件能力写成 PUA 自身能力。
- 通过 `input`、`tool_call`、`turn_end`(原地打转)、`session_before_compact` 实现主动行为检测与约束。

非目标:

- 不把 web search、MCP、PowerShell、subagent 等外部插件能力写成 PUA 自带能力。
- 不做通用权限系统(那是 `pi-permission-system` 的职责);只做 PUA 视角的轻量四权分立。
- 不在设计文档中保存本机环境快照、用户目录绝对路径、token、账号或私有配置。
- 不承诺 PI 目前没有的 `PreResponse` 能力;自然语言最终输出仍只能通过 prompt 约束提高遵守率。

## 平台机制对照

PUA 在不同宿主上的落地能力由宿主扩展机制决定,不能把一个平台的 hook 能力直接映射到另一个平台。

| 维度 | Claude Code | Codex | PI |
|------|-------------|-------|----|
| 扩展形态 | plugin + hooks + skills | skill-only | TypeScript extension + skills + package resources |
| 默认触发 | 可通过 plugin lifecycle 做 always-on 注入 | 无原生 always-on,主要依赖 skill 触发 | 可在 `before_agent_start` 拼接 system prompt |
| skill / references 来源 | 插件可携带 skill 和 references | skill 文件本身是主要载体 | extension 可读取本地 skill references,也可自带 fallback |
| 会话启动点 | `SessionStart` | 无等价 hook | `session_start` |
| Agent 启动前改 prompt | 通过 hook 追加上下文 | 无等价 hook | `before_agent_start` 可返回新 system prompt |
| 工具执行前 | hooks 可做部分 pre-tool 控制 | 无 | `tool_call` 可 block 或修改 input |
| 工具执行后 | `PostToolUse` 可观察结果 | 无 | `tool_result` 可观察工具结果 |
| 最终自然语言响应前 | 可通过 prompt/hook 组合增强约束,具体能力取决于宿主版本 | 无 | 无等价 `PreResponse`,只能通过 prompt 提高遵守率 |
| 当前可见能力读取 | 取决于 Claude Code hook 上下文 | 无结构化 runtime tool 列表 | `systemPromptOptions` / `pi.getActiveTools()` / `pi.getAllTools()` |
| 外部插件协作 | 依赖 Claude Code 插件生态 | 依赖用户显式安装/触发 skill | package、extension、MCP adapter、skills 可组合 |
| 状态持久化 | plugin 可读写本地状态 | skill 本身无可靠 runtime 状态 hook | extension 可读写本地状态文件 |
| 对 PUA 的适配价值 | 最接近上游 plugin 语义 | 适合手动触发压力 skill | 最适合做能力感知 adapter,但必须区分"PI 支持"和"PUA 已实现" |

PI 机制进一步拆分如下:

| PI 机制 | PI 是否支持 | PUA 当前是否接入 | PUA 当前用途或限制 |
|---------|-------------|------------------|---------------------|
| `session_start` | 是 | 是 | 恢复 `always_on`、失败计数、PI 私有状态 |
| `before_agent_start` | 是 | 是 | 注入 behavior protocol、正向能力增强和 L1-L4 pressure prompt |
| `tool_result` | 是 | 是 | 根据失败结果更新 `.failure_count` |
| `tool_call` | 是 | 是 | 仅用于给子 agent prompt 注入 PUA capsule;不拦截、不确认、不授权工具 |
| `systemPromptOptions.selectedTools` | 是 | 是 | 用于能力状态观测与正向增强 |
| `systemPromptOptions.skills` | 是 | 是 | 用于判断 loaded skills;本地 skill 目录嗅探仍用于 PUA skill 缺失保护 |
| `pi.getActiveTools()` | 是 | 是 | 作为 active tools 兜底来源 |
| `pi.getAllTools()` | 是 | 是 | 仅用于给已可见工具补充 source metadata,避免把完整注册表误判为 active tools |
| `registerCommand` | 是 | 是 | 注册 `/pua-on`、`/pua-off`、`/pua-status`、`/pua-reset` |
| `registerTool` | 是 | 否 | PUA 当前不向模型新增任何 tool |
| `ctx.ui.notify` | 是 | 是 | 展示开关、压力升级、skill 缺失提示 |
| `ctx.ui.select/input/confirm` | 是 | 否 | 可用于未来交互确认;当前不做用户决策 gate |

旧文档中"PI 缺少事前工具拦截能力"的结论已经过时。当前 PI 提供 `tool_call` 事件,可在工具执行前 block 或修改 input。PI 仍没有等价 `PreResponse` 的最终自然语言响应拦截点。

这里的 `tool_call` 是 PI 平台能力。当前 `index.ts` 只使用它做子 agent prompt 装饰,不做通用权限或安全 gate。

## 当前实现

`index.ts` 当前负责:

- `session_start`:读取 PUA 配置、官方失败计数和 PI 私有状态。
- `/pua-on`:写入 `always_on=true` 并立即恢复注入。
- `/pua-off`:写入 `always_on=false` 并关闭反馈频率。
- `/pua-status`:显示开关、失败计数、压力等级、味道、skill、references、状态路径和能力摘要。
- `/pua-reset`:清零失败计数和注入等级。
- `tool_result`:分层识别工具失败,仅对执行类工具累计失败计数;执行类工具成功后清零。
- `tool_call`:当子 agent 工具可见且被调用时,为 prompt 类字段注入 PUA capsule。
- `before_agent_start`:检查 skill 是否存在,注入 behavior protocol、正向能力增强和 L1-L4 pressure prompt。

`references_loader.ts` 当前负责:

- 发现 `pua` skill 目录。
- 优先读取 skill 的 `references/`。
- 缺失 references 时使用内置 fallback。
- 加载 flavor、methodology、pressure prompt、behavior protocol。

## 失败检测设计

### 上游对标

上游官方 Claude Code 实现的 `failure-detector.sh` **仅对 Bash 工具**触发(`hooks.json` 用 `"matcher": "Bash"` 过滤,脚本内又二次检查 tool_name)。原因:只有 shell 命令失败才可靠表示"agent 尝试执行动作并失败"。

官方轻量 PI 扩展对所有 tool_result 触发,但它只注入 5 条简化契约,压力系统很弱,过度触发影响不大。

### 问题

pi-pua-x 拥有完整 L1-L4 压力升级,如果对所有 tool_result 触发,会导致:

- `read` 文件不存在(探索性行为)→ 误计入失败
- `web_search` 网络超时(外部因素)→ 误计入失败
- `edit` oldText 不匹配(常规重试)→ 误计入失败
- 任何非失败的 tool_result(含 read、search)还会误清零计数

效果:压力信号被噪声淘没,真正卡住时反而因中间插入的探索操作而清零。

### 分层策略

将工具分为三层,只有前两层参与失败计数和成功清零:

| 层级 | 工具 | 失败时 | 成功时 | 语义 |
|------|------|--------|--------|------|
| 执行层 | `bash`, `powershell`, `shell`, `pwsh-start-job` | +1 失败计数 | 清零 | agent 尝试执行动作 |
| 写入层 | `edit`, `write` | +1(仅 isError=true 且非 oldText 匹配类错误) | 清零 | agent 尝试修改代码 |
| 探索层 | `read`, `web_search`, `code_search`, `fetch_content`, `mcp`, `subagent`, `ask_user`, `pwsh-get-job`, `pwsh-get-job-output` 等 | 不计入 | 不清零 | 信息收集 / 外部系统 |

### 清零逻辑的取舍

上游 Claude Code 实现的清零语义是"任何一次 Bash 成功即清零"。本项目扩展为"执行层或写入层成功即清零"。以下是各层清零决策的理由:

**执行层成功清零:✅ 合理**

一次 bash/powershell 成功表示 agent 找到了可执行的路径,连续失败链已断。即使是 `echo hello` 这样的简单命令,也说明 agent 在主动尝试不同的东西。与上游语义一致。

**写入层成功清零:✅ 合理(有条件)**

一次成功的 edit/write 表示 agent 已经切换了方案并落地了代码变更。这本身就是"换思路"的信号。

潜在风险:agent 可能在"失败 bash → 改代码 → 失败 bash → 改代码"的循环中永远达不到 L2。但这个场景由 `enforcement.ts` 的原地打转检测(`turn_end` hook + `CommandHistory`)负责捕获,不需要失败计数器重复覆盖。

**探索层不参与清零:✅ 关键改进**

这是与上游官方轻量 PI 扩展的核心差异。场景:

```
agent bash 失败 3 次(L2)→ read 了一个文件(成功)→ bash 再次失败
```

- 旧逻辑:read 成功清零 → 第 4 次 bash 失败只算第 1 次 → 压力消失
- 新逻辑:read 对计数器不可见 → 第 4 次 bash 失败正确累加为第 4 次(L3)

信息收集与执行进展是正交的。agent 读文件、搜索文档不代表它"解决了问题",不应释放压力。

### 两套检测的分工

| 检测机制 | 负责 | 位置 |
|----------|------|------|
| 失败计数器 | 连续执行失败,无任何进展 | `index.ts` tool_result |
| 原地打转检测 | 重复相似命令(即使中间有成功) | `enforcement.ts` turn_end + CommandHistory |

两者互补：计数器捕获“卡死”，打转检测捕获“旋转”。

### 关于“空口完成检测”的设计决策

上游 Claude Code PUA 的 "Close the Loop" 红线（“声称完成但未运行验证命令 = 欺诈”）是**纯协议层约束**——写在注入的 prompt 中，靠模型语义理解自觉遵守。上游**没有**任何运行时 hook 来检测模型是否真的跑了验证命令。

pi-pua-x 曾尝试通过 `turn_end` hook 做运行时空口完成检测（匹配“done/完成/搞定”类关键词 + 检查本轮是否有 shell 工具调用），但评估后放弃，原因：

1. **误触发率高**：PUA 协议本身要求模型输出 Banner/旁白，这些文本天然包含“完成/done”类词汇，检测器打自己人。
2. **语义理解不足**：关键词匹配无法区分“我修好了”（真正的完成声明）和“Sprint 启动”（正常协议输出）。
3. **上下文盲区**：纯探索任务（读文件、搜索）不需要 shell 验证，但检测器无法区分任务类型。
4. **上游已验证协议层有效**：纯 prompt 约束对强模型已足够有效，运行时检测的边际收益不足以覆盖误触发代价。

因此，`turn_end` hook 只保留**原地打转检测**（基于 `CommandHistory` 的重复命令检测），不做空口完成检测。“Close the Loop” 红线由协议文本（skill 中的 PUA 行为协议）约束。

### 设计决策

1. **执行层含 `powershell`**:Windows 平台 `bash` 可能不可用(无 Git Bash),`powershell` 是主 shell。上游 Claude Code 的 "Bash" 在各平台上都是统一的 shell 入口,PI 需要显式列举多个 shell 工具名。
2. **写入层排除 oldText 匹配错误**:`edit` 工具的 "Could not find oldText" 是常规重试,不代表 agent 卡住。只有真正的写入失败(权限、路径不存在等)才计入。
3. **探索层完全透明**:不参与计数也不参与清零,对压力系统不可见。
4. **去抖动改为命令骨架匹配**:相同命令骨架 3 秒内只计一次,不同命令的连续失败应该正常累加。

### PI bash 工具的平台差异

PI 的 `bash` 工具在 Windows 上有以下已知问题:

| 问题 | 说明 |
|------|------|
| 搜索顺序固定 | 先查 `%ProgramFiles%\Git\bin\bash.exe` 和 `%ProgramFiles(x86)%\Git\bin\bash.exe`,然后用 `where bash.exe` 搜索 PATH |
| 全部失败则报错 | 返回 "No bash shell found" 错误,不会回退到 cmd 或 powershell |
| 错误信息误导 | 报错只列出硬编码路径,未提及已尝试 PATH 搜索,用户以为"没搜 PATH" |
| Scoop 等非标准安装 | 若 Scoop 的 Git bash 不在 PATH 中(如仅在 shim 目录),`where bash.exe` 可能找不到实际二进制 |
| 需手动配置 | 用户可在 `settings.json` 中设置 `shellPath` 指定任意 bash 路径 |
| 与 powershell 工具不互斥 | 两者可共存,bash 不可用时模型会自动转用 powershell |

**对失败检测的影响**:

- 如果只监听 `bash` 工具(像上游 Claude Code),Windows 用户的 PUA 压力系统可能形同虚设--若 bash 不可用,所有执行都走 `powershell`,失败永远不会被计入。
- `bash` 工具不可用时的报错本身也触发 `tool_result` 事件(isError=true),这类"工具本身不可用"的失败不应计入压力(agent 没有错,是环境缺失)。
- `@marcfargas/pi-powershell` 提供的 `powershell` 工具是 Windows 上的实际主 shell,必须纳入执行层。
- `@aliou/pi-processes` 提供的 `pwsh-start-job` 是启动后台进程的入口,启动失败应计入;但 `pwsh-get-job`、`pwsh-get-job-output` 只是状态查询,属于探索层。

### 与上游的偏差说明

- 上游只计 Bash,pi-pua-x 额外计入 powershell、write、edit(有条件)。原因:PI 的工具颗粒度更细,写入失败同样表示 agent 实施方案受阻。
- 上游无平台差异问题(Claude Code 的 Bash 工具跨平台统一),PI 需要显式处理 Windows 上的 powershell 工具。

## 已验证边界

当前 `index.ts` 不包含以下能力:

- 不调用 `pi.registerTool()`,因此不向模型新增任何工具。
- `tool_call` 子 agent 装饰只修改子 agent prompt,不拦截、不确认、不授权任何工具调用。
- `tool_call` 四权分立只在 `enforcement_level="enforce"` 时硬 block;默认 `suggest` 模式下仅通知不阻止(对齐上游"弹确认"语义)。
- 不读取或执行外部插件配置来做权限判断。
- 不屏蔽 shell、PowerShell、MCP、web search 或子任务工具。
- 不实现危险命令确认、目录沙箱、allowlist、denylist 或用户确认 gate。
- 不接入外部持久化记忆插件;当前只写入配置、失败计数和 PI 扩展私有状态。

这些能力只能由 PI 启动参数、其他 PI 插件、MCP 配置或后续单独实现提供。

## 能力状态设计

当前实现按需构建 `CapabilitySnapshot`,供 `/pua-status` 展示本轮可见工具状态,并供 `before_agent_start` 生成正向能力增强提示。快照不会把未采到的工具转成缺失工具指令。

能力快照在扩展实例内只采集一次;用户通过 `/reload` 重新加载扩展后,模块状态自然清空并重新采集。这样避免每次 agent 启动重复探测工具列表,也避免在工具集合未变化时产生不一致状态。

建议契约:

```ts
interface CapabilitySnapshot {
  tools: string[];
  skills: string[];
  hasRead: boolean;
  hasShell: boolean;
  hasWrite: boolean;
  hasWebSearch: boolean;
  hasFetchContent: boolean;
  hasMcpProxy: boolean;
  hasMcpDirectTools: boolean;
  hasPowerShell: boolean;
  hasBackgroundJobs: boolean;
  hasSubagents: boolean;
  hasPlan: boolean;
  hasAskUser: boolean;
  visibilityNotes: string[];
}
```

字段来源:

- 优先读取 `event.systemPromptOptions.selectedTools`。
- `event.systemPromptOptions.toolSnippets` 可用于判断 tool 是否在 prompt 中可见。
- `event.systemPromptOptions.skills` 可用于判断 loaded skills。
- `pi.getActiveTools()` 可作为兜底来源。
- `pi.getAllTools()` 只给 selected/active/snippets 中已经可见的工具补充 MCP source metadata;完整注册表中的隐藏工具不能参与可见能力判定。
- 如果没有采到任何可见工具来源,只记录"能力状态未采集";不得推断 `read`、`write`、`bash` 等 PI 基础工具缺失。

增强输出:

- `buildCapabilityEnhancementPrompt(snapshot)`:只为已可见能力生成 PUA 使用约束;没有正向能力时返回空字符串。
- `decorateSubagentInput(input, context)`:在子 agent 工具输入的 prompt/message/instructions 等字段上追加 `[PUA-SUBAGENT-INJECTED]` capsule,并保持幂等。

工具分类建议:

| 字段 | 判定 |
|------|------|
| `hasRead` | active tools 包含 `read` |
| `hasShell` | active tools 包含 `bash` 或 `powershell` |
| `hasWrite` | active tools 包含 `edit` 或 `write` |
| `hasWebSearch` | active tools 包含 `web_search` 或 `code_search` |
| `hasFetchContent` | active tools 包含 `fetch_content` 或 `get_search_content` |
| `hasMcpProxy` | active tools 包含 `mcp` |
| `hasMcpDirectTools` | active tools 中存在 MCP adapter 注册的 direct tools;实现时应基于 source metadata 或命名前缀谨慎判断 |
| `hasPowerShell` | active tools 包含 `powershell` |
| `hasBackgroundJobs` | active tools 包含 `pwsh-start-job` 或 PI background task tool |
| `hasSubagents` | active tools 包含 `subagent` |
| `hasPlan` | active tools 包含 `set_plan`、`task_agents` 或 `steer_task_agent` |
| `hasAskUser` | active tools 包含 `ask_user` 或 `request_user_input` |

## 注入策略

`before_agent_start` 注入顺序固定:

1. PUA behavior protocol。
2. 已可见能力的正向增强提示。
3. 按失败计数叠加 L1-L4 pressure prompt。

当前唯一的拒绝分支是 pua skill 缺失保护:`before_agent_start` 会关闭注入并提示安装。该分支与工具能力无关,不把基础工具、外部插件或完整工具注册表作为成败条件。

## `tool_call` 子 agent 注入

当前 PUA 接入 `tool_call` 的唯一用途是把上游"Sub-agent 也不养闲"规则映射到 PI 子 agent 工具调用。

处理规则:

- 仅当 PUA 开启、子 agent 工具可见、当前 tool name 属于子 agent/任务 agent 入口时处理。
- 原地修改 `event.input`、`event.args` 或 `event.arguments` 中的 prompt 类字段。
- 注入内容使用 `[PUA-SUBAGENT-INJECTED]` sentinel,避免重复注入。
- capsule 包含当前 flavor、失败计数、压力等级、三条红线和验证闭环要求。

## 未来可选:通用 `tool_call` 拦截

PI 的 `tool_call` 也可用于后续实现强约束,但不属于当前已实现能力。如需后续实现,建议只屏蔽确定不可执行或高风险的行为,避免把 prompt 风格要求变成脆弱的格式校验:

- 当 PUA 被关闭时,不处理 `tool_call`。
- 当 active tools 缺失某类能力时,理论上模型不会调用对应 tool;若仍发生,返回 `{ block: true, reason }`。
- 对危险命令只做轻量拦截或转交外部权限插件;仓库级危险操作确认仍以宿主 AGENTS 规则为准。
- 不尝试用 `tool_call` 强制"先输出 banner 再调用工具",因为 PI 没有最终响应拦截点,且 session 文本判断容易误伤。

## 状态与命令设计

`/pua-status` 当前展示:

- 开关状态。
- 失败计数和压力等级。
- 当前 flavor。
- pua skill 是否已加载。
- references 是否来自 skill 或 fallback。
- 当前可见工具能力摘要。
- 可见性来源说明。
- 当前模型标识、是否在禁用列表中、禁用规则列表。

## 模型粒度开关（v0.4.0）

### 配置

`~/.pua/config.json` 中新增 `disabled_models` 数组:

```json
{
  "disabled_models": [
    "anthropic/claude-opus-*",
    "anthropic/claude-sonnet-4*"
  ]
}
```

### 匹配逻辑

使用经典通配符匹配算法（`model_rules.ts` 中的 `matchModelPattern`），支持 `*` 匹配任意字符。
模型标识格式为 `{provider}/{id}`（如 `anthropic/claude-opus-4-20250514`）。不依赖第三方库。

### 执行链路

1. `before_agent_start` 入口时通过 `ctx.model` 获取当前模型标识。
2. 若匹配任一 `disabled_models` 模式，设置 `state.modelDisabled = true`。
3. 跳过 PUA 协议注入（不拼 behaviorProtocol 到 system prompt）。
4. 所有 hook（`tool_result`、`tool_call`、`input`、`turn_end`、`session_before_compact`）在入口处检查 `state.modelDisabled`，命中则直接 return。
5. 下次 `before_agent_start` 重新检测，模型变化自动跟随。

### 命令

- `/pua-model list` — 列出当前禁用模式。
- `/pua-model add <pattern>` — 添加禁用模式。
- `/pua-model remove <pattern>` — 移除禁用模式。

### 与全局开关的关系

- 全局 `always_on` 仍控制 PUA 整体启用/禁用。
- `disabled_models` 在 `always_on=true` 的前提下才生效。
- 两者是 AND 关系：只有全局开 + 模型不在禁用列表，PUA 才完全生效。

后续可新增 `/pua-flavor <key>`:

- 支持上游 13 种 flavor key。
- 接受 `musk` 并映射到 `tesla` methodology。
- 写入 `~/.pua/config.json` 的 `flavor` 字段。
- 切换后立即 rebuild protocol。

## 验证要求

文档或实现变更后至少运行:

```bash
rg "pua\\.md" .
npm run lint
```

涉及真实 PI 行为时,显式运行对应 `pua.ittest.*`。这些脚本会消耗真实 AI token,不进入默认批量回归。

