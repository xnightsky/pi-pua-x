// 事件流集成测试：用 mock pi API 驱动真实 index.ts 处理器，
// 断言真实状态文件（~/.pua/.failure_count、~/.pi/agent/pua-state.json）与注入的 systemPrompt。
// 无需模型 / token，确定性可复现。依赖 _register.mjs 钩子解析 .js→.ts 导入。
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ── 隔离 HOME（必须在动态导入 index.ts 之前设置）──
const tmpHome = mkdtempSync(join(tmpdir(), "pua-evt-"));
process.env.USERPROFILE = tmpHome;
process.env.HOME = tmpHome;
// fixture skill 目录：使 hasPuaSkill() 返回真，扩展不会自动禁用
mkdirSync(join(tmpHome, ".agents", "skills", "pua", "references"), { recursive: true });

const PUA_DIR = join(tmpHome, ".pua");
const COUNT_FILE = join(PUA_DIR, ".failure_count");
const STATE_FILE = join(tmpHome, ".pi", "agent", "pua-state.json");

// 动态导入（env 设置后）
const mod = await import("../index.ts");

after(() => {
  try { rmSync(tmpHome, { recursive: true, force: true }); } catch { /* 忽略 */ }
});

/** 清理上一轮的磁盘状态 */
function cleanState() {
  for (const p of [COUNT_FILE, STATE_FILE]) {
    try { rmSync(p); } catch { /* 不存在则忽略 */ }
  }
}

/** 写入 always_on 配置 */
function writeConfig(flavor = "alibaba") {
  mkdirSync(PUA_DIR, { recursive: true });
  writeFileSync(join(PUA_DIR, "config.json"), JSON.stringify({ always_on: true, flavor }), "utf-8");
}

/** 新建一个 mock pi 宿主，注册扩展并触发 session_start */
async function freshHarness(flavor = "alibaba") {
  cleanState();
  writeConfig(flavor);
  const handlers: Record<string, any> = {};
  const notifications: any[] = [];
  const notify = (...a: any[]) => notifications.push(a);
  const pi: any = {
    on: (e: string, h: any) => { handlers[e] = h; },
    registerCommand: () => {},
    ui: { notify },
    getActiveTools: async () => [],
    getAllTools: async () => [],
  };
  mod.default(pi);
  const ctx = { ui: { notify } };
  await handlers["session_start"]?.();
  return { handlers, notifications, ctx };
}

/** 触发一次失败的 bash tool_result */
function bashFail(h: any, ctx: any, stderr: string) {
  return h["tool_result"]({ toolName: "bash", isError: true, details: { exitCode: 1, stderr } }, ctx);
}

/** 触发一次成功的 bash tool_result */
function bashOk(h: any, ctx: any) {
  return h["tool_result"]({ toolName: "bash", isError: false, details: { exitCode: 0, stdout: "ok" } }, ctx);
}

/** 触发 before_agent_start，返回注入后的 systemPrompt */
async function agentStart(h: any, ctx: any): Promise<string> {
  const res = await h["before_agent_start"]({ systemPrompt: "BASE" }, ctx);
  return res?.systemPrompt ?? "BASE";
}

function readState(): any {
  return existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, "utf-8")) : {};
}

test("连续 3 次相同错误 → 计数到 3、errorHistory 持久化、注入 SPINNING 块", async () => {
  const { handlers, ctx } = await freshHarness();
  for (let i = 0; i < 3; i++) await bashFail(handlers, ctx, "fatal: boom_signature");

  assert.equal(readFileSync(COUNT_FILE, "utf-8").trim(), "3", "失败计数应为 3");
  assert.deepEqual(readState().errorHistory, ["fatal: boom_signature", "fatal: boom_signature", "fatal: boom_signature"]);

  const prompt = await agentStart(handlers, ctx);
  assert.match(prompt, /SPINNING/, "应注入 SPINNING 模式块");
  assert.match(prompt, /boom_signature/, "SPINNING 块应含重复签名");
});

test("连续 3 次不同错误 → 注入 EXPLORING 块", async () => {
  const { handlers, ctx } = await freshHarness();
  await bashFail(handlers, ctx, "error: alpha_fail");
  await bashFail(handlers, ctx, "error: beta_fail");
  await bashFail(handlers, ctx, "error: gamma_fail");

  const prompt = await agentStart(handlers, ctx);
  assert.match(prompt, /EXPLORING/, "应注入 EXPLORING 模式块");
  assert.match(prompt, /gamma_fail/, "EXPLORING 块应含最近签名");
});

test("成功 tool_result 清零计数并清空 errorHistory", async () => {
  const { handlers, ctx } = await freshHarness();
  await bashFail(handlers, ctx, "error: one");
  await bashFail(handlers, ctx, "error: two");
  await bashOk(handlers, ctx);

  assert.equal(readFileSync(COUNT_FILE, "utf-8").trim(), "0", "成功后计数应清零");
  assert.deepEqual(readState().errorHistory, [], "成功后 errorHistory 应清空");
});

test("失败少于 3 次（L1）不注入模式块", async () => {
  const { handlers, ctx } = await freshHarness();
  await bashFail(handlers, ctx, "error: only_one");
  await bashFail(handlers, ctx, "error: only_two");

  const prompt = await agentStart(handlers, ctx);
  assert.doesNotMatch(prompt, /SPINNING|EXPLORING|MIXED/, "不足 3 次失败不应有模式块");
});

test("连续挣扎(3)后成功 → 注入突破降压块并只注入一次", async () => {
  const { handlers, ctx } = await freshHarness();
  await bashFail(handlers, ctx, "error: a1");
  await bashFail(handlers, ctx, "error: a2");
  await bashFail(handlers, ctx, "error: a3"); // count=3, peak=L2
  await bashOk(handlers, ctx);                 // 触发突破

  // 状态：计数清零、记录待注入突破、峰值归零
  assert.equal(readFileSync(COUNT_FILE, "utf-8").trim(), "0");
  assert.deepEqual(readState().pendingBreakthrough, { fromLevel: 2, afterFailures: 3 });
  assert.equal(readState().peakLevel, 0);

  const prompt1 = await agentStart(handlers, ctx);
  assert.match(prompt1, /突破/, "应注入突破降压块");
  assert.match(prompt1, /L2 → L0/, "应标注降压方向");

  // 消费后清空，第二次启动不再注入
  assert.equal(readState().pendingBreakthrough, null);
  const prompt2 = await agentStart(handlers, ctx);
  assert.doesNotMatch(prompt2, /突破/, "突破块只注入一次");
});

test("突破降压块使用配置的味道认可话术（microsoft）", async () => {
  const { handlers, ctx } = await freshHarness("microsoft");
  await bashFail(handlers, ctx, "error: m1");
  await bashFail(handlers, ctx, "error: m2");
  await bashFail(handlers, ctx, "error: m3");
  await bashOk(handlers, ctx);

  const prompt = await agentStart(handlers, ctx);
  assert.match(prompt, /突破/);
  assert.match(prompt, /Impact|Successful/, "microsoft 味道认可话术");
});

test("不足 3 次失败后成功不触发突破", async () => {
  const { handlers, ctx } = await freshHarness();
  await bashFail(handlers, ctx, "error: x1");
  await bashFail(handlers, ctx, "error: x2"); // count=2, peak=L1
  await bashOk(handlers, ctx);

  assert.equal(readState().pendingBreakthrough ?? null, null, "不应记录突破");
  const prompt = await agentStart(handlers, ctx);
  assert.doesNotMatch(prompt, /突破/);
});
