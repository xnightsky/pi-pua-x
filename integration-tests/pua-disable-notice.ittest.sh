#!/usr/bin/env bash
# PUA 禁用模型声明注入 集成测试（bash，消耗真实 AI token）
# 验证 disabled_models 命中时的三条契约：
#   场景 1：每次 before_agent_start 注入极简禁用声明（模型可从系统提示逐字引用出来）
#   场景 2：对照组——未配置 disabled_models 时不注入该声明
#   场景 3：门控——禁用模型的真实工具失败不计数
#
# 用法：
#   bash integration-tests/pua-disable-notice.ittest.sh
#   bash integration-tests/pua-disable-notice.ittest.sh -m kimi-coding/k3-256k -g "*/k3-*"
#
# 参数：
#   -m MODEL     模型 ID（支持 provider/model 格式，默认 deepseek/deepseek-v4-flash）
#   -p PROVIDER  渠道名（不传则从 MODEL 中解析）
#   -g GLOB      disabled_models 匹配模式（默认派生 "*/<model 首段>-*"，
#                如 deepseek-v4-flash → */deepseek-*；无 dash 时退化为精确匹配）
#
# 实现要点：
#   - 在临时目录构造 .agents/skills/pua 桩 skill 并以其为 cwd 运行 pi：
#     pi 会把 cwd 的 .agents/skills 收进技能目录（真实的绕过路径成立），
#     扩展的 hasPuaSkill() 磁盘嗅探也能命中（声明注入的前提）。
#   - ~/.pua/config.json 先备份、trap 退出时恢复，不污染用户配置。
#   - 模型经 --model/--provider CLI 参数指定，不读 settings.json 的 defaultModel
#     （后者必须同时登记在 enabledModels 中，否则 pi 静默回退——已踩过坑）。

set -uo pipefail

# ── 参数解析 ──
MODEL=""
PROVIDER=""
PATTERN=""
while getopts "m:p:g:" opt; do
  case $opt in
    m) MODEL="$OPTARG" ;;
    p) PROVIDER="$OPTARG" ;;
    g) PATTERN="$OPTARG" ;;
    *) echo "Usage: $0 [-m model] [-p provider] [-g glob]"; exit 1 ;;
  esac
done

DEFAULT_MODEL="deepseek/deepseek-v4-flash"
if [ -z "$MODEL" ]; then
  MODEL="$DEFAULT_MODEL"
