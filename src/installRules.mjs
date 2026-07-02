import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const RULES_DIR = fileURLToPath(new URL('../rules/', import.meta.url))

// 규칙이 설치되는 베이스 경로: 전역이면 ~/.claude, 아니면 프로젝트.
export function rulesBase({ targetDir, global = false }) {
  return global ? os.homedir() : targetDir
}

export function installRules(packs, { targetDir, force = false, dryRun = false, global = false }) {
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
    if (!dryRun) fs.copyFileSync(src, dest)
    return { pack, dest, status: exists ? 'overwritten' : 'created' }
  })
}
