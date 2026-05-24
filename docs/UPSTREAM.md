# PUA 上游同步策略

PI 版 PUA 是 `tanweai/pua` 的 adapter，不是独立 fork。同步策略必须明确“跟随哪个上游基线”和“哪些内容可自动同步”。

## 上游来源

| 来源 | 用途 |
|------|------|
| `tanweai/pua` GitHub repo | PUA 主协议、Claude Code plugin、Codex skill、references |
| GitHub latest release | 默认稳定同步基线 |
| `main` branch | 观察最新变更，不作为默认同步目标 |

本次调研时，GitHub latest release 为 `v3.2.1`，但 `main` 中 Claude plugin metadata 已出现更高版本。后续脚本应动态解析 latest release，避免把这个版本号写死为永久事实。

## 上游能力核验

上游 `tanweai/pua` 的核心实现不是“接入外部能力插件后强化 PUA”，而是把同一套 PUA 协议分发到不同宿主：

| 上游形态 | 已核验事实 | 对 PI adapter 的含义 |
|----------|------------|----------------------|
| Claude Code plugin | 通过 hooks 做 `UserPromptSubmit`、`PostToolUse`、`PreCompact`、`SessionStart`、`Stop`、`SubagentStop` 注入和状态恢复 | PI 只能映射已有 lifecycle；不能把 Claude hook 能力写成 PI 已实现能力 |
| Codex skill | `codex/pua/SKILL.md` 是单文件 skill，依赖宿主已有搜索、读文件、命令等工具 | PI 版 prompt 可以借鉴行为协议，但不能假设 Codex skill 自带工具 |
| Google Antigravity / Hermes / Kimi 等 | 主要是按目标宿主放置 `SKILL.md` | 这是 skill 分发，不是为 PUA 额外接一层外部插件 |
| 状态持久化 | 上游使用 `~/.pua/config.json`、`~/.pua/builder-journal.md`、`~/.pua/evolution.md`、`.claude/pua-loop-history.jsonl` 等本地文件语义 | PI 版可以保留本地状态文件映射，不需要引入外部记忆插件 |
| 记忆相关字样 | 上游文档提到“项目级记忆”“失败记忆”“auto memory 互补”，但没有依赖 `pi-hermes-memory`、`@samfp/pi-memory` 这类外部记忆插件 | 当前 PI 版不做记忆插件适配；若未来要做，必须另立需求和契约 |

结论：PI 版 PUA 的对齐目标是“复刻上游 PUA 协议和可映射的 hook 状态”，不是额外引入记忆插件、权限插件或搜索插件来替 PUA 扩权。

## 默认基线

默认策略：

- 同步稳定 release。
- 只有显式传入 `--ref main` 或指定 ref 时才追 main。
- 下载失败时不覆盖本地 references。
- 本地 PI adapter 特有文件不被上游覆盖。

原因：

- `main` 可能领先 release，但也可能包含未发布协议变更。
- PI adapter 需要保持可回归、可解释的基线。
- release tag 更适合用户安装和问题复现。

## 可自动同步的内容

可从上游 `skills/pua/references/` 同步：

| 文件 | 用途 |
|------|------|
| `flavors.md` | 味道文化和关键词 |
| `methodology-{key}.md` | 各 flavor 的方法论正文 |
| `methodology-router.md` | 任务类型到 flavor 的路由说明 |
| `display-protocol.md` | 输出展示协议 |
| 其他 references | 仅在 loader 或 docs 明确使用时同步 |

不应自动覆盖：

| 文件 | 原因 |
|------|------|
| `pressure-prompts.md` | 当前 PI extension 有本地 fallback 和解析约束 |
| `behavior-protocol.md` | PI 需要能力感知裁剪，上游文本不能无条件覆盖 |
| `index.ts` | PI adapter 运行时逻辑 |
| `docs/*` | 本 adapter 的设计和能力说明 |

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

## 与 PI adapter 的关系

`references_loader.ts` 的优先级应保持：

1. 用户已安装的 `pua` skill references。
2. PI adapter 本地 fallback。

当 references 缺失时，PUA 仍应可启动，但 `/pua-status` 后续应显示“使用 fallback”，避免用户误以为已完整跟随上游。
