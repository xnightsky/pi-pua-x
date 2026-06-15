# pi-pua-x

> English | [中文版本](./README.zh.md)

Stateful PUA runtime extension for [pi](https://github.com/nicepkg/pi-coding-agent) — lifecycle hooks, pressure escalation, capability-aware enhancement, and subagent inheritance. Built on [tanweai/pua](https://github.com/tanweai/pua).

## What is this?

`pi-pua-x` is the **programmatic runtime** for the PUA behavioral protocol in pi. Unlike static skill files that rely on the model to "remember" rules, this extension uses pi's lifecycle hooks to deterministically enforce behavior:

> ## ⚠️ Two modules: this replaces **hooks only**, NOT the skill
>
> PUA ships as **two separate modules**. You need **both** for the full experience:
>
> | Module | What it is | Who maintains it | Provided by `pi-pua-x`? |
> |--------|-----------|------------------|--------------------------|
> | **skill** | Static rule files (`SKILL.md` + `references/`: flavors, methodologies). The model *reads* these for PUA culture/content. | Upstream [`tanweai/pua`](https://github.com/tanweai/pua) — full version for Claude Code, minimal for other CLIs | ❌ **No** |
> | **hooks** | Programmatic runtime (lifecycle hooks, failure tracking, pressure escalation, enforcement). | Officially **only the hooks** are maintained as a pi adapter; `pi-pua-x` is the enhanced replacement. | ✅ **Yes (this repo)** |
>
> **This is why you still install/sync the official `tanweai/pua` skill after installing `pi-pua-x`:**
> `pi-pua-x` replaces only the **hooks** half. The **skill** half (the actual flavor/methodology text the model reads) still comes from upstream `tanweai/pua`. Without the skill, the hooks run but the model has no rule content to act on (the extension falls back to a built-in minimal set and auto-disables PUA if no skill is found).
>
> ➡️ Install order: **(1)** deploy the `tanweai/pua` skill → **(2)** install `pi-pua-x` (hooks) → **(3)** run `/pua-x-sync-skills` to keep the skill's `references/` up to date. See [INSTALL.md](./INSTALL.md).

| Capability | How |
|-----------|-----|
| Failure tracking | `tool_result` event → persistent counter in `~/.pua/.failure_count` |
| Pressure escalation | L1–L4 prompts injected via `before_agent_start` based on failure count |
| Capability awareness | Reads active tools/skills, only enhances what's actually visible |
| Subagent inheritance | `tool_call` intercept → injects PUA capsule into child agent prompts |
| Frustration detection | `input` event → auto-escalates on user frustration signals |
| Loop detection | `turn_end` + `tool_call` → blocks repetitive failed commands |
| Integrity guard | `tool_call` → blocks writes to hidden tests / contamination targets |
| Compact state save | `session_before_compact` → persists state before context compression |

## vs. official `@tanweai/pi-pua`

The official pi adapter (~100 lines) does basic prompt injection and counting. This extension provides:

1. **Full flavor system** — 13 methodologies + routing + banner protocol + failure switch chains
2. **Capability awareness** — enhances based on actual PI active tools, never assumes invisible tools
3. **Active enforcement** — `tool_call` block, `input` frustration detection, `turn_end` loop detection, `session_before_compact` state save
4. **Subagent governance** — capsule injection ensures child agents inherit PUA constraints

**Relationship**: replaces, not stacks. The two extensions cannot coexist (command/hook conflicts).

## Install

> **所有安装方式、配置说明、命令参考、基线插件和故障排查，请参见 [INSTALL.md](./INSTALL.md)。**
>
> README 中不再重复安装步骤，避免文档双轨维护导致信息不一致。

## Commands

| Command | Description |
|---------|-------------|
| `/pua-on` | Enable PUA (writes `always_on=true`, immediate effect) |
| `/pua-off` | Disable PUA (writes `always_on=false`) |
| `/pua-status` | Show status, failure count, pressure level, flavor, capabilities |
| `/pua-reset` | Reset failure counter to zero |
| `/pua-x-sync-skills` | Sync the **skill module's** upstream tanweai/pua references (flavors, methodologies, etc.). This extension is the *hooks* module and does not bundle the skill — see the **Two modules** callout near the top of this README. |

## Configuration

`~/.pua/config.json`:

```json
{
  "always_on": true,
  "flavor": "alibaba",
  "enforcement_level": "suggest",
  "integrity_guard": true,
  "frustration_detection": true,
  "loop_detection": true,
  "compact_state_save": true
}
```

## Supported Flavors

alibaba (default), bytedance, huawei, tencent, baidu, pinduoduo, meituan, jd, xiaomi, netflix, tesla/musk, apple/jobs, amazon

## Docs

| Doc | Purpose |
|-----|--------|
| [INSTALL.md](./INSTALL.md) | Install, commands, config, sync, integration tests |
| [docs/CAPABILITIES.md](./docs/CAPABILITIES.md) | PI capability model and visibility rules |
| [docs/DESIGN.md](./docs/DESIGN.md) | Internal architecture and contracts |
| [docs/UPSTREAM.md](./docs/UPSTREAM.md) | tanweai/pua upstream sync strategy |
| [docs/RECOMMENDATIONS.md](./docs/RECOMMENDATIONS.md) | Recommended PI plugin combinations |

## File Structure

```
pi-pua-x/
├── index.ts                 # Extension entry point
├── capabilities.js          # Capability snapshot + enhancement prompts
├── enforcement.ts           # 4 enforcement hooks logic
├── references_loader.ts     # Flavor/methodology/pressure loader
├── global.d.ts              # Type stubs for PI extension API
├── tsconfig.json            # TypeScript config (noEmit, type-check only)
├── INSTALL.md               # Installation guide
├── bin/
│   ├── sync-pua-references.sh
│   └── sync-pua-references.ps1
├── docs/
│   ├── CAPABILITIES.md
│   ├── DESIGN.md
│   ├── RECOMMENDATIONS.md
│   ├── UPSTREAM.md
│   └── plans/
└── integration-tests/
    ├── pua.ittest.sh        # Integration test (bash)
    ├── pua.ittest.ps1       # Integration test (PowerShell)
    └── pua-enforcement.ittest.ps1
```

## License

MIT
