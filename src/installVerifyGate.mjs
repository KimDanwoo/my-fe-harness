import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { handlerHasMark } from './installLintHook.mjs'
import { hashFile, writeFileAtomic } from './manifest.mjs'

const GATE_SRC = fileURLToPath(new URL('../scripts/verify-gate.mjs', import.meta.url))
const GATE_REL = '.claude/hooks/verify-gate.mjs'
export const VERIFY_GATE_MARK = 'verify-gate.mjs'
export const VERIFY_GATE_MATCHER = 'Bash|Write|Edit|MultiEdit'
const GATE_TIMEOUT_SECONDS = 10

// 검증 게이트를 설치한다. 커밋 전 검증 여부를 보고, 변경을 판정하는 검사 파일을 고치려면 승인을 받게 한다(PreToolUse).
export function installVerifyGate(options, manifest) {
  const target = gateTarget(options)
  if (!options.dryRun) applyGate(target, options, manifest)
  return {
    scriptDest: target.scriptDest,
    settingsPath: target.settingsPath,
    scriptStatus: scriptStatusOf(target.scriptExists, options.force),
    hookStatus: target.isRegistered ? 'exists' : 'added',
  }
}

function gateTarget({ targetDir, global }) {
  const base = global ? os.homedir() : targetDir
  const scriptDest = path.join(base, GATE_REL)
  const settingsPath = path.join(base, '.claude', 'settings.json')
  const settings = readSettings(settingsPath)
  const isRegistered = (settings.hooks?.PreToolUse ?? []).some((group) =>
    (group?.hooks ?? []).some((handler) => handlerHasMark(handler, VERIFY_GATE_MARK)),
  )
  return { scriptDest, settingsPath, settings, isRegistered, scriptExists: fs.existsSync(scriptDest) }
}

function applyGate(target, { force, global }, manifest) {
  fs.mkdirSync(path.dirname(target.scriptDest), { recursive: true })
  if (!target.scriptExists || force) fs.copyFileSync(GATE_SRC, target.scriptDest)
  if (!target.isRegistered) registerGate(target, global)
  manifest.verifyGate = { rel: GATE_REL, scriptSha: hashFile(target.scriptDest), mark: VERIFY_GATE_MARK, events: ['PreToolUse'] }
}

function registerGate({ settings, settingsPath }, global) {
  settings.hooks ??= {}
  settings.hooks.PreToolUse ??= []
  settings.hooks.PreToolUse.push({ matcher: VERIFY_GATE_MATCHER, hooks: [gateHandler(global)] })
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true })
  writeFileAtomic(settingsPath, `${JSON.stringify(settings, null, 2)}\n`)
}

const scriptStatusOf = (exists, force) => {
  if (!exists) return 'created'
  return force ? 'overwritten' : 'kept'
}

// 전역은 $HOME이 펼쳐지도록 셸 형식, 프로젝트는 ${CLAUDE_PROJECT_DIR}의 exec 형식(https://code.claude.com/docs/en/hooks).
function gateHandler(global) {
  if (global) return { type: 'command', command: `node "$HOME/${GATE_REL}"`, timeout: GATE_TIMEOUT_SECONDS }
  return { type: 'command', command: 'node', args: [`\${CLAUDE_PROJECT_DIR}/${GATE_REL}`], timeout: GATE_TIMEOUT_SECONDS }
}

function readSettings(file) {
  if (!fs.existsSync(file)) return {}
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(`${file} 형식 오류 — 최상위가 JSON 객체가 아닙니다.`)
  return parsed
}
