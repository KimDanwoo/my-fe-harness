import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const GATE = fileURLToPath(new URL('../scripts/verify-gate.mjs', import.meta.url))
const CLI = fileURLToPath(new URL('../bin/my-fe-harness.mjs', import.meta.url))

function transcript(calls) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'verify-gate-')), 't.jsonl')
  const lines = calls.map(([name, input]) => JSON.stringify({ message: { content: [{ type: 'tool_use', name, input }] } }))
  fs.writeFileSync(file, `${lines.join('\n')}\n`)
  return file
}

function gate(input, mode = 'enforce') {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-gate-home-'))
  const r = spawnSync('node', [GATE], { encoding: 'utf8', input: JSON.stringify(input), env: { ...process.env, HOME: home, MY_FE_HARNESS_VERIFY_GATE: mode } })
  const decision = r.stdout ? JSON.parse(r.stdout).hookSpecificOutput.permissionDecision : 'allow'
  const logFile = path.join(home, '.claude', 'my-fe-harness', 'verify-gate.log')
  return { decision, logged: fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8') : '' }
}

const commit = (calls, message = 'feat: x', session = `s${Math.random()}`) => ({
  tool_name: 'Bash',
  session_id: session,
  tool_input: { command: `git commit -m "${message}"` },
  transcript_path: transcript(calls),
})

test('검증 없이 커밋하면 막는다(enforce)', () => {
  assert.equal(gate(commit([['Bash', { command: 'git status' }]])).decision, 'deny')
})

test('마지막 커밋 뒤에 verify 스킬·테스트를 돌렸으면 통과', () => {
  assert.equal(gate(commit([['Skill', { skill: 'verify' }]])).decision, 'allow')
  assert.equal(gate(commit([['Bash', { command: 'pnpm -s verify' }]])).decision, 'allow')
  assert.equal(gate(commit([['Bash', { command: 'pnpm e2e --project=guest' }]])).decision, 'allow')
})

test('검증한 뒤 커밋했으면 다음 커밋 전에 다시 검증해야 한다', () => {
  const calls = [['Bash', { command: 'pnpm test' }], ['Bash', { command: 'git commit -m "a"' }]]
  assert.equal(gate(commit(calls)).decision, 'deny')
})

test('Verified: none(이유)를 적으면 통과', () => {
  assert.equal(gate(commit([], 'docs: x\n\nVerified: none — 문서만 바꿈')).decision, 'allow')
})

test('같은 세션에서 두 번 막힌 뒤에는 통과시킨다', () => {
  const session = `stuck${Date.now()}`
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-gate-home-'))
  const decide = () => {
    const r = spawnSync('node', [GATE], { encoding: 'utf8', input: JSON.stringify(commit([], 'x', session)), env: { ...process.env, HOME: home, MY_FE_HARNESS_VERIFY_GATE: 'enforce' } })
    return r.stdout ? 'deny' : 'allow'
  }
  assert.deepEqual([decide(), decide(), decide()], ['deny', 'deny', 'allow'])
})

test('관찰 모드는 막지 않고 기록만 남긴다', () => {
  const { decision, logged } = gate(commit([]), 'observe')
  assert.equal(decision, 'allow')
  assert.match(logged, /commit-without-verification/)
})

test('검사 파일을 고치려면 승인을 받게 한다', () => {
  for (const file of ['/r/eslint.config.mjs', '/r/scripts/check-tidy.mjs', '/r/scripts/__tests__/lintLocks.test.ts', '/r/.claude/hooks/x.mjs', '/r/.claude/settings.json'])
    assert.equal(gate({ tool_name: 'Edit', tool_input: { file_path: file } }).decision, 'ask', file)
  assert.equal(gate({ tool_name: 'Edit', tool_input: { file_path: '/r/src/a.ts' } }).decision, 'allow')
})

test('verify-gate 명령이 PreToolUse 훅을 설치하고 uninstall이 걷어낸다', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-gate-proj-'))
  assert.equal(spawnSync('node', [CLI, 'verify-gate', '--target', root]).status, 0)
  const settings = JSON.parse(fs.readFileSync(path.join(root, '.claude', 'settings.json'), 'utf8'))
  assert.equal(settings.hooks.PreToolUse[0].matcher, 'Bash|Write|Edit|MultiEdit')
  assert.equal(spawnSync('node', [CLI, 'uninstall', '--target', root]).status, 0)
  assert.ok(!fs.existsSync(path.join(root, '.claude', 'hooks', 'verify-gate.mjs')))
})
