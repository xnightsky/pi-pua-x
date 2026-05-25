/**
 * PUA pi 适配器（对齐 tanweai/pua）
 *
 * 核心机制（与 tanweai/pua 对齐）：
 * 1. SessionStart 时若 always_on=true，通过 before_agent_start 注入完整行为协议
 *    （三条红线、旁白协议、[PUA生效]标记、方法论路由、味道系统）
 * 2. tool_result 检测命令失败，累加 .failure_count，叠加 L1–L4 强制动作
 * 3. 成功执行后自动清零 .failure_count
 *
 * 安装与使用见 INSTALL.md；内部设计见 docs/DESIGN.md。
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import {
  loadFlavorInfo,
  loadPressurePrompts,
  buildBehaviorProtocol,
  findSkillDirs,
  getReferencesDir,
} from "./references_loader.js";
import {
  buildCapabilityEnhancementPrompt,
  buildCapabilitySnapshot,
  decorateSubagentInput,
  formatCapabilityStatus,
  isSubagentToolName,
} from "./capabilities.js";
import {
  detectFrustration,
  checkIntegrity,
  CommandHistory,
  buildCompactStateMarkdown,
  analyzeTurn,
  resolveEnforcementConfig,
} from "./enforcement.js";

/** PUA 扩展的运行时状态 */
interface PuaState {
  /** 当前是否启用 PUA 注入 */
  enabled: boolean;
  /** 累计失败次数（读取自官方 .failure_count 文件） */
  failureCount: number;
  /** 最后一次检测到失败的时间戳（毫秒） */
  lastFailureTs: number;
  /** 上一次注入系统提示时的压力等级 */
  lastInjectedLevel: number;
}

/** 默认运行时状态 */
const DEFAULT_STATE: PuaState = {
  enabled: true,
  failureCount: 0,
  lastFailureTs: 0,
  lastInjectedLevel: 0,
};

/** 当前用户 Home 目录（跨平台兼容） */
const HOME = homedir();
/** PUA 全局配置目录（~/.pua） */
const PUA_DIR = join(HOME, ".pua");
/** PUA 主配置文件路径 */
const PUA_CONFIG = join(PUA_DIR, "config.json");
/** 官方失败计数文件（与 tanweai/pua skill 共享） */
const OFFICIAL_FAILURE_COUNT = join(PUA_DIR, ".failure_count");
/** pi agent 扩展状态目录 */
const PI_AGENT_DIR = join(HOME, ".pi", "agent");
/** pi 扩展私有状态文件（记录最后失败时间、注入等级） */
const PI_EXTENSION_STATE = join(PI_AGENT_DIR, "pua-state.json");

// ═══════════════════════════════════════════════════════════════
// 配置读写（官方文件）
// ═══════════════════════════════════════════════════════════════

/**
 * 读取 PUA 主配置文件（~/.pua/config.json）。
 * 文件不存在或解析失败时返回空对象。
 */
function readPuaConfig(): Record<string, any> {
  try {
    if (existsSync(PUA_CONFIG)) return JSON.parse(readFileSync(PUA_CONFIG, "utf-8"));
  } catch {}
  return {};
}

/**
 * 合并写入 PUA 主配置文件，自动创建缺失目录。
 * @param patch - 要合并的配置键值对
 */
function writePuaConfig(patch: Record<string, any>): void {
  try {
    mkdirSync(PUA_DIR, { recursive: true });
    const existing = readPuaConfig();
    writeFileSync(PUA_CONFIG, JSON.stringify({ ...existing, ...patch }, null, 2) + "\n", "utf-8");
  } catch {}
}

/**
 * 读取官方失败计数文件。
 * 文件不存在或解析失败时返回 0。
 */
function readOfficialFailureCount(): number {
  try {
    if (existsSync(OFFICIAL_FAILURE_COUNT)) {
      const n = parseInt(readFileSync(OFFICIAL_FAILURE_COUNT, "utf-8").trim(), 10);
      if (!isNaN(n)) return n;
    }
  } catch {}
  return 0;
}

/**
 * 写入官方失败计数文件，自动创建缺失目录。
 * @param n - 要写入的失败次数
 */
