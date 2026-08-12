/**
 * 模型规则模块 — per-model PUA 开关匹配
 *
 * 支持通配符 *（匹配任意数量字符，包括 /），不依赖第三方库。
 * 纯函数，无副作用。
 */

/**
 * 经典通配符匹配算法（仅支持 *）。
 * 逐字符遍历，遇到 * 时记录位置并尝试跳过尽可能少的字符。
 *
 * @param modelId - 当前模型标识（如 "anthropic/claude-opus-4-20250514"）
 * @param pattern - glob 模式（如 "anthropic/claude-opus*"）
 * @returns 是否匹配
 */
export function matchModelPattern(modelId: string, pattern: string): boolean {
  const s = modelId.toLowerCase();
  const p = pattern.toLowerCase();

  let si = 0;
  let pi = 0;
  let starIdx = -1;
  let matchIdx = 0;

  while (si < s.length) {
    if (pi < p.length && p[pi] === s[si]) {
      pi++;
      si++;
    } else if (pi < p.length && p[pi] === "*") {
      starIdx = pi;
      matchIdx = si;
      pi++;
    } else if (starIdx !== -1) {
      pi = starIdx + 1;
      matchIdx++;
      si = matchIdx;
    } else {
      return false;
    }
  }

  // 跳过模式尾部多余的 *
  while (pi < p.length && p[pi] === "*") pi++;
  return pi === p.length;
}

/**
 * 从配置对象中提取禁用模型列表。
 * @param config - 完整 PUA 配置对象
 * @returns 禁用的模式数组（非空字符串）
 */
export function getDisabledModels(config: Record<string, any>): string[] {
  const list = config.disabled_models;
  if (!Array.isArray(list)) return [];
  return list.filter((p): p is string => typeof p === "string" && p.length > 0);
}

/**
 * 判断当前模型是否在禁用列表中。
 * @param modelId - 当前模型标识字符串（如 "anthropic/claude-opus-4-20250514"）
 * @param disabledModels - 禁用模式数组
 * @returns 是否匹配任意禁用模式
 */
export function isModelDisabled(modelId: string, disabledModels: string[]): boolean {
  if (!modelId || disabledModels.length === 0) return false;
  return disabledModels.some((p) => matchModelPattern(modelId, p));
}

/**
 * 从模型对象中提取可匹配的标识字符串。
 * 格式：{provider}/{id}
 * @param model - ctx.model 对象（可能含 provider 和 id 字段）
 * @returns 格式化的模型标识字符串，无法提取时返回空串
 */
export function formatModelId(model: any): string {
  if (!model) return "";
  const provider = model.provider ?? "";
  const id = model.id ?? "";
  if (!provider && !id) return "";
  return provider ? `${provider}/${id}` : id;
}
