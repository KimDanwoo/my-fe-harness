#!/usr/bin/env node
// my-fe-harness 린트 강제 계층 (PostToolUse·Stop·SubagentStop 훅).
// 규칙 문서는 "권고"라 LLM이 그 자리에 함수·삼항·숫자를 박아 넣어도 아무도 막지 않는다.
// 이 훅은 Claude(서브에이전트 포함)가 고친 파일을 그 프로젝트의 ESLint로 바로 고치고(--fix) 남은 에러를 되돌려주며,
// 자기가 고친 파일에 에러가 남아 있으면 끝내지 못하게 한다.
//
// 원칙:
// - 문제 없으면 아무것도 출력하지 않고 통과(exit 0).
// - ESLint가 없는 프로젝트, 설정 오류, 시간 초과, 내부 오류는 전부 통과(fail-open).
// - 끝낼 때는 "그 세션·그 에이전트가 고친 파일"만 본다 — 다른 에이전트가 작업 중인 파일 때문에 막지 않는다.
// - 같은 세션·에이전트에서 MAX_STOP_BLOCKS번까지만 막는다(무한 반복 방지).
// - 하네스 기본 잠금(lint-guard-baseline.mjs)을 프로젝트 설정 "아래에" 깔아, 잠금 규칙이 없는 프로젝트에서도 지키게 한다.
//   프로젝트 설정이 뒤에 오므로 프로젝트가 필요한 곳은 명시적으로 끌 수 있다. 덧씌움이 실패하면 프로젝트 설정만으로 검사한다.
// - 끄려면 MY_FE_HARNESS_LINT_GUARD=off. 전역(~/.claude/hooks) 사본이 있으면 프로젝트 사본은 아무것도 하지 않는다.
// - 외부 의존성 0.

import { spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const LINTABLE = /\.(?:[cm]?[jt]sx?)$/
const ESLINT_TIMEOUT_MS = 90_000
const MAX_BUFFER = 32 * 1024 * 1024
const MAX_REPORTED = 30
const MAX_STOP_BLOCKS = 3
const ESLINT_LINT_ERRORS = 1
const BLOCK_EXIT = 2
const ERROR_SEVERITY = 2
const STOP_EVENTS = new Set(['Stop', 'SubagentStop'])
const BLOCKS_FILE = '.blocks'
const GLOBAL_COPY = path.join(os.homedir(), '.claude', 'hooks', 'lint-guard.mjs')
const LEDGER_ROOT = path.join(os.tmpdir(), 'my-fe-harness-lint-guard')
const OVERLAY_DIR = path.join(LEDGER_ROOT, 'configs')
const BASELINE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'lint-guard-baseline.mjs')
const PROJECT_CONFIG_NAMES = ['eslint.config.js', 'eslint.config.mjs', 'eslint.config.cjs']
const ESLINT_CONFIG_ERROR = 2

try {
  run(JSON.parse(fs.readFileSync(0, 'utf8') || '{}'))
} catch {
  process.exit(0)
}

function run(input) {
  if (process.env.MY_FE_HARNESS_LINT_GUARD === 'off') return
  if (isShadowedByGlobal()) return
  if (STOP_EVENTS.has(input.hook_event_name)) return guardStop(input)
  return guardEdit(input)
}

// 전역 사본이 있으면 프로젝트·플러그인 사본은 양보한다(같은 파일을 두 번 검사하지 않게).
function isShadowedByGlobal() {
  const self = fileURLToPath(import.meta.url)
  return path.resolve(self) !== path.resolve(GLOBAL_COPY) && fs.existsSync(GLOBAL_COPY)
}

function guardEdit(input) {
  const file = input.tool_input?.file_path
  if (typeof file !== 'string' || !LINTABLE.test(file)) return
  const absolute = path.resolve(input.cwd ?? '.', file)
  const root = findEslintRoot(path.dirname(absolute))
  if (!root) return
  remember(input, absolute)
  const report = lint(root, [absolute])
  if (report) block(`방금 고친 파일에 자동으로 고칠 수 없는 lint 에러가 남았어요. 규칙을 끄지 말고 코드를 고치세요.\n${report}`)
}

