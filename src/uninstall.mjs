import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { GUARD_MARK } from './installHook.mjs'
import { hashFile, isInside, manifestPath, readManifest } from './manifest.mjs'

// 매니페스트에 기록된, 우리가 쓴 그대로인 파일만 제거한다.
// 해시가 다르면(사용자 수정) 보존하고, 경로가 .claude 밖이면(변조된 매니페스트) 건너뛴다.
export function uninstall({ targetDir, dryRun = false, global = false }) {
  const base = global ? os.homedir() : targetDir
  const claudeDir = path.join(base, '.claude')
  const manifest = readManifest(claudeDir)

  const rulesDir = path.join(claudeDir, 'rules')
  const rules = removeTracked(manifest.rules, (file) => path.join(rulesDir, file), rulesDir, dryRun)
  const files = removeTracked(manifest.files, (rel) => path.join(claudeDir, rel), claudeDir, dryRun)
  const hook = manifest.hook ? removeHook(manifest.hook, base, claudeDir, dryRun) : null

  const tracked = rules.length + files.length + (manifest.hook ? 1 : 0)
  let manifestRemoved = false
  if (!dryRun && tracked > 0) {
    const mf = manifestPath(claudeDir)
    if (fs.existsSync(mf)) {
      fs.unlinkSync(mf)
      manifestRemoved = true
    }
    pruneEmptyDir(path.join(claudeDir, 'rules'))
  }

  return { rules, files, hook, tracked, manifestRemoved, claudeDir }
}

function removeTracked(entries, resolve, baseDir, dryRun) {
  return Object.entries(entries ?? {}).map(([key, recordedSha]) => {
    const dest = resolve(key)
    if (!isInside(baseDir, dest)) return { file: key, status: 'outside-skipped' }
    if (!fs.existsSync(dest)) return { file: key, status: 'missing' }
    if (hashFile(dest) !== recordedSha) return { file: key, status: 'kept-modified' }
    if (!dryRun) fs.unlinkSync(dest)
    return { file: key, status: 'removed' }
  })
}

function removeHook(hook, base, claudeDir, dryRun) {
  const scriptDest = path.join(base, hook.rel)
  const settingsPath = path.join(claudeDir, 'settings.json')

  let scriptStatus = 'missing'
  if (isInside(claudeDir, scriptDest) && fs.existsSync(scriptDest)) {
    scriptStatus = hashFile(scriptDest) === hook.scriptSha ? 'removed' : 'kept-modified'
    if (!dryRun && scriptStatus === 'removed') fs.unlinkSync(scriptDest)
  } else if (!isInside(claudeDir, scriptDest)) {
    scriptStatus = 'outside-skipped'
  }

  const settingsStatus = stripHookEntry(settingsPath, hook.mark ?? GUARD_MARK, dryRun)
  const scriptDir = path.dirname(scriptDest)
  if (!dryRun && isInside(claudeDir, scriptDir)) pruneEmptyDir(scriptDir)
  return { scriptStatus, settingsStatus }
}

// PreToolUse에서 우리 가드 훅 그룹만 제거하고 나머지 설정은 보존한다.
function stripHookEntry(settingsPath, mark, dryRun) {
  if (!fs.existsSync(settingsPath)) return 'missing'
  let settings
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
  } catch {
    return 'parse-error'
  }
  const groups = settings?.hooks?.PreToolUse
  if (!Array.isArray(groups)) return 'not-present'

  const kept = groups.filter(
    (group) =>
      !(group?.hooks ?? []).some((handler) =>
        (handler?.args ?? []).some((arg) => typeof arg === 'string' && arg.includes(mark)),
      ),
  )
  if (kept.length === groups.length) return 'not-present'

  if (kept.length > 0) settings.hooks.PreToolUse = kept
  else delete settings.hooks.PreToolUse
  if (settings.hooks && Object.keys(settings.hooks).length === 0) delete settings.hooks

  if (!dryRun) fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`)
  return 'removed'
}

// 비어 있을 때만 디렉토리 제거(재귀 삭제 안 함).
function pruneEmptyDir(dir) {
  try {
    if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) fs.rmdirSync(dir)
  } catch {
    // 경합·권한 문제는 무시 — 정리 실패가 uninstall을 깨뜨리지 않는다.
  }
}
