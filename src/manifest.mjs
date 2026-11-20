import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const MANIFEST_NAME = '.my-fe-harness-manifest.json'
export const MANIFEST_VERSION = 1

export function resolveClaudeDir({ targetDir, global = false }) {
  return path.join(global ? os.homedir() : targetDir, '.claude')
}

export function manifestPath(claudeDir) {
  return path.join(claudeDir, MANIFEST_NAME)
}

export function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex')
}

export function hashFile(file) {
  return sha256(fs.readFileSync(file))
}

export function writeFileAtomic(file, content) {
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, content)
  fs.renameSync(tmp, file)
}

export function readManifest(claudeDir) {
  const file = manifestPath(claudeDir)
  if (!fs.existsSync(file)) return emptyManifest()
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'))
    return {
      version: data.version ?? MANIFEST_VERSION,
      installedBy: data.installedBy ?? null,
      rules: plainObject(data.rules),
      files: plainObject(data.files),
      hook: data.hook ?? null,
      lintHook: data.lintHook ?? null,
      verifyGate: data.verifyGate ?? null,
      verifySkill: data.verifySkill ? { files: plainObject(data.verifySkill.files) } : null,
      agents: agentsRecord(data.agents),
      project: projectRecord(data.project),
    }
  } catch {
    throw new Error(`${file} 파싱 실패 — 손상된 매니페스트. 수동 확인 후 다시 시도하세요.`)
  }
}

export function writeManifest(claudeDir, manifest) {
  fs.mkdirSync(claudeDir, { recursive: true })
  writeFileAtomic(manifestPath(claudeDir), `${JSON.stringify(manifest, null, 2)}\n`)
}

function emptyManifest() {
  return { version: MANIFEST_VERSION, installedBy: null, rules: {}, files: {}, hook: null, lintHook: null, verifyGate: null, verifySkill: null, agents: null, project: null }
}

function agentsRecord(value) {
  const hasSha = typeof value?.sha === 'string'
  if (!hasSha) return null
  return { file: typeof value.file === 'string' ? value.file : null, sha: value.sha, created: value.created === true }
}

function projectRecord(value) {
  const isRecord = Boolean(value) && typeof value === 'object'
  if (!isRecord) return null
  const packageJson = value.packageJson
  const isPackageRecord = typeof packageJson?.file === 'string'
  return {
    files: plainObject(value.files),
    packageJson: isPackageRecord ? { file: packageJson.file, devDependencies: plainObject(packageJson.devDependencies), scripts: plainObject(packageJson.scripts) } : null,
  }
}

function plainObject(value) {
  const isPlainObject = Boolean(value) && typeof value === 'object' && !Array.isArray(value)
  return isPlainObject ? value : {}
}

export function isInside(base, target) {
  const rel = path.relative(base, target)
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)
}