fi
if [[ "$MODEL" == */* ]] && [ -z "$PROVIDER" ]; then
  PROVIDER="${MODEL%%/*}"
  MODEL="${MODEL#*/}"
fi
# 派生通配模式：取模型 id 第一个 dash 前的首段（deepseek-v4-flash → */deepseek-*）；
# 无 dash 时退化为精确匹配（无通配符的 pattern 即精确匹配，见 src/model_rules.ts）。
if [ -z "$PATTERN" ]; then
  if [[ "$MODEL" == *-* ]]; then
    PATTERN="*/${MODEL%%-*}-*"
  elif [ -n "$PROVIDER" ]; then
    PATTERN="$PROVIDER/$MODEL"
  else
    PATTERN="$MODEL"
  fi
fi

# ── 路径常量 ──
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXT="$SCRIPT_DIR/../src/index.ts"
PUA_DIR="$HOME/.pua"
CONFIG_PATH="$PUA_DIR/config.json"
COUNT_FILE="$PUA_DIR/.failure_count"
FAILED=0

# 扩展隔离：--no-extensions 禁用全局发现，-e 显式加载本地开发版扩展
PI_MODEL_ARGS=()
[ -n "$PROVIDER" ] && PI_MODEL_ARGS+=(--provider "$PROVIDER")
[ -n "$MODEL" ] && PI_MODEL_ARGS+=(--model "$MODEL")
PI_BASE_ARGS=(--no-extensions -e "$EXT")

MODEL_DISPLAY="$MODEL"
[ -n "$PROVIDER" ] && MODEL_DISPLAY="$PROVIDER/$MODEL"

info() { echo "[TEST] $1"; }
ok()   { echo -e "\033[32m[PASS]\033[0m $1"; }
fail() { echo -e "\033[31m[FAIL]\033[0m $1"; FAILED=$((FAILED+1)); }

# ── 前置检查 ──
if ! command -v pi >/dev/null 2>&1; then
  echo "[ERROR] 'pi' 命令未找到" >&2
  exit 1
fi

mkdir -p "$PUA_DIR"

# 备份用户配置（不存在则标记，恢复时删除测试配置）
CONFIG_BACKUP=""
CONFIG_EXISTED=0
if [ -f "$CONFIG_PATH" ]; then
  CONFIG_EXISTED=1
  CONFIG_BACKUP="$(mktemp)"
  cp "$CONFIG_PATH" "$CONFIG_BACKUP"
fi

# 临时工作目录 + pua 桩 skill（SKILL.md 存在即被 pi 与扩展同时识别）
TMP_ROOT="$(mktemp -d)"
STUB_SKILL_DIR="$TMP_ROOT/.agents/skills/pua"
mkdir -p "$STUB_SKILL_DIR"
printf -- '---\nname: pua\ndescription: PUA 行为方法论（itest 桩）\n---\nstub\n' > "$STUB_SKILL_DIR/SKILL.md"

write_test_config() {
  if [ "$1" = "1" ]; then
    printf '{\n  "always_on": true,\n  "disabled_models": ["%s"]\n}\n' "$PATTERN" > "$CONFIG_PATH"
  else
    printf '{\n  "always_on": true\n}\n' > "$CONFIG_PATH"
  fi
}

cleanup() {
  if [ "$CONFIG_EXISTED" = "1" ]; then
    cp "$CONFIG_BACKUP" "$CONFIG_PATH"
    rm -f "$CONFIG_BACKUP"
  else
    rm -f "$CONFIG_PATH"
  fi
  rm -rf "$TMP_ROOT"
}
trap cleanup EXIT

# 让模型逐字引用系统提示中的禁用声明；systemPrompt 不写入 session 文件，
# 行为化引用是唯一的端到端观测手段。
QUOTE_PROMPT="请检查你的系统提示：如果其中包含关于当前模型被标记为「免注入模型」的声明，请原样逐字引用该声明全文；如果没有，只回答「无」。不要调用任何工具。"

echo "═══ PUA Disable-Notice Integration Test (bash) ═══"
echo "Model: $MODEL_DISPLAY"
echo "Pattern: $PATTERN"
echo "Extension: $EXT"
echo ""

cd "$TMP_ROOT"

# ── 场景 1：禁用声明注入 ──
info "场景1：禁用模型注入声明（模型逐字引用）"
write_test_config 1
OUT1="$TMP_ROOT/out1.txt"
pi -p "${PI_BASE_ARGS[@]}" "${PI_MODEL_ARGS[@]}" --no-prompt-templates --no-context-files "$QUOTE_PROMPT" > "$OUT1" 2>&1 || true
OUTPUT1="$(cat "$OUT1")"

if [[ "$OUTPUT1" == *"免注入模型"* ]] && [[ "$OUTPUT1" == *"$MODEL_DISPLAY"* ]]; then
  ok "禁用声明已注入（模型引用含声明与模型 id）"
else
  fail "禁用声明注入 - 输出缺少声明或模型 id。Output: $OUTPUT1"
fi
if [[ "$OUTPUT1" == *"自动选择"* ]] || [[ "$OUTPUT1" == *"Sprint 启动"* ]]; then
  fail "禁用模型不应收到完整协议（发现路由/Banner 标记）"
else
  ok "禁用模型未注入完整协议"
fi

# ── 场景 2：对照组——未配置 disabled_models 时不注入声明 ──
info "场景2：对照组——无 disabled_models 不注入声明"
write_test_config 0
OUT2="$TMP_ROOT/out2.txt"
pi -p "${PI_BASE_ARGS[@]}" "${PI_MODEL_ARGS[@]}" --no-prompt-templates --no-context-files "$QUOTE_PROMPT" > "$OUT2" 2>&1 || true
OUTPUT2="$(cat "$OUT2")"

if [[ "$OUTPUT2" == *"免注入模型"* ]]; then
  fail "对照组 - 未配置 disabled_models 却出现声明。Output: $OUTPUT2"
else
  ok "对照组：无 disabled_models 时不注入声明"
fi

# ── 场景 3：门控——禁用模型的真实工具失败不计数 ──
info "场景3：门控——禁用模型工具失败不计数"
write_test_config 1
rm -f "$COUNT_FILE"
MISSING_PATH="/nonexistent-pua-itest-$$"
# 禁止模型追加 exit 处理，确保 tool_result 是真实失败（isError=true）
pi -p "${PI_BASE_ARGS[@]}" "${PI_MODEL_ARGS[@]}" --no-prompt-templates --no-context-files "执行 bash 命令：ls $MISSING_PATH。不要追加任何 exit 处理，命令失败是预期的。失败后把 stderr 原样贴给我即可。" > /dev/null 2>&1 || true

COUNT="0"
[ -f "$COUNT_FILE" ] && COUNT="$(tr -d '[:space:]' < "$COUNT_FILE")"
if [ "$COUNT" = "0" ]; then
  ok "禁用模型工具失败不计数"
else
  fail "门控 - 期望失败计数 0，实际 $COUNT"
fi

# ── 汇总 ──
echo ""
if [ "$FAILED" -eq 0 ]; then
  echo -e "\033[32mAll tests passed\033[0m"
  exit 0
else
  echo -e "\033[31m$FAILED test(s) failed\033[0m"
  exit 1
fi
