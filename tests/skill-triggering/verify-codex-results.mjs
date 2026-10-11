import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cases, grade } from './routing-check.mjs'

const path = resolve(process.argv[2] ?? fileURLToPath(new URL('./codex-manual-results.json', import.meta.url)))
const report = JSON.parse(readFileSync(path, 'utf8'))
assert.equal(report.platform, 'codex')
assert.equal(report.validation_mode, 'manual-native-skill-routing')
assert.equal(report.results.length, cases.length, 'Every case needs a result, including not_run')
const seen = new Set()
let pending = 0
for (const row of report.results) {
  assert(!seen.has(row.id), `Duplicate result: ${row.id}`)
  seen.add(row.id)
  const test = cases.find(test => test.id === row.id)
  assert(test, `Unknown case: ${row.id}`)
  assert.equal(row.prompt, test.prompt, `${row.id}: prompt changed`)
  assert.deepEqual(row.expected, test.expected)
  assert.deepEqual(row.excluded, test.excluded)
  if (row.status === 'not_run') {
    assert.equal(row.observed, null)
    assert.equal(row.evidence, null)
    pending++
    continue
  }
  assert(report.session && report.source_revision, 'Actual results require session and development source identity')
  assert(row.evidence && existsSync(resolve(dirname(path), row.evidence)), `${row.id}: missing evidence file`)
  assert(readFileSync(resolve(dirname(path), row.evidence), 'utf8').trim(), `${row.id}: empty evidence`)
  // The operator transcribes actual native invocation/read order, not a hypothetical answer.
  assert.equal(row.status, grade(test, row.observed, true, row.evidence), `${row.id}: incorrect pass/fail`)
}
console.log(`Codex manual record: ${cases.length - pending} observed, ${pending} NOT RUN; pending cases are not passes.`)
if (report.results.some(row => row.status === 'fail')) process.exitCode = 1
else if (pending) process.exitCode = 2
