/**
 * PI PUA 能力快照辅助函数。
 *
 * 本模块保持为普通 ESM，方便单元测试直接导入生产逻辑，
 * 避免为仓库额外引入 TypeScript 构建步骤。
 */

const READ_TOOLS = new Set(["read", "view", "open", "read_file"]);
const WRITE_TOOLS = new Set(["write", "edit", "apply_patch"]);
const SHELL_TOOLS = new Set(["bash", "shell", "powershell"]);
const WEB_SEARCH_TOOLS = new Set(["web_search", "code_search"]);
const FETCH_TOOLS = new Set(["fetch_content", "get_search_content"]);
const MCP_PROXY_TOOLS = new Set(["mcp"]);
const POWERSHELL_TOOLS = new Set([
  "powershell",
  "pwsh-start-job",
  "pwsh-get-job",
  "pwsh-stop-job",
  "pwsh-remove-job",
  "pwsh-get-job-output",
  "pwsh-create-session",
  "pwsh-close-session",
]);
const BACKGROUND_JOB_TOOLS = new Set(["pwsh-start-job"]);
const SUBAGENT_TOOLS = new Set(["agent", "subagent", "spawn_agent", "task_agent", "task_agents", "steer_task_agent"]);
const PLAN_TOOLS = new Set(["set_plan", "task_agents", "steer_task_agent"]);
const ASK_USER_TOOLS = new Set(["ask_user", "request_user_input"]);
const SUBAGENT_SENTINEL = "[PUA-SUBAGENT-INJECTED]";
const SUBAGENT_PROMPT_FIELDS = new Set(["prompt", "task", "message", "instructions", "instruction", "systemPrompt"]);

/**
 * 将 PI 选项字段统一为数组，兼容数组、映射、单值和空值。
 *
 * @param {unknown} value - PI 运行时元数据中的原始工具或 skill 集合。
 * @returns {unknown[]} 可统一扫描的扁平集合。
 */
function asArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "object") return Object.entries(value).map(([name, spec]) => ({ name, spec }));
  return [value];
}

/**
 * 从 PI 工具描述符中提取最稳定的展示名或工具名。
 *
 * @param {unknown} item - 工具描述符、skill 描述符或原始字符串名称。
 * @returns {string | null} 可识别时返回非空名称，否则返回 null。
 */
function extractName(item) {
  if (!item) return null;
  if (typeof item === "string") return item;
  if (typeof item !== "object") return null;
  const candidates = [
    item.name,
    item.toolName,
    item.id,
    item.label,
    item.spec?.name,
    item.tool?.name,
    item.definition?.name,
  ];
  return candidates.find((candidate) => typeof candidate === "string" && candidate.trim()) ?? null;
}

/**
 * 将多个 PI 元数据来源合并为去重后的名称列表。
 *
 * @param {...unknown} sources - 可能暴露工具或 skill 的运行时字段。
 * @returns {string[]} 按首次出现顺序保留的去空白名称。
 */
function extractNames(...sources) {
  const names = new Set();
  for (const source of sources) {
    for (const item of asArray(source)) {
      const name = extractName(item);
      if (name) names.add(name.trim());
    }
  }
  return [...names];
}

/**
 * 按工具名索引完整注册表，供已可见工具补充元数据。
 *
 * @param {unknown} allTools - PI 宿主暴露的完整工具注册表。
 * @returns {Map<string, unknown>} 以小写工具名为键的元数据表。
 */
function indexToolsByName(allTools) {
  const toolsByName = new Map();
  for (const item of asArray(allTools)) {
    const name = extractName(item)?.trim().toLowerCase();
    if (name && !toolsByName.has(name)) toolsByName.set(name, item);
  }
  return toolsByName;
}

/**
 * 收集本轮可见工具描述符，并仅为这些工具补充完整注册表元数据。
 *
 * @param {unknown[]} visibleSources - selected/active/snippets 等本轮可见工具来源。
 * @param {unknown} allTools - PI 宿主暴露的完整工具注册表。
 * @returns {unknown[]} 可见工具描述符及其匹配的注册表元数据。
 */
