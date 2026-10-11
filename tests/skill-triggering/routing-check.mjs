import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const cases = JSON.parse(readFileSync(new URL('./routing-cases.json', import.meta.url), 'utf8')).cases
export const repo = fileURLToPath(new URL('../../', import.meta.url))

export function grade(test, observed, completed, evidence) {
  if (!completed || !evidence) return 'not_run'
  assert(Array.isArray(observed), 'observed must be an ordered skill array, including the coordinator if loaded')
  const specialists = observed.filter(name => name !== 'embedded-workbench')
  const first = specialists[0]
  const expected = test.expected.length ? specialists.length === 1 && test.expected.includes(first) : first === undefined
  const conflict = observed.some(name => test.excluded.includes(name))
  return expected && !conflict && new Set(observed).size === observed.length ? 'pass' : 'fail'
}

export function claudeObservation(stdout) {
  const invocations = []
  const results = new Map()
  const events = stdout.split(/\r?\n/).filter(Boolean).map(line => {
    try { return JSON.parse(line) } catch { return null }
  }).filter(Boolean)
  // Only actual assistant tool-use blocks count, not prose naming a skill.
  for (const event of events) {
    for (const block of event.message?.content ?? []) {
      if (event.type === 'assistant' && block.type === 'tool_use' && block.name === 'Skill' && typeof block.input?.skill === 'string') {
        invocations.push({ id: block.id, name: block.input.skill.split(':').at(-1) })
      }
      if (event.type === 'user' && block.type === 'tool_result') {
        results.set(block.tool_use_id, block.is_error !== true)
      }
    }
  }
  const result = events.findLast(event => event.type === 'result')
  const completed = result?.subtype === 'success' && result.is_error !== true
    && invocations.every(call => call.id && results.get(call.id) === true)
  const observed = invocations.filter(call => results.get(call.id) === true).map(call => call.name)
  return { observed, completed }
}
