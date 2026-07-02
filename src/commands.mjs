import os from 'node:os'
import path from 'node:path'
import { PACKS, rulePacks, resolvePacks, withSafety } from './packs.mjs'
import { STRUCTURES, resolveStructure } from './structures.mjs'
import { installRules, rulesBase } from './installRules.mjs'
import { installHook } from './installHook.mjs'
import { scaffoldStructure } from './scaffold.mjs'
import { detectFrameworks } from './detect.mjs'
import { promptPackSelection, promptStructureSelection } from './prompt.mjs'

export async function runInit(options) {
  const detected = detectFrameworks(options.targetDir)
  if (detected.length > 0) {
    console.log(`\n감지된 프레임워크: ${detected.join(', ')} → 권장 "core ${detected.join(' ')}"`)
  }
  const packs = options.all ? rulePacks() : await promptPackSelection(['core', ...detected])
  if (!packs || packs.length === 0) {
    console.log('취소되었습니다.')
    return
  }
  install(packs, options)

  const structure = await pickStructure(options)
  if (structure) applyStructure(structure, options)

  applyGuard(options)
}

export function runAdd(names, options) {
  const packs = options.all ? rulePacks() : resolvePacks(names)
  if (packs.length === 0) {
    throw new Error('설치할 팩을 지정하세요. 권장: my-fe-harness add core react (린) · 전체: add all')
  }
  install(packs, options)

  const structureId = options.structure ?? (options.fsd ? 'fsd' : null)
  if (structureId) applyStructure(resolveStructure(structureId), options)
}

export async function runScaffold(names, options) {
  const structureId = names[0] ?? options.structure ?? (options.fsd ? 'fsd' : null)
  const structure = structureId ? resolveStructure(structureId) : await promptStructureSelection()
  if (!structure) {
    console.log('취소되었습니다.')
    return
  }
  applyStructure(structure, options)
}

export function runGuard(options) {
  applyGuard(options)
}

export function printList() {
  console.log('\n규칙 팩:\n')
  for (const pack of rulePacks()) printPack(pack)
  console.log('폴더 구조 팩 (규칙 + src/ 스캐폴드, 하나만 선택):\n')
  for (const pack of PACKS.filter((p) => p.kind === 'structure')) printPack(pack)
  console.log('설치: my-fe-harness add <팩...> · 구조 적용: my-fe-harness scaffold <구조>\n')
}

export function printHelp() {
  console.log(HELP)
}

async function pickStructure(options) {
  if (options.structure) return resolveStructure(options.structure)
  if (options.fsd) return resolveStructure('fsd')
  if (options.all) return null
  return promptStructureSelection()
}

function applyStructure(structure, options) {
  // 구조 규칙은 스캐폴드된 src/와 짝이므로 항상 프로젝트 스코프(전역 아님).
  install(resolvePacks([structure.id]), { ...options, global: false })

  const results = scaffoldStructure(structure, options)
  const dest = path.join(options.targetDir, 'src/')
  console.log(`\n${structure.title} 스캐폴드 → ${dest}${options.dryRun ? '  [dry-run]' : ''}\n`)
  for (const { dir, status } of results) {
    console.log(`  ${icon(status)} ${`src/${dir}/`.padEnd(17)} ${label(status)}`)
  }
}

function applyGuard(options) {
  const { scriptDest, settingsPath, scriptStatus, hookStatus } = installHook(options)
  const base = options.global ? os.homedir() : options.targetDir
  const rel = (p) => (options.global ? `~/${path.relative(base, p)}` : path.relative(base, p))
  const dry = options.dryRun ? '  [dry-run]' : ''
  console.log(`\n안전장치 훅(강제 계층) 설치${options.global ? ' [전역]' : ''}${dry}\n`)
  console.log(`  ${hookStatus === 'added' ? '✔' : '↷'} ${rel(settingsPath)}  ${hookStatus === 'added' ? 'PreToolUse 훅 추가' : '이미 설정됨'}`)
  console.log(`  ${scriptStatus === 'created' || scriptStatus === 'overwritten' ? '✔' : '↷'} ${rel(scriptDest)}  ${label(scriptStatus)}`)
  console.log(`\n  → 하드코딩 비밀·비밀 파일 커밋·치명적 삭제를 도구 실행 전에 차단한다${options.global ? '(모든 프로젝트)' : ''}. 새 세션부터 적용.`)
}

function install(packs, options) {
  const results = installRules(withSafety(packs), options)
  const dest = path.join(rulesBase(options), '.claude/rules/')
  console.log(`\n규칙 설치${options.global ? ' [전역]' : ''} → ${dest}${options.dryRun ? '  [dry-run]' : ''}\n`)
  for (const { pack, status } of results) {
    console.log(`  ${icon(status)} ${pack.file.padEnd(17)} ${label(status)}`)
  }
  const skipped = results.filter((result) => result.status === 'skipped').length
  if (skipped > 0) {
    console.log(`\n  이미 존재하는 파일 ${skipped}개를 건너뛰었습니다. 덮어쓰려면 --force`)
  }
}

function printPack(pack) {
  const aliases = pack.aliases.length > 0 ? ` (별칭: ${pack.aliases.join(', ')})` : ''
  console.log(`  ${pack.id.padEnd(14)} ${pack.title}${aliases}`)
  console.log(`                 ${pack.description}\n`)
}

function icon(status) {
  return { created: '✔', overwritten: '↻', skipped: '↷' }[status]
}

function label(status) {
  return { created: '생성', overwritten: '덮어씀', skipped: '건너뜀(이미 존재)', kept: '유지(이미 존재)' }[status]
}

const HELP = `
my-fe-harness — 프론트엔드 컨벤션 하네스

사용법:
  npx my-fe-harness <command> [options]

명령:
  init                  대화형 설치 (규칙 팩 선택 → 폴더 구조 선택)
  add <packs...>        지정한 팩 설치
                        권장(린): add core react  ·  core = safety+typescript+patterns
                        전체(무거움): add all
  scaffold [structure]  폴더 구조 스캐폴드 + 해당 규칙 설치
                        구조: ${STRUCTURES.map((s) => s.id).join(' | ')}
  guard                 안전장치 강제 훅 설치 (.claude/settings.json + hooks/)
                        비밀 하드코딩·비밀 파일 커밋·치명적 삭제를 실행 전 차단
  list                  사용 가능한 팩·구조 목록
  version               버전 출력 (-v, --version)
  help                  이 도움말

옵션:
  --all                 모든 규칙 팩 설치 (구조 팩 제외)
  --structure <id>      적용할 폴더 구조 지정
  --fsd                 --structure fsd 단축
  -t, --target <p>      대상 프로젝트 경로 (기본: 현재 폴더)
  -g, --global          ~/.claude 에 설치 (모든 프로젝트 적용, add·guard)
  --force               기존 파일 덮어쓰기
  --dry-run             실제 쓰기 없이 수행 내용만 출력

규칙은 <target>/.claude/rules/ 에 설치되며 Claude Code가 자동으로 로드한다.
`
