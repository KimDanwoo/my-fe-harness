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

function reviewGate(input, mode = 'enforce', home = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-gate-home-'))) {
  const env = { ...process.env, HOME: home, MY_FE_HARNESS_VERIFY_GATE: 'off', MY_FE_HARNESS_REVIEW_GATE: mode }
  const r = spawnSync('node', [GATE], { encoding: 'utf8', input: JSON.stringify(input), env })
  const decision = r.stdout ? JSON.parse(r.stdout).hookSpecificOutput.permissionDecision : 'allow'
  const logFile = path.join(home, '.claude', 'my-fe-harness', 'verify-gate.log')
  return { decision, logged: fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8') : '' }
}

const prCreate = (calls, body = '요약', session = `s${Math.random()}`) => ({
  tool_name: 'Bash',
  session_id: session,
  tool_input: { command: `gh pr create --title "feat: x" --body "${body}"` },
  transcript_path: transcript(calls),
})

test('독립 리뷰 없이 PR을 올리면 막는다(enforce)', () => {
  assert.equal(reviewGate(prCreate([['Bash', { command: 'pnpm test' }]])).decision, 'deny')
})

test('code-reviewer 에이전트·code-review 스킬·Codex 검토 뒤에는 PR을 올릴 수 있다', () => {
  assert.equal(reviewGate(prCreate([['Agent', { subagent_type: 'code-reviewer', prompt: 'x' }]])).decision, 'allow')
  assert.equal(reviewGate(prCreate([['Task', { subagent_type: 'my-plugin:code-reviewer', prompt: 'x' }]])).decision, 'allow')
  assert.equal(reviewGate(prCreate([['Skill', { skill: 'code-review' }]])).decision, 'allow')
  assert.equal(reviewGate(prCreate([['Bash', { command: 'python3 ~/.claude/scripts/ask-codex.py "검토"' }]])).decision, 'allow')
})

test('리뷰어가 아닌 에이전트는 리뷰로 치지 않는다', () => {
  assert.equal(reviewGate(prCreate([['Agent', { subagent_type: 'general-purpose', prompt: 'review' }]])).decision, 'deny')
})

test('PR을 올린 뒤에는 다음 PR 전에 다시 리뷰해야 한다', () => {
  const calls = [['Agent', { subagent_type: 'code-reviewer' }], ['Bash', { command: 'gh pr create --fill' }]]
  assert.equal(reviewGate(prCreate(calls)).decision, 'deny')
})

test('리뷰 지적을 고친 뒤 다시 리뷰하지 않아도 PR을 올릴 수 있다', () => {
  const calls = [['Agent', { subagent_type: 'code-reviewer' }], ['Edit', { file_path: '/r/src/a.ts' }], ['Bash', { command: 'pnpm test' }]]
  assert.equal(reviewGate(prCreate(calls)).decision, 'allow')
})

test('Reviewed: none(이유)를 적으면 통과', () => {
  assert.equal(reviewGate(prCreate([], 'Reviewed: none — 오타 한 글자')).decision, 'allow')
})

test('리뷰 게이트도 두 번 막힌 뒤에는 통과시키고, 커밋 게이트와 횟수를 따로 센다', () => {
  const session = `review-stuck${Date.now()}`
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-gate-home-'))
  const decide = () => reviewGate(prCreate([], 'x', session), 'enforce', home).decision
  assert.deepEqual([decide(), decide(), decide()], ['deny', 'deny', 'allow'])
  const commitEnv = { ...process.env, HOME: home, MY_FE_HARNESS_VERIFY_GATE: 'enforce' }
  const r = spawnSync('node', [GATE], { encoding: 'utf8', input: JSON.stringify(commit([], 'x', session)), env: commitEnv })
  assert.ok(r.stdout, '리뷰 게이트 횟수가 커밋 게이트를 풀면 안 된다')
})

test('리뷰 게이트 기본은 관찰 모드 — 막지 않고 기록만', () => {
  const { decision, logged } = reviewGate(prCreate([]), 'observe')
  assert.equal(decision, 'allow')
  assert.match(logged, /pr-without-review/)
})

test('리뷰 게이트를 꺼도 커밋 게이트는 그대로다', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-gate-home-'))
  const env = { ...process.env, HOME: home, MY_FE_HARNESS_VERIFY_GATE: 'enforce', MY_FE_HARNESS_REVIEW_GATE: 'off' }
  const r = spawnSync('node', [GATE], { encoding: 'utf8', input: JSON.stringify(commit([])), env })
  assert.match(r.stdout, /"deny"/)
})

