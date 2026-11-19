import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const GUARD = fileURLToPath(new URL('../scripts/lint-guard.mjs', import.meta.url))
const CLI = fileURLToPath(new URL('../bin/my-fe-harness.mjs', import.meta.url))

// 내용에 BAD가 있으면 에러 1건(exit 1), CRASH면 설정 오류(exit 2), 아니면 통과하는 가짜 eslint.
const FAKE_ESLINT = `#!/usr/bin/env node
const fs = require('node:fs')
const files = process.argv.slice(2).filter((a) => !a.startsWith('--') && a !== 'json')
const text = files.map((f) => fs.readFileSync(f, 'utf8')).join('')
if (text.includes('CRASH')) process.exit(2)
const results = files.map((f) => ({ filePath: f, messages: fs.readFileSync(f, 'utf8').includes('BAD')
  ? [{ severity: 2, line: 1, column: 1, message: '중첩 삼항 금지', ruleId: 'no-nested-ternary' }] : [] }))
process.stdout.write(JSON.stringify(results))
process.exit(results.some((r) => r.messages.length) ? 1 : 0)
`

function project({ withEslint = true, git = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-guard-'))
  if (withEslint) {
    const bin = path.join(root, 'node_modules', '.bin')
    fs.mkdirSync(bin, { recursive: true })
    fs.writeFileSync(path.join(bin, 'eslint'), FAKE_ESLINT, { mode: 0o755 })
  }
  fs.mkdirSync(path.join(root, 'src'))
  if (git) {
    spawnSync('git', ['init', '-q'], { cwd: root })
    fs.writeFileSync(path.join(root, '.gitignore'), 'node_modules\n')
    fs.writeFileSync(path.join(root, 'src', 'base.ts'), 'export const a = 1\n')
    spawnSync('git', ['add', '.'], { cwd: root })
    spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init'], { cwd: root })
  }
  return root
}

function runGuard(input, env = {}) {
  return spawnSync('node', [GUARD], {
    encoding: 'utf8',
    input: JSON.stringify(input),
    env: { ...process.env, MY_FE_HARNESS_LINT_GUARD: '', ...env },
  })
}

function edit(root, name, content) {
  const file = path.join(root, 'src', name)
  fs.writeFileSync(file, content)
  return { hook_event_name: 'PostToolUse', tool_name: 'Edit', cwd: root, tool_input: { file_path: file } }
}

test('고친 파일에 lint 에러가 있으면 exit 2로 Claude에게 되돌린다', () => {
  const r = runGuard(edit(project(), 'a.ts', 'BAD'))
  assert.equal(r.status, 2)
  assert.match(r.stderr, /중첩 삼항 금지 \(no-nested-ternary\)/)
  assert.match(r.stderr, /src\/a\.ts:1:1/)
})

test('문제 없으면 조용히 통과한다', () => {
  const r = runGuard(edit(project(), 'a.ts', 'ok'))
  assert.equal(r.status, 0)
  assert.equal(r.stderr, '')
})

test('검사 대상이 아닌 파일·ESLint 없는 프로젝트·설정 오류·꺼짐은 통과한다', () => {
  assert.equal(runGuard(edit(project(), 'a.md', 'BAD')).status, 0)
  assert.equal(runGuard(edit(project({ withEslint: false }), 'a.ts', 'BAD')).status, 0)
  assert.equal(runGuard(edit(project(), 'a.ts', 'CRASH BAD')).status, 0)
  assert.equal(runGuard(edit(project(), 'a.ts', 'BAD'), { MY_FE_HARNESS_LINT_GUARD: 'off' }).status, 0)
  assert.equal(spawnSync('node', [GUARD], { input: 'not json' }).status, 0)
})

test('끝내기 전: 바뀐 파일에 에러가 남으면 막고, 같은 세션 3번 뒤에는 놓아준다', () => {
  const root = project({ git: true })
  fs.writeFileSync(path.join(root, 'src', 'base.ts'), 'BAD\n')
  const stop = { hook_event_name: 'Stop', cwd: root, session_id: `s${Date.now()}` }
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const r = runGuard(stop)
    assert.equal(r.status, 2)
    assert.match(r.stderr, new RegExp(`\\(${attempt}/3\\)`))
  }
  assert.equal(runGuard(stop).status, 0)
})

test('끝내기 전: 바뀐 파일이 깨끗하면 통과한다(새 파일 포함)', () => {
  const root = project({ git: true })
  fs.writeFileSync(path.join(root, 'src', 'new.ts'), 'ok\n')
  assert.equal(runGuard({ hook_event_name: 'Stop', cwd: root, session_id: 'clean' }).status, 0)
})

test('lint-guard 명령이 PostToolUse·Stop 훅을 설치하고 uninstall이 걷어낸다', () => {
  const root = project()
  const settingsPath = path.join(root, '.claude', 'settings.json')
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true })
  fs.writeFileSync(settingsPath, JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: 'command', command: 'echo keep' }] }] } }))

  assert.equal(spawnSync('node', [CLI, 'lint-guard', '--target', root]).status, 0)
  const installed = JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
  assert.equal(installed.hooks.PostToolUse[0].matcher, 'Write|Edit|MultiEdit')
  assert.equal(installed.hooks.Stop.length, 2)
  assert.ok(fs.existsSync(path.join(root, '.claude', 'hooks', 'lint-guard.mjs')))

  assert.equal(spawnSync('node', [CLI, 'uninstall', '--target', root]).status, 0)
  const after = JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
  assert.equal(after.hooks.PostToolUse, undefined)
  assert.deepEqual(after.hooks.Stop, [{ hooks: [{ type: 'command', command: 'echo keep' }] }])
  assert.ok(!fs.existsSync(path.join(root, '.claude', 'hooks', 'lint-guard.mjs')))
})

test('lint-guard 설치 matcher와 플러그인 hooks.json matcher가 같다', async () => {
  const { LINT_MATCHER } = await import('../src/installLintHook.mjs')
  const plugin = JSON.parse(fs.readFileSync(fileURLToPath(new URL('../hooks/hooks.json', import.meta.url)), 'utf8'))
  assert.equal(plugin.hooks.PostToolUse[0].matcher, LINT_MATCHER)
  assert.ok(plugin.hooks.Stop[0].hooks[0].args[0].endsWith('lint-guard.mjs'))
})
