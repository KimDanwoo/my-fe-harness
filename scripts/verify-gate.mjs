#!/usr/bin/env node
// my-fe-harness 검증 게이트 (PreToolUse 훅). Claude Code 팀의 검증 원칙을 강제한다.
// https://claude.dev/blog/how-the-claude-code-team-thinks-about-verification/
//
// 1. 커밋 게이트 — `git commit` 전에 이 세션이 마지막 커밋 뒤로 검증(verify 스킬·테스트·e2e)을 돌렸는지 본다.
//    커밋 메시지에 `Verified: none`(이유)을 쓰면 통과. 한 세션에서 두 번 막히면 그다음은 통과시킨다(갇히지 않게).
// 2. 검사 보호 — 변경이 자기를 판정하는 검사(lint 설정·잠금 테스트·훅)를 고치지 못하게, 고치려면 사람의 승인을 받게 한다.
//
// 모드: MY_FE_HARNESS_VERIFY_GATE = off | observe(기본, 막지 않고 기록만) | enforce
// 기록: ~/.claude/my-fe-harness/verify-gate.log (한 줄에 JSON 하나). 내부 오류는 전부 통과(fail-open). 외부 의존성 0.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const MODE = process.env.MY_FE_HARNESS_VERIFY_GATE || 'observe'
const LOG_FILE = path.join(os.homedir(), '.claude', 'my-fe-harness', 'verify-gate.log')
const STATE_DIR = path.join(os.tmpdir(), 'my-fe-harness-verify-gate')
const MAX_COMMIT_BLOCKS = 2
const BYTES_PER_MB = 1_048_576
const MAX_TRANSCRIPT_MB = 64
const MAX_TRANSCRIPT_BYTES = MAX_TRANSCRIPT_MB * BYTES_PER_MB
const LOGGED_COMMAND_LENGTH = 200

const GIT_COMMIT = /\bgit\b[^\n|;&]*\bcommit\b/
const AMEND_ONLY = /--amend\b.*--no-edit\b|--no-edit\b.*--amend\b/
const UNVERIFIED_STAMP = /Verified:\s*none/i
const VERIFY_COMMAND = /\b(?:pnpm|npm|yarn|bun)\s+(?:-s\s+|run\s+)*(?:verify|test|e2e)\b|\bplaywright\s+test\b|\bvitest\b|\bnode\s+--test\b/
const PROTECTED_CHECKS = [
  /(^|\/)eslint\.config\.[cm]?[jt]s$/,
  /(^|\/)\.eslintrc(\.\w+)?$/,
  /(^|\/)scripts\/check-[\w-]+\.m?[jt]s$/,
  /(^|\/)lintLocks\.test\.[jt]sx?$/,
  /(^|\/)\.claude\/hooks\//,
  /(^|\/)\.claude\/settings(\.local)?\.json$/,
]

try {
  run(JSON.parse(fs.readFileSync(0, 'utf8') || '{}'))
} catch {
  process.exit(0)
}

function run(input) {
  if (MODE === 'off') return
  if (input.tool_name === 'Bash') return gateCommit(input)
  return guardChecks(input)
}

function gateCommit(input) {
  const command = input.tool_input?.command ?? ''
  if (!GIT_COMMIT.test(command) || AMEND_ONLY.test(command)) return
  if (UNVERIFIED_STAMP.test(command)) return
  if (hasVerificationSinceLastCommit(input.transcript_path)) return
  const blocks = countBlock(input.session_id)
  if (blocks > MAX_COMMIT_BLOCKS) return
  const reason = `이 세션에서 마지막 커밋 뒤로 검증을 돌리지 않았어요. verify 스킬(또는 테스트·e2e)로 확인하고 커밋 메시지에 "Verified: …"를 남기세요. 돌릴 수 없으면 "Verified: none — 이유"를 적으세요. (${blocks}/${MAX_COMMIT_BLOCKS})`
  decide(input, 'deny', reason, 'commit-without-verification')
}

function guardChecks(input) {
  const file = input.tool_input?.file_path
  if (typeof file !== 'string' || !PROTECTED_CHECKS.some((pattern) => pattern.test(file))) return
  const reason = `${path.basename(file)}는 변경을 판정하는 검사입니다. 검사를 바꾸는 이유를 사용자에게 설명하고 승인을 받으세요(변경이 자기 검사를 고치면 검사가 무의미해집니다).`
  decide(input, 'ask', reason, 'protected-check-edit')
}

// 트랜스크립트(JSONL)에서 마지막 git commit 뒤로 검증 명령이나 verify 스킬 호출이 있었는지 본다.
function hasVerificationSinceLastCommit(transcriptPath) {
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return true
  if (fs.statSync(transcriptPath).size > MAX_TRANSCRIPT_BYTES) return true
  let verified = false
  for (const call of toolCalls(fs.readFileSync(transcriptPath, 'utf8'))) {
    if (call.name === 'Bash' && GIT_COMMIT.test(call.input?.command ?? '')) verified = false
    if (isVerification(call)) verified = true
  }
  return verified
}

function isVerification(call) {
  if (call.name === 'Skill') return /(^|:)verify$/.test(call.input?.skill ?? '')
  return call.name === 'Bash' && VERIFY_COMMAND.test(call.input?.command ?? '')
}

function toolCalls(jsonl) {
  return jsonl.split('\n').flatMap((line) => {
    try {
      const content = JSON.parse(line)?.message?.content
      return Array.isArray(content) ? content.filter((block) => block?.type === 'tool_use') : []
    } catch {
      return []
    }
  })
}

function countBlock(sessionId) {
  fs.mkdirSync(STATE_DIR, { recursive: true })
  const file = path.join(STATE_DIR, String(sessionId ?? 'default').replace(/[^\w-]/g, ''))
  const count = Number(fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : 0) + 1
  fs.writeFileSync(file, String(count))
  return count
}

function decide(input, decision, reason, kind) {
  log({ at: new Date().toISOString(), mode: MODE, kind, decision, session: input.session_id, cwd: input.cwd, target: input.tool_input?.file_path ?? input.tool_input?.command?.slice(0, LOGGED_COMMAND_LENGTH) })
  if (MODE !== 'enforce') return
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: decision, permissionDecisionReason: reason } }))
}

function log(entry) {
  fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true })
  fs.appendFileSync(LOG_FILE, `${JSON.stringify(entry)}\n`)
}
