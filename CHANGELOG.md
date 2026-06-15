# Changelog

## v0.3.1

### Added

- **Harness Integrity 治理段落**：`buildBehaviorProtocol` 内联四权分立原则（行动权 / 自我评价权 / 评分权 / 环境修改权分离）+ 多 Agent 隔离拓扑说明 + 按需加载 `harness-governance.md` 指针。闭合 `docs/UPSTREAM.md` 差距 #2/#3，对齐上游 v3.5.0 SKILL.md 做法（声明原则 + 按需引用）。

### Changed

- `docs/UPSTREAM.md` 标记差距 #2/#3 已闭合，能力对比表更新。

## v0.3.0

### Added

- **模式感知失败分析**（对齐上游 `tanweai/pua` 82b8efc6）：新增 `failure_analysis.ts`，按最近 3 次错误签名分类 SPINNING / EXPLORING / MIXED，并在 `before_agent_start` 叠加针对性模式块到压力提示。
- **突破降压 de-escalation**：连续失败 ≥3 且会话峰值 ≥L2 后的一次成功触发 `[PUA 突破 ✨]`，注入 14 味道认可话术 + 强制复盘三步并将压力归零。`peakLevel` / `pendingBreakthrough` / `errorHistory` 持久化到 `pua-state.json`。
- **Microsoft 味道**：`FLAVOR_MAP` 补齐（🪟，闭合 `docs/UPSTREAM.md` 差距 #4）。
- **node:test 测试层**：新增 `npm test`——纯函数单测 + mock-pi 事件流集成共 29 用例（含 `.js→.ts` 解析钩子，确定性无 token）。

### Changed

- 同步脚本（`sync-pua-references.sh` / `.ps1`）`UPSTREAM_FILES` 新增 `de-escalation-protocol.md`。
- `docs/UPSTREAM.md` 对照刷新到上游 v3.5.0，新增 2026-06 比对表（含 ding 味道 / confidence gate 待评估项）。
- `tsconfig.json` 纳入 `integration-tests/**/*.ts` 并允许 `.ts` 扩展名导入。

## v0.2.1

### Fixed

- **`/pua-x-sync-skills` TUI 卡死**：`execFileSync` 改为异步 `spawn`，脚本执行期间 TUI 保持响应、有进度回执。
- **skill 探测兼容 symlink + references-only**：`findSkillDirs` 判定条件从仅 `SKILL.md` 放宽为 `SKILL.md` 或 `references/` 任一存在即有效，兼容用户通过 symlink 或仅 sync references 的部署方式。
- **安装引导路径修正**："pua skill 未找到"提示的推荐路径改为首选 `~/.agents/skills/pua/`（与 sync 脚本落盘目录一致），保留 `~/.pi/agent/skills/pua/` 作为备选。

### Added

- **INSTALL.md 方式三：开发调试**：独立章节，`pi -ne -e ./index.ts` 直指仓库源码，改完重启即生效。速查表同步更新。
- **README 「两个模块」高亮说明**：在 README.md / README.zh.md / INSTALL.md 三处加醒目 blockquote，讲清 skill（静态规则）vs hooks（本扩展）的分工边界，消除"装了扩展为何还要 sync skill"的困惑。
- `/pua-x-sync-skills` handler 补完整架构注释（模块关系、流程、设计决策）。

## v0.2.0

### Added

- 新增 `/pua-x-sync-skills` 命令：一键同步 tanweai/pua 上游 references，自动嗅探 `pi install` / 手动安装两种路径，跨平台执行（bash / PowerShell）。
- `/pua-status` 增加 skill 目录展示，方便排查 references 加载来源。
- skill 缺失时输出引导安装说明（取代原来的单句英文警告）。

### Changed

- **INSTALL.md** 重构为完整安装指南：
  - 新增目录、前置条件、安装方式速查表、验证安装、故障排查。
  - 独立维护 `pi install`（`~/.pi/agent/git/`）和手动安装（`~/.pi/agent/extensions/`）两种机制的实际路径差异。
  - 同步上游、集成测试、enforcement 测试脚本均补充双路径版本。
- **README.md / README.zh.md**：安装区强制导向 INSTALL.md，删除 Quick start 代码块，避免文档双轨维护。
- `references_loader.ts`：头注释补充 skill 目录发现规则（5 个优先级路径）。
- `bin/sync-pua-references.{sh,ps1}`：注释补充 `/pua-x-sync-skills` 快捷用法。
