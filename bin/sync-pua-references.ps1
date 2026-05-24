# Sync PUA references from tanweai/pua original repo (PowerShell 版本)
# Usage: . $env:USERPROFILE/.pi/agent/extensions/pua/bin/sync-pua-references.ps1

# 兼容 Windows PowerShell 5.x 与 PowerShell 7.x
$ErrorActionPreference = "Stop"

$RepoRaw = "https://raw.githubusercontent.com/tanweai/pua/main/skills/pua/references"
$HomeDir = if ($env:HOME) { $env:HOME } else { $env:USERPROFILE }

# ── 嗅探 skill 目录（按优先级） ──
$SkillDir = $null
foreach ($dir in @(
    (Join-Path $HomeDir ".codex/skills/pua"),
    (Join-Path $HomeDir ".claude/skills/pua"),
    (Join-Path $HomeDir ".agents/skills/pua")
)) {
    if (Test-Path $dir) {
        $SkillDir = $dir
        break
    }
}

# 若都不存在，回退到默认路径
if (-not $SkillDir) {
    $SkillDir = Join-Path $HomeDir ".agents/skills/pua"
}

$RefDir = Join-Path $SkillDir "references"
New-Item -ItemType Directory -Path $RefDir -Force | Out-Null

# ── 代理嗅探：检测常见本地代理端口 ──
$ProxyUrl = $null
foreach ($port in @(7890, 1080, 1087, 8889)) {
    try {
        $null = Invoke-WebRequest -Uri "http://127.0.0.1:$port" -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
        $ProxyUrl = "http://127.0.0.1:$port"
        Write-Host "[proxy] 检测到 ${port} 端口代理"
        break
    } catch {
        # 继续尝试下一个端口
    }
}

# ── 原始 repo 维护的文件列表（自动同步） ──
$UpstreamFiles = @(
    "flavors.md"
    "methodology-router.md"
    "methodology-alibaba.md"
    "methodology-amazon.md"
    "methodology-apple.md"
    "methodology-baidu.md"
    "methodology-bytedance.md"
    "methodology-huawei.md"
    "methodology-jd.md"
    "methodology-meituan.md"
    "methodology-netflix.md"
    "methodology-pinduoduo.md"
    "methodology-tencent.md"
    "methodology-tesla.md"
    "methodology-xiaomi.md"
    "display-protocol.md"
    "agent-team.md"
    "evolution-protocol.md"
    "p7-protocol.md"
    "p9-protocol.md"
    "p10-protocol.md"
    "platform.md"
    "survey.md"
    "teardown-protocol.md"
)

# ── 本地扩展文件（不同步，由本扩展自行维护） ──
$LocalFiles = @("pressure-prompts.md")

Write-Host "═══ PUA References Sync ═══"
Write-Host "Source: $RepoRaw"
Write-Host "Target: $RefDir"
Write-Host ""

$Updated = 0
$Skipped = 0

foreach ($f in $UpstreamFiles) {
    $url = "$RepoRaw/$f"
    $dest = Join-Path $RefDir $f
    $tmp = New-TemporaryFile

    try {
        $params = @{
            Uri = $url
            OutFile = $tmp.FullName
            TimeoutSec = 20
            UseBasicParsing = $true
            ErrorAction = "Stop"
        }
        if ($ProxyUrl) {
            $params['Proxy'] = $ProxyUrl
        }

        Invoke-WebRequest @params

        # 简单校验：排除 404 页面或错误响应
        $firstLine = Get-Content $tmp.FullName -TotalCount 1
        if ($firstLine -match "not found|404") {
            Write-Host "  ✗ $f — 404 (跳过)"
            Remove-Item $tmp.FullName -ErrorAction SilentlyContinue
            continue
        }

        if (Test-Path $dest) {
            # 使用 SHA256 比较文件内容，避免直接覆盖无变化文件
            $destHash = Get-FileHash $dest -Algorithm SHA256 | Select-Object -ExpandProperty Hash
            $tmpHash = Get-FileHash $tmp.FullName -Algorithm SHA256 | Select-Object -ExpandProperty Hash
            if ($destHash -eq $tmpHash) {
                Write-Host "  = $f — 无变化"
                $Skipped++
                Remove-Item $tmp.FullName -ErrorAction SilentlyContinue
                continue
            }
        }

        Move-Item -Path $tmp.FullName -Destination $dest -Force
        Write-Host "  ↑ $f — 已更新"
        $Updated++
    } catch {
        Write-Host "  ✗ $f — 下载失败: $_"
    } finally {
        Remove-Item $tmp.FullName -ErrorAction SilentlyContinue
    }
}

Write-Host ""
Write-Host "本地扩展文件（不参与同步）："
foreach ($f in $LocalFiles) {
    $path = Join-Path $RefDir $f
    if (Test-Path $path) {
        Write-Host "  • $f — 存在"
    } else {
        Write-Host "  • $f — 缺失（需手动创建）"
    }
}

Write-Host ""
Write-Host "完成：$Updated 个文件更新，$Skipped 个文件无变化"
