/**
 * 失败模式分析（对齐 tanweai/pua failure-detector.sh v2 的结构化分析层）。
 *
 * 纯函数、无副作用：提取错误签名、按最近 3 次签名分类失败模式、生成注入块。
 * 运行时状态（错误历史、峰值等级）由 index.ts 持有，本模块只做计算。
 *
 * 对齐来源：tanweai/pua 提交 82b8efc6
 * “feat(hooks): add pattern-aware failure analysis + de-escalation breakthrough detection”。
 */

/** 失败模式类型 */
export type FailurePatternType = "SPINNING" | "EXPLORING" | "MIXED" | "INSUFFICIENT";

/** 模式分类结果 */
export interface FailurePattern {
  type: FailurePatternType;
  /** SPINNING：单个重复签名；EXPLORING/MIXED：最近 3 个签名；INSUFFICIENT：空 */
  detail: string[];
}

/** 错误样式关键词：用于从输出中定位错误行 */
const ERROR_LINE_PATTERN =
  /error|fatal|traceback|exception|failed|panic|refused|denied|not found|cannot|unable|timeout/i;

/** 签名最大长度（与上游 `cut -c1-200` 对齐） */
const SIG_MAX_LEN = 200;

/** 错误历史保留条数（与上游 `tail -10` 对齐） */
export const ERROR_HISTORY_LIMIT = 10;

/**
 * 从工具输出中提取一个简短的错误签名。
 * 优先级：首个匹配错误关键词的行 → 首个非空行 → `exit_code_{code}`。
 *
 * @param text - 工具输出文本
 * @param exitCode - 退出码（用于兜底签名）
 * @returns 截断到 200 字符的错误签名
 */
export function errorSignature(text: string, exitCode: number): string {
  const lines = (text ?? "").split(/\r?\n/);
  let sig = lines.find((l) => ERROR_LINE_PATTERN.test(l))?.trim() ?? "";
  if (!sig) sig = lines.find((l) => l.trim().length > 0)?.trim() ?? "";
  if (!sig) sig = `exit_code_${exitCode}`;
  return sig.slice(0, SIG_MAX_LEN);
}

/**
 * 基于最近的错误签名分类失败模式（结构化，非语义）。
 * 比较最近 3 个签名：全同 = SPINNING（原地打转）；全异 = EXPLORING（在缩小问题）；
 * 部分相同 = MIXED；不足 3 个 = INSUFFICIENT。
 *
 * @param signatures - 历史错误签名（按时间顺序，最新在末尾）
 * @returns 模式分类结果
 */
export function classifyFailurePattern(signatures: string[]): FailurePattern {
  if (!signatures || signatures.length < 3) {
    return { type: "INSUFFICIENT", detail: [] };
  }
  const recent = signatures.slice(-3);
  const unique = new Set(recent);
  if (unique.size === 1) {
    return { type: "SPINNING", detail: [recent[recent.length - 1]] };
  }
  if (unique.size === recent.length) {
    return { type: "EXPLORING", detail: recent };
  }
  return { type: "MIXED", detail: recent };
}

/**
 * 根据失败模式生成注入到 agent 的提示块（对齐上游 PATTERN_BLOCK）。
 * INSUFFICIENT 返回空串。
 *
 * @param pattern - 模式分类结果
 * @returns 注入块文本（含前导换行），或空串
 */
export function buildPatternBlock(pattern: FailurePattern): string {
  switch (pattern.type) {
    case "SPINNING":
      return `
[🔄 模式: SPINNING — 同一错误在重复]
> 最近 3 次错误签名相同：\`${pattern.detail[0] ?? ""}\`
> 你没有取得进展。停止重试同一思路。
> 强制：下一次执行前，先列出 3 个本质不同的策略。同一修复的变体只算 1 个策略，你还需要 2 个完全不同的。`;
    case "EXPLORING": {
      const list = pattern.detail.map((s) => `> · ${s}`).join("\n");
      return `
[📊 模式: EXPLORING — 每次错误都不同]
> 最近 3 次尝试产生了不同的错误，说明你在缩小问题范围、正在取得进展。
> 最近错误签名：
${list}
> 继续探索，但加上结构：每个新错误告诉了你关于根因的什么信息？`;
    }
    case "MIXED": {
      const list = pattern.detail.map((s) => `> · ${s}`).join("\n");
      return `
[📊 模式: MIXED — 部分错误在重复]
> 有的错误在重复，有的是新的。检查：你是否在两个都不通的方案之间来回摇摆？
> 最近错误签名：
${list}
> 选择错误"最不同"（最接近成功）的那个方案，专注推进它。`;
    }
    default:
      return "";
  }
}
