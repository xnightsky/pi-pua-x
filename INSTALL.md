# PUA Extension for pi — 安装与使用指南

能力开关、插件矩阵、可见性边界和正向增强规则见 [docs/CAPABILITIES.md](./docs/CAPABILITIES.md)；内部设计和后续落地契约见 [docs/DESIGN.md](./docs/DESIGN.md)。

## 目录

- [前置条件](#前置条件)
  - [tanweai/pua skill（前置依赖）](#tanweaipua-skill前置依赖)
- [安装方式速查](#安装方式速查)
- [方式一：通过 pi install 安装（推荐）](#方式一通过-pi-install-安装推荐)
  - [安装](#安装)
  - [更新](#更新)
  - [卸载](#卸载)
- [方式二：手动安装（local cp 机制）](#方式二手动安装local-cp-机制)
  - [获取源码](#获取源码)
  - [检测是否已安装](#检测是否已安装)
  - [安装](#安装-1)
  - [更新](#更新-1)
  - [卸载](#卸载-1)
  - [重装](#重装)
- [方式三：开发调试（pi -e 直指源码）](#方式三开发调试pi--e-直指源码推荐)
- [验证安装](#验证安装)
- [PUA 开发基线插件](#pua-开发基线插件)
- [命令](#命令)
- [配置文件](#配置文件)
- [模板文件](#模板文件)
- [同步上游 References](#同步上游-references)
- [集成测试](#集成测试)
- [故障排查](#故障排查)

---

## 前置条件

1. **pi 已安装** — 本扩展是 pi 的插件，需先安装 [pi](https://github.com/nicepkg/pi-coding-agent)。
2. **Node.js ≥ 18** — pi 运行依赖 Node.js，建议用最新 LTS 版本。
3. **tanweai/pua skill（前置依赖，强烈推荐）** — PUA 行为协议的核心规则文件。扩展本身有内置 fallback，但完整体验需要 skill 的 references/ 目录（flavors、methodology 等）。

> ### ⚠️ 为什么装了本扩展还要单独装 skill？
>
> PUA 分**两个模块**，本扩展（`pi-pua-x`）**只替换 hooks，不含 skill**：
>
> - **skill 模块** = 静态规则文件（`SKILL.md` + `references/`），模型*读*它获取 flavor/methodology 内容。由上游 [`tanweai/pua`](https://github.com/tanweai/pua) 维护，本扩展**不打包**。
> - **hooks 模块** = 程序化运行时（生命周期钩子、失败计数、压力升级、强制执行）。官方只把 hooks 作为 pi 适配器维护，`pi-pua-x` 是其增强替代版。
>
> 所以 `pi install` / 手动复制只装好了 **hooks** 那一半；**skill** 那一半（模型真正读的规则文本）必须另外从 `tanweai/pua` 部署。缺了 skill，hooks 照跑但模型无规则内容可依据，扩展会回退到内置最小集；若完全找不到 skill，会在会话开始时自动禁用 PUA 并输出安装指引。

> Windows 用户请确保 PowerShell 执行策略允许运行脚本（`RemoteSigned` 或 `Bypass`）。

### tanweai/pua skill（前置依赖）

`pi install` 方式**不会**自动安装 skill，需手动部署。

**安装方式（推荐放到 `~/.pi/agent/skills/pua/`）：**

```bash
# 方式1：从上游仓库复制
git clone https://github.com/tanweai/pua.git /tmp/tanweai-pua
mkdir -p ~/.pi/agent/skills/pua
cp -R /tmp/tanweai-pua/skills/pua/* ~/.pi/agent/skills/pua/

# 方式2：或只下载核心文件
curl -o ~/.pi/agent/skills/pua/SKILL.md https://raw.githubusercontent.com/tanweai/pua/main/skills/pua/SKILL.md
mkdir -p ~/.pi/agent/skills/pua/references
# 然后同步 references（见下文 /pua-x-sync-skills）
```

安装后可用 `/pua-status` 查看 skill 目录是否被识别。如果未找到，扩展会在会话开始时自动禁用 PUA，并输出安装指引。

## 安装方式速查

| 场景 | 推荐方式 | 一句话 |
|------|---------|--------|
| 普通用户，只想用 | `pi install` | 一行命令，自动管理版本 |
| 开发者，改源码调试 | `pi -e`（方式三） | 直指仓库源码，改完重启即生效，不写配置 |
| 团队项目，共享配置 | `pi install -l` | 项目级安装，写入 `.pi/settings.json` |
| 临时试用，不想留痕 | `pi -e` | 单次会话加载，不写配置 |

---

## 方式一：通过 pi install 安装（推荐）

`pi install` 是 pi 内置的包管理命令，支持 git 和本地路径两种方式：

```bash
# 从 GitHub 安装（全局）
pi install git:github.com/xnightsky/pi-pua-x

# 从本地路径安装（开发用）
# 假设你在仓库根目录
pi install .

# 或从任意路径
pi install /absolute/path/to/pi-pua-x

# 安装到项目级（团队共享，写入 .pi/settings.json）
pi install -l git:github.com/xnightsky/pi-pua-x

# 卸载
pi remove git:github.com/xnightsky/pi-pua-x

# 临时试用（不写入 settings）
pi -e git:github.com/xnightsky/pi-pua-x
```

安装后**重启 pi** 即自动加载，无需手动复制文件。

`pi install` 的实际安装路径为：

```
~/.pi/agent/git/github.com/xnightsky/pi-pua-x/
```

pi 通过读取该目录下 `package.json` 的 `pi.extensions` 字段自动加载扩展。**不要**同时再手动复制到 `~/.pi/agent/extensions/pua/`，两种方式互相独立，混用会导致重复加载或版本不一致。

### 更新

```bash
# 更新到最新
pi update git:github.com/xnightsky/pi-pua-x

# 或重新 install 指定版本
pi install git:github.com/xnightsky/pi-pua-x@v0.1.0
```

### 卸载

```bash
pi remove git:github.com/xnightsky/pi-pua-x
```

> `pi install` 安装方式不支持 `pi remove` 以外的手动目录删除，否则 `pi list` 会出现孤儿记录。

---

## 方式二：手动安装（local cp 机制）

手动安装需要先把仓库拉到本地，再复制到 pi 扩展目录。

### 获取源码

先找个目录，把仓库 clone 下来：

```bash
cd <你选的父目录>
git clone https://github.com/xnightsky/pi-pua-x.git
cd pi-pua-x
```

以下命令默认在仓库的 `./` 目录下执行，安装目标为 PI 扩展目录 `~/.pi/agent/extensions/pua/`。

> 注意：手动安装与 `pi install` 是**两种独立机制**。手动安装直接把文件放进 `extensions/` 目录让 pi 扫描加载；`pi install` 把包下载到 `agent/git/` 并通过 `package.json` 解析加载。二者**不需要同时做**，选一种即可。

这些命令只管理 PUA PI 插件目录，不安装或卸载 tanweai/pua skill，也不安装或卸载外部 PI package。

### 检测是否已安装

**Windows (PowerShell)**
```powershell
$target = Join-Path $env:USERPROFILE ".pi\agent\extensions\pua\index.ts"
if (Test-Path -LiteralPath $target) {
    Write-Host "[OK] PUA PI extension installed"
} else {
    Write-Warning "PUA PI extension not found. Install with: Copy-Item -Path .\* -Destination `$env:USERPROFILE\.pi\agent\extensions\pua\ -Recurse -Force"
}
```

**Linux / macOS (bash)**
```bash
target="$HOME/.pi/agent/extensions/pua/index.ts"
if [ -f "$target" ]; then
  printf '[OK] PUA PI extension installed\n'
else
  printf '[WARN] PUA PI extension not found. Install with: mkdir -p "$HOME/.pi/agent/extensions/pua" && cp -R ./* "$HOME/.pi/agent/extensions/pua/"\n'
fi
```

### 安装

1. 安装 tanweai/pua skill（推荐放到 `~/.pi/agent/skills/pua/`）。
2. 将本目录完整复制到 pi 扩展目录：

   **Linux / macOS (bash)**
   ```bash
   mkdir -p ~/.pi/agent/extensions/pua
   cp -R ./* ~/.pi/agent/extensions/pua/
   ```
   > `cp -R ./*` 会跳过隐藏文件（如 `.git/`、`node_modules/`），这些对扩展运行非必需。如需完整复制（含隐藏文件），用 `cp -R ./. ~/.pi/agent/extensions/pua/`。

   **Windows (PowerShell)**
   ```powershell
   $target = Join-Path $env:USERPROFILE ".pi\agent\extensions\pua"
   New-Item -ItemType Directory -Path $target -Force | Out-Null
   Copy-Item -Path .\* -Destination $target -Recurse -Force
   ```

3. 重启 pi，扩展自动加载。

### 更新

更新等同于覆盖安装当前源码目录。该操作不会删除 `~/.pua/config.json`、`~/.pua/.failure_count` 或 `~/.pi/agent/pua-state.json`。

**Windows (PowerShell)**
```powershell
$target = Join-Path $env:USERPROFILE ".pi\agent\extensions\pua"
New-Item -ItemType Directory -Path $target -Force | Out-Null
Copy-Item -Path .\* -Destination $target -Recurse -Force
```

**Linux / macOS (bash)**
```bash
mkdir -p ~/.pi/agent/extensions/pua
cp -R ./* ~/.pi/agent/extensions/pua/
```

### 卸载

卸载只删除当前 PUA PI 插件目录，不删除 PUA 配置、失败计数、PI 私有状态、tanweai/pua skill 或外部 PI package。

**Windows (PowerShell)**
```powershell
$target = Join-Path $env:USERPROFILE ".pi\agent\extensions\pua"
if (Test-Path -LiteralPath $target) {
    Remove-Item -LiteralPath $target -Recurse -Force
}
```

**Linux / macOS (bash)**
```bash
rm -rf ~/.pi/agent/extensions/pua
```

### 重装

重装用于修复目标目录残留旧文件、复制不完整或更新后行为异常。它会先删除 PUA PI 插件目录，再复制当前源码目录；默认仍保留用户配置和状态文件。

**Windows (PowerShell)**
```powershell
$target = Join-Path $env:USERPROFILE ".pi\agent\extensions\pua"
if (Test-Path -LiteralPath $target) {
    Remove-Item -LiteralPath $target -Recurse -Force
}
New-Item -ItemType Directory -Path $target -Force | Out-Null
Copy-Item -Path .\* -Destination $target -Recurse -Force
```

**Linux / macOS (bash)**
```bash
rm -rf ~/.pi/agent/extensions/pua
mkdir -p ~/.pi/agent/extensions/pua
cp -R ./* ~/.pi/agent/extensions/pua/
```

---

## 方式三：开发调试（`pi -e` 直指源码，推荐）

如果你在**反复改源码、随改随看效果**，不要用方式一/二——那两种每改一次都要重新 `install` 或 `cp`，费劲且容易跟旧文件混。

`pi -e <path>` 直接加载仓库里的 `index.ts`，**不复制、不写配置**；改完源码只需重启 pi 即生效。

### 启动调试会话

在**仓库根目录**执行：

**Linux / macOS (bash)**
```bash
cd /path/to/pi-pua-x      # 你的仓库目录
pi -ne -e ./index.ts
```

**Windows (PowerShell)**
```powershell
cd C:\path\to\pi-pua-x
pi -ne -e .\index.ts
```

两个关键 flag：

| flag | 作用 |
|------|------|
| `-e ./index.ts` | 加载指定扩展文件（可多次传入多个） |
| `-ne` | 禁用全局扩展发现（显式 `-e` 仍生效）。**调试时必加**，否则会与已安装的正式版同时加载，造成命令/钩子重复冲突 |

> ⚠️ **为什么必须加 `-ne`**：若你之前用方式一/二装过正式版（在 `~/.pi/agent/git/.../pi-pua-x/` 或 `~/.pi/agent/extensions/pua/`），pi 启动时会自动发现它。不加 `-ne` 就会和 `-e` 加载的调试版**双重加载**，出现重复命令注册报错。`-ne` 只屏蔽自动发现，你显式 `-e` 指定的仓库源码照常加载。

### 调试闭环

```bash
# 1. 改源码后先跑语法验证（不启 pi 也能提前报错）
node --experimental-strip-types --check index.ts

# 2. 重启调试会话看效果
pi -ne -e ./index.ts

# 3. 会话内验证扩展加载成功
/pua-status
```

需同时调试多个扩展时，`-e` 可重复：

```bash
pi -ne -e ./index.ts -e /path/to/other-ext/index.ts
```

### 调试与正式安装的关系

- 调试加载（`-e`）**不写入** `settings.json`，退出 pi 即消失，零残留。
- 调试阶段无需卸载正式版，`-ne` 已将其隔离；只有你想让改动“转正式”时，才用方式一的 `pi update` 或方式二的重装流程落盘。
- skill 模块（`tanweai/pua`）与调试无关，不受 `-ne` 影响；skill 是独立的 references 文件，按「前置条件」部署后调试会话也能读到。

---

## 验证安装

重启 pi 后，输入以下命令验证扩展是否加载成功：

```bash
/pua-status
```

期望输出包含：
- `always_on` 状态（`true` / `false`）
- 当前 `flavor`
- 失败计数 `failure_count`
- 压力等级 `pressure_level`

如果提示命令不存在，按安装方式分别检查：

**`pi install` 方式**
1. 检查 `pi list` 中是否有 `git:github.com/xnightsky/pi-pua-x`。
2. 确认目录存在：`ls ~/.pi/agent/git/github.com/xnightsky/pi-pua-x/index.ts`

**手动安装方式**
1. 扩展目录下是否有 `index.ts`：`ls ~/.pi/agent/extensions/pua/index.ts`

**通用**
- pi 是否已重启（扩展在 pi 启动时加载）。

## PUA 开发基线插件

PUA 本体不自带搜索、MCP、PowerShell、子任务或询问能力，也不依赖外部记忆插件。进行 PUA 后续开发和集成测试前，建议先安装下面的外部 PI package；集成测试脚本会把这些跨平台基线插件缺失视为失败，而不是跳过。

| 能力 | package | 安装命令 |
|------|---------|----------|
| 网络搜索与内容抓取 | `pi-web-access` | `pi install npm:pi-web-access` |
| MCP 扩展入口 | `pi-mcp-adapter` | `pi install npm:pi-mcp-adapter` |
| 子任务拆分 | `pi-subagents` | `pi install npm:pi-subagents` |
| 计划模式 | `@ifi/pi-plan` | `pi install npm:@ifi/pi-plan` |
| 结构化询问 | `pi-ask-user` | `pi install npm:pi-ask-user` |

安装检测只检查 `pi list` 是否包含对应 package；不会自动安装，缺失时只打印告警和安装命令。

**Windows (PowerShell)**
```powershell
$packages = @(
    @{ Name = "pi-web-access"; Install = "pi install npm:pi-web-access" },
    @{ Name = "pi-mcp-adapter"; Install = "pi install npm:pi-mcp-adapter" },
    @{ Name = "pi-subagents"; Install = "pi install npm:pi-subagents" },
    @{ Name = "@ifi/pi-plan"; Install = "pi install npm:@ifi/pi-plan" },
    @{ Name = "pi-ask-user"; Install = "pi install npm:pi-ask-user" }
)

$installed = pi list 2>&1 | Out-String
foreach ($package in $packages) {
    $needle = "npm:$($package.Name)"
    if ($installed -notmatch [regex]::Escape($needle)) {
        Write-Warning "Missing PI package: $($package.Name). Install: $($package.Install)"
    }
}
```

**Linux / macOS (bash)**
```bash
pi_list="$(pi list 2>&1)"

check_pi_package() {
  package="$1"
  install_cmd="$2"
  if ! printf '%s\n' "$pi_list" | grep -Fq "npm:$package"; then
    printf '[WARN] Missing PI package: %s. Install: %s\n' "$package" "$install_cmd"
  fi
}

check_pi_package "pi-web-access" "pi install npm:pi-web-access"
check_pi_package "pi-mcp-adapter" "pi install npm:pi-mcp-adapter"
check_pi_package "pi-subagents" "pi install npm:pi-subagents"
check_pi_package "@ifi/pi-plan" "pi install npm:@ifi/pi-plan"
check_pi_package "pi-ask-user" "pi install npm:pi-ask-user"
```

可选插件不进入默认集成测试前置检查：

| 能力 | package | 适用场景 |
|------|---------|----------|
| spec workflow | `@ifi/pi-spec` | 需求较重或跨文件方案 |
| Windows 原生命令 | `@marcfargas/pi-powershell` | 只在明确需要 Windows 原生 PowerShell、job 或 session 时安装；不是 PUA 基线依赖 |
| 后台任务观察 | `@ifi/pi-background-tasks` | 长命令、服务启动、日志跟踪 |
| 时延诊断 | `@ifi/pi-diagnostics` | 判断卡住、慢响应、turn 耗时异常 |
| 外部安全层 | `pi-permission-system` | 明确要做工具调用确认或权限 gate 时 |

## 命令

| 命令 | 说明 |
|------|------|
| `/pua-on` | 启用 PUA（`always_on=true`），当前会话立即生效 |
| `/pua-off` | 关闭 PUA（`always_on=false`），同时关闭反馈频率 |
| `/pua-status` | 查看开关状态、失败计数、压力等级、当前味道、模型禁用状态 |
| `/pua-reset` | 清零失败计数与时间戳 |
| `/pua-model list` | 列出禁用规则的模型模式 |
| `/pua-model add <pattern>` | 添加禁用模式（如 `anthropic/claude-opus*`） |
| `/pua-model remove <pattern>` | 移除禁用模式 |
| `/pua-x-sync-skills` | 一键同步 tanweai/pua 上游 references（flavors、methodology 等） |

## 配置文件

```
~/.pua/config.json          # always_on / flavor / disabled_models 配置
~/.pua/.failure_count       # 官方失败计数文件（与 tanweai/pua 共享）
~/.pi/agent/pua-state.json  # pi 扩展私有状态（最后失败时间、注入等级）
```

> Windows 用户请将 `~` 替换为 `%USERPROFILE%`。

示例 `~/.pua/config.json`：

```json
{
  "always_on": true,
  "flavor": "huawei",
  "disabled_models": [
    "anthropic/claude-opus-*",
    "anthropic/claude-sonnet-4*",
    "openai/gpt-4*"
  ],
  "enforcement_level": "suggest",
  "integrity_guard": true,
  "frustration_detection": true,
  "loop_detection": true,
  "compact_state_save": true
}
```

### enforcement 配置字段

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `disabled_models` | string[] | `[]` | glob 模式匹配禁用 PUA 的模型，匹配时跳过协议注入 + 所有 hook |
| `enforcement_level` | `"observe"` \| `"suggest"` \| `"enforce"` | `"suggest"` | observe=只通知，suggest=通知+确认，enforce=自动 block |
| `integrity_guard` | boolean | `true` | 四权分立保护（写入 tests/CI/secrets 时提示或拦截） |
| `frustration_detection` | boolean | `true` | 用户挫败检测（仅交互模式） |
| `loop_detection` | boolean | `true` | 原地打转检测（重复命令 + 空口完成） |
| `compact_state_save` | boolean | `true` | 压缩前自动保存状态到 `~/.pua/builder-journal.md` |

## 模板文件

扩展依赖 tanweai/pua 原始 repo 的 `references/` 目录，主要文件如下：

| 文件 | 说明 |
|------|------|
| `flavors.md` | 味道文化 DNA、黑话词库 |
| `methodology-{key}.md` | 各味道行为约束（共 13 种） |
| `methodology-router.md` | 任务类型→味道 自动路由 |
| `display-protocol.md` | Unicode 方框表格格式规范 |
| `pressure-prompts.md` | L1–L4 压力 prompt（本扩展特有，需手动维护） |

## 同步上游 References

运行同步脚本，自动拉取 tanweai/pua 最新的 methodology、flavors 等文件。

最快捷的方式是在 pi 中直接执行命令：

```bash
/pua-x-sync-skills
```

该命令会自动根据平台选择 `.sh` 或 `.ps1` 脚本，并自动嗅探安装路径（支持 `pi install` 和手动安装两种方式）。

如果你需要手动执行脚本：

如果你使用 `pi install` 安装：

**Linux / macOS (bash)**
```bash
bash ~/.pi/agent/git/github.com/xnightsky/pi-pua-x/bin/sync-pua-references.sh
```

**Windows (PowerShell)**
```powershell
. $env:USERPROFILE\.pi\agent\git\github.com\xnightsky\pi-pua-x\bin\sync-pua-references.ps1
```

如果你使用手动安装：

**Linux / macOS (bash)**
```bash
bash ~/.pi/agent/extensions/pua/bin/sync-pua-references.sh
```

**Windows (PowerShell)**
```powershell
. $env:USERPROFILE\.pi\agent\extensions\pua\bin\sync-pua-references.ps1
```

> `pressure-prompts.md` 等本地扩展文件不参与同步，需手动维护。

## 集成测试

集成测试会先检查 PUA 开发基线插件。缺失任一必需插件都视为测试失败。外部记忆插件当前未被 PI 版 PUA 使用，也没有进入本阶段适配范围。PowerShell 专用脚本在未安装 `@marcfargas/pi-powershell` 时会跳过 Windows PowerShell tool_result 场景，不把该插件作为 PUA 本体成败条件。

**`pi install` 方式**

**Linux / macOS (bash)**
```bash
bash ~/.pi/agent/git/github.com/xnightsky/pi-pua-x/pua.ittest.sh
```

**Windows (PowerShell)**
```powershell
# 方式1：直接在当前会话执行（推荐，可看到彩色输出）
. $env:USERPROFILE\.pi\agent\git\github.com\xnightsky\pi-pua-x\pua.ittest.ps1

# 方式2：通过文件路径执行（若执行策略受限，需加 -ExecutionPolicy Bypass）
powershell -ExecutionPolicy Bypass -File $env:USERPROFILE\.pi\agent\git\github.com\xnightsky\pi-pua-x\pua.ittest.ps1
```

**手动安装方式**

**Linux / macOS (bash)**
```bash
bash ~/.pi/agent/extensions/pua/pua.ittest.sh
```

**Windows (PowerShell)**
```powershell
# 方式1：直接在当前会话执行（推荐，可看到彩色输出）
. $env:USERPROFILE\.pi\agent\extensions\pua\pua.ittest.ps1

# 方式2：通过文件路径执行（若执行策略受限，需加 -ExecutionPolicy Bypass）
powershell -ExecutionPolicy Bypass -File $env:USERPROFILE\.pi\agent\extensions\pua\pua.ittest.ps1
```

> 该脚本消耗真实 AI token，属于集成测试，不进入默认批量回归。

### Enforcement Hooks 集成测试

针对 4 个增强 hook 的专项集成测试，使用弱模型（Kimi）暴露问题：

**`pi install` 方式**
```powershell
. $env:USERPROFILE\.pi\agent\git\github.com\xnightsky\pi-pua-x\pua-enforcement.ittest.ps1
```

**手动安装方式**
```powershell
. $env:USERPROFILE\.pi\agent\extensions\pua\pua-enforcement.ittest.ps1
```

> 测试内容：挫败检测、四权分立 deny、重复命令 block、空口完成检测。
> 其中 `input` 和 `turn_end` hook 仅在交互模式下生效，print mode 下跳过（单元测试已覆盖逻辑）。

---

## 故障排查

| 现象 | 可能原因 | 解决 |
|------|---------|------|
| `/pua-status` 提示未知命令 | 扩展未加载 | 手动安装：确认文件在 `~/.pi/agent/extensions/pua/index.ts`；pi install：确认 `pi list` 有记录。重启 pi |
| 安装后行为没有变化 | 旧版本缓存 | 执行重装流程（先删后复制），或 `pi update` |
| `pi install` 后 `pi list` 看不到 | 安装路径写错 | 检查命令中仓库地址是否拼写正确 |
| Windows PowerShell 脚本执行失败 | 执行策略限制 | `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser` |
| 味道切换不生效 | 配置未保存到正确路径 | 确认 `~/.pua/config.json` 存在且 JSON 合法 |
| 集成测试全部跳过 | 基线插件缺失 | 按[PUA 开发基线插件](#pua-开发基线插件)表格安装必需包 |
| 上游同步后规则丢失 | `pressure-prompts.md` 被覆盖 | 该文件为本地扩展特有，不参与同步，需手动维护 |
| 同时用了 `pi install` 和手动安装 | 两种机制混用导致重复加载 | 只保留一种，删去另一种（手动安装的删 `~/.pi/agent/extensions/pua/`；pi install 的用 `pi remove`） |
| 手动安装后找不到文件 | 复制路径写错 | 确认命令在 **pi-pua-x 仓库根目录** 执行，目标是 `~/.pi/agent/extensions/pua/` |