function guardStop(input) {
  const ledger = ledgerDir(input)
  const reports = groupByRoot(touchedFiles(ledger))
    .map(([root, files]) => lint(root, files))
    .filter(Boolean)
  if (reports.length === 0) return fs.rmSync(ledger, { recursive: true, force: true })
  const count = readCount(path.join(ledger, BLOCKS_FILE)) + 1
  if (count > MAX_STOP_BLOCKS) return fs.rmSync(ledger, { recursive: true, force: true })
  fs.writeFileSync(path.join(ledger, BLOCKS_FILE), String(count))
  block(`끝내기 전에 이번 작업에서 고친 파일의 lint 에러를 0으로 만드세요(${count}/${MAX_STOP_BLOCKS}).\n${reports.join('\n')}`)
}

// 세션과 에이전트(서브에이전트면 agent_id)마다 고친 파일을 따로 적어 둔다.
function ledgerDir(input) {
  const owner = `${input.session_id ?? 'default'}-${input.agent_id ?? 'main'}`
  return path.join(LEDGER_ROOT, owner.replace(/[^\w-]/g, ''))
}

function remember(input, file) {
  const ledger = ledgerDir(input)
  fs.mkdirSync(ledger, { recursive: true })
  const name = crypto.createHash('sha1').update(file).digest('hex')
  fs.writeFileSync(path.join(ledger, name), file)
}

function touchedFiles(ledger) {
  if (!fs.existsSync(ledger)) return []
  return fs
    .readdirSync(ledger)
    .filter((name) => name !== BLOCKS_FILE)
    .map((name) => fs.readFileSync(path.join(ledger, name), 'utf8'))
    .filter((file) => fs.existsSync(file))
}

function groupByRoot(files) {
  const groups = new Map()
  for (const file of files) {
    const root = findEslintRoot(path.dirname(file))
    if (root) groups.set(root, [...(groups.get(root) ?? []), file])
  }
  return [...groups.entries()]
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

// 자동으로 고칠 수 있는 것(포맷·import 순서 등)은 고치고, 남은 에러가 있으면 목록을, 없거나 검사할 수 없으면 null을 돌려준다.
function lint(root, files) {
  if (files.length === 0) return null
  const overlay = overlayConfig(root)
  const withBaseline = overlay ? runEslint(root, files, ['--config', overlay]) : null
  const result = withBaseline && withBaseline.status !== ESLINT_CONFIG_ERROR ? withBaseline : runEslint(root, files, [])
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

function runEslint(root, files, extraArgs) {
  return spawnSync(eslintBin(root), [...extraArgs, '--fix', '--format', 'json', '--no-warn-ignored', ...files], {
    cwd: root,
    encoding: 'utf8',
    timeout: ESLINT_TIMEOUT_MS,
    maxBuffer: MAX_BUFFER,
  })
}

// 프로젝트 설정을 불러와 그 앞에 하네스 기본 잠금을 까는 설정 파일을 만든다. --config로 넘기면 패턴은 cwd(프로젝트 루트) 기준이다.
function overlayConfig(root) {
  const projectConfig = PROJECT_CONFIG_NAMES.map((name) => path.join(root, name)).find((file) => fs.existsSync(file))
  if (!projectConfig || !fs.existsSync(BASELINE)) return null
  fs.mkdirSync(OVERLAY_DIR, { recursive: true })
  const overlay = path.join(OVERLAY_DIR, `${crypto.createHash('sha1').update(root).digest('hex')}.mjs`)
  const source = [
    `import project from ${JSON.stringify(pathToFileURL(projectConfig).href)}`,
    `import { harnessBaseline } from ${JSON.stringify(pathToFileURL(BASELINE).href)}`,
    'const configs = Array.isArray(project) ? project : [project]',
    'export default [...harnessBaseline(configs), ...configs]',
    '',
  ].join('\n')
  fs.writeFileSync(overlay, source)
  return overlay
}

function readCount(file) {
  const count = Number(fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : 0)
  return Number.isFinite(count) ? count : 0
}

function block(message) {
  process.stderr.write(`${message}\n`)
  process.exit(BLOCK_EXIT)
}
