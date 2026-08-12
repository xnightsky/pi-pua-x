/**
 * PUA Enforcement Module — 主动约束层
 *
 * 实现 4 个增强 hook 的核心检测逻辑：
 * 1. input: 用户挫败检测
 * 2. tool_call: 四权分立 + 重复命令检测
 * 3. session_before_compact: 压力状态保存
 * 4. turn_end: 空口完成 + 原地打转检测
 *
 * 本模块保持为纯 ESM，不依赖 PI runtime API，方便单元测试。
 */

// ═══════════════════════════════════════════════════════════════
// 配置类型
// ═══════════════════════════════════════════════════════════════

/**
 * enforcement 相关配置字段。
 * 从 ~/.pua/config.json 读取，与主配置合并。
 */
export interface EnforcementConfig {
  /** 约束等级：observe=只通知 | suggest=通知+确认 | enforce=通知+自动block */
  enforcement_level?: "observe" | "suggest" | "enforce";
  /** 四权分立 integrity guard 开关 */
  integrity_guard?: boolean;
  /** 用户挫败检测开关 */
  frustration_detection?: boolean;
  /** 原地打转检测开关 */
  loop_detection?: boolean;
  /** 压缩前状态保存开关 */
  compact_state_save?: boolean;
}

/** 默认配置 */
export const DEFAULT_ENFORCEMENT_CONFIG: Required<EnforcementConfig> = {
  enforcement_level: "suggest",
  integrity_guard: true,
  frustration_detection: true,
  loop_detection: true,
  compact_state_save: true,
};

/**
 * 合并用户配置与默认值。
 * @param userConfig - 用户 ~/.pua/config.json 中的 enforcement 相关字段
 * @returns 完整配置
 */
export function resolveEnforcementConfig(
  userConfig: Partial<EnforcementConfig> | undefined
): Required<EnforcementConfig> {
  return { ...DEFAULT_ENFORCEMENT_CONFIG, ...userConfig };
}

// ═══════════════════════════════════════════════════════════════
// Hook 1: 用户挫败检测（input event）
// ═══════════════════════════════════════════════════════════════

/** 中英文挫败关键词（大小写不敏感匹配） */
const FRUSTRATION_PATTERNS: RegExp[] = [
  // 中文
  /为什么还不行/,
  /怎么还是不行/,
  /你[一再又]直?失败/,
  /再试[试一]?[下次]/,
  /试[了过]这么多次/,
  /能不能[用认]?点心/,
  /你到底[行能]不[行能]/,
  /别[再又]给我/,
  /不[要是]?跟我说(不行|做不到|无法)/,
  // 英文
  /why (does|is) (this|it) (still )?(not work|fail|broken)/i,
  /try (harder|again|once more)/i,
  /stop (giving up|failing|quitting)/i,
  /you keep (failing|getting it wrong)/i,
  /figure it out/i,
  /don'?t (just )?give up/i,
  /this (still )?doesn'?t work/i,
];

/**
 * 检测用户输入是否包含挫败信号。
 * @param text - 用户原始输入文本
 * @returns 是否匹配到挫败模式
 */
export function detectFrustration(text: string): boolean {
  if (!text || text.length < 3) return false;
  return FRUSTRATION_PATTERNS.some((p) => p.test(text));
}

// ═══════════════════════════════════════════════════════════════
// Hook 2: 四权分立 + 重复命令检测（tool_call event）
// ═══════════════════════════════════════════════════════════════

/** 四权分立保护模式：写入目标路径匹配 */
const PROTECTED_WRITE_PATTERNS: Array<{ pattern: RegExp; reason: string; level: "advisory" | "deny" }> = [
  {
    pattern: /(^|\/)(tests?|__tests__|spec|evals?|e2e|cypress|playwright)(\/|$)|\.(test|spec)\.[A-Za-z0-9]+$/i,
    reason: "四权分立：测试/评估资产属于评分权，执行者不应修改",
    level: "advisory",
  },
  {
    pattern: /(^|\/)\.github\/workflows(\/|$)|(^|\/)(ci|buildkite|circleci|jenkins)(\/|$)/i,
    reason: "四权分立：CI 配置属于环境修改权，需人工确认",
    level: "advisory",
  },
  {
    pattern: /(^|\/)\.env(\.|$)|(^|\/)(secrets?|credentials?)(\.|\/|$)/i,
    reason: "四权分立：秘密文件需人工确认",
    level: "advisory",
  },
];

