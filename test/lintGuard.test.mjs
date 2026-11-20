import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const GUARD = fileURLToPath(new URL('../scripts/lint-guard.mjs', import.meta.url))
const CLI = fileURLToPath(new URL('../bin/my-fe-harness.mjs', import.meta.url))

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

const EMPTY_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-guard-home-'))

function runGuard(input, env = {}) {
  return spawnSync('node', [GUARD], {
    encoding: 'utf8',
    input: JSON.stringify(input),
    env: { ...process.env, HOME: EMPTY_HOME, MY_FE_HARNESS_LINT_GUARD: '', ...env },
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

test('끝내기 전: 이 세션이 고친 파일에 에러가 남으면 막고, 3번 뒤에는 놓아준다', () => {
  const root = project()
  const session = `s${Date.now()}`
  runGuard({ ...edit(root, 'a.ts', 'BAD'), session_id: session })
  const stop = { hook_event_name: 'Stop', cwd: root, session_id: session }
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const r = runGuard(stop)
    assert.equal(r.status, 2)
    assert.match(r.stderr, new RegExp(`\\(${attempt}/3\\)`))
  }
  assert.equal(runGuard(stop).status, 0)
})

test('끝내기 전: 고친 파일을 고쳐 두었으면 통과하고, 다른 에이전트가 고친 파일은 보지 않는다', () => {
  const root = project()
  const session = `t${Date.now()}`
  runGuard({ ...edit(root, 'mine.ts', 'BAD'), session_id: session })
  runGuard({ ...edit(root, 'theirs.ts', 'BAD'), session_id: session, agent_id: 'designer-1' })
  fs.writeFileSync(path.join(root, 'src', 'mine.ts'), 'ok')
  assert.equal(runGuard({ hook_event_name: 'Stop', cwd: root, session_id: session }).status, 0)
  const sub = runGuard({ hook_event_name: 'SubagentStop', cwd: root, session_id: session, agent_id: 'designer-1' })
  assert.equal(sub.status, 2)
  assert.match(sub.stderr, /theirs\.ts/)
  assert.doesNotMatch(sub.stderr, /mine\.ts/)
})

test('고친 적이 없으면 끝낼 때 아무것도 하지 않는다', () => {
  assert.equal(runGuard({ hook_event_name: 'Stop', cwd: project(), session_id: `none${Date.now()}` }).status, 0)
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
  assert.equal(installed.hooks.SubagentStop.length, 1)
  assert.ok(fs.existsSync(path.join(root, '.claude', 'hooks', 'lint-guard.mjs')))
  assert.ok(fs.existsSync(path.join(root, '.claude', 'hooks', 'lint-guard-baseline.mjs')))
  assert.ok(fs.existsSync(path.join(root, '.claude', 'hooks', 'lint-guard-plugin.mjs')))

  assert.equal(spawnSync('node', [CLI, 'uninstall', '--target', root]).status, 0)
  assert.ok(!fs.existsSync(path.join(root, '.claude', 'hooks', 'lint-guard-baseline.mjs')))
  assert.ok(!fs.existsSync(path.join(root, '.claude', 'hooks', 'lint-guard-plugin.mjs')))
  const after = JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
  assert.equal(after.hooks.PostToolUse, undefined)
  assert.equal(after.hooks.SubagentStop, undefined)
  assert.deepEqual(after.hooks.Stop, [{ hooks: [{ type: 'command', command: 'echo keep' }] }])
  assert.ok(!fs.existsSync(path.join(root, '.claude', 'hooks', 'lint-guard.mjs')))
})

test('lint-guard 설치 matcher와 플러그인 hooks.json matcher가 같다', async () => {
  const { LINT_MATCHER } = await import('../src/installLintHook.mjs')
  const plugin = JSON.parse(fs.readFileSync(fileURLToPath(new URL('../hooks/hooks.json', import.meta.url)), 'utf8'))
  assert.equal(plugin.hooks.PostToolUse[0].matcher, LINT_MATCHER)
  assert.ok(plugin.hooks.Stop[0].hooks[0].args[0].endsWith('lint-guard.mjs'))
})

test('전역 사본이 있으면 프로젝트 사본은 양보한다', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-guard-home-'))
  fs.mkdirSync(path.join(home, '.claude', 'hooks'), { recursive: true })
  fs.copyFileSync(GUARD, path.join(home, '.claude', 'hooks', 'lint-guard.mjs'))
  assert.equal(runGuard(edit(project(), 'a.ts', 'BAD'), { HOME: home }).status, 0)
})

test('기본 잠금: 프로젝트 ESLint 설정이 있으면 기본 잠금을 깐 설정으로 검사하고, 그게 실패하면 프로젝트 설정만으로 검사한다', () => {
  const root = project()
  const argsLog = path.join(root, 'args.log')
  const bin = path.join(root, 'node_modules', '.bin', 'eslint')
  fs.writeFileSync(bin, `#!/usr/bin/env node
const fs = require('node:fs')
fs.appendFileSync(${JSON.stringify(argsLog)}, process.argv.slice(2).join(' ') + '\\n')
if (process.argv.includes('--config')) process.exit(2)
process.stdout.write('[]')
`, { mode: 0o755 })
  fs.writeFileSync(path.join(root, 'eslint.config.mjs'), 'export default []\n')
  assert.equal(runGuard(edit(root, 'a.ts', 'ok')).status, 0)
  const calls = fs.readFileSync(argsLog, 'utf8').trim().split('\n')
  assert.equal(calls.length, 2)
  assert.match(calls[0], /^--config \S+\.mjs --fix/)
  assert.match(calls[1], /^--fix/)
})

test('일괄 억제: 프로젝트에 eslint-suppressions.json이 있으면 빈 억제 파일로 바꿔 끼워 손댄 파일의 부채도 잡는다', () => {
  const root = project()
  const argsLog = path.join(root, 'args.log')
  fs.writeFileSync(path.join(root, 'node_modules', '.bin', 'eslint'), `#!/usr/bin/env node
const fs = require('node:fs')
fs.appendFileSync(${JSON.stringify(argsLog)}, process.argv.slice(2).join(' ') + '\\n')
process.stdout.write('[]')
`, { mode: 0o755 })
  assert.equal(runGuard(edit(root, 'a.ts', 'ok')).status, 0)
  assert.doesNotMatch(fs.readFileSync(argsLog, 'utf8'), /--suppressions-location/)

  fs.writeFileSync(path.join(root, 'eslint-suppressions.json'), JSON.stringify({ 'src/a.ts': { complexity: { count: 1 } } }))
  fs.rmSync(argsLog)
  assert.equal(runGuard(edit(root, 'a.ts', 'ok')).status, 0)
  const location = fs.readFileSync(argsLog, 'utf8').match(/--suppressions-location (\S+) --fix/)?.[1]
  assert.ok(location, '억제 파일 위치를 넘겨야 한다')
  assert.notEqual(path.dirname(location), root)
  assert.deepEqual(JSON.parse(fs.readFileSync(location, 'utf8')), {})
})

test('기본 잠금: 중첩 삼항·복잡도·매직넘버 규칙과 인라인 끄기 금지를 담는다', async () => {
  const { harnessBaseline } = await import('../scripts/lint-guard-baseline.mjs')
  const configs = harnessBaseline([])
  const rules = Object.assign({}, ...configs.map((config) => config.rules ?? {}))
  assert.ok(configs.some((config) => config.linterOptions?.noInlineConfig === true))
  assert.ok(configs.some((config) => config.ignores?.includes('**/storybook-static/**')))
  assert.equal(rules['no-nested-ternary'], 'error')
  const componentRules = configs.find((config) => config.rules?.['harness/component-body'])
  assert.deepEqual(componentRules.files, ['**/*.tsx', '**/*.jsx'])
  const commentRule = configs.find((config) => config.rules?.['harness/no-comment'])
  assert.ok(commentRule.files[0].includes('mjs'))
  assert.equal(commentRule.rules['harness/no-comment'][0], 'error')
  assert.equal(componentRules.rules['harness/component-body'], 'error')
  assert.equal(componentRules.rules['harness/no-direct-effect'], 'error')
  assert.deepEqual(rules.complexity, ['error', 10])
  assert.ok(configs.some((config) => config.rules?.['no-magic-numbers'] && config.files?.includes('**/*.tsx')))
  const withTs = harnessBaseline([{ plugins: { '@typescript-eslint': {} } }])
  assert.ok(withTs.some((config) => config.rules?.['@typescript-eslint/no-magic-numbers']))
})

test('런타임: 프로젝트에 ESLint가 없으면 하네스 런타임으로 기본 잠금을 검사한다', () => {
  const runtime = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-guard-runtime-'))
  fs.mkdirSync(path.join(runtime, 'node_modules', '.bin'), { recursive: true })
  fs.writeFileSync(path.join(runtime, 'node_modules', '.bin', 'eslint'), FAKE_ESLINT, { mode: 0o755 })
  fs.writeFileSync(path.join(runtime, 'eslint.config.mjs'), 'export default []\n')
  const root = project({ withEslint: false })
  fs.writeFileSync(path.join(root, 'package.json'), '{}')
  const r = runGuard(edit(root, 'a.ts', 'BAD'), { MY_FE_HARNESS_RUNTIME_DIR: runtime })
  assert.equal(r.status, 2)
  assert.match(r.stderr, /src\/a\.ts:1:1/)
})