function writeOfficialFailureCount(n: number): void {
  try {
    mkdirSync(PUA_DIR, { recursive: true });
    writeFileSync(OFFICIAL_FAILURE_COUNT, String(n) + "\n", "utf-8");
  } catch {}
}

/**
 * 读取 pi 扩展私有状态（最后失败时间、上次注入等级）。
 * 文件不存在或解析失败时返回零值对象。
 */
function readPiExtensionState(): { lastFailureTs: number; lastInjectedLevel: number } {
  try {
    if (existsSync(PI_EXTENSION_STATE)) {
      const d = JSON.parse(readFileSync(PI_EXTENSION_STATE, "utf-8"));
      return { lastFailureTs: d.lastFailureTs ?? 0, lastInjectedLevel: d.lastInjectedLevel ?? 0 };
    }
  } catch {}
  return { lastFailureTs: 0, lastInjectedLevel: 0 };
}

/**
 * 写入 pi 扩展私有状态，自动合并已有字段。
 * @param s - 状态片段，包含最后失败时间戳与上次注入等级
 */
function writePiExtensionState(s: { lastFailureTs: number; lastInjectedLevel: number }): void {
  try {
    mkdirSync(PI_AGENT_DIR, { recursive: true });
    const existing = readPiExtensionState();
    writeFileSync(PI_EXTENSION_STATE, JSON.stringify({ ...existing, ...s }, null, 2) + "\n", "utf-8");
  } catch {}
}

// ═══════════════════════════════════════════════════════════════
// 核心逻辑
// ═══════════════════════════════════════════════════════════════

/**
 * 根据累计失败次数计算压力等级（L1–L4）。
 * @param failureCount - 累计失败次数
 * @returns 压力等级，0 表示无压力
 */
function getLevel(failureCount: number): number {
  if (failureCount >= 5) return 4;
  if (failureCount >= 4) return 3;
  if (failureCount >= 3) return 2;
  if (failureCount >= 2) return 1;
  return 0;
}

/**
 * 判断一次 tool_result 事件是否代表执行失败。
 *
 * 判定优先级：
 * 1. event.isError 为 true；
 * 2. details.exitCode 非 0；
 * 3. details.stderr 匹配常见错误关键词。
 *
 * @param event - pi 的 tool_result 事件对象
 * @returns 是否为失败
 */
function isFailure(event: any): boolean {
  if (event.isError) return true;
  const details = event.details;
  if (details) {
    const exitCode = details.exitCode ?? 0;
    if (typeof exitCode === "number" && exitCode !== 0) return true;
    const stderr = details.stderr ?? "";
    const patterns = [/error/i, /failed/i, /fatal/i, /exception/i, /cannot find/i, /not found/i, /permission denied/i, /connection refused/i];
    if (typeof stderr === "string" && stderr.length > 0 && patterns.some((p) => p.test(stderr))) return true;
  }
  return false;
}

/**
 * 检查本地磁盘上是否已安装 pua skill。
 * 直接嗅探 skill 安装目录（与 references_loader.ts 逻辑对齐），
 * 避免依赖 pi 的 systemPromptOptions 传递机制（跨平台/跨版本可能不一致）。
 * @returns 是否找到 pua skill
 */
function hasPuaSkill(): boolean {
  return findSkillDirs().length > 0;
}

/**
 * pi 扩展入口函数。
 *
 * 注册会话生命周期钩子、四条用户命令，以及 tool_result / tool_call / before_agent_start 事件监听，
 * 实现 PUA 行为协议的动态注入与失败压力升级机制。
 *
 * @param pi - pi 提供的 ExtensionAPI 实例
 */