/** 污染模式：隐藏测试/答案，强制 deny */
const CONTAMINATION_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  {
    pattern: /(^|\/)(hidden[-_]?tests?|verifier[-_]?private|hidden[-_]?cases?)(\/|$)/i,
    reason: "解题污染风险：隐藏测试/验证器私有资产",
  },
  {
    pattern: /(^|\/)(hidden_solution|gold_patch|benchmark_answers?|answer_key)(\.|\/|$)/i,
    reason: "解题污染风险：隐藏答案/基准答案资产",
  },
];

export interface IntegrityCheckResult {
  /** 是否应当阻止执行 */
  block: boolean;
  /** 检测结果类型 */
  level: "pass" | "advisory" | "deny";
  /** 原因说明 */
  reason?: string;
  /** 命中的目标路径 */
  target?: string;
}

/**
 * 检查工具调用是否触发四权分立保护。
 * @param toolName - 工具名称
 * @param input - 工具输入参数
 * @returns 检测结果
 */
export function checkIntegrity(toolName: string, input: any): IntegrityCheckResult {
  const pass: IntegrityCheckResult = { block: false, level: "pass" };
  if (!toolName || !input) return pass;

  const name = toolName.toLowerCase();
  // 只检查写入类工具
  if (name !== "edit" && name !== "write" && name !== "bash") return pass;

  // 提取目标路径
  const paths = collectPaths(name, input);

  for (const p of paths) {
    const normalized = p.replace(/\\/g, "/");
    // 先检查污染模式（强制 deny）
    for (const { pattern, reason } of CONTAMINATION_PATTERNS) {
      if (pattern.test(normalized)) {
        return { block: true, level: "deny", reason, target: p };
      }
    }
    // 再检查保护模式（advisory）
    for (const { pattern, reason, level } of PROTECTED_WRITE_PATTERNS) {
      if (pattern.test(normalized)) {
        return { block: false, level, reason, target: p };
      }
    }
  }
  return pass;
}

