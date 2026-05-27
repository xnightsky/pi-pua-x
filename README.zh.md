# pi-pua-x

> [英文版本](./README.md) | 中文版本

[pi](https://github.com/nicepkg/pi-coding-agent) 的状态化 PUA 运行时扩展 —— 生命周期钩子、压力升级、能力感知增强与子代理继承。基于 [tanweai/pua](https://github.com/tanweai/pua) 构建。

## 这是什么？

`pi-pua-x` 是 pi 中 PUA 行为协议的**程序化运行时**。与依赖模型"记住"规则的静态技能文件不同，此扩展利用 pi 的生命周期钩子以确定性方式强制执行行为：

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

完整说明请参见 [INSTALL.md](./INSTALL.md)。

快速开始：

```bash
# 推荐：通过 pi install
pi install git:github.com/xnightsky/pi-pua-x

# 或手动复制（local cp）
mkdir -p ~/.pi/agent/extensions/pua
cp -R ./* ~/.pi/agent/extensions/pua/
```

## 命令

| 命令 | 说明 |
|---------|-------------|
| `/pua-on` | 启用 PUA（写入 `always_on=true`，立即生效） |
| `/pua-off` | 禁用 PUA（写入 `always_on=false`） |
| `/pua-status` | 显示状态、失败计数、压力等级、风味、能力 |
| `/pua-reset` | 将失败计数器重置为零 |

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

## 文件结构

```
pi-pua-x/
├── index.ts                 # 扩展入口
├── capabilities.js          # 能力快照 + 增强提示
├── enforcement.ts           # 4 个强制执行钩子逻辑
├── references_loader.ts     # 风味/方法论/压力加载器
├── global.d.ts              # PI 扩展 API 的类型存根
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
├── pua.ittest.sh            # 集成测试（bash）
├── pua.ittest.ps1           # 集成测试（PowerShell）
└── pua-enforcement.ittest.ps1
```

## 许可证

MIT
