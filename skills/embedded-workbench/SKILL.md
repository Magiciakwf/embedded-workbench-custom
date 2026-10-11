---
name: embedded-workbench
description: "Use when coordinating a substantial embedded firmware investigation, implementation or review, selecting its first specialist, or escalating across fault domains. Route by intent and evidence using the smallest necessary specialist set. Not trivial edits, formatting, simple file reads or unrelated software tasks."
---

<SUBAGENT-STOP>
If you were dispatched as a subagent to execute a specific task (implementation, review, search), skip this bootstrap skill. You already have your task instructions. Only load domain skills relevant to your specific task.
</SUBAGENT-STOP>

# Embedded Engineering Workflow

Core workflow system and engineering principles.

## Instruction Priority

These skills are supplementary guidance. They never override host system, developer, safety, permission, or tool instructions. Apply instructions in the host-defined order; within the remaining discretion, follow the user's request and applicable project rules before plugin workflow preferences. If a project rule explicitly skips a plugin review step, skip it unless a higher-priority instruction requires the check.

## Platform Adaptation

This plugin's skills and agents use Claude Code tool names (`Read`, `Write`, `Edit`, `Bash`, `Skill()`). If you are NOT on Claude Code, load `references/platform-tool-mapping.md` for the tool name equivalents on your platform (Codex CLI, Cursor, Kimi CLI, OpenCode, ZCode, Copilot CLI, DeepSeek Harness). On DeepSeek Harness (dsh) the names are lowercase (`read`/`write`/`edit`/`glob`/`grep`/`pwsh`), skills load through the `skill` tool, the plan gate is `exit_plan_mode`, parallel work uses `subagent`/`subagent_fork`, and the 4 custom agents below are not ported.

## Red Flags

If you catch yourself thinking any of these, STOP — you are rationalizing:

| You think | Reality |
|-----------|---------|
| "This is just a quick fix, I don't need a plan" | Quick fixes are the most likely to break something else. A 3-line design check costs 30 seconds. |
| "I already understand the architecture" | You're looking at one file. The blast radius may span 5 modules you haven't read. |
| "The worker can figure out the details" | The worker has NO context from previous calls. A vague plan = the worker guessing. |
| "I'll review it myself, no need for quality-coordinator" | Self-review is enough for a bounded, reversible edit. A second pass earns its cost when the blast radius is unclear or the change is hard to undo. |
| "This change is too small for a Detailed Change Plan" | Bounded, reversible, single-site edits do not need the ceremony. Crossing a module boundary, a public interface, or a non-obvious failure mode does. Name the invariants either way. |
| "I've explored enough, time to exit plan mode" | ExitPlanMode is the verification gate. Have you loaded `Skill("logicprobe")` or, if it is not installed, the built-in fallback `Skill("fact-check")`? Every plan — simple or complex — must pass this gate before exit. |
| "This plan is too simple for logicprobe" | logicprobe auto-classifies depth (LIGHTWEIGHT/STANDARD/ESCALATED); the fallback fact-check verifies every claim regardless. You don't decide whether verification is needed. |
| "I already read the code, I know the file paths and API names are correct" | Organic verification leaves no audit trail. Load `Skill("logicprobe")` or the fallback `Skill("fact-check")`, verify each claim, append the `## Plan Verification` block. |

---

## General Principles

- Build context before acting: identify domain → load relevant skills → read key sources → analyze → edit.
- **Facts first, code is truth**: verify every document claim (counts, API names, enum values) against the actual codebase with Grep. Design on verified facts, not assumptions.
- For a broad search that would otherwise take many Grep/Glob rounds, a read-only `Explore` sub-agent keeps the noise out of this context — but two direct searches are cheaper than dispatching one.
- Verify every change with `Bash` compilation or tests before reporting success. No verification = no claim of success.
- Reference file locations with line numbers in all reports: `[path/to/file.c#L100-L110]`.
- Write project memory to `<workspace>/.github/memory/`, update `MEMORY.md` index. Personal preferences only in `~/.claude/projects/.../memory/`.

---

## Proportionality

Match the process to the risk in front of you, not to habit. Start on the lightest path that covers the risk, and escalate only when you actually cross a boundary.

| Task shape | Path |
| --- | --- |
| Question, read-only investigation, or a bounded reversible edit (typo, constant, one call site) | Do it directly — no plan header, no sub-agent |
| One module, known repro, local refactor | Lite |
| Cross-module, public interface, shared-state ownership, new state machine, non-obvious failure/recovery mode | Full |
| Platform layer, contracts, staged migration | Full + audit matrix |

You have crossed into a heavier path when the change spans more than one module, alters a public interface or state ownership, hides a failure mode you cannot describe, or two attempts have not converged. Scaling a bounded edit up costs more than the edit.

