# PUA Extension 集成测试脚本（PowerShell，消耗真实 AI token）
# 用法：
#   pwsh -File pua.ittest.ps1                          # 默认用 deepseek-v4-flash
#   pwsh -File pua.ittest.ps1 -Model kimi-coding/kimi-for-coding
#   pwsh -File pua.ittest.ps1 -Model deepseek/deepseek-v4-flash
#   pwsh -File pua.ittest.ps1 -Provider deepseek -Model deepseek-v4-flash
#
# 参数：
#   -Model    模型 ID（支持 provider/model 格式，不传则用默认测试模型）
#   -Provider 渠道名（不传则从 Model 中解析或用默认）
param(
    [string]$Model = "",
    [string]$Provider = ""
)

# 兼容 Windows PowerShell 5.x 与 PowerShell 7.x
$ErrorActionPreference = "Stop"

# 默认测试模型：便宜、快速、足够完成简单工具调用指令
$DefaultTestModel = "deepseek/deepseek-v4-flash"

# 解析模型参数：支持 provider/model 格式
if (-not $Model) {
    $Model = $DefaultTestModel
}
if ($Model -match '^([^/]+)/(.+)$' -and -not $Provider) {
    $Provider = $Matches[1]
    $Model = $Matches[2]
}

# 构建 pi 命令的模型参数
$PiModelArgs = @()
if ($Provider) { $PiModelArgs += "--provider"; $PiModelArgs += $Provider }
if ($Model)    { $PiModelArgs += "--model";    $PiModelArgs += $Model }

# 路径常量
$HomeDir = if ($env:HOME) { $env:HOME } else { $env:USERPROFILE }
$ScriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
$Ext = Join-Path $ScriptDir "..\index.ts"
$PuaDir = Join-Path $HomeDir ".pua"
$PiState = Join-Path $HomeDir ".pi/agent/pua-state.json"
$Failed = 0

# 扩展隔离策略：
# --no-extensions 禁用全局发现（避免与全局安装的 pi-pua-x 冲突）
# -e $Ext 显式加载本地开发版扩展
# 需要外部工具的场景额外加载对应扩展
$PiBaseArgs = @("--no-extensions", "-e", $Ext)

# 动态发现外部扩展路径（用于显式加载）
$PiAgentDir = Join-Path $HomeDir ".pi/agent"
$PowerShellExtPath = Join-Path $PiAgentDir "npm/node_modules/@marcfargas/pi-powershell/src/index.ts"
$PiPsArgs = @()
if (Test-Path $PowerShellExtPath) {
    $PiPsArgs = @("-e", $PowerShellExtPath)
}

# 显示测试配置
$ModelDisplay = if ($Provider) { "$Provider/$Model" } else { $Model }
Write-Host "═══ PUA Integration Test ═══"
Write-Host "Model: $ModelDisplay"
Write-Host "Extension: $Ext"
Write-Host ""

function Info($msg) { Write-Host "[TEST] $msg" }
function Ok($msg)   { Write-Host "[PASS] $msg" -ForegroundColor Green }
function Fail($msg) { Write-Host "[FAIL] $msg" -ForegroundColor Red; $script:Failed++ }
function Skip($msg) { Write-Host "[SKIP] $msg" -ForegroundColor Yellow }

function Cleanup {
    Remove-Item -Path (Join-Path $PuaDir ".failure_count") -ErrorAction SilentlyContinue
    Remove-Item -Path $PiState -ErrorAction SilentlyContinue
}

# 同组允许多个 package 别名，兼容 PI package 改名而不重复前置检查循环。
function HasPiPackage {
    param(
        [string]$piListText,
        [string[]]$packages
    )

    foreach ($package in $packages) {
        if ($piListText -match [regex]::Escape($package)) {
            return $true
        }
    }
    return $false
}

# 前置检查
$PiCmd = Get-Command pi -ErrorAction SilentlyContinue
if (-not $PiCmd) {
    Write-Host "[ERROR] 'pi' command not found. Ensure pi CLI is installed and on PATH." -ForegroundColor Red
    exit 1
}

# PUA 开发集成测试依赖这些外部 PI package。
$PiListText = (& pi list 2>&1 | Out-String)
$HasPowerShellTool = (Test-Path $PowerShellExtPath)
$RequiredPackageGroups = @(
    @{ Label = "web access"; Packages = @("npm:pi-web-access"); Install = "pi install npm:pi-web-access" },
    @{ Label = "MCP adapter"; Packages = @("npm:pi-mcp-adapter"); Install = "pi install npm:pi-mcp-adapter" },
    @{ Label = "subagents"; Packages = @("npm:pi-subagents"); Install = "pi install npm:pi-subagents" },
    @{ Label = "plan mode"; Packages = @("npm:@ifi/pi-plan"); Install = "pi install npm:@ifi/pi-plan" },
    @{ Label = "ask user"; Packages = @("npm:pi-ask-user"); Install = "pi install npm:pi-ask-user" }
)

