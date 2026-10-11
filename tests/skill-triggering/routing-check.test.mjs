import assert from 'node:assert/strict'
import { cases, grade, claudeObservation } from './routing-check.mjs'

const conflict = cases.find(test => test.id === 'conflict-unknown-hang')
const negative = cases.find(test => test.id === 'negative-format')
assert.equal(grade(conflict, ['embedded-workbench', 'embedded-bug-investigator'], true, 'trace'), 'pass')
assert.equal(grade(conflict, ['freertos-debug', 'embedded-bug-investigator'], true, 'trace'), 'fail')
assert.equal(grade(conflict, ['embedded-bug-investigator', 'freertos-debug'], true, 'trace'), 'fail')
assert.equal(grade(conflict, ['embedded-bug-investigator', 'embedded-code-generator'], true, 'trace'), 'fail')
assert.equal(grade(conflict, ['embedded-workbench', 'embedded-workbench', 'embedded-bug-investigator'], true, 'trace'), 'fail')
assert.equal(grade(negative, [], false, 'authentication error'), 'not_run')
assert.equal(grade(negative, [], true, null), 'not_run')
assert.equal(grade(negative, [], true, 'successful empty invocation trace'), 'pass')
assert.equal(grade(negative, ['embedded-workbench'], true, 'trace'), 'fail')
const trace = [
  { type: 'assistant', message: { content: [
    { type: 'text', text: 'I may use freertos-debug' },
    { type: 'tool_use', id: 'skill-1', name: 'Skill', input: { skill: 'embedded-workbench:embedded-bug-investigator' } },
  ] } },
  { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'skill-1', content: 'Loaded skill', is_error: false }] } },
  { type: 'result', subtype: 'success', is_error: false },
].map(event => JSON.stringify(event)).join('\n')
assert.deepEqual(claudeObservation(trace), { observed: ['embedded-bug-investigator'], completed: true })
assert.deepEqual(claudeObservation(trace.replace('"is_error":false}', '"is_error":true}')), { observed: [], completed: false })
assert.deepEqual(claudeObservation('Not logged in'), { observed: [], completed: false })
assert.equal(claudeObservation('{"type":"result","subtype":"error_max_turns","is_error":true}').completed, false)
console.log('PASS: order, minimal set, conflict, coordinator, missing evidence, auth/turn/tool failure and successful tool-use parsing')
