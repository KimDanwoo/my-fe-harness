#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const LINTABLE = /\.(?:[cm]?[jt]sx?)$/
const ESLINT_TIMEOUT_MS = 90_000
const BYTES_PER_KB = 1024
const BYTES_PER_MB = BYTES_PER_KB * BYTES_PER_KB
const MAX_BUFFER_MB = 32
const MAX_BUFFER = MAX_BUFFER_MB * BYTES_PER_MB
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
const RUNTIME_DIR = process.env.MY_FE_HARNESS_RUNTIME_DIR || path.join(os.homedir(), '.claude', 'my-fe-harness-runtime')
const RUNTIME_CONFIG = path.join(RUNTIME_DIR, 'eslint.config.mjs')
const PROJECT_MARKERS = ['package.json', '.git']
const SUPPRESSIONS_FILE = 'eslint-suppressions.json'
const EMPTY_SUPPRESSIONS = path.join(LEDGER_ROOT, 'empty-suppressions.json')
const EXCLUDE_FILE = path.join(os.homedir(), '.claude', 'lint-guard-exclude.json')
const HOME_PREFIX = /^~(?=$|[\\/])/

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

function isShadowedByGlobal() {
  const self = fileURLToPath(import.meta.url)
  return path.resolve(self) !== path.resolve(GLOBAL_COPY) && fs.existsSync(GLOBAL_COPY)
}

function guardEdit(input) {
  const file = input.tool_input?.file_path
  const isLintable = typeof file === 'string' && LINTABLE.test(file)
  if (!isLintable) return
  const absolute = path.resolve(input.cwd ?? '.', file)
  if (isExcluded(absolute)) return
  const linter = linterFor(path.dirname(absolute))
  if (!linter) return
  remember(input, absolute)
  const report = lint(linter, [absolute])
  if (report) block(`방금 고친 파일에 자동으로 고칠 수 없는 lint 에러가 남았어요. 규칙을 끄지 말고 코드를 고치세요.\n${report}`)
}

function guardStop(input) {
  const ledger = ledgerDir(input)
  const reports = groupByLinter(touchedFiles(ledger))
    .map(({ linter, files }) => lint(linter, files))
    .filter(Boolean)
  if (reports.length === 0) return fs.rmSync(ledger, { recursive: true, force: true })
  const count = readCount(path.join(ledger, BLOCKS_FILE)) + 1
  if (count > MAX_STOP_BLOCKS) return fs.rmSync(ledger, { recursive: true, force: true })
  fs.writeFileSync(path.join(ledger, BLOCKS_FILE), String(count))
  block(`끝내기 전에 이번 작업에서 고친 파일의 lint 에러를 0으로 만드세요(${count}/${MAX_STOP_BLOCKS}).\n${reports.join('\n')}`)
}

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
  const roots = excludedRoots()
  return fs
    .readdirSync(ledger)
    .filter((name) => name !== BLOCKS_FILE)
    .map((name) => fs.readFileSync(path.join(ledger, name), 'utf8'))
    .filter((file) => fs.existsSync(file))
    .filter((file) => !isExcluded(file, roots))
}

function isExcluded(file, roots = excludedRoots()) {
  const real = realPath(file)
  return roots.some((root) => isInside(root, real))
}

function isInside(root, file) {
  const relative = path.relative(root, file)
  const isOutside = relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)
  return !isOutside
}

function excludedRoots() {
  try {
    const roots = JSON.parse(fs.readFileSync(EXCLUDE_FILE, 'utf8'))
    if (!Array.isArray(roots)) return []
    return roots
      .filter((root) => typeof root === 'string')
      .map((root) => root.replace(HOME_PREFIX, os.homedir()))
      .filter((root) => path.isAbsolute(root))
      .map(realPath)
  } catch {
    return []
  }
}

function realPath(target) {
  try {
    return fs.realpathSync(target)
  } catch {
    return path.resolve(target)
  }
}

function groupByLinter(files) {
  const groups = new Map()
  for (const file of files) {
    const linter = linterFor(path.dirname(file))
    if (!linter) continue
    const key = `${linter.bin}\0${linter.root}`
    groups.set(key, { linter, files: [...(groups.get(key)?.files ?? []), file] })
  }
  return [...groups.values()]
}

function linterFor(dir) {
  const projectRoot = findEslintRoot(dir)
  if (projectRoot) {
    const overlay = overlayConfig(projectRoot)
    return { root: projectRoot, bin: eslintBin(projectRoot), configs: overlay ? [overlay, null] : [null] }
  }
  const hasRuntime = fs.existsSync(eslintBin(RUNTIME_DIR)) && fs.existsSync(RUNTIME_CONFIG)
  if (!hasRuntime) return null
  return { root: findProjectRoot(dir), bin: eslintBin(RUNTIME_DIR), configs: [RUNTIME_CONFIG] }
}

function findProjectRoot(start) {
  let dir = path.resolve(start)
  while (true) {
    if (PROJECT_MARKERS.some((marker) => fs.existsSync(path.join(dir, marker)))) return dir
    const parent = path.dirname(dir)
    if (parent === dir) return path.resolve(start)
    dir = parent
  }
}

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

function lint(linter, files) {
  if (files.length === 0) return null
  const result = firstLoadableRun(linter, files)
  if (result?.status !== ESLINT_LINT_ERRORS) return null
  const { root } = linter
  const errors = JSON.parse(result.stdout).flatMap((entry) =>
    entry.messages
      .filter((message) => message.severity === ERROR_SEVERITY)
      .map((message) => `${path.relative(root, entry.filePath)}:${message.line}:${message.column}  ${message.message} (${message.ruleId ?? 'parse'})`),
  )
  if (errors.length === 0) return null
  const hidden = errors.length - MAX_REPORTED
  return [...errors.slice(0, MAX_REPORTED), ...(hidden > 0 ? [`…외 ${hidden}건`] : [])].join('\n')
}

function firstLoadableRun(linter, files) {
  for (const config of linter.configs) {
    const result = runEslint(linter, files, config ? ['--config', config] : [])
    if (result.status !== ESLINT_CONFIG_ERROR) return result
  }
  return null
}

function runEslint(linter, files, extraArgs) {
  const args = [...extraArgs, ...suppressionArgs(linter.root), '--fix', '--format', 'json', '--no-warn-ignored', ...files]
  return spawnSync(linter.bin, args, {
    cwd: linter.root,
    encoding: 'utf8',
    timeout: ESLINT_TIMEOUT_MS,
    maxBuffer: MAX_BUFFER,
  })
}

function suppressionArgs(root) {
  if (!fs.existsSync(path.join(root, SUPPRESSIONS_FILE))) return []
  if (!fs.existsSync(EMPTY_SUPPRESSIONS)) writeAtomically(EMPTY_SUPPRESSIONS, '{}')
  return ['--suppressions-location', EMPTY_SUPPRESSIONS]
}

function writeAtomically(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const temporary = `${file}.${process.pid}`
  fs.writeFileSync(temporary, content)
  fs.renameSync(temporary, file)
}

function overlayConfig(root) {
  const projectConfig = PROJECT_CONFIG_NAMES.map((name) => path.join(root, name)).find((file) => fs.existsSync(file))
  const canOverlay = Boolean(projectConfig) && fs.existsSync(BASELINE)
  if (!canOverlay) return null
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