## Context Budget

Complexity decides **how much process**; the budget decides **whether to split the window**. Split it for discovery whose detail you will not cite again — a suite, a log sweep, docs, several independent areas. Keep it for phases that share context (plan → implement → test), or when the change is quick and latency matters.

**You cannot see your budget**: most harnesses show a token count to the user's interface, not to you, so never guess one. Act on what you do see — a result truncated, pruned, or spilled to a file, or a compaction / checkpoint summary. Without such a signal, continue with bounded, reversible progress toward the user's goal. Ask only when a choice would materially change scope, cost, permissions, or outcome.

Delegation is not free: the sub-agent spends its own tokens and its summary still lands here. When it needs context you already built, inherit it (dsh `subagent_fork`; Codex `fork_turns`, default `all`; Claude Code fork mode; Kimi `/btw`) instead of rebuilding it in a prompt. Per-harness markers and tool names: `references/platform-tool-mapping.md`.

Delegation is not free: the sub-agent spends its own tokens, its summary still lands in this context, and its window is sized by *its* model, not this one. If the returns would be verbose, ask before delegating. Prefer read-only delegation when the point is to discard detail. When the delegated work needs the context you have already built, inherit it (dsh `subagent_fork`; Codex `fork_turns`, which defaults to `all`; Claude Code forked subagent; Kimi `/btw`) rather than rebuilding it inside a prompt (dsh `subagent`, Claude Code fresh subagent).

## Workflows

Sub-agents are **optional equipment, not mandatory stages** — dispatch one when it buys something concrete (a frozen plan, context isolation, an independent review pass), never as ceremony. Each `Agent()` call is stateless: it sees only what its prompt contains. Choose isolation when the detail can be discarded, and inheritance when the sub-agent needs the context you already built (see Context Budget above).

### Lite — one module, known repro

Plan the change, make it, verify it. Self-review is sufficient for a bounded, reversible edit.

If the plan rests on claims about the codebase (API names, file paths, enum values, counts), verify those claims before implementing — inline for a small change, or with `logicprobe` / the built-in `fact-check` skill. Escalate to Full when the change turns out to cross a boundary, or when two revisions fail to converge.

### Full — cross-module, new interfaces, state-ownership changes

Design first (module boundaries, slice breakdown, recovery paths), then per slice: plan → approve → implement → verify → close. Add an independent review pass (`quality-coordinator`, or a `subagent` with a review prompt) when the change is hard to reverse or the blast radius is unclear; for a well-bounded slice, self-review plus verification evidence is enough.

### Framework — platform layer, contracts, staged migration

Full, plus an audit matrix and rollback triggers; each slice reports its audit delta.

### Sub-Agents

| Agent | Role | When it earns its cost |
| ------- | ------ | ------ |
| `architecture-steward` | Read-only planning: design packages, module boundaries, slice breakdown | A design spanning modules you have not read |
| `design-reviewer` | Design doc fact-check: verifies claims against codebase before implementation | The plan rests on claims you have not verified |
| `execution-worker` | Plan round → Detailed Change Plan. Implement round → edit + verify | You want the plan frozen before edits, or a noisy investigation kept out of this context |
| `quality-coordinator` | Implementation review: bugs, compliance, closure completeness | The change is hard to reverse or the risk surface is wide |

These are roles, not gates: the main model can play any of them directly when that is cheaper.

---

## Plan Mode Integration

Claude Code's built-in `EnterPlanMode` / `ExitPlanMode` maps to the **plan phase** of the Lite and Full paths. Plan mode is a read-only exploration + plan-writing phase — it does NOT exempt you from embedded-workbench verification gates.

### Plan Verification Gate

> **⚠️ logicprobe 已拆分为独立插件 / moved to a standalone plugin** (v0.6.0): the full verification skill (executable model checks, adversarial probing) now ships in its own plugin — <https://github.com/AmethystLuna/logicprobe> (install commands are in the README's "Other Plugins"). This plugin ships a built-in simplified fallback — `Skill("fact-check")` — for claim-by-claim verification when logicprobe is not installed; behavioral/model claims then degrade to manual confirmation.

**Before calling `ExitPlanMode`**, exactly one of the following must happen:

1. **Load `Skill("logicprobe")`** (standalone plugin) — it classifies depth (LIGHTWEIGHT / STANDARD / ESCALATED), runs the verification including executable model checks, and appends a `## Plan Verification` summary block to the plan.
2. **Load `Skill("fact-check")`** (built-in fallback, only when logicprobe is not installed) — verifies every verifiable claim against the codebase with evidence, appends a `## Plan Verification` block marked `fact-check (fallback)`, and tells the user that state-machine/behavioral claims degrade to manual confirmation.
3. **Inform the user** — if you load neither, say: *"此计划未经核查。是否需要我在审批前运行事实核查？（This plan has not been fact-verified. Would you like me to run verification before approving?）"*