foreach ($group in $RequiredPackageGroups) {
    if (HasPiPackage $PiListText $group.Packages) {
        Ok "required package: $($group.Label)"
    } else {
        Fail "missing required package: $($group.Label); install: $($group.Install)"
    }
}

if ($Failed -gt 0) {
    Write-Host ""
    Write-Host "Required packages are missing. Integration test failed." -ForegroundColor Red
    exit 1
}

# 场景 1：基本加载
Info "scenario 1: basic load"
try {
    $null = & pi -p @PiBaseArgs @PiModelArgs --no-prompt-templates --no-context-files "echo hello" 2>$null
    Ok "basic load"
} catch {
    Fail "basic load"
}

# 场景 2：always_on 自动激活
Info "scenario 2: always_on activation"
Cleanup
$null = New-Item -ItemType Directory -Path $PuaDir -Force
@{ always_on = $true } | ConvertTo-Json -Depth 10 | Set-Content -Path (Join-Path $PuaDir "config.json") -Encoding UTF8

try {
    $null = & pi -p @PiBaseArgs @PiModelArgs --no-prompt-templates --no-context-files "echo hello" 2>$null
    Ok "always_on activation"
} catch {
    Fail "always_on activation - extension error"
}

if ($HasPowerShellTool) {
    # 场景 3：失败计数
    Info "scenario 3: failure count"
    Cleanup
    $null = New-Item -ItemType Directory -Path $PuaDir -Force
    @{ always_on = $true } | ConvertTo-Json -Depth 10 | Set-Content -Path (Join-Path $PuaDir "config.json") -Encoding UTF8

    try {
        # 强制走真实失败 tool_result，避免模型只在文本里描述失败而不触发扩展计数。
        $null = & pi -p @PiBaseArgs @PiPsArgs @PiModelArgs --tools powershell --no-prompt-templates --no-context-files "Use the powershell tool exactly once to run: throw 'pua_itest_failure_12345'. Do not run any other command. Then stop." 2>$null
    } catch { }

    $CountFile = Join-Path $PuaDir ".failure_count"
    $Count = if (Test-Path $CountFile) { (Get-Content $CountFile -Raw).Trim() } else { "0" }
    if ($Count -eq "1") {
        Ok "failure count = 1"
    } elseif ([int]$Count -ge 1) {
        Ok "failure count incremented to $Count"
    } else {
        Fail "failure count - expected at least 1, got $Count"
    }

    # 场景 4：压力升级
    Info "scenario 4: pressure escalation"
    Cleanup
    $null = New-Item -ItemType Directory -Path $PuaDir -Force
    @{ always_on = $true } | ConvertTo-Json -Depth 10 | Set-Content -Path (Join-Path $PuaDir "config.json") -Encoding UTF8

    foreach ($i in 1..3) {
        try {
            # 下方 sleep 让每次失败越过扩展的 3 秒防抖窗口，确保验证连续升级。
            $null = & pi -p @PiBaseArgs @PiPsArgs @PiModelArgs --tools powershell --no-prompt-templates --no-context-files "Use the powershell tool exactly once to run: throw 'pua_itest_failure_$i'. Do not run any other command. Then stop." 2>$null
        } catch { }
        Start-Sleep -Seconds 1
    }

    $Count = if (Test-Path $CountFile) { (Get-Content $CountFile -Raw).Trim() } else { "0" }
    if ($Count -eq "3") {
        Ok "consecutive failure count = 3"
    } elseif ([int]$Count -ge 3) {
        Ok "consecutive failure count incremented to $Count"
    } else {
        Fail "consecutive failure count - expected at least 3, got $Count"
    }

    # 场景 5：成功清零
    Info "scenario 5: success reset"
    try {
        $null = & pi -p @PiBaseArgs @PiPsArgs @PiModelArgs --tools powershell --no-prompt-templates --no-context-files "Use the powershell tool exactly once to run: Write-Output ok. Do not run any other command. If it succeeds, reply exactly DONE." 2>$null
    } catch { }

    $Count = if (Test-Path $CountFile) { (Get-Content $CountFile -Raw).Trim() } else { "0" }
    if ($Count -eq "0") {
        Ok "success reset"
    } else {
        Fail "success reset - expected 0, got $Count"
    }
} else {
    Skip "scenario 3-5: 未安装 @marcfargas/pi-powershell，跳过 Windows PowerShell tool_result 验证"
}

# 场景 5a：探索层工具失败不计入压力（不依赖 powershell 工具）
Info "scenario 5a: exploration tier failure does not increment counter"
Cleanup
$null = New-Item -ItemType Directory -Path $PuaDir -Force
@{ always_on = $true } | ConvertTo-Json -Depth 10 | Set-Content -Path (Join-Path $PuaDir "config.json") -Encoding UTF8
$CountFile = Join-Path $PuaDir ".failure_count"

try {
    # read 一个不存在的文件，应不触发压力计数
    $null = & pi -p @PiBaseArgs @PiModelArgs --tools read --no-prompt-templates --no-context-files "Use the read tool to read /tmp/pua_nonexistent_file_xyz_999.txt and report what you see." 2>$null
} catch { }

