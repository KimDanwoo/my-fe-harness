import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { removeAgents } from './installAgents.mjs'
import { GUARD_MARK } from './installHook.mjs'
import { handlerHasMark } from './installLintHook.mjs'
import { removeProjectSetup } from './installProjectSetup.mjs'
import { removeVerifySkillDirs } from './installVerifySkill.mjs'
import { hashFile, isInside, manifestPath, readManifest, writeFileAtomic } from './manifest.mjs'

export function uninstall({ targetDir, dryRun, global }) {
  const base = global ? os.homedir() : targetDir
  const claudeDir = path.join(base, '.claude')
  const manifest = readManifest(claudeDir)

  const rulesDir = path.join(claudeDir, 'rules')
  const rules = removeTracked(manifest.rules, (file) => path.join(rulesDir, file), rulesDir, dryRun)
  const files = removeTracked(manifest.files, (rel) => path.join(claudeDir, rel), claudeDir, dryRun)
  const hook = manifest.hook ? removeHook(manifest.hook, base, claudeDir, dryRun) : null
  const lintHook = manifest.lintHook ? removeHook(manifest.lintHook, base, claudeDir, dryRun) : null
  const verifyGate = manifest.verifyGate ? removeHook(manifest.verifyGate, base, claudeDir, dryRun) : null
  const verifySkill = manifest.verifySkill ? removeVerifySkill(manifest.verifySkill, base, dryRun) : null
  const agents = manifest.agents ? removeAgents({ targetDir, global }, manifest, dryRun) : null
  const project = manifest.project ? removeProjectSetup(targetDir, manifest.project, dryRun) : null

  const tracked = rules.length + files.length + countRecorded(manifest)
  const manifestRemoved = !dryRun && tracked > 0 && removeManifest(claudeDir)

  return { rules, files, hook, lintHook, verifyGate, verifySkill, agents, project, tracked, manifestRemoved, claudeDir }
}

function countRecorded(manifest) {
  return [manifest.hook, manifest.lintHook, manifest.verifyGate, manifest.verifySkill, manifest.agents, manifest.project].filter(Boolean).length
}

function removeVerifySkill(verifySkill, base, dryRun) {
  const files = removeTracked(verifySkill.files, (rel) => path.join(base, rel), base, dryRun)
  removeVerifySkillDirs(base, dryRun)
  return files
}

function removeManifest(claudeDir) {
  const mf = manifestPath(claudeDir)
  const existed = fs.existsSync(mf)
  if (existed) fs.unlinkSync(mf)
  pruneEmptyDir(path.join(claudeDir, 'rules'))
  return existed
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

  const scriptStatus = removeScript(scriptDest, hook.scriptSha, claudeDir, dryRun)
  for (const companion of hook.companions ?? []) removeCompanion(path.join(base, companion.rel), companion.sha, claudeDir, dryRun)
  removeRuntime(hook, base, claudeDir, dryRun)
  const settingsStatus = stripHookEntry(settingsPath, hook.mark ?? GUARD_MARK, hook.events ?? ['PreToolUse'], dryRun)
  const scriptDir = path.dirname(scriptDest)
  const shouldPrune = !dryRun && isInside(claudeDir, scriptDir)
  if (shouldPrune) pruneEmptyDir(scriptDir)
  return { scriptStatus, settingsStatus }
}

function removeScript(scriptDest, recordedSha, claudeDir, dryRun) {
  if (!isInside(claudeDir, scriptDest)) return 'outside-skipped'
  if (!fs.existsSync(scriptDest)) return 'missing'
  if (hashFile(scriptDest) !== recordedSha) return 'kept-modified'
  if (!dryRun) fs.unlinkSync(scriptDest)
  return 'removed'
}

function removeRuntime(hook, base, claudeDir, dryRun) {
  const shouldSkip = !hook.runtime || dryRun
  if (shouldSkip) return
  const runtimeDir = path.join(base, hook.runtime)
  if (isInside(claudeDir, runtimeDir)) fs.rmSync(runtimeDir, { recursive: true, force: true })
}

function removeCompanion(file, sha, claudeDir, dryRun) {
  const isOurs = isInside(claudeDir, file) && fs.existsSync(file) && hashFile(file) === sha
  if (!isOurs) return
  if (!dryRun) fs.unlinkSync(file)
}

function stripHookEntry(settingsPath, mark, events, dryRun) {
  if (!fs.existsSync(settingsPath)) return 'missing'
  let settings
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
  } catch {
    return 'parse-error'
  }
  const removedFrom = events.filter((event) => stripEvent(settings, event, mark))
  if (removedFrom.length === 0) return 'not-present'
  const hasEmptyHooks = Boolean(settings.hooks) && Object.keys(settings.hooks).length === 0
  if (hasEmptyHooks) delete settings.hooks

  if (!dryRun) writeFileAtomic(settingsPath, `${JSON.stringify(settings, null, 2)}\n`)
  return 'removed'
}

function stripEvent(settings, event, mark) {
  const groups = settings?.hooks?.[event]
  if (!Array.isArray(groups)) return false
  const kept = groups.filter((group) => !(group?.hooks ?? []).some((handler) => handlerHasMark(handler, mark)))
  if (kept.length === groups.length) return false
  if (kept.length > 0) settings.hooks[event] = kept
  else delete settings.hooks[event]
  return true
}

function pruneEmptyDir(dir) {
  try {
    const isEmptyDir = fs.existsSync(dir) && fs.readdirSync(dir).length === 0
    if (isEmptyDir) fs.rmdirSync(dir)
  } catch {
  }
}
