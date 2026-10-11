import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../', import.meta.url))
const readJson = path => JSON.parse(readFileSync(join(repo, path), 'utf8'))
const version = '0.9.3-custom.1'
const name = 'embedded-workbench-custom'

const portable = readJson('plugin.json')
const codex = readJson('.codex-plugin/plugin.json')
const marketplace = readJson('.agents/plugins/marketplace.json')
for (const manifest of [portable, codex]) {
  assert.equal(manifest.name, name)
  assert.equal(manifest.version, version)
  assert.match(manifest.description, /STM32 \/ FreeRTOS/)
}
assert.equal(codex.skills, './skills/')
assert.equal(codex.hooks, './hooks/codex-hooks.json')
assert.equal(portable.extensions?.['com.openai']?.hooks, './hooks/codex-hooks.json')
assert.equal(marketplace.name, name)
assert.equal(marketplace.plugins.length, 1)
assert.equal(marketplace.plugins[0].name, name)
assert.equal(marketplace.plugins[0].version, version)
assert.deepEqual(marketplace.plugins[0].source, { source: 'local', path: './' })
assert.equal(marketplace.plugins[0].policy.installation, 'AVAILABLE')
assert.equal(marketplace.plugins[0].policy.authentication, 'ON_INSTALL')

const skills = readdirSync(join(repo, 'skills'), { withFileTypes: true })
  .filter(entry => entry.isDirectory()).map(entry => entry.name).sort()
assert.equal(skills.length, 16)
for (const skill of skills) assert(existsSync(join(repo, 'skills', skill, 'SKILL.md')))

const agents = readdirSync(join(repo, '.codex', 'agents'), { withFileTypes: true })
  .filter(entry => entry.isFile() && entry.name.endsWith('.toml'))
assert.equal(agents.length, 4)
for (const agent of agents) {
  const text = readFileSync(join(repo, '.codex', 'agents', agent.name), 'utf8')
  assert.match(text, /^name\s*=\s*".+"/m)
  assert.match(text, /^sandbox_mode\s*=\s*"(?:read-only|workspace-write)"/m)
  assert(!/^model\s*=/m.test(text), `${agent.name}: model must inherit the supported host default`)
}

for (const relative of ['hooks/hooks.json', 'hooks/codex-hooks.json', 'hooks/session-start', 'hooks/session-start.ps1', 'hooks/session-start-content.md']) {
  assert(existsSync(resolve(repo, relative)), `missing ${relative}`)
}
console.log(`PASS: ${name}@${version}, ${skills.length} skills, ${agents.length} Codex agents, marketplace and hooks`)
