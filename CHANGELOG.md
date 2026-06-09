# Changelog

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