export default function (pi: ExtensionAPI) {
  let state: PuaState = { ...DEFAULT_STATE };
  let warnedNoSkill = false;
  let behaviorProtocol = "";
  let pressurePrompts: Record<number, string> = {};
  /** 当前扩展实例内缓存的能力快照；/reload 后由模块重载自然刷新。 */
  let lastCapabilitySnapshot: any = null;
  /** enforcement 配置（从 config.json 读取） */
  let enforcementConfig = resolveEnforcementConfig(undefined);
  /** 命令历史记录器（用于重复检测） */
  const commandHistory = new CommandHistory(5);
  /** 最近失败的工具命令摘要（用于 compact state save） */
  const recentFailures: string[] = [];
  /** advisory 通知冷却记录：target → 上次通知时间戳 */
  const advisoryCooldown: Map<string, number> = new Map();
  /** advisory 冷却时间（毫秒） */
  const ADVISORY_COOLDOWN_MS = 30_000;

  /**
   * 从文件系统恢复完整运行时状态（配置、失败计数、扩展私有状态）。
   */
  function restoreState() {
    const config = readPuaConfig();
    const piExt = readPiExtensionState();
    const alwaysOn = config.always_on ?? true;
    state = {
      enabled: alwaysOn === true,
      failureCount: readOfficialFailureCount(),
      lastFailureTs: piExt.lastFailureTs,
      lastInjectedLevel: piExt.lastInjectedLevel,
    };
    enforcementConfig = resolveEnforcementConfig(config as any);
  }

  /**
   * 将当前运行时状态持久化到官方计数文件与扩展私有状态文件。
   */
  function persistState() {
    writeOfficialFailureCount(state.failureCount);
    writePiExtensionState({ lastFailureTs: state.lastFailureTs, lastInjectedLevel: state.lastInjectedLevel });
  }

  /**
   * 重建行为协议与压力提示表。
   * 依据当前配置文件中的味道加载对应文化，并读取 L1–L4 压力提示。
   */
  function rebuildProtocol() {
    const config = readPuaConfig();
    const flavorKey = config.flavor ?? "alibaba";
    const flavor = loadFlavorInfo(flavorKey);
    behaviorProtocol = buildBehaviorProtocol(flavor);
    pressurePrompts = loadPressurePrompts();
  }

  /**
   * 采集当前 PI 运行时暴露给模型的工具与 skill 能力，供状态命令展示。
   *
   * @param event - 可选的 before_agent_start 事件；其中可能携带 systemPromptOptions。
   * @returns 当前会话可见能力与可见工具来源状态。
   */
  async function collectCapabilitySnapshot(event?: any) {
    let activeTools: any[] = [];
    let allTools: any[] = [];
    try {
      // 新版本 PI 可能直接提供当前轮启用工具；老版本没有该 API 时保持空数组。
      const tools = await Promise.resolve((pi as any).getActiveTools?.());
      if (Array.isArray(tools)) activeTools = tools;
    } catch {}
    try {
      // allTools 只给已可见工具补元数据，不能参与本轮工具可见性判定。
      const tools = await Promise.resolve((pi as any).getAllTools?.());
      if (Array.isArray(tools)) allTools = tools;
    } catch {}
    return buildCapabilitySnapshot({
      systemPromptOptions: event?.systemPromptOptions,
      activeTools,
      allTools,
    });
  }

  /**
   * 获取扩展实例级能力快照。
   *
   * PI 的工具可见性在同一次扩展加载期间应保持稳定；若用户通过 /reload
   * 变更插件或工具集合，模块会重新加载并自然清空该缓存。
   *
   * @param event - 可选的 before_agent_start 事件，用于首次采集时读取 systemPromptOptions。
   * @returns 当前扩展实例缓存的能力快照。
   */
  async function getCapabilitySnapshot(event?: any) {
    if (lastCapabilitySnapshot) return lastCapabilitySnapshot;
    lastCapabilitySnapshot = await collectCapabilitySnapshot(event);
    return lastCapabilitySnapshot;
  }

  /** 每次会话启动时恢复状态并重载协议。 */
  pi.on("session_start", async () => {
    restoreState();
    rebuildProtocol();
  });

  // ═══════════════════════════════════════════════════════════════
  // 命令
  // ═══════════════════════════════════════════════════════════════

  /**
   * /pua-on：启用 PUA，写入 always_on=true；
   * 若 feedback_frequency 被关闭则恢复默认值 5。
   */
  pi.registerCommand("pua-on", {
    description: "开启 PUA 压力模式（写入 ~/.pua/config.json always_on=true，当前会话立即生效）",
    handler: async (_args, ctx) => {
      const config = readPuaConfig();
      const patch: Record<string, any> = { always_on: true };
      if (config.feedback_frequency === 0) patch.feedback_frequency = 5;
      writePuaConfig(patch);
      state.enabled = true;
      rebuildProtocol();
      persistState();
      ctx.ui.notify("[PUA ON] 从现在起，每个新会话都会自动进入 PUA 模式。公司不养闲 Agent。", "success");
    },
  });

  /**
   * /pua-off：关闭 PUA，同时关闭 feedback_frequency，避免残留通知。
   */
  pi.registerCommand("pua-off", {
    description: "关闭 PUA 压力模式（写入 ~/.pua/config.json always_on=false，当前会话立即生效）",
    handler: async (_args, ctx) => {
      writePuaConfig({ always_on: false, feedback_frequency: 0 });
      state.enabled = false;
      persistState();
      ctx.ui.notify("[PUA OFF] PUA 默认模式和反馈收集已关闭。需要时手动 /pua:pua 触发。", "info");
    },
  });

  /**
   * /pua-status：展示开关状态、失败计数、压力等级、当前味道、配置文件路径、最后失败时间。
   */
  pi.registerCommand("pua-status", {
    description: "查看 PUA 当前状态",
    handler: async (_args, ctx) => {
      const config = readPuaConfig();
      const level = getLevel(state.failureCount);
      const levelText = level === 0 ? "无" : `L${level}`;
      const flavor = config.flavor ?? "alibaba";
      const capabilitySnapshot = await getCapabilitySnapshot();
      const skillStatus = hasPuaSkill() ? "已安装" : "未找到";
      const referencesSource = getReferencesDir() ? "skill references" : "fallback";
      const capabilityStatus = formatCapabilityStatus(capabilitySnapshot);
      ctx.ui.notify(
        `PUA 状态:\n- 开关: ${state.enabled ? "ON 🔥" : "OFF"}\n- 失败计数: ${state.failureCount}\n- 压力等级: ${levelText}\n- 味道: ${flavor}\n- pua skill: ${skillStatus}\n- references: ${referencesSource}\n- config: ${existsSync(PUA_CONFIG) ? PUA_CONFIG : "N/A"}\n- 最后失败: ${state.lastFailureTs ? new Date(state.lastFailureTs).toLocaleTimeString() : "N/A"}\n${capabilityStatus}`,
        "info",
      );
    },
  });

  /** /pua-reset：清零失败计数与时间戳，同时持久化。 */
  pi.registerCommand("pua-reset", {
    description: "重置 PUA 失败计数",
    handler: async (_args, ctx) => {
      state.failureCount = 0;
      state.lastFailureTs = 0;
      state.lastInjectedLevel = 0;
      persistState();
      ctx.ui.notify("[PUA RESET] 失败计数已清零。从头再来。", "info");
    },
  });

  // ═══════════════════════════════════════════════════════════════
  // 失败检测
  // ═══════════════════════════════════════════════════════════════

  /**
   * 监听 tool_result 事件，识别执行失败并累加失败计数，
   * 或在连续成功时自动清零。
   *
   * 为避免高频抖动，3 秒内同一批连续失败只计一次。
   */
  pi.on("tool_result", async (event, ctx) => {
    if (!state.enabled) return;

    const isErr = isFailure(event);
    if (isErr) {
      const now = Date.now();
      // 3 秒内同一批连续失败只计一次，避免抖动
      if (now - state.lastFailureTs < 3000) return;

      state.failureCount++;
      state.lastFailureTs = now;
      persistState();

      const level = getLevel(state.failureCount);
      if (level > 0) {
        ctx.ui.notify(`PUA 压力升级: L${level}（失败 ${state.failureCount} 次）`, level >= 3 ? "error" : "warning");
      }
    } else {
      // 一次成功即清零，体现“流程优先于个人英雄”的快速恢复机制。
      if (state.failureCount > 0) {
        state.failureCount = 0;
        state.lastInjectedLevel = 0;
        persistState();
      }
    }
  });

  /**
   * 监听子 agent 工具调用，在派发前把当前 PUA 约束写入子任务 prompt。
   *
   * PI 的 tool_call 输入对象可原地修改；这里不拦截、不授权，只做上游
   * “Sub-agent 也不养闲”协议的最小映射。
   */
  pi.on("tool_call", async (event) => {
    if (!state.enabled) return undefined;

    const toolName = event.toolName ?? event.tool_name ?? event.name;
    if (!isSubagentToolName(toolName)) return undefined;

    const capabilitySnapshot = await getCapabilitySnapshot();
    if (!capabilitySnapshot.hasSubagents) return undefined;

    const config = readPuaConfig();
    const input = event.input ?? event.args ?? event.arguments;
    decorateSubagentInput(input, {
      flavor: config.flavor ?? "alibaba",
      level: getLevel(state.failureCount),
      failureCount: state.failureCount,
    });
    return undefined;
  });

  // ═══════════════════════════════════════════════════════════════
  // 主动约束层：4 个增强 hook
  // ═══════════════════════════════════════════════════════════════

  /**
   * Hook 1: 用户挫败检测。
   * 匹配到挫败关键词时，自动将失败计数提升到至少 2（触发 L1）。
   */
  pi.on("input", (event, ctx) => {
    if (!state.enabled || !enforcementConfig.frustration_detection) return undefined;
    const text = event?.text ?? "";
    if (detectFrustration(text)) {
      if (state.failureCount < 2) {
        state.failureCount = 2;
        persistState();
      }
      ctx.ui.notify(
        `[PUA] 检测到用户挫败信号，压力升级至 L${getLevel(state.failureCount)}`,
        "warning"
      );
    }
    return { action: "continue" };
  });

  /**
   * Hook 2: 四权分立 + 重复命令检测。
   * 在已有子 agent 装饰逻辑之后追加。
   */
  pi.on("tool_call", async (event, ctx) => {
    if (!state.enabled) return undefined;

    const toolName = event.toolName ?? event.tool_name ?? event.name ?? "";
    const input = event.input ?? event.args ?? event.arguments;

    // 四权分立检查：根据 enforcement_level 决定处缆力度
    // observe  = 全部静默（不通知、不 block）
    // suggest  = advisory 通知 + deny 通知但不 block（对齐上游语义）
    // enforce  = advisory 通知 + deny 硬 block
    if (enforcementConfig.integrity_guard) {
      const result = checkIntegrity(toolName, input);
      const level = enforcementConfig.enforcement_level;

      if (result.level === "deny") {
        if (level === "enforce") {
          ctx.ui.notify(`[PUA Integrity Guard] DENY: ${result.reason}\nTarget: ${result.target}`, "error");
          return { block: true, reason: result.reason };
        }
        if (level === "suggest") {
          ctx.ui.notify(`[PUA Integrity Guard] 警告: ${result.reason}\nTarget: ${result.target}`, "error");
        }
        // observe: 静默
      }

      if (result.level === "advisory" && level !== "observe") {
        // 30s 内同一 target 不重复通知
        const now = Date.now();
        const key = result.target ?? "";
        const lastNotify = advisoryCooldown.get(key) ?? 0;
        if (now - lastNotify > ADVISORY_COOLDOWN_MS) {
          advisoryCooldown.set(key, now);
          ctx.ui.notify(`[PUA Integrity Guard] 注意: ${result.reason}\nTarget: ${result.target}`, "warning");
        }
      }
    }

    // 重复命令检测（仅 L2+ 且 bash 工具）
    if (enforcementConfig.loop_detection && toolName.toLowerCase() === "bash" && getLevel(state.failureCount) >= 2) {
      const cmd = input?.command ?? "";
      if (cmd && commandHistory.isRepetitive(cmd)) {
        const level = enforcementConfig.enforcement_level;
        if (level === "enforce") {
          ctx.ui.notify("[PUA] 检测到重复命令模式，已阻止执行。请切换思路。", "error");
          return { block: true, reason: "PUA: 连续失败后重复相同命令，已阻止" };
        }
        if (level === "suggest") {
          ctx.ui.notify("[PUA] 检测到重复命令模式。建议切换思路。", "warning");
        }
      }
      if (cmd) commandHistory.push(cmd);
    }

    return undefined;
  });

  /**
   * Hook 3: 压缩前状态保存。
   * 将当前 PUA 运行时状态写入 builder-journal.md。
   */
  pi.on("session_before_compact", (event, ctx) => {
    if (!state.enabled || !enforcementConfig.compact_state_save) return undefined;
    try {
      const config = readPuaConfig();
      const snapshot = buildCompactStateMarkdown({
        timestamp: new Date().toISOString(),
        pressure_level: `L${getLevel(state.failureCount)}`,
        failure_count: state.failureCount,
        current_flavor: (config as any).flavor ?? "alibaba",
        recent_failures: recentFailures.slice(-5),
      });
      const journalPath = join(PUA_DIR, "builder-journal.md");
      mkdirSync(PUA_DIR, { recursive: true });
      writeFileSync(journalPath, snapshot, "utf-8");
      ctx.ui.notify("[PUA] 压缩前状态已保存到 builder-journal.md", "info");
    } catch {}
    return undefined;
  });

  /**
   * Hook 4: 空口完成 + 原地打转检测。
   */
  pi.on("turn_end", (event, ctx) => {
    if (!state.enabled) return undefined;

    const message = event?.message;
    const toolResults = event?.toolResults ?? [];

    // 提取 assistant 文本
    let assistantText = "";
    if (message?.role === "assistant") {
      const content = message.content;
      if (typeof content === "string") {
        assistantText = content;
      } else if (Array.isArray(content)) {
        assistantText = content
          .filter((c: any) => c?.type === "text")
          .map((c: any) => c.text ?? "")
          .join("\n");
      }
    }

    // 记录失败的 bash 命令到 recentFailures
    for (const r of toolResults) {
      if (r?.isError && r?.input?.command) {
        recentFailures.push(r.input.command.slice(0, 100));
        if (recentFailures.length > 10) recentFailures.shift();
      }
    }

    const analysis = analyzeTurn(assistantText, toolResults, commandHistory);

    if (analysis.unverifiedCompletion) {
      state.failureCount++;
      persistState();
      ctx.ui.notify(
        `[PUA] 检测到空口完成：声称完成但本轮无验证证据。失败计数 +1（当前 ${state.failureCount}）`,
        "warning"
      );
    }

    if (analysis.loopDetected && enforcementConfig.loop_detection) {
      ctx.ui.notify(
        "[PUA] 检测到原地打转：连续多轮执行相似失败命令。建议切换方法论。",
        "error"
      );
    }

    return undefined;
  });

  // ═══════════════════════════════════════════════════════════════
  // 动态注入：完整行为协议 + 压力等级叠加
  // ═══════════════════════════════════════════════════════════════

  /**
   * 在 Agent 启动前拦截，向其系统提示追加行为协议与压力提示。
   *
   * 注入顺序：
   * 1. 基础行为协议（味道文化 + 三条红线 + 方法论路由等）；
   * 2. 基于已可见工具追加正向能力增强提示；
   * 3. 根据当前失败等级叠加 L1–L4 压力 prompt。
   *
   * 若检测到未加载 pua skill，则自动关闭扩展并提示用户安装。
   */
  pi.on("before_agent_start", async (event, ctx) => {
    if (!state.enabled) return undefined;

    // skill 卸载检测：未安装则自动禁用，避免向用户注入无效协议
    if (!warnedNoSkill && !hasPuaSkill()) {
      warnedNoSkill = true;
      state.enabled = false;
      writePuaConfig({ always_on: false });
      persistState();
      ctx.ui.notify("[PUA Extension] pua skill not found. Auto-disabled. Install skill first, then /pua-on.", "warning");
      return undefined;
    }

    const capabilitySnapshot = await getCapabilitySnapshot(event);

    // 1. 注入完整行为协议（基础层）
    let extraPrompt = behaviorProtocol;

    // 2. 可见能力增强：只正向追加已可用能力的 PUA 使用协议。
    const capabilityEnhancement = buildCapabilityEnhancementPrompt(capabilitySnapshot);
    if (capabilityEnhancement) {
      extraPrompt += "\n\n" + capabilityEnhancement;
    }

    // 3. 叠加压力等级（L1–L4）
    const level = getLevel(state.failureCount);
    if (level > 0) {
      const pressure = pressurePrompts[level];
      if (pressure) {
        extraPrompt += "\n\n" + pressure;
      }
      state.lastInjectedLevel = level;
      writePiExtensionState({ lastFailureTs: state.lastFailureTs, lastInjectedLevel: level });
    }

    if (!extraPrompt) return undefined;
    return { systemPrompt: event.systemPrompt + "\n\n" + extraPrompt };
  });
}
