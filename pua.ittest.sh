#!/usr/bin/env bash
# PUA Extension 集成测试脚本（消耗真实 AI token）
# 用法：bash ~/.pi/agent/extensions/pua/pua.ittest.sh

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXT="$SCRIPT_DIR/index.ts"
PUA_DIR="$HOME/.pua"
PI_STATE="$HOME/.pi/agent/pua-state.json"
FAILED=0

info() { echo "[TEST] $1"; }
ok()   { echo "[PASS] $1"; }
fail() { echo "[FAIL] $1"; FAILED=$((FAILED+1)); }

cleanup() {
  rm -f "$PUA_DIR/.failure_count" "$PI_STATE"
}

# PUA 开发集成测试依赖这些外部 PI package。缺失即失败，不跳过。
# 同组可列多个包名，用于兼容 PI package 改名但能力语义不变的情况。
has_pi_package_group() {
  local pi_list_text="$1"
  shift
  local package
  for package in "$@"; do
    if grep -Fq "$package" <<<"$pi_list_text"; then
      return 0
    fi
  done
  return 1
}

# ── 前置检查 ──
if ! command -v pi >/dev/null 2>&1; then
  echo "[ERROR] 'pi' 命令未找到，请确保 pi CLI 已安装并加入 PATH" >&2
  exit 1
fi

PI_LIST_TEXT="$(pi list 2>&1)"
REQUIRED_GROUPS=(
  "网络搜索与内容抓取|pi install npm:pi-web-access|npm:pi-web-access"
  "MCP 扩展入口|pi install npm:pi-mcp-adapter|npm:pi-mcp-adapter"
  "子任务拆分|pi install npm:pi-subagents|npm:pi-subagents"
  "计划模式|pi install npm:@ifi/pi-plan|npm:@ifi/pi-plan"
  "结构化询问|pi install npm:pi-ask-user|npm:pi-ask-user"
)

for group in "${REQUIRED_GROUPS[@]}"; do
  IFS='|' read -r label install_cmd package_a package_b <<<"$group"
  packages=("$package_a")
  if [ -n "${package_b:-}" ]; then
    packages+=("$package_b")
  fi
  if has_pi_package_group "$PI_LIST_TEXT" "${packages[@]}"; then
    ok "前置插件：$label"
  else
    fail "前置插件缺失：$label；安装：$install_cmd"
  fi
done

if [ "$FAILED" -gt 0 ]; then
  echo ""
  echo "❌ 前置插件缺失，集成测试失败"
  exit 1
fi

mkdir -p "$PUA_DIR"

# ── 场景1：基本加载 ──
info "场景1：基本加载"
if pi -p -e "$EXT" --no-prompt-templates --no-context-files "echo hello" >/dev/null 2>&1; then
  ok "基本加载"
else
  fail "基本加载"
fi

# ── 场景2：always_on 自动激活（行为协议注入） ──
info "场景2：always_on 自动激活"
cleanup
echo '{"always_on": true}' > "$PUA_DIR/config.json"
# 发送一个正常任务，extension 应加载且不报错
if pi -p -e "$EXT" --no-prompt-templates --no-context-files "echo hello" >/dev/null 2>&1; then
  ok "always_on 自动激活"
else
  fail "always_on 自动激活 — extension 报错"
fi

# ── 场景3：失败检测与计数 ──
info "场景3：失败检测与计数"
cleanup
echo '{"always_on": true}' > "$PUA_DIR/config.json"
# 强制走真实失败 tool_result，避免模型只在文本里描述失败而不触发扩展计数。
pi -p -e "$EXT" --tools bash --no-prompt-templates --no-context-files "Use the bash tool exactly once to run: exit 42. Do not run any other command. Then stop." >/dev/null 2>&1 || true
COUNT=$(cat "$PUA_DIR/.failure_count" 2>/dev/null || echo 0)
if [ "$COUNT" = "1" ]; then
  ok "失败计数 = 1"
elif [ "$COUNT" -ge 1 ] 2>/dev/null; then
  ok "失败计数递增到 $COUNT"
else
  fail "失败计数 — 预期至少 1，实际 $COUNT"
fi

# ── 场景4：压力升级（连续失败） ──
info "场景4：压力升级（连续失败）"
cleanup
echo '{"always_on": true}' > "$PUA_DIR/config.json"
for i in 1 2 3; do
  # sleep 让每次失败越过扩展的 3 秒防抖窗口，确保验证连续升级而非抖动合并。
  pi -p -e "$EXT" --tools bash --no-prompt-templates --no-context-files "Use the bash tool exactly once to run: exit 42. Do not run any other command. Then stop." >/dev/null 2>&1 || true
  sleep 1
