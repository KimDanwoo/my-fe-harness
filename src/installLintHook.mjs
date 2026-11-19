import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { hashFile, writeFileAtomic } from './manifest.mjs'

const LINT_GUARD_SRC = fileURLToPath(new URL('../scripts/lint-guard.mjs', import.meta.url))
const LINT_GUARD_REL = '.claude/hooks/lint-guard.mjs'
export const LINT_GUARD_MARK = 'lint-guard.mjs'
export const LINT_MATCHER = 'Write|Edit|MultiEdit'
export const LINT_GUARD_EVENTS = ['PostToolUse', 'Stop']
const LINT_GUARD_TIMEOUT_SECONDS = 120

// 린트 강제 훅을 설치한다. 스크립트를 .claude/hooks/에 복사하고 settings.json의 PostToolUse·Stop에 병합한다.
// 고친 파일을 바로 검사하고(PostToolUse), 바뀐 파일에 에러가 남으면 끝내지 못하게 한다(Stop).
export function installLintHook({ targetDir, force = false, dryRun = false, global = false }, manifest) {
  const base = global ? os.homedir() : targetDir
  const scriptDest = path.join(base, LINT_GUARD_REL)
  const settingsPath = path.join(base, '.claude', 'settings.json')
  const commandArg = `\${${global ? 'HOME' : 'CLAUDE_PROJECT_DIR'}}/${LINT_GUARD_REL}`

  const scriptExists = fs.existsSync(scriptDest)
  const settings = readJson(settingsPath)
  const missingEvents = LINT_GUARD_EVENTS.filter((event) => !hasHook(settings, event))

  if (!dryRun) {
    fs.mkdirSync(path.dirname(scriptDest), { recursive: true })
    if (!scriptExists || force) fs.copyFileSync(LINT_GUARD_SRC, scriptDest)
    if (missingEvents.length > 0) {
      for (const event of missingEvents) addHook(settings, event, commandArg)
      fs.mkdirSync(path.dirname(settingsPath), { recursive: true })
      writeFileAtomic(settingsPath, `${JSON.stringify(settings, null, 2)}\n`)
    }
    const scriptSha = scriptExists && !force ? hashFile(scriptDest) : hashFile(LINT_GUARD_SRC)
    manifest.lintHook = { rel: LINT_GUARD_REL, scriptSha, mark: LINT_GUARD_MARK, events: LINT_GUARD_EVENTS }
  }

  return {
    scriptDest,
    settingsPath,
    scriptStatus: scriptExists ? (force ? 'overwritten' : 'kept') : 'created',
    hookStatus: missingEvents.length > 0 ? 'added' : 'exists',
  }
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

function hasHook(settings, event) {
  const groups = settings?.hooks?.[event]
  if (!Array.isArray(groups)) return false
  return groups.some((group) =>
    (group?.hooks ?? []).some((handler) =>
      (handler?.args ?? []).some((arg) => typeof arg === 'string' && arg.includes(LINT_GUARD_MARK)),
    ),
  )
}

function addHook(settings, event, commandArg) {
  settings.hooks ??= {}
  settings.hooks[event] ??= []
  const handler = { type: 'command', command: 'node', args: [commandArg], timeout: LINT_GUARD_TIMEOUT_SECONDS }
  settings.hooks[event].push(event === 'Stop' ? { hooks: [handler] } : { matcher: LINT_MATCHER, hooks: [handler] })
}
