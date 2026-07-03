import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

// 패키지 버전 단일 진실원천 — 모든 곳(bin, 매니페스트 스탬프, status)이 여기서 읽는다.
export const PACKAGE_VERSION = JSON.parse(
  fs.readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'),
).version
