import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { detectFrameworks } from '../src/detect.mjs'

const BIN = fileURLToPath(new URL('../bin/my-fe-harness.mjs', import.meta.url))

function cli(args, { input = '', env } = {}) {
  const r = spawnSync('node', [BIN, ...args], { encoding: 'utf8', input, env: env ?? process.env })
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') }
}
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mfh-'))
const rules = (d) => {
  const p = path.join(d, '.claude/rules')
  return fs.existsSync(p) ? fs.readdirSync(p).sort() : []
}
const withTmp = (fn) => {
  const d = tmp()
  try { return fn(d) } finally { fs.rmSync(d, { recursive: true, force: true }) }
}

test('--version prints name', () => {
  const { code, out } = cli(['--version'])
  assert.equal(code, 0)
  assert.match(out, /my-fe-harness/)
})

test('add core react = safety+typescript+patterns+react', () =>
  withTmp((d) => {
    cli(['add', 'core', 'react', '--target', d])
    assert.deepEqual(rules(d), ['patterns.md', 'react.md', 'safety.md', 'typescript.md'])
  }))

test('add core vue installs vue, not react', () =>
  withTmp((d) => {
    cli(['add', 'core', 'vue', '--target', d])
    const rr = rules(d)
    assert.ok(rr.includes('vue.md') && rr.includes('safety.md'))
    assert.ok(!rr.includes('react.md'))
  }))

test('add all = 12 rule packs, no structures', () =>
  withTmp((d) => {
    cli(['add', 'all', '--target', d])
    assert.equal(rules(d).length, 12)
    assert.ok(!rules(d).includes('fsd.md'))
  }))

test('aliases resolve', () =>
  withTmp((d) => {
    cli(['add', 'fe', 'clean', 'test', 'style', 'form', 'security', '--target', d])
    for (const f of ['frontend.md', 'patterns.md', 'testing.md', 'styling.md', 'forms.md', 'safety.md'])
      assert.ok(rules(d).includes(f), `missing ${f}`)
  }))

test('unknown token errors with core/all hint', () =>
  withTmp((d) => {
    const { code, out } = cli(['add', 'nope', '--target', d])
    assert.equal(code, 1)
    assert.match(out, /core/)
    assert.match(out, /all/)
  }))

for (const s of ['fsd', 'feature-based', 'layered']) {
  test(`scaffold ${s}: rule + safety + src dirs`, () =>
    withTmp((d) => {
      cli(['scaffold', s, '--target', d])
      assert.ok(rules(d).includes(`${s}.md`))
      assert.ok(rules(d).includes('safety.md'))
      const srcDirs = fs.existsSync(path.join(d, 'src')) ? fs.readdirSync(path.join(d, 'src')) : []
      assert.ok(srcDirs.length >= 4)
      assert.ok(fs.existsSync(path.join(d, 'src', srcDirs[0], 'README.md')))
    }))
}

test('dry-run writes nothing', () =>
  withTmp((d) => {
    cli(['add', 'ts', '--dry-run', '--target', d])
    assert.ok(!fs.existsSync(path.join(d, '.claude')))
  }))

test('re-run is idempotent (skips)', () =>
  withTmp((d) => {
    cli(['add', 'ts', '--target', d])
    assert.match(cli(['add', 'ts', '--target', d]).out, /건너뜀/)
  }))

test('--force overwrites', () =>
  withTmp((d) => {
    cli(['add', 'ts', '--target', d])
    assert.match(cli(['add', 'ts', '--force', '--target', d]).out, /덮어씀/)
  }))

test('guard installs + is idempotent + preserves existing settings', () =>
  withTmp((d) => {
    cli(['guard', '--target', d])
    assert.ok(fs.existsSync(path.join(d, '.claude/settings.json')))
    assert.ok(fs.existsSync(path.join(d, '.claude/hooks/safety-guard.mjs')))
    cli(['guard', '--target', d])
    const s = JSON.parse(fs.readFileSync(path.join(d, '.claude/settings.json'), 'utf8'))
    assert.equal(s.hooks.PreToolUse.length, 1, 'no duplicate hook')
  }))

test('guard preserves pre-existing settings keys', () =>
  withTmp((d) => {
    fs.mkdirSync(path.join(d, '.claude'), { recursive: true })
    fs.writeFileSync(
      path.join(d, '.claude/settings.json'),
      JSON.stringify({ model: 'opus', hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo x' }] }] } }),
    )
    cli(['guard', '--target', d])
    const s = JSON.parse(fs.readFileSync(path.join(d, '.claude/settings.json'), 'utf8'))
    assert.equal(s.model, 'opus')
    assert.equal(s.hooks.PreToolUse.length, 2)
  }))

test('init --all installs rules + guard', () =>
  withTmp((d) => {
    cli(['init', '--all', '--target', d])
    assert.equal(rules(d).length, 12)
    assert.ok(fs.existsSync(path.join(d, '.claude/hooks/safety-guard.mjs')))
  }))

test('non-TTY init errors cleanly (no hang)', () =>
  withTmp((d) => {
    const { code, out } = cli(['init', '--target', d])
    assert.equal(code, 1)
    assert.match(out, /비-TTY/)
  }))

// ---- --global (sandboxed HOME so the real home is never touched) ----
test('add --global writes to sandboxed ~/.claude/rules', () =>
  withTmp((home) => {
    cli(['add', 'core', '--global'], { env: { ...process.env, HOME: home } })
    const rr = fs.readdirSync(path.join(home, '.claude/rules')).sort()
    assert.deepEqual(rr, ['patterns.md', 'safety.md', 'typescript.md'])
  }))

test('guard --global uses ${HOME} hook path in ~/.claude/settings.json', () =>
  withTmp((home) => {
    cli(['guard', '--global'], { env: { ...process.env, HOME: home } })
    const s = JSON.parse(fs.readFileSync(path.join(home, '.claude/settings.json'), 'utf8'))
    const arg = s.hooks.PreToolUse[0].hooks[0].args[0]
    assert.match(arg, /^\$\{HOME\}\/\.claude\/hooks\/safety-guard\.mjs$/)
    assert.ok(fs.existsSync(path.join(home, '.claude/hooks/safety-guard.mjs')))
  }))

// ---- framework auto-detect ----
test('detectFrameworks reads package.json deps', () =>
  withTmp((d) => {
    fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify({ dependencies: { react: '18', next: '14' } }))
    assert.deepEqual(detectFrameworks(d), ['react'])
    fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify({ devDependencies: { vue: '3' } }))
    assert.deepEqual(detectFrameworks(d), ['vue'])
    fs.writeFileSync(path.join(d, 'package.json'), '{ not json')
    assert.deepEqual(detectFrameworks(d), [])
  }))

test('detectFrameworks returns [] when no package.json', () => withTmp((d) => assert.deepEqual(detectFrameworks(d), [])))
