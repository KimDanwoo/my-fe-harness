import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PACKS } from '../src/packs.mjs'
import { STRUCTURES } from '../src/structures.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const r = (...p) => path.join(ROOT, ...p)

test('every rule pack has its rules file', () => {
  for (const p of PACKS) assert.ok(fs.existsSync(r('rules', p.file)), `missing rules/${p.file}`)
})

test('every rules/*.md is registered in PACKS', () => {
  const registered = new Set(PACKS.map((p) => p.file))
  for (const f of fs.readdirSync(r('rules'))) assert.ok(registered.has(f), `unregistered rules/${f}`)
})

test('every structure has a matching structure pack and rule file', () => {
  for (const s of STRUCTURES) {
    assert.ok(fs.existsSync(r('rules', s.ruleFile)), `missing rules/${s.ruleFile}`)
    assert.ok(PACKS.some((p) => p.id === s.id && p.kind === 'structure'), `no structure pack for ${s.id}`)
  }
})

test('package.json ships every referenced directory', () => {
  const pkg = JSON.parse(fs.readFileSync(r('package.json'), 'utf8'))
  for (const d of ['bin', 'src', 'rules', 'commands', 'skills', 'scripts', 'hooks', 'assets', '.claude-plugin'])
    assert.ok(pkg.files.includes(d), `package.files missing "${d}"`)
  assert.ok(pkg.bin['my-fe-harness'], 'bin name should be my-fe-harness')
  assert.equal(pkg.scripts.test, 'node --test')
})

test('plugin/marketplace/hooks JSON are valid', () => {
  for (const f of ['.claude-plugin/plugin.json', '.claude-plugin/marketplace.json', 'hooks/hooks.json'])
    assert.doesNotThrow(() => JSON.parse(fs.readFileSync(r(f), 'utf8')), `invalid JSON: ${f}`)
})

// 릴리스 drift 방지: package.json과 plugin.json 버전은 항상 일치해야 한다.
test('package.json and plugin.json versions are in sync', () => {
  const pkg = JSON.parse(fs.readFileSync(r('package.json'), 'utf8')).version
  const plugin = JSON.parse(fs.readFileSync(r('.claude-plugin/plugin.json'), 'utf8')).version
  assert.equal(pkg, plugin, `version drift: package.json=${pkg} plugin.json=${plugin}`)
  assert.match(pkg, /^\d+\.\d+\.\d+/, 'semver 형식')
})

test('hooks.json references the existing guard script', () => {
  const hooks = fs.readFileSync(r('hooks/hooks.json'), 'utf8')
  assert.ok(hooks.includes('safety-guard.mjs'))
  assert.ok(fs.existsSync(r('scripts/safety-guard.mjs')))
})

// 드리프트 방지: installHook의 MATCHER(npx 설치)와 hooks.json의 matcher(플러그인 설치)는 같아야
// 두 설치 경로가 동일한 도구 집합을 가드한다.
test('installHook MATCHER matches plugin hooks.json matcher', () => {
  const pluginMatcher = JSON.parse(fs.readFileSync(r('hooks/hooks.json'), 'utf8')).hooks.PreToolUse[0].matcher
  const src = fs.readFileSync(r('src/installHook.mjs'), 'utf8')
  const m = src.match(/const MATCHER = '([^']+)'/)
  assert.ok(m, 'installHook.mjs 에서 MATCHER 상수를 찾지 못했습니다')
  assert.equal(m[1], pluginMatcher, 'matcher 드리프트: installHook.mjs 와 hooks.json')
})

test('no stale "claude-harness" references remain', () => {
  let stale = []
  const scan = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (['node_modules', '.git', '.omc', 'test'].includes(e.name)) continue
      const fp = path.join(dir, e.name)
      if (e.isDirectory()) scan(fp)
      else if (/\.(md|mjs|json|svg)$/.test(e.name) && fs.readFileSync(fp, 'utf8').includes('claude-harness')) stale.push(fp)
    }
  }
  scan(ROOT)
  assert.deepEqual(stale, [], `stale refs: ${stale.join(', ')}`)
})

test('slash commands reference the correct bin', () => {
  for (const f of fs.readdirSync(r('commands')))
    assert.ok(fs.readFileSync(r('commands', f), 'utf8').includes('my-fe-harness.mjs'), `${f} bad bin ref`)
})

test('only safety & commit are always-loaded; rest are path-scoped', () => {
  const ALWAYS = new Set(['safety.md', 'commit.md'])
  for (const p of PACKS) {
    const t = fs.readFileSync(r('rules', p.file), 'utf8')
    const scoped = /^---\r?\n[\s\S]*?paths:/.test(t)
    if (ALWAYS.has(p.file)) assert.ok(!scoped, `${p.file} should be always-loaded`)
    else assert.ok(scoped, `${p.file} should be path-scoped`)
  }
})

test('all sources pass node --check', () => {
  const files = ['bin/my-fe-harness.mjs', 'scripts/safety-guard.mjs', ...fs.readdirSync(r('src')).map((x) => `src/${x}`)]
  for (const f of files) {
    const res = spawnSync('node', ['--check', r(f)], { encoding: 'utf8' })
    assert.equal(res.status, 0, `${f}: ${res.stderr}`)
  }
})
