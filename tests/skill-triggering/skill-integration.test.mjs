import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cases, repo } from './routing-check.mjs'

const added = ['embedded-code-review', 'stm32-driver-debug', 'freertos-debug', 'hardfault-analyzer',
  'datasheet-reader', 'firmware-memory-analyzer', 'embedded-bug-investigator', 'embedded-code-generator']
const dirs = readdirSync(join(repo, 'skills'), { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name)
assert.equal(dirs.length, 16)
const known = new Set(dirs)
let localLinks = 0
for (const name of dirs) {
  const root = join(repo, 'skills', name)
  const body = readFileSync(join(root, 'SKILL.md'), 'utf8').replace(/\r\n/g, '\n')
  const front = body.match(/^---\n([\s\S]*?)\n---\n/)
  assert(front, `${name}: frontmatter must start the file, not a Markdown fence`)
  // This repository uses a strict valid YAML subset: bare kebab-case name and JSON-quoted description.
  const names = [...front[1].matchAll(/^name: ([a-z0-9]+(?:-[a-z0-9]+)*)$/gm)]
  const descriptions = [...front[1].matchAll(/^description: (".*")$/gm)]
  assert.equal(names.length, 1, `${name}: missing/duplicate name`)
  assert.equal(names[0][1], name)
  assert(name.length <= 64)
  assert.equal(descriptions.length, 1, `${name}: missing/duplicate description`)
  const description = JSON.parse(descriptions[0][1])
  assert(description.startsWith('Use when '), `${name}: description must state invocation boundary`)
  assert(description.length <= 1024 && !/[<>]/.test(description))
  assert(!/^[ \t]*```/.test(body.slice(front[0].length).trimStart()), `${name}: entire body wrapped in fence`)
  for (const [, target] of body.matchAll(/\bSkill\("([a-z0-9-]+)"\)/g)) {
    assert(known.has(target) || target === 'logicprobe', `${name}: nonexistent routed skill ${target}`)
  }
  for (const [, path] of body.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    if (/^(https?:|#)/.test(path)) continue
    assert(existsSync(resolve(root, path.split('#')[0])), `${name}: broken local reference ${path}`)
    localLinks++
  }
  for (const [, path] of body.matchAll(/\b(scripts\/[\w./-]+)/g)) {
    assert(existsSync(resolve(root, path)), `${name}: missing script ${path}`)
  }
}
const router = readFileSync(join(repo, 'skills', 'embedded-workbench', 'SKILL.md'), 'utf8')
const routingSection = router.split('## Domain Skills')[1].split('## Templates & References')[0]
for (const name of dirs.filter(name => name !== 'embedded-workbench')) {
  assert(routingSection.includes(`Skill("${name}")`), `Router missing ${name}`)
}
const ids = new Set()
for (const test of cases) {
  assert(!ids.has(test.id), `Duplicate case ${test.id}`)
  ids.add(test.id)
  assert(test.prompt.trim())
  assert(['positive', 'negative', 'conflict'].includes(test.kind))
  for (const name of [...test.expected, ...test.excluded]) assert(known.has(name), `${test.id}: unknown skill ${name}`)
  assert(!test.expected.some(name => test.excluded.includes(name)), `${test.id}: conflicting expectations`)
}
assert(cases.filter(test => test.kind === 'conflict').length >= 12)

// Keep the baseline branch/tag, manifests, agents and original Claude presence runner unchanged.
const git = (...args) => execFileSync('git', ['-C', repo, ...args])
const baseline = git('rev-parse', 'upstream-v0.9.2^{}').toString().trim()
for (const ref of ['main', 'custom-main']) assert.equal(git('rev-parse', ref).toString().trim(), baseline)
const protectedFiles = git('ls-tree', '-r', '--name-only', 'upstream-v0.9.2').toString().trim().split('\n')
  .filter(path => /^(\.codex-plugin\/|\.claude-plugin\/|\.cursor-plugin\/|\.kimi-plugin\/|\.codex\/agents\/|agents\/)/.test(path)
    || ['package.json', 'package-lock.json', 'tests/skill-triggering/run-test.sh'].includes(path))
for (const path of protectedFiles) {
  const original = git('show', `upstream-v0.9.2:${path}`).toString().replace(/\r\n/g, '\n')
  const current = readFileSync(join(repo, path), 'utf8').replace(/\r\n/g, '\n')
  assert.equal(current, original, `Protected file changed: ${path}`)
}

const sourceOption = process.argv.indexOf('--source-root')
let supporting = 0
if (sourceOption >= 0) {
  const source = resolve(process.argv[sourceOption + 1])
  const files = root => readdirSync(root, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
    ? files(join(root, entry.name)).map(path => `${entry.name}/${path}`) : [entry.name])
  const digest = path => createHash('sha256').update(readFileSync(path)).digest('hex')
  for (const name of added) {
    const src = join(source, name)
    const dst = join(repo, 'skills', name)
    assert.deepEqual(files(dst).sort(), files(src).sort(), `${name}: supporting files missing/extra`)
    for (const path of files(src).filter(path => path !== 'SKILL.md')) {
      assert.equal(digest(join(src, path)), digest(join(dst, path)), `${name}/${path}: resource changed`)
      supporting++
    }
    const normalize = path => readFileSync(path, 'utf8').replace(/\r\n/g, '\n')
      .replace(/^description: .*$/m, 'description: <routing-only>')
      .replace(/## Routing boundary\n\n[^]*?\n\n(?=## )/, '')
      .replace(/When evidence narrows the question,[^\n]+/, '<localized handoff>')
    assert.equal(normalize(join(dst, 'SKILL.md')), normalize(join(src, 'SKILL.md')), `${name}: unexpected core workflow rewrite`)
  }
}
console.log(`PASS: ${dirs.length} skills, ${localLinks} local links, ${cases.length} routing cases, protected baseline/files${supporting ? `, ${supporting} byte-identical resources and preserved specialist bodies` : ''}`)
console.log('Structural checks only: this is NOT a Claude or Codex behavioral routing pass.')
