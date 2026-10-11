import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { cases, repo, grade, claudeObservation } from './routing-check.mjs'

const cliOption = process.argv.indexOf('--claude-bin')
const windowsNative = join(process.env.APPDATA ?? '', 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe')
const cli = cliOption >= 0 ? process.argv[cliOption + 1]
  : process.platform === 'win32' && existsSync(windowsNative) ? windowsNative : 'claude'
const selectedId = process.argv.indexOf('--case')
const selected = selectedId < 0 ? cases : cases.filter(test => test.id === process.argv[selectedId + 1])
if (!selected.length) throw new Error('Unknown case')
const output = mkdtempSync(join(tmpdir(), 'embedded-routing-'))
const report = { platform: 'claude', source: repo, results: [] }
const auth = spawnSync(cli, ['auth', 'status'], { encoding: 'utf8', timeout: 30000, windowsHide: true })
let loggedIn = false
try { loggedIn = JSON.parse(auth.stdout).loggedIn === true } catch { /* Unavailable/auth error is not a pass. */ }
if (auth.error || auth.status !== 0 || !loggedIn) {
  report.results = selected.map(test => ({ id: test.id, observed: null, status: 'not_run', reason: 'Claude unavailable or not authenticated' }))
  writeFileSync(join(output, 'results.json'), JSON.stringify(report, null, 2))
  console.log(`NOT RUN: authenticate Claude yourself before running. Report: ${join(output, 'results.json')}`)
  process.exit(2)
}

for (const test of selected) {
  const cwd = join(output, test.id)
  // No project installation or configuration mutation; one fresh CLI invocation per case.
  const prompt = `Perform initial skill routing only for the user task below. Load the coordinator if its scope applies, then the smallest necessary first specialist set and stop. Do not implement or diagnose the task, run commands, spawn agents, or edit files. Do not name a skill as loaded unless you actually invoke it.\n\nUser task:\n${test.prompt}`
  const run = spawnSync(cli, [
    '-p', prompt, '--plugin-dir', repo, '--tools', 'Skill,Read', '--allowedTools', 'Skill,Read',
    '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--setting-sources', '',
    '--max-turns', '6', '--output-format', 'stream-json', '--verbose', '--no-session-persistence',
  ], { cwd: output, encoding: 'utf8', timeout: 300000, maxBuffer: 16 * 1024 * 1024, windowsHide: true })
  const evidence = `${cwd}.jsonl`
  writeFileSync(evidence, run.stdout ?? '')
  writeFileSync(`${cwd}.stderr.txt`, run.stderr ?? String(run.error ?? ''))
  const observation = claudeObservation(run.stdout ?? '')
  const completed = !run.error && run.status === 0 && observation.completed
  const status = grade(test, observation.observed, completed, evidence)
  report.results.push({ id: test.id, expected: test.expected, excluded: test.excluded,
    observed: observation.observed, status, evidence, exit_code: run.status })
  console.log(`${status.toUpperCase()}: ${test.id} -> ${observation.observed.join(', ') || '(none)'}`)
  if (!completed) break // Stop on authentication, timeout or runtime failure; never infer a negative pass.
}
for (const test of selected.slice(report.results.length)) {
  report.results.push({ id: test.id, observed: null, status: 'not_run', reason: 'Runner stopped on earlier execution failure' })
}
writeFileSync(join(output, 'results.json'), JSON.stringify(report, null, 2))
console.log(`Report: ${join(output, 'results.json')}`)
process.exitCode = report.results.some(result => result.status !== 'pass') ? 1 : 0
