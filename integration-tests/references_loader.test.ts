// 单元测试：references_loader 纯函数（味道映射）
// 运行：node --experimental-strip-types --test integration-tests/references_loader.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { findSkillDirs, loadFlavorInfo, listFlavorKeys, normalizeFlavorKey, buildBehaviorProtocol } from "../src/references_loader.ts";

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

test("findSkillDirs 跟随祖先链发现父目录 .agents/skills/pua（与 pi 技能发现对齐）", () => {
  // 构造 git root（root/.git）+ root/.agents/skills/pua，从 root/a/b 作为 cwd 发起发现。
  // pi 的 collectAncestorAgentsSkillDirs 会逐级向上收集并在 git root 停止，
  // findSkillDirs 必须同样命中，否则禁用模型的防御声明在该布局下漏注入。
  const root = mkdtempSync(join(tmpdir(), "pua-ancestor-"));
  const prevCwd = process.cwd();
  try {
    mkdirSync(join(root, ".git"));
    const skillDir = join(root, ".agents", "skills", "pua");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, "SKILL.md"), "---\nname: pua\n---\n", "utf-8");
    const nested = join(root, "a", "b");
    mkdirSync(nested, { recursive: true });
    process.chdir(nested);

    const found = findSkillDirs().map((d) => resolve(d));
    assert.ok(found.includes(resolve(skillDir)), "应发现祖先目录链上的 pua skill 目录");

    // git root 之外（更上层）的目录不应被收集
    assert.ok(found.every((d) => !d.includes(resolve(join(tmpdir(), ".agents")))), "不应越过 git root 向上收集");
  } finally {
    process.chdir(prevCwd);
    rmSync(root, { recursive: true, force: true });
  }
});
