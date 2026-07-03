import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { hashFile } from './manifest.mjs'

const RULES_DIR = fileURLToPath(new URL('../rules/', import.meta.url))

// 규칙이 설치되는 베이스 경로: 전역이면 ~/.claude, 아니면 프로젝트.
export function rulesBase({ targetDir, global = false }) {
  return global ? os.homedir() : targetDir
}

// 패키지에 동봉된 규칙 원본 경로(update 명령이 최신본과 비교할 때 사용).
export function ruleSourcePath(file) {
  return path.join(RULES_DIR, file)
}

// 규칙 파일을 복사하고, 실제로 쓴 파일의 sha256을 manifest.rules에 누적한다.
// 매니페스트 파일 쓰기는 호출자(commands)가 명령당 한 번만 수행한다.
export function installRules(packs, { targetDir, force = false, dryRun = false, global = false }, manifest) {
  const destDir = path.join(rulesBase({ targetDir, global }), '.claude', 'rules')
  if (!dryRun) fs.mkdirSync(destDir, { recursive: true })

  return packs.map((pack) => {
    const src = path.join(RULES_DIR, pack.file)
    if (!fs.existsSync(src)) {
      throw new Error(`규칙 원본을 찾을 수 없습니다: rules/${pack.file} — 팩 등록과 파일이 일치하는지 확인하세요.`)
    }
    const dest = path.join(destDir, pack.file)
    const exists = fs.existsSync(dest)

    if (exists && !force) return { pack, dest, status: 'skipped' }
    if (!dryRun) {
      fs.copyFileSync(src, dest)
      manifest.rules[pack.file] = hashFile(dest)
    }
    return { pack, dest, status: exists ? 'overwritten' : 'created' }
  })
}