/** 从工具输入中提取目标路径 */
function collectPaths(toolName: string, input: any): string[] {
  const paths: string[] = [];
  if (!input) return paths;
  if (toolName === "edit" || toolName === "write") {
    if (typeof input.path === "string") paths.push(input.path);
    if (typeof input.file_path === "string") paths.push(input.file_path);
  }
  if (toolName === "bash" && typeof input.command === "string") {
    // 从 bash 命令中提取路径片段（含 /）
    const multiSegment = input.command.match(/[A-Za-z0-9_.@+~:/-]+(?:\/[A-Za-z0-9_.@+~:/-]+)+/g);
    if (multiSegment) paths.push(...multiSegment);
    // 提取单文件名（如 .env.local、secrets.json）
    const tokens = input.command.split(/[\s;&|><]+/);
    for (const t of tokens) {
      const cleaned = t.replace(/^["']+|["']+$/g, "");
      if (cleaned && /^[.]?[A-Za-z_][A-Za-z0-9_.-]*$/.test(cleaned)) {
        paths.push(cleaned);
      }
    }
  }
  return paths;
}

// ═══════════════════════════════════════════════════════════════
// Hook 2 辅助：重复命令检测
// ═══════════════════════════════════════════════════════════════

/**
 * 命令历史记录器，用于检测连续重复的 bash 命令。
 */
export class CommandHistory {
  private history: string[] = [];
  private readonly maxSize: number;

  constructor(maxSize = 5) {
    this.maxSize = maxSize;
  }

  /** 记录一条命令 */
  push(command: string): void {
    this.history.push(command.trim());
    if (this.history.length > this.maxSize) {
      this.history.shift();
    }
  }

  /** 清空历史 */
  clear(): void {
    this.history = [];
  }

  /**
   * 检测新命令是否与最近命令高度相似。
   * 简化策略：去除参数后比较命令骨架。
   * @param command - 新命令
   * @returns 是否检测到重复模式
   */
  isRepetitive(command: string): boolean {
    if (this.history.length < 2) return false;
    const skeleton = this.commandSkeleton(command);
    const recentSkeletons = this.history.slice(-3).map((c) => this.commandSkeleton(c));
    const matches = recentSkeletons.filter((s) => s === skeleton).length;
    return matches >= 2;
  }

  /**
   * 提取命令骨架：去除参数值，保留命令结构。
   * 例如 `npm test -- --filter=foo` → `npm test -- --filter=*`
   */
  private commandSkeleton(cmd: string): string {
    return cmd
      .trim()
      .replace(/=\S+/g, "=*")       // 去除等号后的值
      .replace(/"[^"]*"/g, '"*"')   // 去除引号内容
      .replace(/'[^']*'/g, "'*'")   // 去除单引号内容
      .replace(/\d+/g, "N");        // 数字替换为 N
  }
}

// ═══════════════════════════════════════════════════════════════
// Hook 3: 压缩前状态保存（session_before_compact）
// ═══════════════════════════════════════════════════════════════

export interface CompactStateSnapshot {
  timestamp: string;
  pressure_level: string;
  failure_count: number;
  current_flavor: string;
  recent_failures: string[];
}

/**
 * 生成压缩前的状态快照，用于写入 builder-journal.md。
 * @param state - 当前运行时状态
 * @returns 格式化的 markdown 内容
 */
export function buildCompactStateMarkdown(state: CompactStateSnapshot): string {
  const lines = [
    "# PUA Builder Journal — Compaction Checkpoint",
    "",
    `## Timestamp`,
    state.timestamp,
    "",
    `## Runtime State`,
    `- pressure_level: ${state.pressure_level}`,
    `- failure_count: ${state.failure_count}`,
    `- current_flavor: ${state.current_flavor}`,
    "",
    `## Recent Failures`,
  ];
  if (state.recent_failures.length > 0) {
    for (const f of state.recent_failures.slice(-5)) {
      lines.push(`- ${f}`);
    }
  } else {
    lines.push("- (none)");
  }
  lines.push("");
  return lines.join("\n");
}

// ═══════════════════════════════════════════════════════════════
// Hook 4: 空口完成 + 原地打转检测（turn_end）
// ═══════════════════════════════════════════════════════════════

/** 完成声明关键词（中英文） */
const COMPLETION_CLAIMS: RegExp[] = [
  /已完成/,
  /完成了/,
  /搞定/,
  /修复完毕/,
  /问题已解决/,
  /done/i,
  /fixed/i,
  /completed/i,
  /resolved/i,
  /all (tests? )?pass/i,
];

/** 验证工具名称（表示模型确实跑了验证） */
const VERIFICATION_TOOLS = new Set(["bash", "powershell", "shell"]);

/**
 * 检测 assistant 消息是否包含完成声明。
 * @param text - assistant 消息文本
 * @returns 是否声称完成
 */
export function detectCompletionClaim(text: string): boolean {
  if (!text) return false;
  return COMPLETION_CLAIMS.some((p) => p.test(text));
}

/**
 * 检查本轮工具结果中是否有成功的验证执行。
 * @param toolResults - 本轮工具执行结果数组
 * @returns 是否存在成功的验证工具调用
 */
export function hasVerificationEvidence(toolResults: any[]): boolean {
  if (!Array.isArray(toolResults) || toolResults.length === 0) return false;
  return toolResults.some((r) => {
    const toolName = (r?.toolName ?? r?.tool_name ?? "").toLowerCase();
    if (!VERIFICATION_TOOLS.has(toolName)) return false;
    // 工具执行成功（非 error）
    return r?.isError !== true;
  });
}

export interface TurnAnalysis {
  /** 是否检测到空口完成 */
  unverifiedCompletion: boolean;
  /** 是否检测到原地打转 */
  loopDetected: boolean;
}

/**
 * 分析一轮结束后的行为模式。
 * @param assistantText - 本轮 assistant 消息文本
 * @param toolResults - 本轮工具结果
 * @param commandHistory - 命令历史记录器
 * @returns 分析结果
 */
export function analyzeTurn(
  assistantText: string,
  toolResults: any[],
  commandHistory: CommandHistory
): TurnAnalysis {
  const claimed = detectCompletionClaim(assistantText);
  const hasEvidence = hasVerificationEvidence(toolResults);
  const unverifiedCompletion = claimed && !hasEvidence;

  // 检测原地打转：本轮有失败的 bash 且命令重复
  let loopDetected = false;
  const failedBash = toolResults.filter((r) => {
    const name = (r?.toolName ?? r?.tool_name ?? "").toLowerCase();
    return name === "bash" && r?.isError === true;
  });
  for (const r of failedBash) {
    const cmd = r?.input?.command ?? "";
    if (cmd && commandHistory.isRepetitive(cmd)) {
      loopDetected = true;
      break;
    }
  }

  return { unverifiedCompletion, loopDetected };
}