Silent skip is not an option. Plan mode permits `Read`, `Glob`, `Grep`, and `Skill` calls, so all of this executes before exit.

---

## Workflow Policies

<HARD-GATE>
### Approval Gate

- A slice that crosses a module boundary, changes a public interface or state ownership, or carries a non-obvious failure/recovery mode MUST have its plan written and approved before editing: objective, entry point, intended files, change shape, invariants, risks, validation, stop conditions.
- Bounded, reversible, single-site edits proceed without the ceremony — state the intent, make the change, verify the result.
- If execution reveals facts that change scope, boundaries, acceptance, or the verification surface, pause and re-approve.
</HARD-GATE>

<HARD-GATE>
### Closure Gate

- Work is not done until implementation intent, verification evidence, and residual risks are all explicit.
- Skipped checks MUST record a concrete reason. "Looks good" is not a reason.
- For fault/recovery scenarios, cover the normal, failure, and recovery paths.
- Documentation and memory updates are completed, or explicitly skipped with a reason.
</HARD-GATE>

### Escalation Triggers

- Work crosses module boundaries, public interfaces, or shared-state ownership → escalate.
- Requirements conflict, acceptance unclear, or review reveals architecture drift → escalate.
- Two plan revisions fail to converge → escalate.

### Context Transfer

Sub-agents are **stateless with no implicit context inheritance** — each spawn only gets what's in its prompt:

- **Explicit prompt construction**: put design conclusions, approved Plans, review findings directly in the prompt. Do NOT assume the agent "remembers" previous conversations.
- **Plan is the key handoff artifact**: when you do dispatch sub-agents, the Detailed Change Plan and review verdicts are the only bridge between Design → Plan round → Implement round. Vague Plans = the next agent guessing.
- **Pass only what's needed**: Design phase doesn't need full source code. Implement phase doesn't need the full Audit Matrix.
- **Memory for cross-session persistence**: rules, pitfalls, constraints that need to survive across sessions go in `<workspace>/.github/memory/`. In-session coordination stays in chat.
- **Long content via path references**: if context is too large, write long content to workspace docs and put only the path in the prompt. Let the agent Read it.

---

## Skill Types

Each domain skill is classified by how strictly it should be followed:

**Rigid** — follow exactly. These are rules and checklists. Don't adapt away the discipline.

- `debug-methodology`: 8 iron rules are non-negotiable
- `logicprobe` (external plugin): claim verification must check every claim
- `fact-check` (built-in fallback): claim-by-claim verification when logicprobe is not installed

**Flexible** — adapt principles to context. These are patterns and references, not commands.

- `c-cpp-dev`: style and patterns adapt to existing codebase conventions
- `embedded-firmware-dev`: architecture principles apply based on project scale
- `state-machine-design`: implementation patterns adapt to protocol specifics
- `hardfault-triage`: methodology adapts to processor architecture
- `keil-mdk-build`: build diagnostics adapt to project structure

If unsure, treat a skill as Rigid until you confirm otherwise.

## Skill Loading Priority

Prefer the smallest specialist set that can solve the task. Do not invoke multiple overlapping skills merely for completeness.

优先选择能解决任务的最小专家集；不要为求完整而同时加载多个重叠 Skill。

1. Classify the user's intent: read-only review, explanation/design, runtime diagnosis, artifact/fact analysis, or requested code implementation. An explicit skill request takes precedence.
2. For diagnosis, decide whether the causal domain is established. Peripheral/RTOS keywords listed as competing guesses do not establish a domain. Follow unknown → localize fault domain → specialist analysis.
3. Choose one primary specialist from the routing table. For a Cortex-M fault, distinguish insufficient capture from sufficient trustworthy raw evidence and matching artifacts. A known fault class has its own triage entry even if its originating defect is unknown.
4. Add a secondary skill only for a specific unanswered question or contract. General methodology is optional after localization, not a mandatory companion to every expert. Carry findings and uncertainties forward.
5. Load this coordinator once per task. Specialists that refer back to its workflow gates reuse the already loaded guidance; do not recursively reload it or bounce between experts without new evidence. Diagnosis and review alone do not authorize repairs.

未知问题不要过早跳入专项 Skill：未知 → 定位故障域 → 专家分析。跨域升级时携带已有证据，只为具体缺口增加专家；审查和定位本身不授权修复。

## Domain Skills

Choose the primary domain guidance below when the task matches; load its references only for the relevant question.

