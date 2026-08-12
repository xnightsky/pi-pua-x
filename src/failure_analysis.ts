/**
 * 失败模式分析（对齐 tanweai/pua failure-detector.sh v2 的结构化分析层）。
 *
 * 纯函数、无副作用：提取错误签名、按最近 3 次签名分类失败模式、生成注入块。
 * 运行时状态（错误历史、峰值等级）由 index.ts 持有，本模块只做计算。
 *
 * 对齐来源：tanweai/pua 提交 82b8efc6
 * “feat(hooks): add pattern-aware failure analysis + de-escalation breakthrough detection”。
 */

import { normalizeFlavorKey } from "./references_loader.js";

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

// ═══════════════════════════════════════════════════════════════
// 突破降压（de-escalation）—— 对齐上游"奖励端 + 深层换框"
// ═══════════════════════════════════════════════════════════════

/**
 * 突破触发条件：连续失败 ≥3 次且会话峰值压力 ≥L2 后的一次成功（对齐上游）。
 *
 * @param failureCount - 当前连续失败次数
 * @param peakLevel - 本会话达到过的最高压力等级
 * @returns 是否应触发突破降压
 */
export function shouldDeescalate(failureCount: number, peakLevel: number): boolean {
  return failureCount >= 3 && peakLevel >= 2;
}

/** 各味道的突破认可话术（对齐上游 82b8efc6 Part 3）；`{{n}}` 在生成时替换为失败次数 */
const RECOGNITION_MAP: Record<string, string> = {
  alibaba: "这才是 Owner 该有的样子，3.75 打底。刚才卡了 {{n}} 次，根因是什么？把正确路径写下来下次直达——这叫沉淀方法论。",
  bytedance: "结果到位了，ROI 翻正。把刚才有效的方法提炼成 SOP 写进 memory。那 {{n}} 次失败就是数据，别浪费。",
  huawei: "军令状完成。烧不死的鸟是凤凰——你刚证明了自己烧不死。按自我批判复盘：哪个假设一开始就错了？写入经验库。胜则举杯相庆。",
  tencent: "赛马跑出来了，你赢了这条赛道。做灰度验证确认可复现、边界清楚，再把这套打法沉淀，下次小步快跑直接跑通。",
  baidu: "搜索 + 深挖见效了，基本盘守住了。把搜索路径和关键发现记录下来——简单可依赖的前提是路径可复用。",
  pinduoduo: "本分做到了，结果出来就是硬核。回头看：{{n}} 次失败里有多少步可以砍？极致效率 = 下次零弯路。",
  meituan: "做难而正确的事，你做到了。猛将发于卒伍——这次卡住就是你的卒伍。把解题路径标准化，下次同类直接套。",
  jd: "结果拿到了，这才是兄弟该有的执行力。正道成功——过程虽硬路子是对的。沉淀下来，让下一个兄弟不用再走弯路。",
  xiaomi: "极致！这次交付够极致。把方案性价比拉满——记录最短路径，下次专注直达。",
  netflix: "Keeper Test: passed. 你扛过了 {{n}} 次失败——这就是 stunning colleague 该做的。记录什么有效、以及之前为什么失败，这是把 adequate 和 exceptional 区分开的学习闭环。",
  tesla: "Good. Shipped. 现在回溯 The Algorithm：这 {{n}} 次失败里哪些本不该存在？哪个需求一开始就该质疑？把浪费从你的心智模型里删掉。",
  apple: "That's A-player work. Real artists ship——你穿过了 {{n}} 次失败。现在做减法：到这个解的最短路径是什么？把多余的尝试全部剥掉。优雅 = 最短路径。",
  amazon: "Delivered Results——LP #1 的体现。从这次成功 Working Backwards 写个小复盘：早期违反了哪条 LP？Dive Deep 弄清原因，记录路径 Earn Trust。",
  microsoft: "Impact Descriptor 更新：轨迹从 SLITE 回到 Successful Impact。{{n}} 次失败 → 改变动作 → 验证结果，这是完整的学习闭环。把它写进你的 Connects：个人影响 + leverage 已有资产的证据。",
};

/** 默认认可话术（未知味道兜底） */
const DEFAULT_RECOGNITION =
  "突破了。{{n}} 次失败后找到正确方案——这才是真正的 problem solving。复盘：之前为什么卡住？正确路径是什么？写入 memory，下次直达。";

/**
 * 生成突破降压注入块（对齐上游 `[PUA 突破 ✨]`）。
 * 含味道认可话术 + 压力归零声明 + 强制复盘三步。
 *
 * @param flavorKey - 当前味道 key（兼容 musk→tesla 别名）
 * @param fromLevel - 突破前的峰值压力等级
 * @param afterFailures - 连续失败次数
 * @returns 注入块文本
 */
export function buildDeescalationBlock(flavorKey: string, fromLevel: number, afterFailures: number): string {
  const tmpl = RECOGNITION_MAP[normalizeFlavorKey(flavorKey)] ?? DEFAULT_RECOGNITION;
  const recognize = tmpl.replaceAll("{{n}}", String(afterFailures));
  return `[PUA 突破 ✨ — 从 L${fromLevel} 降压]

> ${recognize}

压力已重置：L${fromLevel} → L0。你现在必须：
1. 简述前 ${afterFailures} 次尝试失败的根因（根因，不是表象）
2. 把正确方法记录到 memory/evolution.md 供未来复用
3. 验证方案完整（别过早庆祝）

[PUA生效 🔥] ${afterFailures} 次连续失败后的突破，有效方法应被内化。`;
}
