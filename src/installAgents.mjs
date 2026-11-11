import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { isInside, resolveClaudeDir, sha256, writeFileAtomic } from './manifest.mjs'
import { PACKS } from './packs.mjs'
import { STACK_FILE } from './stack.mjs'

// Codex 등 AGENTS.md를 읽는 에이전트용 출력.
// .claude/rules/에 설치된 규칙(매니페스트 기록분)을 디스크에서 읽어 AGENTS.md의 마커 블록 하나로 렌더한다.
// Claude가 보는 규칙과 같은 내용을 보게 하고, 마커 밖 사용자 내용은 건드리지 않는다.
export const AGENTS_FILE = 'AGENTS.md'
const START = '<!-- my-fe-harness:start -->'
const END = '<!-- my-fe-harness:end -->'
const SIZE_WARN_BYTES = 24 * 1024
const FRONTMATTER = /^---\n([\s\S]*?)\n---\n/
const LIST_ENTRY = /^\s*-\s*["']?([^"'\n]+?)["']?\s*$/gm

// 프로젝트는 <target>/AGENTS.md, 전역은 Codex 홈(CODEX_HOME 또는 ~/.codex)의 AGENTS.md.
// 전역은 Codex 홈이 이미 있을 때만 — 설치되지 않은 도구의 설정 디렉토리를 만들지 않는다.
export function resolveAgentsPath({ targetDir, global = false }) {
  if (!global) return path.join(targetDir, AGENTS_FILE)
  const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), '.codex')
  return fs.existsSync(codexHome) ? path.join(codexHome, AGENTS_FILE) : null
}

// 블록을 만들거나 갱신한다. 매니페스트 쓰기는 호출자가 일괄 수행한다.
export function installAgents(options, manifest) {
  const file = resolveAgentsPath(options)
  if (!file) return { file, status: 'no-codex' }
  if (options.dryRun) return { file, status: 'dry-run' }

  const sections = collectSections(options, manifest)
  if (sections.length === 0) return { file, status: 'empty' }

  const block = renderBlock(sections)
  const exists = fs.existsSync(file)
  const text = exists ? fs.readFileSync(file, 'utf8') : ''
  const found = findBlock(text)
  if (found?.malformed) return { file, status: 'malformed' }

  const outcome = found ? replaceBlock(text, found, block, manifest, options.force) : appendBlock(text, block)
  if (outcome.status === 'kept-modified') return { file, status: outcome.status }

  // 내용이 같아도 기록은 채택한다(매니페스트 유실 복구). 생성 여부는 같은 경로의 기록으로만 이어받는다.
  const wasCreatedHere = manifest.agents?.file === file && manifest.agents.created
  manifest.agents = { file, sha: sha256(block), created: wasCreatedHere || !exists }
  if (outcome.content !== undefined) writeFileAtomic(file, outcome.content)

  const bytes = Buffer.byteLength(outcome.content ?? text)
  return { file, status: outcome.status, bytes, isLarge: bytes > SIZE_WARN_BYTES, hasOverride: hasOverride(file) }
}

// 우리가 쓴 그대로인 블록만 제거한다. 마커 밖 내용은 블록에 붙은 줄바꿈 외에 건드리지 않는다.
// 파일 삭제는 이 경로에서 우리가 만든 파일이고 남은 게 공백뿐일 때만.
export function removeAgents(options, manifest, dryRun) {
  const file = resolveAgentsPath(options)
  const state = blockState(file, manifest)
  if (state.status !== 'intact') return { file, status: state.status }
  if (dryRun) return { file, status: 'removed' }

  const { text, found } = state
  const before = text.slice(0, found.start)
  const after = text.slice(found.end)
  const remaining = (before.endsWith('\n\n') ? before.slice(0, -1) : before) + after.replace(/^\r?\n/, '')
  const isOurFile = manifest.agents.file === file && manifest.agents.created
  if (isOurFile && remaining.trim() === '') fs.unlinkSync(file)
  else writeFileAtomic(file, remaining)
  return { file, status: 'removed' }
}

// Codex는 같은 디렉토리의 AGENTS.override.md를 AGENTS.md보다 우선한다 — 블록이 무시될 수 있음을 알린다.
function hasOverride(file) {
  return fs.existsSync(path.join(path.dirname(file), 'AGENTS.override.md'))
}

