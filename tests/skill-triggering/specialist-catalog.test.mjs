// Exercise this plugin's actual filesystem provider without a sibling logicprobe checkout.
import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { basename, join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import { apply, name, Config } from '../../lib/index.js'
import { repo } from './routing-check.mjs'

const expected = readdirSync(join(repo, 'skills'), { withFileTypes: true })
  .filter(entry => entry.isDirectory()).map(entry => entry.name).sort()
assert.equal(expected.length, 16)
const app = new Context()
new SkillRegistry(app)
await app.plugin({ name, Config, apply }, { enabled: true })
try {
  const snapshot = await app.skills.snapshot({ cwd: repo })
  assert.deepEqual(snapshot.skills.map(skill => skill.name).sort(), expected)
  for (const skill of expected) {
    const definition = await app.skills.get(skill, { cwd: repo })
    assert(definition?.content?.length > 50, `${skill}: content not loaded`)
    assert.equal(definition.resourceBase?.kind, 'directory')
    assert.equal(basename(definition.resourceBase.path), skill)
  }
  console.log('PASS: real filesystem registry discovers/loads all 16 skills with resource bases')
  console.log('Catalog integration only; not a Codex or Claude behavioral routing pass.')
} finally {
  await app.fiber.dispose()
}
