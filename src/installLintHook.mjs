import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { hashFile, writeFileAtomic } from './manifest.mjs'

const LINT_GUARD_SRC = fileURLToPath(new URL('../scripts/lint-guard.mjs', import.meta.url))
const LINT_GUARD_REL = '.claude/hooks/lint-guard.mjs'
const BASELINE_SRC = fileURLToPath(new URL('../scripts/lint-guard-baseline.mjs', import.meta.url))
const BASELINE_REL = '.claude/hooks/lint-guard-baseline.mjs'
const PLUGIN_SRC = fileURLToPath(new URL('../scripts/lint-guard-plugin.mjs', import.meta.url))
const PLUGIN_REL = '.claude/hooks/lint-guard-plugin.mjs'
export const LINT_GUARD_MARK = 'lint-guard.mjs'
export const LINT_MATCHER = 'Write|Edit|MultiEdit'
export const LINT_GUARD_EVENTS = ['PostToolUse', 'Stop', 'SubagentStop']
const LINT_GUARD_TIMEOUT_SECONDS = 120
const RUNTIME_CONFIG_SRC = fileURLToPath(new URL('../scripts/lint-guard-runtime.config.mjs', import.meta.url))
export const RUNTIME_REL = '.claude/my-fe-harness-runtime'
// ESLint가 없는 프로젝트용 런타임. typescript-eslint 8.73은 typescript <6.1을 지원한다.
export const RUNTIME_PACKAGES = { eslint: '10.15.0', 'typescript-eslint': '8.73.0', typescript: '6.0.3' }
const NPM_TIMEOUT_MS = 300_000

// 린트 강제 훅을 설치한다. 스크립트를 .claude/hooks/에 복사하고 settings.json의 PostToolUse·Stop에 병합한다.
// 고친 파일을 바로 검사하고(PostToolUse), 바뀐 파일에 에러가 남으면 끝내지 못하게 한다(Stop).
export function installLintHook(options, manifest) {
  const target = lintTarget(options)
  if (!options.dryRun) applyLintHook(target, options, manifest)
  return {
    scriptDest: target.scriptDest,
    settingsPath: target.settingsPath,
    scriptStatus: scriptStatusOf(target.scriptExists, options.force),
    hookStatus: target.missingEvents.length > 0 ? 'added' : 'exists',
  }
}

function lintTarget({ targetDir, global }) {
  const base = global ? os.homedir() : targetDir
  const scriptDest = path.join(base, LINT_GUARD_REL)
  const settingsPath = path.join(base, '.claude', 'settings.json')
  const settings = readJson(settingsPath)
  const missingEvents = LINT_GUARD_EVENTS.filter((event) => !hasHook(settings, event))
  return { base, scriptDest, settingsPath, settings, missingEvents, scriptExists: fs.existsSync(scriptDest) }
}

function applyLintHook(target, { force, global }, manifest) {
  const { base, scriptDest, settingsPath, settings, missingEvents, scriptExists } = target
  copyLintFiles(base, scriptDest, scriptExists, force)
  if (missingEvents.length > 0) {
    const handler = hookHandler(global)
    for (const event of missingEvents) addHook(settings, event, handler)
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true })
    writeFileAtomic(settingsPath, `${JSON.stringify(settings, null, 2)}\n`)
  }
  const scriptSha = scriptExists && !force ? hashFile(scriptDest) : hashFile(LINT_GUARD_SRC)
  const runtimeStatus = global ? installRuntime(base, force) : 'project-scope'
  manifest.lintHook = {
    rel: LINT_GUARD_REL,
    scriptSha,
    mark: LINT_GUARD_MARK,
    events: LINT_GUARD_EVENTS,
    companions: [BASELINE_REL, PLUGIN_REL].map((rel) => ({ rel, sha: hashFile(path.join(base, rel)) })),
    ...(global ? { runtime: RUNTIME_REL } : {}),
  }
  manifest.lintHook.runtimeStatus = runtimeStatus
}