function collectVisibleToolDescriptors(visibleSources, allTools) {
  const toolsByName = indexToolsByName(allTools);
  const descriptors = [];
  const seenNames = new Set();
  for (const source of visibleSources) {
    for (const item of asArray(source)) {
      const rawName = extractName(item);
      if (!rawName) continue;
      const name = rawName.trim();
      const key = name.toLowerCase();
      if (seenNames.has(key)) continue;
      seenNames.add(key);
      descriptors.push(typeof item === "string" ? { name } : item);
      const registryMetadata = toolsByName.get(key);
      if (registryMetadata) descriptors.push(registryMetadata);
    }
  }
  return descriptors;
}

/**
 * 构建小写查询集合，用于大小写不敏感的能力匹配。
 *
 * @param {string[]} names - 从 PI 运行时元数据中发现的名称。
 * @returns {Set<string>} 小写名称集合。
 */
function lowerSet(names) {
  return new Set(names.map((name) => name.toLowerCase()));
}

/**
 * 检查已发现名称是否命中某个已知能力别名。
 *
 * @param {Set<string>} names - 从 PI 中发现的小写名称。
 * @param {Set<string>} expected - 表示某类能力的小写别名集合。
 * @returns {boolean} 是否至少存在一个别名。
 */
function hasAny(names, expected) {
  for (const name of names) {
    if (expected.has(name)) return true;
  }
  return false;
}

/**
 * 判断当前工具名是否属于子 agent 或任务 agent 调度入口。
 *
 * @param {unknown} toolName - PI tool_call 事件里的工具名。
 * @returns {boolean} 是否应当注入子 agent PUA capsule。
 */
export function isSubagentToolName(toolName) {
  if (typeof toolName !== "string") return false;
  return SUBAGENT_TOOLS.has(toolName.trim().toLowerCase());
}

/**
 * 在 PI 未暴露通用 mcp 代理工具时识别直连 MCP 工具描述符。
 *
 * @param {unknown} item - 原始 PI 工具描述符。
 * @returns {boolean} 描述符元数据是否表明该工具由 MCP 提供。
 */
function hasMcpMetadata(item) {
  if (!item || typeof item !== "object") return false;
  const fields = [
    item.source,
    item.package,
    item.packageName,
    item.origin,
    item.extension,
    item.serverName,
    item.provider,
    item.spec?.source,
    item.spec?.serverName,
  ];
  return fields.some((value) => typeof value === "string" && value.toLowerCase().includes("mcp"));
}

/**
 * 识别以普通 PI 工具形式暴露的直连 MCP 工具。
 *
 * @param {unknown} visibleTools - 本轮已确认可见的工具描述符。
 * @returns {boolean} 是否可见非代理形式的 MCP 工具。
 */
function hasMcpDirectTool(visibleTools) {
  return asArray(visibleTools).some((tool) => {
    const name = extractName(tool)?.toLowerCase();
    if (!name || name === "mcp") return false;
    // 直连适配器常把 MCP 标记编码在生成名称或提供方元数据中。
    return name.startsWith("mcp_") || name.includes("__mcp") || hasMcpMetadata(tool);
  });
}

/**
 * 构建当前 PI 可见能力的保守快照。
 *
 * 未知来源只表示“未采集到可见工具列表”，不能推断基础工具缺失。
 *
 * @param {object} [input] - 从事件选项和宿主 API 收集的 PI 运行时元数据。
 * @param {object} [input.systemPromptOptions] - before_agent_start 传入的 PI 系统提示选项。
 * @param {unknown} [input.selectedTools] - 显式选择的工具列表或映射。
 * @param {unknown} [input.activeTools] - 当前运行时激活的工具描述符。
 * @param {unknown} [input.allTools] - 完整运行时工具注册表，仅用于给可见工具补充元数据。
 * @param {unknown} [input.toolSnippets] - 嵌入系统提示选项的工具片段。
 * @param {unknown} [input.skills] - 嵌入系统提示选项的 skill 描述符。
 * @returns {object} 能力布尔值、原始名称和可见性说明。
 */