function transcriptWithResults(entries) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'verify-gate-')), 't.jsonl')
  const lines = entries.flatMap(([name, input, isError], index) => [
    JSON.stringify({ message: { content: [{ type: 'tool_use', id: `t${index}`, name, input }] } }),
    JSON.stringify({ message: { content: [{ type: 'tool_result', tool_use_id: `t${index}`, is_error: isError }] } }),
  ])
  fs.writeFileSync(file, `${lines.join('\n')}\n`)
  return file
}

const bashCall = (command, extra = {}) => ({ tool_name: 'Bash', session_id: `s${Math.random()}`, tool_input: { command }, ...extra })

test('막히거나 실패한 PR 시도는 리뷰 기록을 지우지 않는다', () => {
  const entries = [['Agent', { subagent_type: 'code-reviewer' }, false], ['Bash', { command: 'gh pr create --fill' }, true]]
  assert.equal(reviewGate({ ...prCreate([]), transcript_path: transcriptWithResults(entries) }).decision, 'allow')
  const succeeded = [['Agent', { subagent_type: 'code-reviewer' }, false], ['Bash', { command: 'gh pr create --fill' }, false]]
  assert.equal(reviewGate({ ...prCreate([]), transcript_path: transcriptWithResults(succeeded) }).decision, 'deny')
})

test('PR 생성 명령만 잡는다 — 글자만 들어간 다른 명령은 대상이 아니다', () => {
  const transcript_path = transcript([])
  for (const command of ['git commit -m "docs: gh pr create 게이트 추가"', 'gh pr comment 5 --body "create a test"', 'gh pr list --search create', 'gh issue create --title "pr create bug"', 'pnpm run gh-pr-create'])
    assert.equal(reviewGate(bashCall(command, { transcript_path })).decision, 'allow', command)
  for (const command of ['gh pr create --fill', 'gh pr new --fill', 'gh -R me/repo pr create --fill', 'git push && gh pr create --fill', 'cd /r\ngh pr create --fill'])
    assert.equal(reviewGate(bashCall(command, { transcript_path })).decision, 'deny', command)
})

test('ask-codex.py를 읽기만 한 명령은 리뷰로 치지 않는다', () => {
  assert.equal(reviewGate(prCreate([['Bash', { command: 'cat ~/.claude/scripts/ask-codex.py' }]])).decision, 'deny')
  assert.equal(reviewGate(prCreate([['Bash', { command: '~/.claude/scripts/ask-codex.py "검토"' }]])).decision, 'allow')
})

test('환경변수가 없으면 두 게이트 모두 관찰 모드다', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-gate-home-'))
  const gateVariables = new Set(['MY_FE_HARNESS_VERIFY_GATE', 'MY_FE_HARNESS_REVIEW_GATE'])
  const env = { ...Object.fromEntries(Object.entries(process.env).filter(([name]) => !gateVariables.has(name))), HOME: home }
  for (const input of [commit([]), prCreate([])]) assert.equal(spawnSync('node', [GATE], { encoding: 'utf8', input: JSON.stringify(input), env }).stdout, '')
  const logged = fs.readFileSync(path.join(home, '.claude', 'my-fe-harness', 'verify-gate.log'), 'utf8')
  assert.match(logged, /commit-without-verification/)
  assert.match(logged, /pr-without-review/)
})

test('커밋과 PR 생성이 한 명령이면 강제 모드에서 결정은 한 번만 내보낸다', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-gate-home-'))
  const env = { ...process.env, HOME: home, MY_FE_HARNESS_VERIFY_GATE: 'enforce', MY_FE_HARNESS_REVIEW_GATE: 'enforce' }
  const input = bashCall('git commit -m x && gh pr create --fill', { transcript_path: transcript([]) })
  const r = spawnSync('node', [GATE], { encoding: 'utf8', input: JSON.stringify(input), env })
  assert.equal(JSON.parse(r.stdout).hookSpecificOutput.permissionDecision, 'deny')
})

test('리뷰 게이트를 끄면 PR을 막지도 기록하지도 않는다', () => {
  assert.deepEqual(reviewGate(prCreate([]), 'off'), { decision: 'allow', logged: '' })
})
