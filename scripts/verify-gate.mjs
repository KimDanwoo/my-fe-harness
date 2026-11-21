#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const DEFAULT_MODE = 'observe'
const LOG_FILE = path.join(os.homedir(), '.claude', 'my-fe-harness', 'verify-gate.log')
const STATE_DIR = path.join(os.tmpdir(), 'my-fe-harness-verify-gate')
const MAX_BLOCKS = 2
const BYTES_PER_MB = 1_048_576
const MAX_TRANSCRIPT_MB = 64
const MAX_TRANSCRIPT_BYTES = MAX_TRANSCRIPT_MB * BYTES_PER_MB
const LOGGED_COMMAND_LENGTH = 200

const GIT_COMMIT = /\bgit\b[^\n|;&]*\bcommit\b/
const AMEND_ONLY = /--amend\b.*--no-edit\b|--no-edit\b.*--amend\b/
const UNVERIFIED_STAMP = /Verified:\s*none/i
const VERIFY_SKILL = /(^|:)verify$/
const VERIFY_COMMAND = /\b(?:pnpm|npm|yarn|bun)\s+(?:-s\s+|run\s+)*(?:verify|test|e2e)\b|\bplaywright\s+test\b|\bvitest\b|\bnode\s+--test\b/
const GH_PR_CREATE = /(?:^|[;&|(\n])\s*gh(?:\s+(?:-R|--repo)(?:\s+|=)\S+)*\s+pr\s+(?:create|new)\b/
const UNREVIEWED_STAMP = /Reviewed:\s*none/i
const REVIEW_AGENT = /(^|:)code-reviewer$/
const REVIEW_SKILL = /(^|:)code-review$/
const REVIEW_COMMAND = /(?:^|[;&|(\n])\s*(?:python3?\s+)?\S*ask-codex\.py\b/
const AGENT_TOOLS = new Set(['Agent', 'Task'])
const PROTECTED_CHECKS = [
  /(^|\/)eslint\.config\.[cm]?[jt]s$/,
  /(^|\/)\.eslintrc(\.\w+)?$/,
  /(^|\/)scripts\/check-[\w-]+\.m?[jt]s$/,
  /(^|\/)lintLocks\.test\.[jt]sx?$/,
  /(^|\/)\.claude\/hooks\//,
  /(^|\/)\.claude\/settings(\.local)?\.json$/,
]

const modeOf = (variable) => process.env[variable] || DEFAULT_MODE
const commandOf = (call) => call.input?.command ?? ''
const isBashMatching = (call, pattern) => call.name === 'Bash' && pattern.test(commandOf(call))

function isVerification(call) {
  if (call.name === 'Skill') return VERIFY_SKILL.test(call.input?.skill ?? '')
  return isBashMatching(call, VERIFY_COMMAND)
}

function isReview(call) {
  if (AGENT_TOOLS.has(call.name)) return REVIEW_AGENT.test(call.input?.subagent_type ?? '')
  if (call.name === 'Skill') return REVIEW_SKILL.test(call.input?.skill ?? '')
  return isBashMatching(call, REVIEW_COMMAND)
}

const VERIFY_MODE = modeOf('MY_FE_HARNESS_VERIFY_GATE')

const BASH_GATES = [
  {
    mode: VERIFY_MODE,
    kind: 'commit-without-verification',
    isTarget: (command) => GIT_COMMIT.test(command) && !AMEND_ONLY.test(command),
    exemptStamp: UNVERIFIED_STAMP,
    resetsAt: (call) => isBashMatching(call, GIT_COMMIT),
    isEvidence: isVerification,
    reason: (blocks) =>
      `이 세션에서 마지막 커밋 뒤로 검증을 돌리지 않았어요. verify 스킬(또는 테스트·e2e)로 확인하고 커밋 메시지에 "Verified: …"를 남기세요. 돌릴 수 없으면 "Verified: none — 이유"를 적으세요. (${blocks}/${MAX_BLOCKS})`,
  },
  {
    mode: modeOf('MY_FE_HARNESS_REVIEW_GATE'),
    kind: 'pr-without-review',
    isTarget: (command) => GH_PR_CREATE.test(command),
    exemptStamp: UNREVIEWED_STAMP,
    resetsAt: (call) => isBashMatching(call, GH_PR_CREATE),
    isEvidence: isReview,
    reason: (blocks) =>
      `이 세션에서 PR을 올리기 전에 독립 리뷰를 받지 않았어요. 내 결론은 빼고 코드만 넘긴 code-reviewer 에이전트(또는 /code-review·ask-codex.py)로 리뷰하고 반영한 뒤 올리세요. 돌릴 수 없으면 PR 본문에 "Reviewed: none — 이유"를 적으세요. (${blocks}/${MAX_BLOCKS})`,
  },
]

const CHECK_GUARD = { mode: VERIFY_MODE, kind: 'protected-check-edit' }

try {
  run(JSON.parse(fs.readFileSync(0, 'utf8') || '{}'))
} catch {
  process.exit(0)
}

function run(input) {
  if (input.tool_name !== 'Bash') return guardChecks(input)
  const transcript = lazyTranscript(input.transcript_path)
  for (const gate of BASH_GATES) {
    const hasDecided = gateBash(input, gate, transcript)
    if (hasDecided) return
  }
}

function gateBash(input, gate, transcript) {
  const command = input.tool_input?.command ?? ''
  const isGuarded = gate.mode !== 'off' && gate.isTarget(command) && !gate.exemptStamp.test(command)
  if (!isGuarded) return false
  if (hasEvidenceSinceLastTarget(transcript(), gate)) return false
  const blocks = countBlock(input.session_id, gate.kind)
  if (blocks > MAX_BLOCKS) return false
  return decide(input, gate, 'deny', gate.reason(blocks))
}

function guardChecks(input) {
  const file = input.tool_input?.file_path
  const isProtected = CHECK_GUARD.mode !== 'off' && typeof file === 'string' && PROTECTED_CHECKS.some((pattern) => pattern.test(file))
  if (!isProtected) return
  const reason = `${path.basename(file)}는 변경을 판정하는 검사입니다. 검사를 바꾸는 이유를 사용자에게 설명하고 승인을 받으세요(변경이 자기 검사를 고치면 검사가 무의미해집니다).`
  decide(input, CHECK_GUARD, 'ask', reason)
}

function isReadableTranscript(transcriptPath) {
  const exists = Boolean(transcriptPath) && fs.existsSync(transcriptPath)
  return exists && fs.statSync(transcriptPath).size <= MAX_TRANSCRIPT_BYTES
}

function lazyTranscript(transcriptPath) {
  let parsed
  return () => {
    parsed ??= isReadableTranscript(transcriptPath) ? parseTranscript(fs.readFileSync(transcriptPath, 'utf8')) : null
    return parsed
  }
}

function hasEvidenceSinceLastTarget(transcript, gate) {
  if (!transcript) return true
  const isAttempted = (call) => !transcript.failedIds.has(call.id)
  const evidenceAfter = (hasEvidence, call) => {
    const isReset = gate.resetsAt(call) && isAttempted(call)
    if (isReset) return false
    return hasEvidence || gate.isEvidence(call)
  }
  return transcript.calls.reduce(evidenceAfter, false)
}

function contentBlocks(line) {
  try {
    const content = JSON.parse(line)?.message?.content
    return Array.isArray(content) ? content : []
  } catch {
    return []
  }
}

function parseTranscript(jsonl) {
  const blocks = jsonl.split('\n').flatMap(contentBlocks)
  const calls = blocks.filter((block) => block?.type === 'tool_use')
  const failedIds = new Set(blocks.filter((block) => block?.type === 'tool_result' && block.is_error === true).map((block) => block.tool_use_id))
  return { calls, failedIds }
}

function countBlock(sessionId, kind) {
  fs.mkdirSync(STATE_DIR, { recursive: true })
  const file = path.join(STATE_DIR, `${String(sessionId ?? 'default')}-${kind}`.replace(/[^\w-]/g, ''))
  const count = Number(fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : 0) + 1
  fs.writeFileSync(file, String(count))
  return count
}

function decide(input, gate, decision, reason) {
  log({ at: new Date().toISOString(), mode: gate.mode, kind: gate.kind, decision, session: input.session_id, cwd: input.cwd, target: input.tool_input?.file_path ?? input.tool_input?.command?.slice(0, LOGGED_COMMAND_LENGTH) })
  if (gate.mode !== 'enforce') return false
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: decision, permissionDecisionReason: reason } }))
  return true
}

function log(entry) {
  fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true })
  fs.appendFileSync(LOG_FILE, `${JSON.stringify(entry)}\n`)
}