export function buildCapabilitySnapshot(input = {}) {
  const options = input.systemPromptOptions ?? {};
  // 只合并本轮对模型可见的工具来源；完整注册表不能参与可见能力判定。
  const selectedTools = input.selectedTools ?? options.selectedTools;
  const activeTools = input.activeTools;
  const allTools = input.allTools;
  const toolSnippets = input.toolSnippets ?? options.toolSnippets;
  const skills = input.skills ?? options.skills;
  const visibleToolSources = [selectedTools, activeTools, toolSnippets];

  const toolNames = extractNames(...visibleToolSources);
  const visibleToolDescriptors = collectVisibleToolDescriptors(visibleToolSources, allTools);
  const skillNames = extractNames(skills);
  const toolSet = lowerSet(toolNames);
  const hasVisibleToolSource = toolNames.length > 0;

  const hasRead = hasAny(toolSet, READ_TOOLS);
  const hasWrite = hasAny(toolSet, WRITE_TOOLS);
  const hasShell = hasAny(toolSet, SHELL_TOOLS);
  const hasWebSearch = hasAny(toolSet, WEB_SEARCH_TOOLS);
  const hasFetchContent = hasAny(toolSet, FETCH_TOOLS);
  const hasMcpProxy = hasAny(toolSet, MCP_PROXY_TOOLS);
  const hasMcpDirectTools = hasMcpDirectTool(visibleToolDescriptors);
  const hasPowerShell = hasAny(toolSet, POWERSHELL_TOOLS);
  const hasBackgroundJobs = hasAny(toolSet, BACKGROUND_JOB_TOOLS);
  const hasSubagents = hasAny(toolSet, SUBAGENT_TOOLS);
  const hasPlan = hasAny(toolSet, PLAN_TOOLS);
  const hasAskUser = hasAny(toolSet, ASK_USER_TOOLS);
  const hasMcp = hasMcpProxy || hasMcpDirectTools;

  const visibilityNotes = [];
  if (!hasVisibleToolSource) {
    visibilityNotes.push("未获得 PI 可见工具列表：能力状态未采集，不推断基础工具缺失。");
  }

  return {
    tools: toolNames,
    skills: skillNames,
    hasRead,
    hasWrite,
    hasShell,
    hasWebSearch,
    hasFetchContent,
    hasMcpProxy,
    hasMcpDirectTools,
    hasMcp,
    hasPowerShell,
    hasBackgroundJobs,
    hasSubagents,
    hasPlan,
    hasAskUser,
    visibilityNotes,
  };
}

/**
 * 根据当前可见能力生成正向 PUA 增强提示。
 *
 * 这里不生成“缺什么别用什么”的负向清单；只在能力已对模型可见时，
 * 把上游 PUA 对这些能力的使用约束注入主 agent。
 *
 * @param {object | null | undefined} snapshot - {@link buildCapabilitySnapshot} 返回的快照。
 * @returns {string} 可追加到 system prompt 的能力增强提示；没有增强时返回空字符串。
 */
export function buildCapabilityEnhancementPrompt(snapshot) {
  if (!snapshot) return "";
  const sections = [];

  if (snapshot.hasSubagents) {
    sections.push(`## Sub-agent 也不养闲
- 创建、委派或指挥子 agent 时，必须让子任务继承当前 PUA 行为约束。
- 子 agent prompt 必须包含当前 flavor、失败计数、压力等级、三条红线和验证闭环要求。
- 不要假设子 agent 天然知道 PUA；没有显式注入就是裸奔。`);
  }

  if (snapshot.hasWebSearch || snapshot.hasFetchContent) {
    sections.push(`## 搜索与抓取能力
- 调研、排错、L2+ 压力升级或不确定事实时，优先使用可见的搜索/抓取工具拿证据。
- 输出结论前要说明搜索、抓取或源码阅读带来的验证结果。`);
  }

  if (snapshot.hasMcp) {
    sections.push(`## MCP 能力
- 需要外部系统能力时，先发现当前可见 MCP 入口或 direct tool，再基于真实可见工具调用。
- 不按 server 名称猜工具；只使用本轮已暴露给模型的 MCP 能力。`);
  }

  if (snapshot.hasPlan) {
    sections.push(`## 计划能力
- 连续失败、跨文件任务或验收口径不清时，先产出计划/checklist，再逐项闭环。
- 计划不是汇报材料；每项都要绑定可验证的完成标准。`);
  }

  if (snapshot.hasPowerShell) {
    sections.push(`## PowerShell 能力
- Windows 原生问题、注册表、服务、进程、权限或路径语义任务，可使用可见 PowerShell 工具验证。
- PowerShell 是可选执行通道，不是 PUA 本体能力，也不替代仓库安全规则。`);
  }

  if (sections.length === 0) return "";
  return `<EXTREMELY_IMPORTANT>
[PUA 能力增强]
以下规则只基于本轮已对模型可见的能力启用；不要反推不可见工具。

${sections.join("\n\n")}
</EXTREMELY_IMPORTANT>`;
}

