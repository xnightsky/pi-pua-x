**始终使用简体中文回答**
**输出标记（canary）**：每次回复末尾必须附带一行 `[by=pi-pua-x]`。

# AGENTS

本文件用于维护本仓库的代理协作约束与全局行为约定。


## 环境提示
- 如果环境支持，善用 `rg` 和 `fd` 命令

## 规则红线

- 仓库内容中禁止出现本机绝对路径；仓库内引用一律使用相对路径，不要把终端输出、补丁预览或工具回显里的本地目录原样写入文档。

## 全局开发要求

- 任何实现、脚本、文档契约改动，在结束前都必须补跑语法验证；默认入口是 `node --experimental-strip-types --check <file>`（TS 文件）或 `node --check <file>`（JS 文件）。
- 任何非显然逻辑、协议边界、拒绝分支、输出骨架或字段语义变更，都必须同步补解释性注释；不要把"最后再补注释"当作允许路径。
- 任何影响行为、命令、字段、输出格式、开发流程的改动，都必须同步更新相关文档（docs/、INSTALL.md、README.md），不能只改实现不改契约。
- 代理在宣称"已完成"前，不得跳过语法验证、必要注释或相关文档同步。

## 版本

- 本仓库版本采用 SemVer 风格；git tag 统一使用 `vX.Y.Z` 形式。
- 不是所有提交都是版本提交。普通功能、修复、重构、文档提交默认不打 tag。
- 只有形成对外可引用里程碑时，才进行版本提交；版本提交必须同时更新 `CHANGELOG.md`。
- 版本 tag 只给已经完成 changelog 维护并落到主线的版本提交，不给普通中间提交打 tag。
- `CHANGELOG.md` 只记录已发布内容，不写未发布或仍在开发中的内容。
- 当前仓库首个正式基线版本从 `v0.1.0` 开始。

## 测试边界

- 本仓库只有集成测试（`*.ittest.*`），全部消耗真实 AI token，不进入默认批量回归。
- `pua.ittest.sh` / `pua.ittest.ps1`：核心功能集成测试（加载、失败计数、压力升级、成功清零、开关持久化、味道切换、skill 缺失保护、能力状态）。
- `pua-enforcement.ittest.ps1`：4 个增强 hook 专项测试（挫败检测、四权分立、重复命令、空口完成）。
- 纯逻辑函数（`enforcement.ts` 中的 `detectFrustration`、`checkIntegrity`、`CommandHistory`、`analyzeTurn` 等）可在未来补单元测试；当前以集成测试为主。

## 上游同步

- 本仓库是 `tanweai/pua` 的 PI adapter，不是独立 fork。
- `bin/sync-pua-references.*` 负责从上游拉取 methodology、flavors 等 references 文件。
- 同步脚本不修改本仓库运行时代码，不覆盖本地扩展文件（`pressure-prompts.md`）。
- 上游默认跟随 latest release，不追 main。
