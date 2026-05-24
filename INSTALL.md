# PUA Extension for pi — 安装与使用指南

能力开关、插件矩阵、可见性边界和正向增强规则见 [docs/CAPABILITIES.md](./docs/CAPABILITIES.md)；内部设计和后续落地契约见 [docs/DESIGN.md](./docs/DESIGN.md)。

## 通过 pi install 安装（推荐）

`pi install` 是 pi 内置的包管理命令，支持 git 和本地路径两种方式：

```bash
# 从 GitHub 安装（全局）
pi install git:github.com/xnightsky/pi-pua-x

# 从本地路径安装（开发用）
pi install ./path/to/pi-pua-x

# 安装到项目级（团队共享，写入 .pi/settings.json）
pi install -l git:github.com/xnightsky/pi-pua-x

# 卸载
pi remove git:github.com/xnightsky/pi-pua-x

# 临时试用（不写入 settings）
pi -e git:github.com/xnightsky/pi-pua-x
```

安装后重启 pi 即自动加载，无需手动复制文件。更新使用 `pi update` 或重新 install 指定新 ref：

```bash
# 锁定到特定版本
pi install git:github.com/xnightsky/pi-pua-x@v0.1.0
```

---

## 手动安装（local cp 机制）

本节操作主体是当前 PUA PI extension 本体，即 `./` 这套插件目录。以下命令默认在仓库的 `./` 目录下执行，安装目标为 PI 扩展目录 `~/.pi/agent/extensions/pua/`。

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
  printf '[WARN] PUA PI extension not found. Install with: mkdir -p "$HOME/.pi/agent/extensions/pua" && cp -R ./. "$HOME/.pi/agent/extensions/pua/"\n'
fi
```

### 安装

1. 安装 tanweai/pua skill（推荐放到 `~/.codex/skills/pua/`）。
2. 将本目录完整复制到 pi 扩展目录：

   **Linux / macOS (bash)**
   ```bash
   mkdir -p ~/.pi/agent/extensions/pua
   cp -R ./. ~/.pi/agent/extensions/pua/
   ```

   **Windows (PowerShell)**
   ```powershell
   $target = Join-Path $env:USERPROFILE ".pi\agent\extensions\pua"
   New-Item -ItemType Directory -Path $target -Force | Out-Null
   Copy-Item -Path .\pua\* -Destination $target -Recurse -Force
   ```

3. 重启 pi，扩展自动加载。

### 更新

更新等同于覆盖安装当前源码目录。该操作不会删除 `~/.pua/config.json`、`~/.pua/.failure_count` 或 `~/.pi/agent/pua-state.json`。

**Windows (PowerShell)**
```powershell
$target = Join-Path $env:USERPROFILE ".pi\agent\extensions\pua"
New-Item -ItemType Directory -Path $target -Force | Out-Null
Copy-Item -Path .\pua\* -Destination $target -Recurse -Force
```

**Linux / macOS (bash)**
```bash
mkdir -p ~/.pi/agent/extensions/pua
cp -R ./. ~/.pi/agent/extensions/pua/
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
Copy-Item -Path .\pua\* -Destination $target -Recurse -Force
```

**Linux / macOS (bash)**
```bash
rm -rf ~/.pi/agent/extensions/pua
mkdir -p ~/.pi/agent/extensions/pua
cp -R ./. ~/.pi/agent/extensions/pua/
```

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
| `/pua-status` | 查看开关状态、失败计数、压力等级、当前味道 |
| `/pua-reset` | 清零失败计数与时间戳 |

## 配置文件

```
~/.pua/config.json          # always_on / flavor 配置
~/.pua/.failure_count       # 官方失败计数文件（与 tanweai/pua 共享）
~/.pi/agent/pua-state.json  # pi 扩展私有状态（最后失败时间、注入等级）
```

> Windows 用户请将 `~` 替换为 `%USERPROFILE%`。

示例 `~/.pua/config.json`：

```json
{
  "always_on": true,
  "flavor": "huawei",
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

运行同步脚本，自动拉取 tanweai/pua 最新的 methodology、flavors 等文件：

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

**Windows (PowerShell)**
```powershell
. $env:USERPROFILE\.pi\agent\extensions\pua\pua-enforcement.ittest.ps1
```

> 测试内容：挫败检测、四权分立 deny、重复命令 block、空口完成检测。
> 其中 `input` 和 `turn_end` hook 仅在交互模式下生效，print mode 下跳过（单元测试已覆盖逻辑）。