/**
 * 构建注入子 agent prompt 的紧凑 PUA capsule。
 *
 * @param {object} context - 当前主 agent 的 PUA 运行状态。
 * @param {string} [context.flavor] - 当前 PUA flavor key。
 * @param {number} [context.level] - 当前压力等级。
 * @param {number} [context.failureCount] - 当前失败计数。
 * @returns {string} 幂等 sentinel 开头的子 agent 行为协议。
 */
function buildSubagentCapsule(context = {}) {
  const flavor = context.flavor || "alibaba";
  const level = Number.isInteger(context.level) ? context.level : 0;
  const failureCount = Number.isInteger(context.failureCount) ? context.failureCount : 0;
  return `${SUBAGENT_SENTINEL}
你是由 PUA 主 agent 委派的子 agent，必须继承当前 PUA 约束。
- 当前 flavor: ${flavor}
- 失败计数: ${failureCount}
- 压力等级: L${level}
- 三条红线: 不能空口完成；不能未验证就甩锅；不能未穷尽就放弃。
- 交付要求: 先读可用上下文，再执行任务，最后给出验证证据和风险。
- 如果具备读取工具，先读取已安装的 pua skill 或 references；如果不能读取，就按本 capsule 执行。`;
}

/**
 * 在子 agent 工具输入中为 prompt 类字段追加 PUA capsule。
 *
 * 函数会原地修改对象，便于 PI `tool_call` 事件直接复用；已包含
 * sentinel 的字段不会重复注入。
 *
 * @param {unknown} input - PI tool_call 的输入对象。
 * @param {object} context - 当前 PUA 运行状态。
 * @returns {boolean} 是否修改了至少一个 prompt 字段。
 */
export function decorateSubagentInput(input, context = {}) {
  const capsule = buildSubagentCapsule(context);
  return decoratePromptFields(input, capsule, new WeakSet());
}

function decoratePromptFields(value, capsule, seen) {
  if (!value || typeof value !== "object") return false;
  if (seen.has(value)) return false;
  seen.add(value);

  let changed = false;
  if (Array.isArray(value)) {
    for (const item of value) {
      if (decoratePromptFields(item, capsule, seen)) changed = true;
    }
    return changed;
  }

  for (const [key, item] of Object.entries(value)) {
    if (SUBAGENT_PROMPT_FIELDS.has(key) && typeof item === "string" && !item.includes(SUBAGENT_SENTINEL)) {
      value[key] = `${item}\n\n${capsule}`;
      changed = true;
    } else if (item && typeof item === "object" && decoratePromptFields(item, capsule, seen)) {
      changed = true;
    }
  }
  return changed;
}

/**
 * 为 `/pua-status` 命令格式化能力状态。
 *
 * @param {object | null | undefined} snapshot - {@link buildCapabilitySnapshot} 返回的快照。
 * @returns {string} 用于用户通知输出的多行状态文本。
 */
export function formatCapabilityStatus(snapshot) {
  if (!snapshot) return "Capability: not collected\nVisibility: not collected";
  const enabled = [];
  if (snapshot.hasRead) enabled.push("read");
  if (snapshot.hasWrite) enabled.push("write");
  if (snapshot.hasShell) enabled.push("shell");
  if (snapshot.hasWebSearch) enabled.push("web");
  if (snapshot.hasFetchContent) enabled.push("fetch");
  if (snapshot.hasMcpProxy) enabled.push("mcp");
  if (snapshot.hasMcpDirectTools) enabled.push("mcp-direct");
  if (snapshot.hasPowerShell) enabled.push("powershell");
  if (snapshot.hasBackgroundJobs) enabled.push("jobs");
  if (snapshot.hasSubagents) enabled.push("subagent");
  if (snapshot.hasPlan) enabled.push("plan");
  if (snapshot.hasAskUser) enabled.push("ask-user");

  const visibilityNotes = snapshot.visibilityNotes ?? [];
  const capabilityLine = snapshot.tools?.length === 0 && visibilityNotes.length > 0
    ? "Capability: not collected"
    : `Capability: ${enabled.length > 0 ? enabled.join(", ") : "none visible"}`;
  const visibilityLine = visibilityNotes.length > 0
    ? `Visibility:\n${visibilityNotes.map((note) => `  - ${note}`).join("\n")}`
    : "Visibility: collected";
  return `${capabilityLine}\n${visibilityLine}`;
}
