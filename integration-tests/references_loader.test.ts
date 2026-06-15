// 单元测试：references_loader 纯函数（味道映射）
// 运行：node --experimental-strip-types --test integration-tests/references_loader.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadFlavorInfo, listFlavorKeys, normalizeFlavorKey } from "../references_loader.ts";

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
