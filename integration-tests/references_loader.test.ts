// 单元测试：references_loader 纯函数（味道映射）
// 运行：node --experimental-strip-types --test integration-tests/references_loader.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadFlavorInfo, listFlavorKeys, normalizeFlavorKey, buildBehaviorProtocol } from "../references_loader.ts";

test("microsoft 味道已注册，name/icon 正确", () => {
  const f = loadFlavorInfo("microsoft");
  assert.equal(f.key, "microsoft");
  assert.equal(f.name, "Microsoft");
  assert.equal(f.icon, "🪟");
  assert.ok(f.keywords.length > 0, "microsoft 味道应有关键词");
});

test("listFlavorKeys 包含 microsoft", () => {
  assert.ok(listFlavorKeys().includes("microsoft"), "味道列表应包含 microsoft");
});

test("normalizeFlavorKey 对 microsoft 原样返回（无别名）", () => {
  assert.equal(normalizeFlavorKey("microsoft"), "microsoft");
  assert.equal(normalizeFlavorKey("MICROSOFT"), "microsoft");
});

test("行为协议含 Harness Integrity 四权分立段落 + 治理引用指针", () => {
  const proto = buildBehaviorProtocol(loadFlavorInfo("alibaba"));
  assert.match(proto, /四权/, "应声明四权分立原则");
  assert.match(proto, /评分权|评分器/, "应点明评分权不可自持");
  assert.match(proto, /harness-governance\.md/, "应指向按需加载的治理协议引用");
});
