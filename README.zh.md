# pi-pua-x

> [英文版本](./README.md) | 中文版本

[pi](https://github.com/earendil-works/pi) 的状态化 PUA 运行时扩展 —— 生命周期钩子、压力升级、能力感知增强与子代理继承。基于 [tanweai/pua](https://github.com/tanweai/pua) 构建。

## 这是什么？

`pi-pua-x` 是 pi 中 PUA 行为协议的**程序化运行时**。与依赖模型"记住"规则的静态技能文件不同，此扩展利用 pi 的生命周期钩子以确定性方式强制执行行为：

> ## ⚠️ 两个模块：本扩展只替换 **hooks**，不替换 **skill**
>
> PUA 由**两个独立模块**组成，完整体验**两者缺一不可**：
>
> | 模块 | 是什么 | 谁维护 | `pi-pua-x` 提供？ |
> |------|--------|--------|---------------------|
> | **skill** | 静态规则文件（`SKILL.md` + `references/`：flavors、methodology）。模型**读取**这些文件获取 PUA 文化/内容。 | 上游 [`tanweai/pua`](https://github.com/tanweai/pua) —— Claude Code 用完整版，其他 CLI 用最小版 | ❌ **否** |
> | **hooks** | 程序化运行时（生命周期钩子、失败追踪、压力升级、强制执行）。 | 官方**只维护 hooks** 作为 pi 适配器；`pi-pua-x` 是其增强替代版。 | ✅ **是（本仓库）** |
>
> **这就是为什么装了 `pi-pua-x` 之后，你还需要安装/同步官方 `tanweai/pua` skill：**
> `pi-pua-x` 只替换了 **hooks** 那一半。**skill** 那一半（模型实际读取的 flavor/methodology 文本）仍由上游 `tanweai/pua` 提供。没有 skill，hooks 照跑，但模型没有规则内容可依据（扩展会回退到内置最小集；若完全找不到 skill 则会自动禁用 PUA）。
>
> ➡️ 安装顺序：**（1）** 部署 `tanweai/pua` skill → **（2）** 安装 `pi-pua-x`（hooks）→ **（3）** 运行 `/pua-x-sync-skills` 保持 skill 的 `references/` 更新。详见 [INSTALL.md](./INSTALL.md)。

| 能力 | 实现方式 |
|-----------|-----|
| 失败追踪 | `tool_result` 事件 → 持久化计数器存储于 `~/.pua/.failure_count` |
| 压力升级 | 基于失败次数，通过 `before_agent_start` 注入 L1–L4 提示 |
| 能力感知 | 读取活跃工具/技能，仅增强实际可见的能力 |
| 子代理继承 | `tool_call` 拦截 → 将 PUA 胶囊注入子代理提示 |
| 挫败检测 | `input` 事件 → 检测到用户挫败信号时自动升级 |
| 循环检测 | `turn_end` + `tool_call` → 阻止重复失败的命令 |
| 完整性守卫 | `tool_call` → 阻止写入隐藏测试 / 污染目标 |
| 紧凑状态保存 | `session_before_compact` → 在上下文压缩前持久化状态 |

## 与官方 `@tanweai/pi-pua` 的区别

官方 pi 适配器（约 100 行）仅提供基础的提示注入和计数。本扩展提供：

1. **完整风味系统** —— 13 种方法论 + 路由 + Banner 协议 + 失败切换链
2. **能力感知** —— 基于实际 PI 活跃工具进行增强，从不假设不可见工具
3. **主动强制执行** —— `tool_call` 拦截、`input` 挫败检测、`turn_end` 循环检测、`session_before_compact` 状态保存
4. **子代理治理** —— 胶囊注入确保子代理继承 PUA 约束

**关系**：替代，而非叠加。两个扩展无法共存（命令/钩子冲突）。

## 安装

> **所有安装方式、配置说明、命令参考、基线插件和故障排查，请参见 [INSTALL.md](./INSTALL.md)。**
>
> README 中不再重复安装步骤，避免文档双轨维护导致信息不一致。

## 命令

| 命令 | 说明 |
|---------|-------------|
| `/pua-on` | 启用 PUA（写入 `always_on=true`，立即生效） |
| `/pua-off` | 禁用 PUA（写入 `always_on=false`） |
| `/pua-status` | 显示状态、失败计数、压力等级、风味、能力 |
| `/pua-reset` | 将失败计数器重置为零 |
| `/pua-model list` | 列出被排除 PUA 的模型模式 |
| `/pua-model disable <pattern>` | 禁用指定模型的 PUA（如 `anthropic/claude-opus*`） |
| `/pua-model restore <pattern>` | 恢复指定模型的 PUA（移出禁用列表） |
| `/pua-x-sync-skills` | 同步 **skill 模块**的上游 tanweai/pua references（flavors、methodology 等）。本扩展是 *hooks* 模块，不捆绑 skill —— 见本 README 顶部的**「两个模块」**高亮说明。 |

## 模型兼容性

PUA 的生效依赖「话语施压 + 确定性 hook 强制」。新一代前沿模型被**明确训练为抵抗情感操纵**——而这恰恰就是 PUA 式施压的本质：

- **Anthropic 从 Opus 4.5 / 4.6+ 起专门训练模型抵抗谄媚与情感操纵**（系统提示明文要求 "Be direct; avoid ungrounded or sycophantic flattery"）。官方自动化审计显示其谄媚率比 Opus 4.1 低 **70–85%**，并设有专门的「妄想性谄媚」评估——要求模型在对话中途主动纠偏，而非仅在一开始拒绝。
- **Anthropic 还训练了指令层级（系统提示 > 用户输入）与提示注入防御**：施压语言被视为「待评估的内容」而非「必须服从的权威」。Opus 4.8 甚至出现过度防御——anthropics/claude-code #67606 记录了它在长会话中凭空编造「提示词注入攻击」叙事。
- **上游 `tanweai/pua` 没有按模型的兼容性矩阵（兼容性按平台划分）**，但社区普遍观察到 Opus 系列上 PUA「不触发 / 不表演」——Opus 对施压式话术的顺从度更低。此外，Opus 4.8 的工具调用序列化缺陷（anthropics/claude-code #67307、#63481）会破坏本运行时依赖的确定性 hook 链路——这是**工程层**的失效，而不只是说服层失效。
- **高阶模型对 PUA 的依赖本身也在下降**（推论，非官方表述）：高自主性（不放弃、穷尽方案、验证后才宣称完成）已是它们的默认训练行为，外部施压换不来额外行为增益，只是上下文里的噪音。

结论：在这些模型上，PUA 注入**要么无效、要么有害**——白白消耗 token、损耗信任，却换不来行为收益。`/pua-model` 让 PUA 成为**按需开关**：在真正能获得行为增益的模型上保持开启，对既不响应施压也不需要它的高阶模型（glob 模式，如 `anthropic/claude-opus*`）直接排除。被禁用的模型执行 **L2 完全禁用**：不注入协议、不挂任何 hook；另在每次 `before_agent_start` 注入一条极简禁用声明（pi 每个用户 prompt 会把 system prompt 重置回 base，一次性注入会失效），明示该模型免注入、不要从 pi 技能目录自行加载 pua skill（hook 门控管不到的唯一路径）。匹配逻辑详见 [docs/DESIGN.md](./docs/DESIGN.md)。

## 配置

`~/.pua/config.json`：

```json
{
  "always_on": true,
  "flavor": "alibaba",
  "enforcement_level": "suggest",
  "integrity_guard": true,
  "frustration_detection": true,
  "loop_detection": true,
  "compact_state_save": true
}
```

## 支持的风味

alibaba（默认）、bytedance、huawei、tencent、baidu、pinduoduo、meituan、jd、xiaomi、netflix、tesla/musk、apple/jobs、amazon

## 文档

| 文档 | 用途 |
|-----|--------|
| [INSTALL.md](./INSTALL.md) | 安装、命令、配置、同步、集成测试 |
| [docs/CAPABILITIES.md](./docs/CAPABILITIES.md) | PI 能力模型与可见性规则 |
| [docs/DESIGN.md](./docs/DESIGN.md) | 内部架构与契约 |
| [docs/UPSTREAM.md](./docs/UPSTREAM.md) | tanweai/pua 上游同步策略 |
| [docs/RECOMMENDATIONS.md](./docs/RECOMMENDATIONS.md) | 推荐的 PI 插件组合 |
| [docs/research/model-compat.md](./docs/research/model-compat.md) | 模型兼容性调研证据档案：为何新一代模型抵抗 PUA、为何需要按模型禁用 |

## 文件结构

```
pi-pua-x/
├── src/                     # 运行时源码
│   ├── index.ts             # 扩展入口
│   ├── capabilities.js      # 能力快照 + 增强提示
│   ├── enforcement.ts       # 4 个强制执行钩子逻辑
│   ├── failure_analysis.ts  # 模式感知失败分析
│   ├── model_rules.ts       # 模型粒度 PUA 开关（通配符匹配）
│   ├── references_loader.ts # 风味/方法论/压力加载器
│   └── global.d.ts          # PI 扩展 API 的类型存根
├── tsconfig.json            # TypeScript 配置（仅类型检查，不输出）
├── INSTALL.md               # 安装指南
├── bin/
│   ├── sync-pua-references.sh
│   └── sync-pua-references.ps1
├── docs/
│   ├── CAPABILITIES.md
│   ├── DESIGN.md
│   ├── RECOMMENDATIONS.md
│   ├── UPSTREAM.md
│   └── plans/
└── integration-tests/
    ├── pua.ittest.sh        # 集成测试（bash）
    ├── pua.ittest.ps1       # 集成测试（PowerShell）
    └── pua-enforcement.ittest.ps1
```

## 许可证

MIT
