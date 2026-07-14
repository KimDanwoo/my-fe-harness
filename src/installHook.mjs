import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { hashFile, writeFileAtomic } from './manifest.mjs'

const GUARD_SRC = fileURLToPath(new URL('../scripts/safety-guard.mjs', import.meta.url))
const GUARD_REL = '.claude/hooks/safety-guard.mjs'
const MATCHER = 'Write|Edit|MultiEdit|NotebookEdit|Bash'
export const GUARD_MARK = 'safety-guard.mjs'

// 강제 훅을 설치한다. 가드 스크립트를 .claude/hooks/에 복사하고 settings.json의 PreToolUse에 병합한다.
// global=true면 ~/.claude(모든 프로젝트), 아니면 프로젝트별. 훅 커맨드 경로는 스코프에 맞춰 치환 변수를 고른다.
export function installHook({ targetDir, force = false, dryRun = false, global = false }, manifest) {
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
      writeFileAtomic(settingsPath, `${JSON.stringify(settings, null, 2)}\n`)
    }
    // 매니페스트에 훅 소유권 기록(파일 쓰기는 호출자가 일괄 수행): uninstall이 스크립트 해시를 검증해 삭제한다.
    // 스크립트를 실제로 쓰지 않았다면(kept) 디스크의 실제 해시를 기록해야
    // 이후 패키지 업데이트로 소스 해시가 바뀌어도 uninstall이 오분류하지 않는다.
    const scriptSha = scriptExists && !force ? hashFile(scriptDest) : hashFile(GUARD_SRC)
    manifest.hook = { rel: GUARD_REL, scriptSha, mark: GUARD_MARK }
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
  let parsed
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    throw new Error(`${file} 파싱 실패 — 유효한 JSON이 아닙니다. 수동으로 확인 후 다시 시도하세요.`)
  }
  // 배열·스칼라(유효 JSON이지만 객체 아님)에 훅을 병합하면 조용히 유실되므로 막는다.
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${file} 형식 오류 — 최상위가 JSON 객체가 아닙니다. 수동으로 확인 후 다시 시도하세요.`)
  }
  return parsed
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
