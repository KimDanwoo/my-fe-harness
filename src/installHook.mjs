import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const GUARD_SRC = fileURLToPath(new URL('../scripts/safety-guard.mjs', import.meta.url))
const GUARD_REL = '.claude/hooks/safety-guard.mjs'
const MATCHER = 'Write|Edit|MultiEdit|NotebookEdit|Bash'
const GUARD_MARK = 'safety-guard.mjs'

// 강제 훅을 설치한다. 가드 스크립트를 .claude/hooks/에 복사하고 settings.json의 PreToolUse에 병합한다.
// global=true면 ~/.claude(모든 프로젝트), 아니면 프로젝트별. 훅 커맨드 경로는 스코프에 맞춰 치환 변수를 고른다.
export function installHook({ targetDir, force = false, dryRun = false, global = false }) {
  const base = global ? os.homedir() : targetDir
  const scriptDest = path.join(base, GUARD_REL)
  const settingsPath = path.join(base, '.claude', 'settings.json')
  const commandArg = `\${${global ? 'HOME' : 'CLAUDE_PROJECT_DIR'}}/${GUARD_REL}`

  const scriptExists = fs.existsSync(scriptDest)
  const settings = readJson(settingsPath)
  const already = hasGuardHook(settings)

  if (!dryRun) {
    fs.mkdirSync(path.dirname(scriptDest), { recursive: true })
    if (!scriptExists || force) fs.copyFileSync(GUARD_SRC, scriptDest)
    if (!already) {
      addGuardHook(settings, commandArg)
      fs.mkdirSync(path.dirname(settingsPath), { recursive: true })
      fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`)
    }
  }

  return {
    scriptDest,
    settingsPath,
    scriptStatus: scriptExists ? (force ? 'overwritten' : 'kept') : 'created',
    hookStatus: already ? 'exists' : 'added',
  }
}

function readJson(file) {
  if (!fs.existsSync(file)) return {}
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    throw new Error(`${file} 파싱 실패 — 유효한 JSON이 아닙니다. 수동으로 확인 후 다시 시도하세요.`)
  }
}

function hasGuardHook(settings) {
  const groups = settings?.hooks?.PreToolUse
  if (!Array.isArray(groups)) return false
  return groups.some((group) =>
    (group?.hooks ?? []).some((handler) =>
      (handler?.args ?? []).some((arg) => typeof arg === 'string' && arg.includes(GUARD_MARK)),
    ),
  )
}

function addGuardHook(settings, commandArg) {
  settings.hooks ??= {}
  settings.hooks.PreToolUse ??= []
  settings.hooks.PreToolUse.push({
    matcher: MATCHER,
    hooks: [{ type: 'command', command: 'node', args: [commandArg], timeout: 10 }],
  })
}
