#!/usr/bin/env node
// my-fe-harness 린트 강제 계층 (PostToolUse·Stop 훅).
// 규칙 문서는 "권고"라 LLM이 그 자리에 함수·삼항·숫자를 박아 넣어도 아무도 막지 않는다.
// 이 훅은 Claude가 고친 파일을 그 프로젝트의 ESLint로 바로 검사해 에러를 Claude에게 되돌려주고,
// 이번 작업에서 바뀐 파일에 에러가 남아 있으면 끝내지 못하게 한다.
//
// 원칙:
// - 문제 없으면 아무것도 출력하지 않고 통과(exit 0).
// - ESLint가 없는 프로젝트, 설정 오류, 시간 초과, 내부 오류는 전부 통과(fail-open).
// - Stop은 같은 세션에서 MAX_STOP_BLOCKS번까지만 막는다(무한 반복 방지).
// - 끄려면 MY_FE_HARNESS_LINT_GUARD=off.
// - 외부 의존성 0.

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const LINTABLE = /\.(?:[cm]?[jt]sx?)$/
const ESLINT_TIMEOUT_MS = 90_000
const MAX_BUFFER = 32 * 1024 * 1024
const MAX_REPORTED = 30
const MAX_STOP_BLOCKS = 3
const ESLINT_LINT_ERRORS = 1
const BLOCK_EXIT = 2
const ERROR_SEVERITY = 2

try {
  run(JSON.parse(fs.readFileSync(0, 'utf8') || '{}'))
} catch {
  process.exit(0)
}

function run(input) {
  if (process.env.MY_FE_HARNESS_LINT_GUARD === 'off') return
  if (input.hook_event_name === 'Stop') return guardStop(input)
  return guardEdit(input)
}

function guardEdit(input) {
  const file = input.tool_input?.file_path
  if (typeof file !== 'string' || !LINTABLE.test(file)) return
  const root = findEslintRoot(path.dirname(path.resolve(input.cwd ?? '.', file)))
  if (!root) return
  const report = lint(root, [file])
  if (report) block(`방금 고친 파일에 lint 에러가 있어요. 규칙을 끄지 말고 코드를 고치세요.\n${report}`)
}

function guardStop(input) {
  const root = findEslintRoot(input.cwd ?? process.cwd())
  if (!root) return
  const counterFile = path.join(os.tmpdir(), `my-fe-harness-lint-guard-${String(input.session_id ?? 'default').replace(/\W/g, '')}`)
  const report = lint(root, changedFiles(root))
  if (!report) return fs.rmSync(counterFile, { force: true })
  const count = readCount(counterFile) + 1
  if (count > MAX_STOP_BLOCKS) return fs.rmSync(counterFile, { force: true })
  fs.writeFileSync(counterFile, String(count))
  block(`끝내기 전에 이번 작업에서 바뀐 파일의 lint 에러를 0으로 만드세요(${count}/${MAX_STOP_BLOCKS}).\n${report}`)
}

// 위로 올라가며 node_modules/.bin/eslint가 있는 폴더를 찾는다.
function findEslintRoot(start) {
  let dir = path.resolve(start)
  while (true) {
    if (fs.existsSync(eslintBin(dir))) return dir
    const parent = path.dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

function eslintBin(root) {
  return path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'eslint.cmd' : 'eslint')
}

function changedFiles(root) {
  const git = (args) => spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' })
  const tracked = git(['diff', '--name-only', 'HEAD'])
  const untracked = git(['ls-files', '--others', '--exclude-standard'])
  if (tracked.status !== 0 || untracked.status !== 0) return []
  return `${tracked.stdout}\n${untracked.stdout}`
    .split('\n')
    .filter((file) => LINTABLE.test(file))
    .map((file) => path.join(root, file))
    .filter((file) => fs.existsSync(file))
}

// 에러가 있으면 사람이 읽을 목록을, 없거나 검사할 수 없으면 null을 돌려준다.
function lint(root, files) {
  if (files.length === 0) return null
  const result = spawnSync(eslintBin(root), ['--format', 'json', '--no-warn-ignored', ...files], {
    cwd: root,
    encoding: 'utf8',
    timeout: ESLINT_TIMEOUT_MS,
    maxBuffer: MAX_BUFFER,
  })
  if (result.status !== ESLINT_LINT_ERRORS) return null
  const errors = JSON.parse(result.stdout).flatMap((entry) =>
    entry.messages
      .filter((message) => message.severity === ERROR_SEVERITY)
      .map((message) => `${path.relative(root, entry.filePath)}:${message.line}:${message.column}  ${message.message} (${message.ruleId ?? 'parse'})`),
  )
  if (errors.length === 0) return null
  const hidden = errors.length - MAX_REPORTED
  return [...errors.slice(0, MAX_REPORTED), ...(hidden > 0 ? [`…외 ${hidden}건`] : [])].join('\n')
}

function readCount(file) {
  const count = Number(fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : 0)
  return Number.isFinite(count) ? count : 0
}

function block(message) {
  process.stderr.write(`${message}\n`)
  process.exit(BLOCK_EXIT)
}
