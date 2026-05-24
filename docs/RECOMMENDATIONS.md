# PUA 外部能力推荐组合

本文记录 PUA 迭代时可选的 PI 插件组合。它不是安装清单，也不是 PUA 当前能力说明；所有条目都必须按 `README.md` 和 `CAPABILITIES.md` 的边界理解：PUA 当前注入 prompt、记录失败状态，并对已可见能力追加正向使用约束，但不拥有外部插件能力。

## 推荐原则

- 只为明确的 PUA 行为缺口引入插件，不因为包名热门就安装。
- 同一能力优先选择一种实现，避免多个插件暴露相似 tool 后增加模型混淆。
- 推荐组合只影响 PUA“如何提示模型做事”；当前 `tool_call` 只做子 agent prompt 装饰，不变成工具拦截或权限控制。
- `@ifi/oh-pi` 这类 umbrella package 不能当成具体能力来源；必须以实际加载的子包、active tools 和 loaded skills 为准。

## 最小组合

适合在保持 PUA 当前实现边界不变的前提下，给正向能力增强提供外部能力参考，不引入复杂编排。

| 能力缺口 | 推荐插件 | 支撑 PUA 的方式 |
|----------|----------|-----------------|
| 网络搜索与网页取证 | `pi-web-access` | 失败后可提示使用搜索、URL 抓取、PDF/GitHub/YouTube 内容提取 |
| MCP 扩展入口 | `pi-mcp-adapter` | 需要外部 MCP server 时，通过 proxy 或 direct tools 扩展能力 |
| Windows 原生命令 | `@marcfargas/pi-powershell` | Windows 场景下可提示使用 PowerShell、job、session 等能力 |

这个组合只解决“能不能搜、能不能接 MCP、能不能在 Windows 下跑原生命令”。它不提供子任务、计划模式、权限边界或长期记忆。

## 开发与 ittest 基线

PUA 后续开发默认使用下面的跨平台基线组合。`pua.ittest.*` 会先检查这些 package，缺失即失败：

| 能力缺口 | 必需 package |
|----------|--------------|
| 网络搜索与内容抓取 | `pi-web-access` |
| MCP 扩展入口 | `pi-mcp-adapter` |
| 子任务拆分 | `pi-subagents` |
| 计划模式 | `@ifi/pi-plan` |
| 结构化询问 | `pi-ask-user` |

安装命令统一维护在 `../INSTALL.md`。这里不复制命令，避免推荐说明和安装入口漂移。

`@marcfargas/pi-powershell` 只在明确要验证或提示 Windows 原生 PowerShell、job、session 能力时作为可选插件使用；它不是 PUA 失败计数或能力状态逻辑的前置条件。

## 失败升级组合

适合把 PUA 从“压力 prompt”推进到“失败状态机”。

| 能力缺口 | 推荐插件 | 取舍 |
|----------|----------|------|
| 子任务拆分 | `pi-subagents` | 适合把 L2/L3 失败分给 scout、researcher、reviewer；子 agent prompt 会继承 PUA capsule，不要和另一套 subagent 插件同时启用 |
| 计划模式 | `@ifi/pi-plan` | 适合连续失败后先产出计划、再执行；属于流程能力，不是 PUA 本体 |
| 规格化落地 | `@ifi/pi-spec` | 适合需求较重或跨文件方案，成本高于普通计划模式 |
| 后台观察 | `@ifi/pi-background-tasks` | 适合长命令、服务启动、日志跟踪；和 PowerShell job 可按平台择一使用 |
| 时延诊断 | `@ifi/pi-diagnostics` | 适合判断卡住、慢响应、turn 耗时异常，不解决业务失败 |

推荐默认顺序是：先 `pi-subagents`，再按需要补 `@ifi/pi-plan`；只有长任务和时延问题真实出现时再考虑 background/diagnostics。

## 交互组合

适合让 PUA 更少自作主张。

| 能力缺口 | 推荐插件 | 支撑 PUA 的方式 |
|----------|----------|-----------------|
| 高影响歧义询问 | `pi-ask-user` | 在缺少关键决策时提示模型走结构化询问，而不是继续猜 |

## 明确决策：不适配记忆插件

当前 PUA 没有明确的持久化记忆读写需求，因此本阶段不适配 `pi-hermes-memory` 或 `@samfp/pi-memory`。这不是二选一，而是两个都不进入开发基线。

原因：

- 上游 `tanweai/pua` 主要通过 skill、hooks 和本地文件做 PUA 协议分发与状态恢复，没有用外部记忆插件强化核心 PUA。
- PI 版当前只需要短期失败计数、开关状态和 flavor 配置，本地状态文件已经覆盖。
- 记忆插件会引入额外数据模型、写入时机、隐私边界和回放语义。
- 同时适配两个记忆插件会扩大实现面；在没有明确使用场景前不符合 YAGNI。

如果未来确实要做“失败模式长期复用”，必须先明确单一目标插件、写入触发、读取优先级、隐私边界和回放语义，再进入开发基线；不要同时开发两套记忆适配。

## 不默认纳入 PUA 推荐的能力

`pi-permission-system` 属于外部安全层，不是 PUA 自身能力。它可以和 PUA 共存，但不应写成 PUA 的默认依赖或必装项。

只有在明确要实现“工具调用确认、权限 gate、危险命令拦截”时，才把权限插件纳入单独方案。否则 PUA 文档只需要说明：安全边界由 PI 启动参数、权限插件、MCP 配置或宿主规则提供。

## 文档落地边界

- 本文只记录推荐组合和取舍，不复制安装命令。
- 安装步骤统一放入 `../INSTALL.md`。
- 实现前必须回到 `DESIGN.md`，确认推荐插件的能力是否已经能从 active tools、loaded skills 或 commands 中被 PUA 可靠感知，并明确是正向提示增强还是工具调用装饰。
