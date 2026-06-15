// 单元测试：failure_analysis 纯函数（错误签名 + 模式分类 + 模式块）
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  errorSignature,
  classifyFailurePattern,
  buildPatternBlock,
} from "../failure_analysis.ts";

// ── errorSignature ──
test("errorSignature 提取首个错误样式行", () => {
  const sig = errorSignature("some output\nfatal: not a git repo\nmore", 1);
  assert.match(sig, /fatal: not a git repo/);
});

test("errorSignature 无错误行时回退到首个非空行", () => {
  const sig = errorSignature("\n\nhello world\n", 1);
  assert.equal(sig, "hello world");
});

test("errorSignature 空文本回退到 exit_code", () => {
  assert.equal(errorSignature("", 2), "exit_code_2");
  assert.equal(errorSignature("   \n  \t", 3), "exit_code_3");
});

test("errorSignature 截断到 200 字符", () => {
  const long = "error: " + "x".repeat(500);
  assert.equal(errorSignature(long, 1).length, 200);
});

// ── classifyFailurePattern ──
test("少于 3 个签名 → INSUFFICIENT", () => {
  assert.equal(classifyFailurePattern(["a", "b"]).type, "INSUFFICIENT");
  assert.equal(classifyFailurePattern([]).type, "INSUFFICIENT");
});

test("最近 3 个相同 → SPINNING，detail 为该签名", () => {
  const r = classifyFailurePattern(["x", "same err", "same err", "same err"]);
  assert.equal(r.type, "SPINNING");
  assert.deepEqual(r.detail, ["same err"]);
});

test("最近 3 个全不同 → EXPLORING，detail 含 3 个", () => {
  const r = classifyFailurePattern(["e1", "e2", "e3"]);
  assert.equal(r.type, "EXPLORING");
  assert.equal(r.detail.length, 3);
});

test("最近 3 个部分相同 → MIXED", () => {
  const r = classifyFailurePattern(["a", "a", "b"]);
  assert.equal(r.type, "MIXED");
});

// ── buildPatternBlock ──
test("SPINNING 块包含模式名与重复签名", () => {
  const block = buildPatternBlock({ type: "SPINNING", detail: ["dup error sig"] });
  assert.match(block, /SPINNING/);
  assert.match(block, /dup error sig/);
});

test("EXPLORING 块表明在取得进展", () => {
  const block = buildPatternBlock({ type: "EXPLORING", detail: ["e1", "e2", "e3"] });
  assert.match(block, /EXPLORING/);
  assert.match(block, /e1/);
});

test("MIXED 块包含模式名", () => {
  const block = buildPatternBlock({ type: "MIXED", detail: ["a", "a", "b"] });
  assert.match(block, /MIXED/);
});

test("INSUFFICIENT 返回空串", () => {
  assert.equal(buildPatternBlock({ type: "INSUFFICIENT", detail: [] }), "");
});
