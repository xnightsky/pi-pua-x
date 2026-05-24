# PI PUA 能力模型

PUA extension 不直接提供搜索、MCP、PowerShell、子任务或权限能力。当前实现注入 PUA behavior prompt、记录失败计数、管理 PUA 开关，在 `/pua-status` 中展示当前 active tools / skills 的可见状态，并对已可见能力追加正向 PUA 使用约束；本文的能力矩阵用于描述外部插件可能提供什么，以及能力感知如何避免把外部能力写成 PUA 自身能力。

> 当前边界：PUA 没有注册 tool。它接入 `tool_call` 只用于给子 agent prompt 注入 PUA capsule，不能拦截、屏蔽、确认或授权任何工具调用。

## 能力开启与屏蔽层级

PI 的能力不是单一开关，而是多层资源共同决定：

| 层级 | 控制面 | 对 PUA 能力感知的影响 |
|------|--------|---------------|
| CLI tool 层 | `--no-tools` | 关闭内置工具、extension 工具和 custom tools；PUA 只剩 prompt 注入与状态记录 |
| CLI built-in 层 | `--no-builtin-tools` | 关闭 `read`、`bash`、`edit`、`write` 等内置工具，但保留 extension/custom tools |
| CLI allowlist 层 | `--tools <list>` | 只启用 allowlist 中的 tool；同时影响内置、extension 和 custom tools |
| Extension 发现层 | `--no-extensions` | 关闭 extension discovery；显式 `-e` 路径仍可加载 |
| Skill 发现层 | `--no-skills` | 关闭 skill discovery/loading；PUA 不应假装完整 skill 协议可用 |
| Package/resource 层 | `pi config`、settings package filters | 可按 package 过滤 extensions、skills、prompts、themes |
| Extension 内部层 | 插件自己的 config | 例如 MCP direct/proxy、web provider、PowerShell session/job 开关 |
| Runtime 层 | `before_agent_start.systemPromptOptions` | 当前能力感知会读取 active tools、tool snippets、loaded skills，生成状态摘要和正向增强提示 |

## PI Package 能力矩阵

### `pi-web-access`

提供网络与内容获取能力。

| Resource | 名称 | 外部插件提供的能力 |
|----------|------|----------------|
| Tool | `web_search` | 网络搜索、多查询调研、带来源摘要 |
| Tool | `code_search` | 编程问题、API、库示例、错误排查搜索 |
| Tool | `fetch_content` | URL、GitHub repo、YouTube、PDF、本地视频内容提取 |
| Tool | `get_search_content` | 获取前一次搜索或抓取的完整内容 |
| Command | `/websearch` | 打开 web search curator |
| Command | `/curator` | 切换或配置搜索 curator workflow |
| Command | `/google-account` | 查看 Gemini Web 使用的 Google 账号 |
| Command | `/search` | 浏览已存储搜索结果 |
| Skill | `librarian` | 开源库调研工作流 |

能力观测规则：

- 只有 `web_search` 或 `code_search` 可见时，状态中才标记搜索能力。
- 只有 `fetch_content` 或 `get_search_content` 可见时，状态中才标记内容抓取能力。
- 搜索或抓取能力可见时，`before_agent_start` 会追加搜索取证约束，用于调研、排错和 L2+ 压力升级。
- 有 `web_search` 但 provider/key 不可用时，失败应进入普通工具失败计数，不把 provider 问题误判成 PUA 失效。

### `pi-mcp-adapter`

提供 MCP server 接入能力。

| Resource | 名称 | 外部插件提供的能力 |
|----------|------|----------------|
| Tool | `mcp` | 通过 proxy 搜索、列出、描述、调用 MCP server tools |
| Direct tools | 由 `directTools` 注册 | MCP tool 以一等 PI tool 暴露给模型 |
| Command | `/mcp` | MCP 面板、server 状态、工具切换 |
| Command | `/mcp-auth` | MCP OAuth 认证流程 |
| Config | `directTools` | 将指定 MCP tools 提升为直接工具 |
| Config | `excludeTools` | 对 direct/proxy/panel 同时隐藏指定工具 |
| Config | `disableProxyTool` | direct tools 可用后隐藏 `mcp` proxy tool |
| Config | `lifecycle` | `lazy`、`eager`、`keep-alive` 控制 server 生命周期 |

能力观测规则：