function copyLintFiles(base, scriptDest, scriptExists, force) {
  fs.mkdirSync(path.dirname(scriptDest), { recursive: true })
  if (!scriptExists || force) fs.copyFileSync(LINT_GUARD_SRC, scriptDest)
  for (const [src, rel] of [[BASELINE_SRC, BASELINE_REL], [PLUGIN_SRC, PLUGIN_REL]]) {
    const dest = path.join(base, rel)
    if (!fs.existsSync(dest) || force) fs.copyFileSync(src, dest)
  }
}

function scriptStatusOf(exists, force) {
  if (!exists) return 'created'
  return force ? 'overwritten' : 'kept'
}

// 하네스 런타임: 프로젝트에 ESLint가 없을 때 기본 잠금을 검사할 eslint·typescript-eslint를 한 번 설치한다.
function installRuntime(base, force) {
  if (process.env.MY_FE_HARNESS_SKIP_RUNTIME === '1') return 'skipped'
  const dir = path.join(base, RUNTIME_REL)
  fs.mkdirSync(dir, { recursive: true })
  const manifestFile = path.join(dir, 'package.json')
  const pkg = `${JSON.stringify({ name: 'my-fe-harness-runtime', private: true, type: 'module', dependencies: RUNTIME_PACKAGES }, null, 2)}\n`
  const isCurrent = fs.existsSync(manifestFile) && fs.readFileSync(manifestFile, 'utf8') === pkg
  fs.writeFileSync(manifestFile, pkg)
  fs.copyFileSync(RUNTIME_CONFIG_SRC, path.join(dir, 'eslint.config.mjs'))
  fs.copyFileSync(BASELINE_SRC, path.join(dir, 'lint-guard-baseline.mjs'))
  fs.copyFileSync(PLUGIN_SRC, path.join(dir, 'lint-guard-plugin.mjs'))
  if (isCurrent && !force && fs.existsSync(path.join(dir, 'node_modules', '.bin', 'eslint'))) return 'kept'
  const result = spawnSync('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error'], {
    cwd: dir,
    encoding: 'utf8',
    timeout: NPM_TIMEOUT_MS,
  })
  return result.status === 0 ? 'installed' : 'failed'
}

function readJson(file) {
  if (!fs.existsSync(file)) return {}
  let parsed
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    throw new Error(`${file} 파싱 실패 — 유효한 JSON이 아닙니다. 수동으로 확인 후 다시 시도하세요.`)
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${file} 형식 오류 — 최상위가 JSON 객체가 아닙니다. 수동으로 확인 후 다시 시도하세요.`)
  }
  return parsed
}

// args(exec 형식)는 셸 없이 실행돼 \${CLAUDE_PROJECT_DIR} 같은 경로 플레이스홀더만 치환된다.
// 전역 경로의 $HOME은 셸 형식이어야 펼쳐진다. https://code.claude.com/docs/en/hooks
function hookHandler(global) {
  const timeout = LINT_GUARD_TIMEOUT_SECONDS
  if (global) return { type: 'command', command: `node "$HOME/${LINT_GUARD_REL}"`, timeout }
  return { type: 'command', command: 'node', args: [`\${CLAUDE_PROJECT_DIR}/${LINT_GUARD_REL}`], timeout }
}

export function handlerHasMark(handler, mark) {
  const parts = [handler?.command, ...(handler?.args ?? [])]
  return parts.some((part) => typeof part === 'string' && part.includes(mark))
}

function hasHook(settings, event) {
  const groups = settings?.hooks?.[event]
  if (!Array.isArray(groups)) return false
  return groups.some((group) => (group?.hooks ?? []).some((handler) => handlerHasMark(handler, LINT_GUARD_MARK)))
}

function addHook(settings, event, handler) {
  settings.hooks ??= {}
  settings.hooks[event] ??= []
  settings.hooks[event].push(event === 'PostToolUse' ? { matcher: LINT_MATCHER, hooks: [handler] } : { hooks: [handler] })
}