done
COUNT=$(cat "$PUA_DIR/.failure_count" 2>/dev/null || echo 0)
if [ "$COUNT" = "3" ]; then
  ok "连续失败计数 = 3"
elif [ "$COUNT" -ge 3 ] 2>/dev/null; then
  ok "连续失败计数递增到 $COUNT"
else
  fail "连续失败计数 — 预期至少 3，实际 $COUNT"
fi

# ── 场景5：成功清零 ──
info "场景5：成功清零"
pi -p -e "$EXT" --tools bash --no-prompt-templates --no-context-files "Use the bash tool exactly once to run: printf ok. Do not run any other command. If it succeeds, reply exactly DONE." >/dev/null 2>&1 || true
COUNT=$(cat "$PUA_DIR/.failure_count" 2>/dev/null || echo 0)
if [ "$COUNT" = "0" ]; then
  ok "成功清零"
else
  fail "成功清零 — 预期 0，实际 $COUNT"
fi

# ── 场景6：on/off 持久化 ──
info "场景6：on/off 持久化"
echo '{"always_on": false}' > "$PUA_DIR/config.json"
pi -p -e "$EXT" --no-prompt-templates --no-context-files "echo off" >/dev/null 2>&1 || true
ALWAYS_OFF=$(python3 -c "import json; print(json.load(open('$PUA_DIR/config.json')).get('always_on',''))" 2>/dev/null || echo "")
if [ "$ALWAYS_OFF" = "False" ]; then
  ok "always_on=false 持久化"
else
  fail "always_on=false 持久化 — 预期 False，实际 '$ALWAYS_OFF'"
fi

echo '{"always_on": true}' > "$PUA_DIR/config.json"
pi -p -e "$EXT" --no-prompt-templates --no-context-files "echo on" >/dev/null 2>&1 || true
ALWAYS_ON=$(python3 -c "import json; print(json.load(open('$PUA_DIR/config.json')).get('always_on',''))" 2>/dev/null || echo "")
if [ "$ALWAYS_ON" = "True" ]; then
  ok "always_on=true 持久化"
else
  fail "always_on=true 持久化 — 预期 True，实际 '$ALWAYS_ON'"
fi

# ── 场景7：味道切换 ──
info "场景7：味道切换"
cleanup
echo '{"always_on": true, "flavor": "huawei"}' > "$PUA_DIR/config.json"
# 验证 config 被正确读取且 extension 正常工作
if pi -p -e "$EXT" --no-prompt-templates --no-context-files "echo test" >/dev/null 2>&1; then
  ok "味道切换（config 读取正常）"
else
  fail "味道切换"
fi

# ── 场景8：skill 缺失保护 ──
info "场景8：skill 缺失保护"
TMP=$(mktemp)
# --no-skills 时 extension 应自动关闭，下一句话不应有旁白
pi -p -e "$EXT" --no-skills --no-prompt-templates --no-context-files "echo test" > "$TMP" 2>&1 || true
if grep -q '定目标\|闭环\|阿里\|PUA' "$TMP"; then
  fail "skill 缺失保护 — 旁白仍出现（extension 未关闭）"
else
  ok "skill 缺失保护（旁白未出现）"
fi
rm -f "$TMP"

# ── 场景9：能力状态可观测 ──
info "场景9：能力状态可观测"
TMP=$(mktemp)
echo '{"always_on": true}' > "$PUA_DIR/config.json"
# 只暴露 read/write 时，能力快照只应出现在状态命令中，不应注入旧的缺失工具 prompt。
pi -p -e "$EXT" --tools read,write --no-prompt-templates --no-context-files "/pua-status" > "$TMP" 2>&1 || true
STATUS_OUTPUT=$(cat "$TMP")
if grep -q 'Capability:' "$TMP" && grep -q 'Visibility:' "$TMP" && ! grep -q 'read 工具\|pi-hermes-memory\|@samfp/pi-memory' "$TMP"; then
  ok "能力状态可观测"
else
  fail "能力状态可观测 — 未看到状态摘要，或仍出现旧缺失工具/记忆插件提示。输出：$STATUS_OUTPUT"
fi
rm -f "$TMP"

# ── 汇总 ──
echo ""
if [ "$FAILED" -eq 0 ]; then
  echo "✅ 全部通过"
  exit 0
else
  echo "❌ $FAILED 项失败"
  exit 1
fi