- 没有 `mcp` 且没有 MCP direct tools 时，状态中不标记 MCP 能力。
- 只有 `mcp` proxy 时，只标记 proxy 入口，不假设具体 server tool 已直接可见。
- 有 direct tools 时，能力观测可以把这些工具视为普通 active tools，但不应按 server 名称猜测未暴露工具。
- MCP 能力可见时，`before_agent_start` 会追加“先发现、再调用、只用可见工具”的 PUA 约束。
- `excludeTools` 或 `disableProxyTool` 生效时，以 active tools 为准。

### `@marcfargas/pi-powershell`

提供 Windows 原生 PowerShell 与后台任务能力。

| Resource | 名称 | 外部插件提供的能力 |
|----------|------|----------------|
| Tool | `powershell` | 执行 PowerShell 命令或脚本 |
| Tool | `pwsh-start-job` | 启动后台 PowerShell job |
| Tool | `pwsh-get-job` | 查询后台 job 状态 |
| Tool | `pwsh-stop-job` | 停止后台 job |
| Tool | `pwsh-remove-job` | 清理后台 job |
| Tool | `pwsh-get-job-output` | 读取后台 job 输出 |
| Tool | `pwsh-create-session` | 创建持久 PowerShell session |
| Tool | `pwsh-close-session` | 关闭 PowerShell session |
| Skill | `pi-powershell` | PowerShell 使用指导 |

能力观测规则：

- 只有 `powershell` 可见时，状态中才标记 Windows 原生 PowerShell 能力。
- 只有 `pwsh-start-job` 可见时，状态中才标记 PowerShell job 能力。
- 只有 session tools 可见时，状态中才标记远程或持久 session 能力。
- PowerShell 能力可见时，`before_agent_start` 会追加 Windows 原生验证约束。
- 不能因为当前宿主是 Windows 就推断 `@marcfargas/pi-powershell` 已安装或可见。

### `@ifi/oh-pi`

`@ifi/oh-pi` 是 umbrella/setup package，用于安装一组 PI package。它本身不等于某个具体 runtime tool。

常见子能力包括：

| 子包类别 | 典型能力 | 能力感知处理方式 |
|----------|----------|--------------|
| extensions | git-guard、scheduler、usage-tracker、background tasks、worktree 等 | 只按 active tools/commands 判断 |
| ant-colony/subagents | 多 agent、任务编排、并行执行 | 只有相关 tool/command 可见时才可要求使用 |
| plan/spec | 计划模式、spec workflow | 作为可选流程能力，不写成 PUA 自带能力 |
| prompts/skills/themes | 内容资源 | 只影响模型上下文和 UI，不等同于工具能力 |

能力观测规则：

- 不根据 `@ifi/oh-pi` 这个包名推断具体可用能力。
- 只根据 PI 当前 active tools、loaded skills 和 visible commands 做判断。

## PUA 自身能力边界

PUA extension 当前注册 command 和 hooks，不注册工具：

| 类型 | 名称 | 说明 |
|------|------|------|
| Hook | `session_start` | 恢复 `always_on`、失败计数、PI 私有状态 |
| Hook | `before_agent_start` | 注入 PUA behavior protocol、正向能力增强和压力 prompt |
| Hook | `tool_call` | 子 agent 工具调用前，为 prompt 类字段注入 PUA capsule |
| Hook | `tool_result` | 识别工具失败，更新失败计数 |
| Command | `/pua-on` | 写入 `always_on=true` |
| Command | `/pua-off` | 写入 `always_on=false` |
| Command | `/pua-status` | 显示开关、失败计数、压力等级、当前味道、skill、references、能力摘要和可见性说明 |
| Command | `/pua-reset` | 清零失败计数 |

已验证的当前边界：

- 不注册 `registerTool`。
- 不用 `tool_call` 做权限判断、危险命令确认、MCP 工具屏蔽或 shell 命令改写。
- 不接入 `pi-hermes-memory`、`@samfp/pi-memory` 或其他外部持久化记忆插件。
- 不把 `pi-web-access`、`pi-mcp-adapter`、`@marcfargas/pi-powershell` 或 `@ifi/oh-pi` 的能力复制进自身。

能力感知不改变这个边界：PUA 可以读取 active tools/skills、展示状态并追加正向使用约束；除非单独实现通用 `tool_call` 拦截，否则不能约束工具执行，也不应把未采到的基础工具写成缺失提示。

