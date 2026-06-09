# Changelog

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
