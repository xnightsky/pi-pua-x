#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# Sync PUA references from tanweai/pua original repo
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

REPO_RAW="https://raw.githubusercontent.com/tanweai/pua/main/skills/pua/references"
# 嗅探 skill 目录（按优先级）
for dir in "${HOME}/.codex/skills/pua" "${HOME}/.claude/skills/pua" "${HOME}/.agents/skills/pua"; do
  if [ -d "${dir}" ] || [ "${dir}" = "${HOME}/.agents/skills/pua" ]; then
    SKILL_DIR="${dir}"
    break
  fi
done
REF_DIR="${SKILL_DIR}/references"

# ── 代理嗅探：检测常见本地代理端口 ──
CURL_PROXY=""
for port in 7890 1080 1087 8889; do
  if curl -s --max-time 2 "http://127.0.0.1:${port}" >/dev/null 2>&1; then
    CURL_PROXY="--proxy http://127.0.0.1:${port}"
    echo "[proxy] 检测到 ${port} 端口代理"
    break
  fi
done

# ── 确保 references/ 目录存在 ──
mkdir -p "${REF_DIR}"

# ── 原始 repo 维护的文件列表（自动同步） ──
UPSTREAM_FILES=(
  flavors.md
  methodology-router.md
  methodology-alibaba.md
  methodology-amazon.md
  methodology-apple.md
  methodology-baidu.md
  methodology-bytedance.md
  methodology-huawei.md
  methodology-jd.md
  methodology-meituan.md
  methodology-netflix.md
  methodology-pinduoduo.md
  methodology-tencent.md
  methodology-tesla.md
  methodology-xiaomi.md
  display-protocol.md
  agent-team.md
  evolution-protocol.md
  p7-protocol.md
  p9-protocol.md
  p10-protocol.md
  platform.md
  survey.md
  teardown-protocol.md
)

# ── 本地扩展文件（不同步，由本扩展自行维护） ──
LOCAL_FILES=(
  pressure-prompts.md
)

echo "═══ PUA References Sync ═══"
echo "Source: ${REPO_RAW}"
echo "Target: ${REF_DIR}"
echo ""

UPDATED=0
SKIPPED=0
for f in "${UPSTREAM_FILES[@]}"; do
  url="${REPO_RAW}/${f}"
  dest="${REF_DIR}/${f}"

  # 先下载到临时文件，避免直接覆盖失败导致本地文件损坏
  tmp="$(mktemp)"
  if curl -s --max-time 20 ${CURL_PROXY} -o "${tmp}" "${url}"; then
    # 简单校验：排除 404 页面或错误响应
    if head -1 "${tmp}" | grep -qi "not found\|404"; then
      echo "  ✗ ${f} — 404 (跳过)"
      rm -f "${tmp}"
      continue
    fi

    if [ -f "${dest}" ] && diff -q "${dest}" "${tmp}" >/dev/null 2>&1; then
      echo "  = ${f} — 无变化"
      SKIPPED=$((SKIPPED + 1))
    else
      mv "${tmp}" "${dest}"
      echo "  ↑ ${f} — 已更新"
      UPDATED=$((UPDATED + 1))
    fi
  else
    echo "  ✗ ${f} — 下载失败"
  fi
  rm -f "${tmp}"
done

echo ""
echo "本地扩展文件（不参与同步）："
for f in "${LOCAL_FILES[@]}"; do
  if [ -f "${REF_DIR}/${f}" ]; then
    echo "  • ${f} — 存在"
  else
    echo "  • ${f} — 缺失（需手动创建）"
  fi
done

echo ""
echo "完成：${UPDATED} 个文件更新，${SKIPPED} 个文件无变化"
