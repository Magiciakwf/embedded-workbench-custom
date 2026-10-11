# Specialist routing verification

`routing-cases.json` holds 12 conflict, 10 positive and 9 negative cases. It records
the user prompt, allowed first specialist and excluded initial loads. The
coordinator is not counted as a specialist. Conflicts are checked only during
the initial routing phase; later escalation requires new evidence. Do not solve
the firmware task during these tests.

## Offline checks

```text
node tests/skill-triggering/skill-integration.test.mjs
node tests/skill-triggering/routing-check.test.mjs
node tests/skill-triggering/specialist-catalog.test.mjs
```

To also verify every imported resource against the user Skill source, append
`--source-root <user-skill-directory>` to the first command. The copied specialist
bodies may differ only in their description, routing-boundary section and the
investigator's localized handoff paragraph. Resources must be byte-identical.
These are structural checks and scorer unit tests, not model routing evidence.
The catalog test uses the repository's locked DSH dependencies and the actual
filesystem registry/provider; it checks discovery, loading and resource bases
without requiring a sibling logicprobe checkout.

## Claude native invocation tests

The original `run-test.sh` remains a `claude -p` presence test, unchanged. Its
negative-case grep can mistake an execution failure for absence of a Skill; do
not accept those results unless the invocation actually completed successfully.
`run-all.sh` retains that runner and adds the new initial-routing suite.

```text
node tests/skill-triggering/run-claude-routing.mjs
node tests/skill-triggering/run-claude-routing.mjs --case conflict-unknown-hang
```

Use `--claude-bin <native-executable>` when command discovery is unavailable.
The new runner checks authentication without logging in, restricts tools to
Skill/Read, starts each prompt fresh with this checkout's plugin, and saves
ordered actual `Skill` tool invocations and terminal results under the OS temp
directory. Authentication, timeout, turn-limit or other execution failure is
`not_run`, never a successful negative. All initial expected/excluded checks
come from the common cases file. Avoid duplicate installed versions of this
plugin during a native test and inspect the session's actual catalog.

## Codex manual native verification

Claude success does not establish Codex success. Codex CLI being installed also
does not show that it has loaded the modified development plugin. This editing
session still has upstream/user Skill definitions, so its responses cannot be
used to validate the development checkout's native automatic selection.

The Codex fallback is `codex-manual-results.json`. Every case starts with
`observed: null`, `evidence: null`, `status: "not_run"`. No automatic native
Codex routing result is asserted in this phase.

For a real run, use a fresh Codex session in an isolated test workspace with
only this checkout's Skill catalog available for these names. Disable duplicate
upstream/user definitions for that test session without overwriting the user
Skill sources. Check the displayed names/descriptions and source paths first.
Do not point the session at a firmware project, where a positive implementation
prompt could cause unintended changes. Present each saved prompt as a routing
probe that must stop after loading its first specialist, without solving,
editing, spawning agents or executing build/firmware commands.

Record the source revision and session identity; transcribe the actual ordered
native Skill invocation or SKILL.md reads (including the coordinator), attach
the saved trace, and enter `pass`/`fail`. A prose prediction of what would load
is not an observed invocation. An interrupted session stays `not_run`. Cases
are initial-selection probes, not target-driver correctness tests.

```text
node tests/skill-triggering/verify-codex-results.mjs <completed-results.json>
```

This executable validates prompt/expectation consistency, evidence presence and
scoring of manual observations; it does not run a model. Exit codes: 0 = all
observed cases pass; 1 = failure/invalid record; 2 = cases still not run. Leave
the committed blank template intact and save completed results outside this
repository unless deliberately adding them as review evidence.

## Integration review scope

The source catalog contains 16 skills after copying 8 specialist directories.
Each imported reference/script is preserved; no user Skill source was edited.
The original agents and plugin/package manifests are preserved, including their
upstream identity and existing metadata mentioning 8 skills. Refresh those
counts together with the later installation-identity change; they do not define
the filesystem-discovered catalog.

The bootstrap table selects one primary expert by intent and evidence.
Conditional specialist links reuse already loaded guidance, including the
coordinator's workflow gates. The session-start text now lists all 16 skills.
The DSH real-registry expected roster also includes all 16, but its existing
sibling logicprobe/dependency requirement is unchanged.

Small proven legacy corrections accompany the routing edits: triage now
labels Armv7-M UNSTKERR/STKERR at CFSR bits 11/12 correctly (consistent with the
imported decoder/reference); the shared check-and-clear event latch no longer
claims multi-consumer broadcast or lossless event counting. The legacy fault
printf example is explicitly illustrative: its declared guard is not used,
entry EXC_RETURN is separate from stacked LR, and frame bounds need validation.
Imprecise CPU faults no longer imply a DMA-controller fault, and UNALIGNED does
not universally depend on CCR.UNALIGN_TRP. These are limited corrections,
consistent with the imported architecture reference; no decoder was changed.
Broader example/methodology rewrites are deferred to a separate task.

## Recorded checks (2026-10-11)

- Skill Creator `quick_validate.py`: all 16 skills passed with UTF-8 mode and
  PyYAML supplied in an external validation directory. A separate real YAML
  parser also accepted every frontmatter. No whole-file Markdown fences found.
- `skill-integration.test.mjs --source-root <user-skill-directory>`: passed;
  9 local reference links, 11 byte-identical supporting files, unchanged
  specialist core bodies, protected manifests/agents/branches and real route names.
- `routing-check.test.mjs`: passed; initial order, minimal set, forbidden loads,
  duplicate coordinator, evidence requirements, execution failures and actual
  successful Skill tool-result parsing checked. This is a scorer test.
- Repository-wide markdownlint: passed with markdownlint-cli 0.45.0.
- `claude plugin validate .`: passed with the existing root-CLAUDE.md context
  warning; plugin/marketplace manifests were not modified.
- SessionStart hook: 15/15 passed using Git Bash. The changed payload is fixed
  to LF in `.gitattributes` to preserve its final byte across Windows/Linux.
- Fault decoder: all 18 existing Python unit tests passed without script edits.
- DSH gate injection: 16/16 passed; browser client-half and volatile fallback
  tests passed with the repository's installed lockfile dependencies.
- Real filesystem catalog: all 16 skills discovered/loaded with directory
  resource bases. TypeScript typecheck passed. Dependency installation used
  `npm ci --legacy-peer-deps --ignore-scripts`; package manifests/lock stayed intact.
- `npm run build` passed and produced no Git content drift in committed `lib/`.
- Existing combined `dsh-skills-registration.test.mjs`: unavailable here because
  the required sibling `logicprobe/lib/index.js` is absent. Its expected roster
  was extended; the standalone real-catalog test above covers this plugin only.
- Claude native routing: not run; CLI authentication status was logged out.
  The new runner's preflight produced only `not_run` results. The original
  `claude -p` presence test was preserved and was not treated as successful.
- Codex native routing: 0 observed, 31 not run. The saved manual template and
  executable result checker do not imply native automatic selection passed.

Review found no missing resources, nonexistent route targets or unconditional
specialist reload cycle. Review remains read-only and implementation requires
an explicit change request. Unknown-domain and fault-evidence gates are explicit.
Native model behavior is the remaining validation gap; keep installation
identity/count updates separate until that routing evidence is available.
