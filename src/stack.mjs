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

  const dest = path.join(base, '.claude', STACK_FILE)
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.writeFileSync(dest, renderStamp(stack, installedPackIds(manifest)))

  manifest.files[STACK_FILE] = hashFile(dest)
  return { dest, stack }
}

// 스탬프는 설치 시점의 스냅샷이다 — 이후 의존성·구조·alias가 바뀌면 조용히 낡는다.
// 낡은 사실은 사실이 없는 것보다 나쁘므로(에이전트가 없는 라이브러리를 쓴다) status가 이걸 알린다.
// 새 상태를 저장하지 않는다 — 지금 프로젝트로 다시 렌더해 파일과 비교할 뿐이다.
export function stampState({ base, targetDir, global = false }, manifest) {
  if (global) return null

  const stack = detectStack(targetDir)
  if (isStackEmpty(stack)) return null

  const dest = path.join(base, '.claude', STACK_FILE)
  if (!fs.existsSync(dest)) return 'stale'
  return fs.readFileSync(dest, 'utf8') === renderStamp(stack, installedPackIds(manifest)) ? 'current' : 'stale'
}

// 지금까지 설치된 규칙 전체를 반영(여러 install 호출 누적) — 파일명에서 팩 id 복원.
function installedPackIds(manifest) {
  return Object.keys(manifest.rules).map((file) => file.replace(/\.md$/, ''))
}

function renderStamp(stack, installedPackIds) {
  const frameworks = stack.frameworks.length > 0 ? stack.frameworks.join(', ') : '감지 안 됨'
  const flags = [stack.nextjs && 'Next.js', stack.monorepo && '모노레포'].filter(Boolean)
  const flagLine = flags.length > 0 ? ` (${flags.join(', ')})` : ''
  const packs = installedPackIds.length > 0 ? installedPackIds.join(', ') : '없음'

  return `# 감지된 스택·컨벤션 — my-fe-harness 기록

- 프레임워크: ${frameworks}${flagLine}
- 설치된 규칙 팩: ${packs}
${renderConventions(stack.conventions)}
my-fe-harness가 \`package.json\`·\`tsconfig\`·소스 디렉토리를 감지해 자동 생성한 스탬프다(수동 편집 대상 아님).
이 스택과 맞지 않는 규칙(예: 다른 프레임워크 전용 규칙)은 적용하지 말 것.
`
}

// 항상 로드되는 파일이라 감지된 항목만 출력한다. 사실만 적고 판정하지 않는다.
function renderConventions({ libs, sourceDirs, aliases }) {
  const lines = libs.map(([label, found]) => `- ${label}: ${found.join(', ')}`)

  if (sourceDirs) {
    const dirs = sourceDirs.dirs.join(', ') + (sourceDirs.truncated ? ', …' : '')
    lines.push(`- \`${sourceDirs.root}/\` 최상위: ${dirs}`)
  }
  if (aliases.length > 0) lines.push(`- import alias: ${aliases.join(', ')}`)
  if (lines.length === 0) return ''

  const reuse = libs.length > 0 ? '같은 역할의 라이브러리를 새로 추가하지 말고 위에 이미 있는 것을 쓴다.' : ''
  const placement = sourceDirs ? ' 새 파일은 위 구조 안에 둔다 — 최상위에 새 디렉토리를 임의로 만들지 않는다.' : ''
  const importPath = aliases.length > 0 ? ' 크로스 레이어 import는 상대경로 대신 위 alias를 쓴다.' : ''

  return `
## 이 프로젝트가 실제로 쓰는 것

${lines.join('\n')}

${reuse}${placement}${importPath}
목록이 실제와 다르면 스탬프가 낡은 것이다 — \`my-fe-harness update\` 로 갱신하고, 그전까지는 \`package.json\`을 믿는다.
`
}
