import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// 설치 매니페스트: 우리가 쓴 파일의 sha256을 기록한다.
// uninstall은 이 해시와 현재 파일이 일치할 때만 삭제해 사용자 수정본을 보존한다.
export const MANIFEST_NAME = '.my-fe-harness-manifest.json'
export const MANIFEST_VERSION = 1

// 설치 스코프(전역/프로젝트)에 맞는 .claude 디렉토리. 모든 명령이 이 한 경로를 공유한다.
export function resolveClaudeDir({ targetDir, global = false }) {
  return path.join(global ? os.homedir() : targetDir, '.claude')
}

// 매니페스트는 .claude/ 아래에 둔다(규칙·훅 양쪽을 함께 추적).
export function manifestPath(claudeDir) {
  return path.join(claudeDir, MANIFEST_NAME)
}

export function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex')
}

export function hashFile(file) {
  return sha256(fs.readFileSync(file))
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
    }
  } catch {
    throw new Error(`${file} 파싱 실패 — 손상된 매니페스트. 수동 확인 후 다시 시도하세요.`)
  }
}

export function writeManifest(claudeDir, manifest) {
  fs.mkdirSync(claudeDir, { recursive: true })
  fs.writeFileSync(manifestPath(claudeDir), `${JSON.stringify(manifest, null, 2)}\n`)
}

function emptyManifest() {
  return { version: MANIFEST_VERSION, installedBy: null, rules: {}, files: {}, hook: null }
}

// 변조된 매니페스트가 배열·문자열을 넣어도 안전하게 빈 객체로 취급.
function plainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

// 보안: 해석된 경로가 base 디렉토리 내부인지 검증(경로 탈출 차단).
export function isInside(base, target) {
  const rel = path.relative(base, target)
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)
}