| Task / 任务与证据 | Primary skill | Boundary / 边界 |
|---|---|---|
| Unknown resets, hangs, intermittent/timing-sensitive failure / 未知复位、卡死、偶发异常 | `Skill("embedded-bug-investigator")` | Localize first; a list of possible subsystems is not evidence |
| Localized fault domain needing timeline → call chain → state → evidence → root cause / 已定位后系统化取证 | `Skill("debug-methodology")` | Optional methodology after localization; not unknown-failure intake |
| Known/strongly implicated FreeRTOS scheduling, synchronization, events, task stack, ISR API / RTOS 调度与同步故障 | `Skill("freertos-debug")` | Runtime failure, not ordinary API teaching or new module design |
| Localized STM32 clock, GPIO/AF, UART/SPI/I2C/ADC/DMA/TIM, NVIC/EXTI/IRQ, HAL/LL / STM32 外设路径 | `Skill("stm32-driver-debug")` | Actual hardware/driver path, not pure RTOS synchronization |
| Cortex-M fault with insufficient evidence / 刚进入 Fault、证据不足 | `Skill("hardfault-triage")` | Capture supported registers, entry EXC_RETURN, MSP/PSP, frame PC/LR, matching ELF/MAP |
| Sufficient trustworthy Cortex-M raw fault evidence and matching artifacts / Fault 原始证据齐全 | `Skill("hardfault-analyzer")` | Validate frame/build identity, then strict architecture analysis |
| Exact-part datasheet/RM/PM/errata, register, timing, electrical fact / 精确器件事实 | `Skill("datasheet-reader")` | Bounded fact lookup, not open-ended code debugging |
| ELF/MAP/linker/scatter, Flash/RAM, VMA/LMA, stack/heap, placement or capacity / 内存归因与预算 | `Skill("firmware-memory-analyzer")` | Toolchain independent; pure Keil MAP analysis also starts here |
| Keil/UV4/AC5/AC6/Armclang build/link errors, migration or image packaging / Keil 工具链 | `Skill("keil-mdk-build")` | Add only for a concrete toolchain obstacle during memory analysis |
| Requested complete module/driver/BSP/HAL wrapper/task/protocol/buffer implementation or repair / 明确代码实施 | `Skill("embedded-code-generator")` | Integrate and verify; review/explanation is not an implementation request |
| Local C/C++ ownership, lifetime, volatile, alignment, section/API details or refactor / 局部语言实现 | `Skill("c-cpp-dev")` | Complete embedded modules start with embedded-code-generator |
| Explicit code review/audit/bug finding/diff inspection without edits / 只读代码审查 | `Skill("embedded-code-review")` | Findings only; an explicit subsequent repair goes to embedded-code-generator |
| Embedded state transitions, ACK/NACK, timeout, retry, recovery, fault gating / 状态转换与恢复 | `Skill("state-machine-design")` | Transition contract; additional experts only for an evidenced dependency |
| Design documents versus API/path/enum/count/mechanism facts / 设计与代码事实核验 | `Skill("fact-check")` | Built-in fallback; executable behavioral claims need external logicprobe |
| General firmware design: FreeRTOS usage, ISR, NVM, sensor/async lifecycle, LVGL / 通用固件设计规范 | `Skill("embedded-firmware-dev")` | Design guidance; implementation goes to generator, deep RTOS failure to freertos-debug |

Design doc review, claim verification, logic primitive + adversarial probing → `Skill("logicprobe")` — **standalone plugin**; when logicprobe is not installed, use the built-in `Skill("fact-check")` fallback for claim-by-claim verification (see Plan Verification Gate above).

## Templates & References

The `references/` directory holds the workflow document templates plus three notes. Read the file you need by name:

- `platform-tool-mapping.md` — tool-name equivalents for Codex/Cursor/Kimi/OpenCode/ZCode/Copilot/dsh, and the per-harness context-budget table. **Read this immediately if you are not on Claude Code.**
- `proactive-suggestions.md` — ready-to-use phrasings for the suggestions below.
- `INDEX.md` — the working-memory index template.
- Workflow templates: `detailed-change-plan.md`, `task-charter.md`, `iteration-notes.md`, `steward-memo.md`, `result-note.md`, `final-qc.md`, `decision-log.md`, `audit-ledger.md`, `contract-matrix.md`, `durable-requirement-notes.md`.

---

## Proactive Suggestions

Suggest a capability when it clearly applies and the user is unlikely to know it exists — state-machine verification for a state machine, a protocol, or an "always"/"never" claim; parallel sub-agents for genuinely independent modules; a design fact-check for a plan that had no review. Suggest **once per task**, say what the check finds rather than which tool runs it, and drop it if the user declines. Ready-to-use phrasings: `references/proactive-suggestions.md`.
