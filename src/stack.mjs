import fs from 'node:fs'
import path from 'node:path'
import { detectStack, isStackEmpty } from './detect.mjs'
import { hashFile } from './manifest.mjs'

export const STACK_FILE = 'rules/_stack.md'

// 설치 시 package.json 스택을 감지해 .claude/rules/_stack.md 에 기록한다(매니페스트 쓰기는 호출자가 일괄).
// Claude가 "이 프로젝트 스택과 맞지 않는 규칙은 무시"하도록 돕는 스탬프.
// 프로젝트 스코프 전용 — 전역(~/.claude)은 단일 스택이 없으므로 건너뛴다.
// 감지된 스택이 전혀 없으면(비-FE/비-Node) 항상-로드되는 무의미한 파일을 만들지 않는다.
export function writeStackStamp({ base, targetDir, dryRun = false, global = false }, manifest) {
  if (global || dryRun) return null

  const stack = detectStack(targetDir)
  if (isStackEmpty(stack)) return null

  const claudeDir = path.join(base, '.claude')
  // 지금까지 설치된 규칙 전체를 반영(여러 install 호출 누적) — 파일명에서 팩 id 복원.
  const installedPackIds = Object.keys(manifest.rules).map((file) => file.replace(/\.md$/, ''))

  const dest = path.join(claudeDir, STACK_FILE)
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.writeFileSync(dest, renderStamp(stack, installedPackIds))

  manifest.files[STACK_FILE] = hashFile(dest)
  return { dest, stack }
}

function renderStamp(stack, installedPackIds) {
  const frameworks = stack.frameworks.length > 0 ? stack.frameworks.join(', ') : '감지 안 됨'
  const flags = [stack.nextjs && 'Next.js', stack.monorepo && '모노레포'].filter(Boolean)
  const flagLine = flags.length > 0 ? ` (${flags.join(', ')})` : ''
  const packs = installedPackIds.length > 0 ? installedPackIds.join(', ') : '없음'

  return `# 감지된 스택 — my-fe-harness 기록

- 프레임워크: ${frameworks}${flagLine}
- 설치된 규칙 팩: ${packs}

my-fe-harness가 \`package.json\`을 감지해 자동 생성한 스탬프다(수동 편집 대상 아님).
이 스택과 맞지 않는 규칙(예: 다른 프레임워크 전용 규칙)은 적용하지 말 것.
`
}