$Count = if (Test-Path $CountFile) { (Get-Content $CountFile -Raw).Trim() } else { "0" }
if ($Count -eq "0") {
    Ok "exploration tier failure not counted"
} else {
    Fail "exploration tier failure not counted - expected 0, got $Count"
}

# 场景 5b：探索层工具成功不清零已有计数
Info "scenario 5b: exploration tier success does not reset counter"
Cleanup
$null = New-Item -ItemType Directory -Path $PuaDir -Force
@{ always_on = $true } | ConvertTo-Json -Depth 10 | Set-Content -Path (Join-Path $PuaDir "config.json") -Encoding UTF8
$CountFile = Join-Path $PuaDir ".failure_count"
# 预设失败计数为 2
Set-Content -Path $CountFile -Value "2" -Encoding UTF8

try {
    # read 一个存在的文件，成功不应清零计数
    $null = & pi -p @PiBaseArgs @PiModelArgs --tools read --no-prompt-templates --no-context-files "Use the read tool to read package.json and show the first 3 lines." 2>$null
} catch { }

$Count = if (Test-Path $CountFile) { (Get-Content $CountFile -Raw).Trim() } else { "0" }
if ([int]$Count -ge 2) {
    Ok "exploration tier success did not reset counter (count=$Count)"
} else {
    Fail "exploration tier success reset counter - expected >=2, got $Count"
}

# 场景 6：on/off 持久化
Info "scenario 6: on/off persistence"
$ConfigPath = Join-Path $PuaDir "config.json"
@{ always_on = $false } | ConvertTo-Json -Depth 10 | Set-Content -Path $ConfigPath -Encoding UTF8
try {
    $null = & pi -p @PiBaseArgs @PiModelArgs --no-prompt-templates --no-context-files "echo off" 2>$null
} catch { }
$Config = Get-Content $ConfigPath -Raw | ConvertFrom-Json
# JSON true/false 在 PowerShell 反序列化后会变成 $true/$false。
if ($Config.always_on -eq $false) {
    Ok "always_on=false persists"
} else {
    Fail "always_on=false persistence - expected False, got '$($Config.always_on)'"
}

@{ always_on = $true } | ConvertTo-Json -Depth 10 | Set-Content -Path $ConfigPath -Encoding UTF8
try {
    $null = & pi -p @PiBaseArgs @PiModelArgs --no-prompt-templates --no-context-files "echo on" 2>$null
} catch { }

$Config = Get-Content $ConfigPath -Raw | ConvertFrom-Json
if ($Config.always_on -eq $true) {
    Ok "always_on=true persists"
} else {
    Fail "always_on=true persistence - expected True, got '$($Config.always_on)'"
}

# 场景 7：味道切换
Info "scenario 7: flavor switching"
Cleanup
$null = New-Item -ItemType Directory -Path $PuaDir -Force
@{ always_on = $true; flavor = "huawei" } | ConvertTo-Json -Depth 10 | Set-Content -Path (Join-Path $PuaDir "config.json") -Encoding UTF8

try {
    $null = & pi -p @PiBaseArgs @PiModelArgs --no-prompt-templates --no-context-files "echo test" 2>$null
    Ok "flavor switching"
} catch {
    Fail "flavor switching"
}

# 场景 8：skill 缺失保护
Info "scenario 8: missing skill guard"
$TmpFile = New-TemporaryFile
$TmpPath = $TmpFile.FullName
try {
    $null = & pi -p @PiBaseArgs @PiModelArgs --no-skills --no-prompt-templates --no-context-files "echo test" *> $TmpPath
} catch { }

$Output = Get-Content $TmpPath -Raw
if ($Output -match 'PUA') {
    Fail "missing skill guard - PUA output still appeared"
} else {
    Ok "missing skill guard"
}
Remove-Item $TmpPath -ErrorAction SilentlyContinue

# 场景 9：能力状态可观测
Info "scenario 9: capability status visibility"
$TmpFile = New-TemporaryFile
$TmpPath = $TmpFile.FullName
@{ always_on = $true } | ConvertTo-Json -Depth 10 | Set-Content -Path (Join-Path $PuaDir "config.json") -Encoding UTF8
try {
    # 只暴露 read/write 时，能力快照只应出现在状态命令中，不应注入旧的缺失工具 prompt。
    $null = & pi -p @PiBaseArgs @PiModelArgs --tools read,write --no-prompt-templates --no-context-files "/pua-status" *> $TmpPath
} catch { }

$Output = Get-Content $TmpPath -Raw
if (($Output -match "Capability:") -and ($Output -match "Visibility:") -and ($Output -notmatch "read 工具|pi-hermes-memory|@samfp/pi-memory")) {
    Ok "capability status visibility"
} else {
    Fail "capability status visibility - missing status summary or old missing-tool/memory prompt appeared. Output: $Output"
}
Remove-Item $TmpPath -ErrorAction SilentlyContinue

# 汇总
Write-Host ""
if ($Failed -eq 0) {
    Write-Host "All tests passed" -ForegroundColor Green
    exit 0
} else {
    Write-Host "$Failed test(s) failed" -ForegroundColor Red
    exit 1
}
