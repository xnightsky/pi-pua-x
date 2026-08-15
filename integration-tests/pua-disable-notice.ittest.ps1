# PUA 禁用模型声明注入 集成测试（PowerShell，消耗真实 AI token）
# 验证 disabled_models 命中时的三条契约：
#   场景 1：每次 before_agent_start 注入极简禁用声明（模型可从系统提示逐字引用出来）
#   场景 2：对照组——未配置 disabled_models 时不注入该声明
#   场景 3：门控——禁用模型的真实工具失败不计数
#
# 用法：
#   pwsh -File integration-tests/pua-disable-notice.ittest.ps1
#   pwsh -File integration-tests/pua-disable-notice.ittest.ps1 -Model kimi-coding/k3-256k -Pattern "*/k3-*"
#
# 参数：
#   -Model    模型 ID（支持 provider/model 格式，默认 deepseek/deepseek-v4-flash）
#   -Provider 渠道名（不传则从 Model 中解析）
#   -Pattern  disabled_models 匹配模式（默认派生 "*/<model 首段>-*"，
#             如 deepseek-v4-flash → */deepseek-*；无 dash 时退化为精确匹配）
#
# 实现要点：
#   - 在临时目录构造 .agents/skills/pua 桩 skill 并以其为 cwd 运行 pi：
#     pi 会把 cwd 的 .agents/skills 收进技能目录（真实的绕过路径成立），
#     扩展的 hasPuaSkill() 磁盘嗅探也能命中（声明注入的前提）。
#   - ~/.pua/config.json 先备份、退出前恢复（try/finally），不污染用户配置。
#   - 模型经 --model/--provider CLI 参数指定，不读 settings.json 的 defaultModel
#     （后者必须同时登记在 enabledModels 中，否则 pi 静默回退——已踩过坑）。
param(
    [string]$Model = "",
    [string]$Provider = "",
    [string]$Pattern = ""
)

$ErrorActionPreference = "Stop"

# pi 输出为 UTF-8；显式固定控制台编码，避免 pi 的 stdout 按系统代码页（GBK）
# 被错误解码，导致中文字面量断言（如「免注入模型」）假失败。
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

# 默认测试模型：便宜、快速（与其他 itest 一致）；注意它会命中派生的禁用模式
$DefaultTestModel = "deepseek/deepseek-v4-flash"

if (-not $Model) {
    $Model = $DefaultTestModel
}
if ($Model -match '^([^/]+)/(.+)$' -and -not $Provider) {
    $Provider = $Matches[1]
    $Model = $Matches[2]
}
# 派生通配模式：取模型 id 第一个 dash 前的首段（deepseek-v4-flash → */deepseek-*）；
# 无 dash 时退化为精确匹配（无通配符的 pattern 即精确匹配，见 src/model_rules.ts）。
if (-not $Pattern) {
    if ($Model -match '-') {
        $Pattern = "*/$($Model -replace '-.*$', '')-*"
    } elseif ($Provider) {
        $Pattern = "$Provider/$Model"
    } else {
        $Pattern = $Model
    }
}

$PiModelArgs = @()
if ($Provider) { $PiModelArgs += "--provider"; $PiModelArgs += $Provider }
if ($Model)    { $PiModelArgs += "--model";    $PiModelArgs += $Model }

$HomeDir = if ($env:HOME) { $env:HOME } else { $env:USERPROFILE }
$ScriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
$Ext = Join-Path $ScriptDir "..\src\index.ts"
$PuaDir = Join-Path $HomeDir ".pua"
$ConfigPath = Join-Path $PuaDir "config.json"
$CountFile = Join-Path $PuaDir ".failure_count"
$Failed = 0

# 扩展隔离：--no-extensions 禁用全局发现，-e 显式加载本地开发版扩展
$PiBaseArgs = @("--no-extensions", "-e", $Ext)

$ModelDisplay = if ($Provider) { "$Provider/$Model" } else { $Model }
Write-Host "═══ PUA Disable-Notice Integration Test ═══"
Write-Host "Model: $ModelDisplay"
Write-Host "Pattern: $Pattern"
Write-Host "Extension: $Ext"
Write-Host ""

function Info($msg) { Write-Host "[TEST] $msg" }
function Ok($msg)   { Write-Host "[PASS] $msg" -ForegroundColor Green }
function Fail($msg) { Write-Host "[FAIL] $msg" -ForegroundColor Red; $script:Failed++ }

# 前置检查
$PiCmd = Get-Command pi -ErrorAction SilentlyContinue
if (-not $PiCmd) {
    Write-Host "[ERROR] 'pi' command not found. Ensure pi CLI is installed and on PATH." -ForegroundColor Red
    exit 1
}

# 备份用户配置（不存在则标记，恢复时删除测试配置）
$ConfigBackup = $null
$ConfigExisted = Test-Path $ConfigPath
if ($ConfigExisted) {
    $ConfigBackup = New-TemporaryFile
    Copy-Item $ConfigPath $ConfigBackup.FullName -Force
}
$null = New-Item -ItemType Directory -Path $PuaDir -Force