// status용: intact(우리가 쓴 그대로) / modified / missing / malformed. 기록이 없으면 null.
export function agentsStatus(options, manifest) {
  if (!manifest.agents) return null
  const file = resolveAgentsPath(options)
  return { file, status: blockState(file, manifest).status }
}

function blockState(file, manifest) {
  if (!file || !fs.existsSync(file)) return { status: 'missing' }
  const text = fs.readFileSync(file, 'utf8')
  const found = findBlock(text)
  if (!found) return { status: 'missing' }
  if (found.malformed) return { status: 'malformed' }
  if (sha256(normalize(found.block)) !== manifest.agents?.sha) return { status: 'modified' }
  return { status: 'intact', text, found }
}

function replaceBlock(text, found, block, manifest, force) {
  const current = normalize(found.block)
  if (current === block) return { status: 'up-to-date' }
  const isOurs = sha256(current) === manifest.agents?.sha
  if (!isOurs && !force) return { status: 'kept-modified' }
  return { status: 'updated', content: text.slice(0, found.start) + block + text.slice(found.end) }
}

// 기존 내용은 그대로 두고 빈 줄 하나로 구분해 끝에 붙인다(removeAgents가 같은 구분자를 되돌린다).
function appendBlock(text, block) {
  const separator = text === '' ? '' : text.endsWith('\n') ? '\n' : '\n\n'
  return { status: 'created', content: `${text}${separator}${block}\n` }
}

// 마커가 정확히 한 쌍일 때만 블록으로 인정한다. 짝이 안 맞거나 중복이면 건드리지 않는다.
function findBlock(text) {
  const start = text.indexOf(START)
  const endAt = text.indexOf(END)
  if (start === -1 && endAt === -1) return null
  const isPaired = start !== -1 && endAt > start
  const isUnique = text.indexOf(START, start + 1) === -1 && text.indexOf(END, endAt + 1) === -1
  if (!isPaired || !isUnique) return { malformed: true }
  const end = endAt + END.length
  return { start, end, block: text.slice(start, end) }
}

// 규칙 팩(정의 순서: safety 먼저) → 스택 스탬프. 디스크에 없는 항목은 건너뛴다.
// 보안: 변조된 매니페스트 키가 rules 밖 파일을 끌어오지 못하게 경로를 검증한다.
function collectSections(options, manifest) {
  const claudeDir = resolveClaudeDir(options)
  const rulesDir = path.join(claudeDir, 'rules')
  const ruleFiles = Object.keys(manifest.rules)
    .sort((a, b) => packOrder(a) - packOrder(b))
    .map((file) => path.join(rulesDir, file))
  const stampFiles = STACK_FILE in manifest.files ? [path.join(claudeDir, STACK_FILE)] : []

  return [...ruleFiles, ...stampFiles]
    .filter((file) => isInside(rulesDir, file) && fs.existsSync(file))
    .map((file) => normalize(fs.readFileSync(file, 'utf8')))
    .filter((content) => !content.includes(START) && !content.includes(END))
    .map(toSection)
}

function packOrder(file) {
  const index = PACKS.findIndex((pack) => pack.file === file)
  return index === -1 ? PACKS.length : index
}

// frontmatter의 paths는 AGENTS.md에서 동작하지 않으므로 제목 아래 '적용 대상' 한 줄로 옮긴다.
function toSection(content) {
  const match = content.match(FRONTMATTER)
  const body = (match ? content.slice(match[0].length) : content).trim()
  const paths = match ? [...match[1].matchAll(LIST_ENTRY)].map((entry) => entry[1]) : []
  if (paths.length === 0) return body

  const scope = `> 적용 대상: ${paths.map((p) => `\`${p}\``).join(', ')}`
  const [title, ...rest] = body.split('\n')
  return title.startsWith('# ') ? [title, '', scope, ...rest].join('\n') : `${scope}\n\n${body}`
}

function renderBlock(sections) {
  return `${START}
<!-- 자동 생성 영역(my-fe-harness). 규칙은 .claude/rules/ 원본을 고친 뒤 \`my-fe-harness update\`로 반영한다. 이 블록을 직접 고치면 update·uninstall이 보존한다. -->

# 프론트엔드 규칙 (my-fe-harness)

'적용 대상'이 표시된 규칙은 그 파일을 만들거나 고칠 때 따른다. 표시가 없는 규칙은 항상 적용한다. 규칙끼리 충돌하면 안전장치가 우선한다.

${sections.join('\n\n---\n\n')}

${END}`
}

function normalize(text) {
  return text.replace(/\r\n/g, '\n')
}
