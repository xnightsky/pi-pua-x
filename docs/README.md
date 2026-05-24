# PUA Extension Docs

本目录放 PI 版 PUA adapter 的内部文档。用户只想安装和使用时，先看上一级 `README.md` 和 `INSTALL.md`；需要理解能力边界或准备实现后续功能时，再读本目录。

## 阅读顺序

| 文档 | 适合场景 |
|------|----------|
| [CAPABILITIES.md](./CAPABILITIES.md) | 确认 PI 启用哪些插件后会获得哪些能力，以及运行时可见性如何驱动正向增强 |
| [RECOMMENDATIONS.md](./RECOMMENDATIONS.md) | 选择 PUA 迭代相关的外部插件组合，并区分推荐能力和当前实现 |
| [DESIGN.md](./DESIGN.md) | 理解 PUA adapter 的 hook 设计、状态模型和能力感知落地契约 |
| [UPSTREAM.md](./UPSTREAM.md) | 理解 `tanweai/pua` 上游基线、release/main 取舍和 references 同步边界 |

## 文档边界

- `CAPABILITIES.md` 只写 PI 能力来源、开关和可见性边界，不写内部实现细节。
- `RECOMMENDATIONS.md` 只写外部插件推荐组合和取舍，不写成 PUA 当前能力。
- `DESIGN.md` 只写 adapter 内部设计和后续实现契约，不写安装步骤。
- `UPSTREAM.md` 只写上游同步策略，不写运行时能力。
- 安装、命令、配置和集成测试统一放在 `../INSTALL.md`。

## 维护规则

- README 只保留入口信息，避免复制专题文档的大段内容。
- 新增能力时先确认它来自 PUA 自身还是其他 PI 插件，再更新对应文档。
- 涉及 PI hook、tool、skill 或 package 机制的结论，需要以当前 PI 文档或实际安装包为准。
