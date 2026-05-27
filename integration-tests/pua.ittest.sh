#!/usr/bin/env bash
# PUA Extension 集成测试脚本（消耗真实 AI token）
# 用法：
#   bash integration-tests/pua.ittest.sh
#   bash integration-tests/pua.ittest.sh -m deepseek/deepseek-v4-flash
#   bash integration-tests/pua.ittest.sh -m kimi-for-coding -p kimi-coding
#
# 参数：
#   -m MODEL     模型 ID（支持 provider/model 格式，默认 deepseek/deepseek-v4-flash）
#   -p PROVIDER  渠道名（不传则从 MODEL 中解析）

set -uo pipefail

# ── 参数解析 ──
MODEL=""
PROVIDER=""
while getopts "m:p:" opt; do
  case $opt in
    m) MODEL="$OPTARG" ;;
    p) PROVIDER="$OPTARG" ;;
    *) echo "Usage: $0 [-m model] [-p provider]"; exit 1 ;;
  esac
done

# 默认测试模型
DEFAULT_MODEL="deepseek/deepseek-v4-flash"
if [ -z "$MODEL" ]; then
  MODEL="$DEFAULT_MODEL"
fi

# 支持 provider/model 格式自动拆分
if [[ "$MODEL" == */* ]] && [ -z "$PROVIDER" ]; then
  PROVIDER="${MODEL%%/*}"
  MODEL="${MODEL#*/}"
fi

# ── 路径常量 ──
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXT="$SCRIPT_DIR/../index.ts"
PUA_DIR="$HOME/.pua"
PI_STATE="$HOME/.pi/agent/pua-state.json"
FAILED=0

# ── 构建 pi 参数 ──
PI_MODEL_ARGS=()
[ -n "$PROVIDER" ] && PI_MODEL_ARGS+=(--provider "$PROVIDER")
[ -n "$MODEL" ] && PI_MODEL_ARGS+=(--model "$MODEL")

# 扩展隔离：禁用全局发现，显式加载本地扩展
PI_BASE_ARGS=(--no-extensions -e "$EXT")

# ── 辅助函数 ──
info() { echo "[TEST] $1"; }
ok()   { echo -e "\033[32m[PASS]\033[0m $1"; }
fail() { echo -e "\033[31m[FAIL]\033[0m $1"; FAILED=$((FAILED+1)); }
skip() { echo -e "\033[33m[SKIP]\033[0m $1"; }

cleanup() {
  rm -f "$PUA_DIR/.failure_count" "$PI_STATE"
}

# ── Banner ──
MODEL_DISPLAY="$MODEL"
[ -n "$PROVIDER" ] && MODEL_DISPLAY="$PROVIDER/$MODEL"
echo "═══ PUA Integration Test (bash) ═══"
echo "Model: $MODEL_DISPLAY"
echo "Extension: $EXT"
echo ""

# ── 前置检查 ──
if ! command -v pi >/dev/null 2>&1; then
  echo "[ERROR] 'pi' 命令未找到" >&2
  exit 1
fi

mkdir -p "$PUA_DIR"

# ═══ 场景 1：基本加载 ═══
info "场景1：基本加载"
if pi -p "${PI_BASE_ARGS[@]}" "${PI_MODEL_ARGS[@]}" --no-prompt-templates --no-context-files "echo hello" >/dev/null 2>&1; then
  ok "基本加载"
else
  fail "基本加载"
fi

# ═══ 场景 2：always_on 自动激活 ═══
info "场景2：always_on 自动激活"
cleanup
echo '{"always_on": true}' > "$PUA_DIR/config.json"
if pi -p "${PI_BASE_ARGS[@]}" "${PI_MODEL_ARGS[@]}" --no-prompt-templates --no-context-files "echo hello" >/dev/null 2>&1; then
  ok "always_on 自动激活"
else
  fail "always_on 自动激活"
fi

# ═══ 场景 3：失败检测与计数 ═══
info "场景3：失败检测与计数"
cleanup
echo '{"always_on": true}' > "$PUA_DIR/config.json"
pi -p "${PI_BASE_ARGS[@]}" "${PI_MODEL_ARGS[@]}" --tools bash --no-prompt-templates --no-context-files \
  "Use the bash tool exactly once to run: exit 42. Do not run any other command." >/dev/null 2>&1 || true
COUNT=$(cat "$PUA_DIR/.failure_count" 2>/dev/null | tr -d '\n' || echo 0)
if [ "$COUNT" -ge 1 ] 2>/dev/null; then
  ok "失败计数 = $COUNT"
else
  fail "失败计数 — 预期至少 1，实际 $COUNT"
fi

# ═══ 场景 4：压力升级（连续失败） ═══
info "场景4：压力升级"
cleanup
echo '{"always_on": true}' > "$PUA_DIR/config.json"
for i in 1 2 3; do
  pi -p "${PI_BASE_ARGS[@]}" "${PI_MODEL_ARGS[@]}" --tools bash --no-prompt-templates --no-context-files \
    "Use the bash tool exactly once to run: exit $i. Do not run any other command." >/dev/null 2>&1 || true
  sleep 1
done
COUNT=$(cat "$PUA_DIR/.failure_count" 2>/dev/null | tr -d '\n' || echo 0)
if [ "$COUNT" -ge 3 ] 2>/dev/null; then
  ok "连续失败计数 = $COUNT"
else
  fail "连续失败计数 — 预期至少 3，实际 $COUNT"
fi

# ═══ 场景 5：成功清零 ═══
info "场景5：成功清零"
pi -p "${PI_BASE_ARGS[@]}" "${PI_MODEL_ARGS[@]}" --tools bash --no-prompt-templates --no-context-files \
  "Use the bash tool exactly once to run: printf ok. Do not run any other command." >/dev/null 2>&1 || true
COUNT=$(cat "$PUA_DIR/.failure_count" 2>/dev/null | tr -d '\n' || echo 0)
if [ "$COUNT" = "0" ]; then
  ok "成功清零"
else
  fail "成功清零 — 预期 0，实际 $COUNT"
fi

# ═══ 场景 5a：探索层工具失败不计入压力 ═══
info "场景5a：探索层失败不计入压力"
cleanup
echo '{"always_on": true}' > "$PUA_DIR/config.json"
pi -p "${PI_BASE_ARGS[@]}" "${PI_MODEL_ARGS[@]}" --tools read --no-prompt-templates --no-context-files \
  "Use the read tool to read /tmp/pua_nonexistent_file_xyz_999.txt and report what you see." >/dev/null 2>&1 || true
COUNT=$(cat "$PUA_DIR/.failure_count" 2>/dev/null | tr -d '\n' || echo 0)
if [ "$COUNT" = "0" ] || [ -z "$COUNT" ]; then
  ok "探索层失败未计入"
else
  fail "探索层失败未计入 — 预期 0，实际 $COUNT"
fi

# ═══ 场景 5b：探索层工具成功不清零计数 ═══
info "场景5b：探索层成功不清零计数"
cleanup
echo '{"always_on": true}' > "$PUA_DIR/config.json"
# 预设失败计数为 2
echo "2" > "$PUA_DIR/.failure_count"
pi -p "${PI_BASE_ARGS[@]}" "${PI_MODEL_ARGS[@]}" --tools read --no-prompt-templates --no-context-files \
  "Use the read tool to read package.json and show the first 3 lines." >/dev/null 2>&1 || true
COUNT=$(cat "$PUA_DIR/.failure_count" 2>/dev/null | tr -d '\n' || echo 0)
if [ "$COUNT" -ge 2 ] 2>/dev/null; then
  ok "探索层成功未清零 (count=$COUNT)"
else
  fail "探索层成功未清零 — 预期 >=2，实际 $COUNT"
fi

# ═══ 场景 6：on/off 持久化 ═══
info "场景6：on/off 持久化"
echo '{"always_on": false}' > "$PUA_DIR/config.json"
pi -p "${PI_BASE_ARGS[@]}" "${PI_MODEL_ARGS[@]}" --no-prompt-templates --no-context-files "echo off" >/dev/null 2>&1 || true
# 用 node 解析 JSON（避免依赖 python3/jq）
ALWAYS_ON=$(node -e "try{console.log(JSON.parse(require('fs').readFileSync('$PUA_DIR/config.json','utf8')).always_on)}catch{console.log('')}" 2>/dev/null)
if [ "$ALWAYS_ON" = "false" ]; then
  ok "always_on=false 持久化"
else
  fail "always_on=false 持久化 — 实际 '$ALWAYS_ON'"
fi

echo '{"always_on": true}' > "$PUA_DIR/config.json"
pi -p "${PI_BASE_ARGS[@]}" "${PI_MODEL_ARGS[@]}" --no-prompt-templates --no-context-files "echo on" >/dev/null 2>&1 || true
ALWAYS_ON=$(node -e "try{console.log(JSON.parse(require('fs').readFileSync('$PUA_DIR/config.json','utf8')).always_on)}catch{console.log('')}" 2>/dev/null)
if [ "$ALWAYS_ON" = "true" ]; then
  ok "always_on=true 持久化"
else
  fail "always_on=true 持久化 — 实际 '$ALWAYS_ON'"
fi

# ═══ 场景 7：味道切换 ═══
info "场景7：味道切换"
cleanup
echo '{"always_on": true, "flavor": "huawei"}' > "$PUA_DIR/config.json"
if pi -p "${PI_BASE_ARGS[@]}" "${PI_MODEL_ARGS[@]}" --no-prompt-templates --no-context-files "echo test" >/dev/null 2>&1; then
  ok "味道切换（config 读取正常）"
else
  fail "味道切换"
fi

# ═══ 场景 8：skill 缺失保护 ═══
info "场景8：skill 缺失保护"
TMP=$(mktemp)
pi -p "${PI_BASE_ARGS[@]}" "${PI_MODEL_ARGS[@]}" --no-skills --no-prompt-templates --no-context-files "echo test" > "$TMP" 2>&1 || true
if grep -q '定目标\|闭环\|阿里\|PUA' "$TMP"; then
  fail "skill 缺失保护 — 旁白仍出现"
else
  ok "skill 缺失保护（旁白未出现）"
fi
rm -f "$TMP"

# ═══ 场景 9：能力状态可观测 ═══
info "场景9：能力状态可观测"
TMP=$(mktemp)
echo '{"always_on": true}' > "$PUA_DIR/config.json"
pi -p "${PI_BASE_ARGS[@]}" "${PI_MODEL_ARGS[@]}" --tools read,write --no-prompt-templates --no-context-files "/pua-status" > "$TMP" 2>&1 || true
if grep -q 'Capability:' "$TMP" && grep -q 'Visibility:' "$TMP"; then
  ok "能力状态可观测"
else
  fail "能力状态可观测 — 未看到状态摘要"
fi
rm -f "$TMP"

# ═══ 汇总 ═══
echo ""
if [ "$FAILED" -eq 0 ]; then
  echo "✅ 全部通过"
  exit 0
else
  echo "❌ $FAILED 项失败"
  exit 1
fi