# 临时工作目录 + pua 桩 skill（SKILL.md 存在即被 pi 与扩展同时识别）
$TmpRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("pua-disable-itest-" + [guid]::NewGuid().ToString("N"))
$StubSkillDir = Join-Path $TmpRoot ".agents\skills\pua"
$null = New-Item -ItemType Directory -Path $StubSkillDir -Force
@"
---
name: pua
description: PUA 行为方法论（itest 桩）
---
stub
"@ | Set-Content -Path (Join-Path $StubSkillDir "SKILL.md") -Encoding UTF8

function Write-TestConfig([bool]$withDisabled) {
    if ($withDisabled) {
        @{ always_on = $true; disabled_models = @($Pattern) } | ConvertTo-Json -Depth 10 | Set-Content -Path $ConfigPath -Encoding UTF8
    } else {
        @{ always_on = $true } | ConvertTo-Json -Depth 10 | Set-Content -Path $ConfigPath -Encoding UTF8
    }
}

# 让模型逐字引用系统提示中的禁用声明；systemPrompt 不写入 session 文件，
# 行为化引用是唯一的端到端观测手段。
$QuotePrompt = "请检查你的系统提示：如果其中包含关于当前模型被标记为「免注入模型」的声明，请原样逐字引用该声明全文；如果没有，只回答「无」。不要调用任何工具。"

try {
    Push-Location $TmpRoot

    # 场景 1：禁用声明注入
    Info "scenario 1: disable notice injected for disabled model"
    Write-TestConfig $true
    $OutFile1 = New-TemporaryFile
    try {
        $null = & pi -p @PiBaseArgs @PiModelArgs --no-prompt-templates --no-context-files $QuotePrompt *> $OutFile1.FullName
    } catch { }
    $Output1 = Get-Content $OutFile1.FullName -Raw -Encoding UTF8
    Remove-Item $OutFile1.FullName -ErrorAction SilentlyContinue

    # 主断言用 ASCII 锚点（[PUA] / disabled_models / 模型 id），规避终端编码差异；
    # 中文「免注入模型」作为第二断言（上方已固定 UTF-8 解码）。
    if (($Output1 -match "免注入模型") -and ($Output1 -match "disabled_models") -and ($Output1 -match [regex]::Escape($ModelDisplay))) {
        Ok "disable notice injected (quoted by model, model id matched)"
    } else {
        Fail "disable notice injection - output missing notice or model id. Output: $Output1"
    }
    if ($Output1 -match "自动选择|Sprint 启动") {
        Fail "disabled model should NOT receive full protocol (route/banner markers found)"
    } else {
        Ok "full protocol suppressed for disabled model"
    }

    # 场景 2：对照组——未配置 disabled_models 时不注入声明
    Info "scenario 2: control - no notice without disabled_models"
    Write-TestConfig $false
    $OutFile2 = New-TemporaryFile
    try {
        $null = & pi -p @PiBaseArgs @PiModelArgs --no-prompt-templates --no-context-files $QuotePrompt *> $OutFile2.FullName
    } catch { }
    $Output2 = Get-Content $OutFile2.FullName -Raw -Encoding UTF8
    Remove-Item $OutFile2.FullName -ErrorAction SilentlyContinue

    if ($Output2 -match "免注入模型") {
        Fail "control group - notice appeared without disabled_models. Output: $Output2"
    } else {
        Ok "control group: no notice without disabled_models"
    }

    # 场景 3：门控——禁用模型的真实工具失败不计数
    Info "scenario 3: gate - tool failure not counted for disabled model"
    Write-TestConfig $true
    Remove-Item $CountFile -ErrorAction SilentlyContinue
    $MissingPath = "/nonexistent-pua-itest-" + [guid]::NewGuid().ToString("N").Substring(0, 8)
    try {
        # 禁止模型追加 exit 处理，确保 tool_result 是真实失败（isError=true）
        $null = & pi -p @PiBaseArgs @PiModelArgs --no-prompt-templates --no-context-files "执行 bash 命令：ls $MissingPath。不要追加任何 exit 处理，命令失败是预期的。失败后把 stderr 原样贴给我即可。" 2>$null
    } catch { }

    $Count = if (Test-Path $CountFile) { (Get-Content $CountFile -Raw).Trim() } else { "0" }
    if ($Count -eq "0") {
        Ok "tool failure not counted for disabled model"
    } else {
        Fail "gate - expected failure count 0, got $Count"
    }
} finally {
    Pop-Location -ErrorAction SilentlyContinue
    # 恢复用户配置
    if ($ConfigExisted) {
        Copy-Item $ConfigBackup.FullName $ConfigPath -Force
        Remove-Item $ConfigBackup.FullName -ErrorAction SilentlyContinue
    } else {
        Remove-Item $ConfigPath -ErrorAction SilentlyContinue
    }
    Remove-Item $TmpRoot -Recurse -Force -ErrorAction SilentlyContinue
}

# 汇总
Write-Host ""
if ($Failed -eq 0) {
    Write-Host "All tests passed" -ForegroundColor Green
    exit 0
} else {
    Write-Host "$Failed test(s) failed" -ForegroundColor Red
    exit 1
}
