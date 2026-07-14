import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { PACKS, rulePacks, resolvePacks, withSafety } from './packs.mjs'
import { STRUCTURES, resolveStructure } from './structures.mjs'
import { installRules, rulesBase, ruleSourcePath } from './installRules.mjs'
import { installHook } from './installHook.mjs'
import { writeStackStamp } from './stack.mjs'
import { uninstall } from './uninstall.mjs'
import { scaffoldStructure } from './scaffold.mjs'
import { detectFrameworks } from './detect.mjs'
import { hashFile, readManifest, writeManifest, resolveClaudeDir, manifestPath } from './manifest.mjs'
import { PACKAGE_VERSION } from './version.mjs'
import { promptPackSelection, promptStructureSelection } from './prompt.mjs'

// 명령당 매니페스트를 한 번 읽어 넘기고, 끝에 한 번만 쓴다(read-modify-write 중복 제거).
// 쓰기 시 현재 패키지 버전을 기록해 이후 status/update가 업그레이드 여부를 판단한다.
function withManifest(options, fn) {
  const claudeDir = resolveClaudeDir(options)
  const manifest = readManifest(claudeDir)
  const result = fn(manifest)
  if (!options.dryRun) {
    manifest.installedBy = PACKAGE_VERSION
    writeManifest(claudeDir, manifest)
  }
  return result
}

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
  const { scriptDest, settingsPath, scriptStatus, hookStatus } = withManifest(options, (manifest) =>
    installHook(options, manifest),
  )
  const base = options.global ? os.homedir() : options.targetDir
  const rel = (p) => (options.global ? `~/${path.relative(base, p)}` : path.relative(base, p))
  const dry = options.dryRun ? '  [dry-run]' : ''
  console.log(`\n안전장치 훅(강제 계층) 설치${options.global ? ' [전역]' : ''}${dry}\n`)
  console.log(`  ${hookStatus === 'added' ? '✔' : '↷'} ${rel(settingsPath)}  ${hookStatus === 'added' ? 'PreToolUse 훅 추가' : '이미 설정됨'}`)
  console.log(`  ${scriptStatus === 'created' || scriptStatus === 'overwritten' ? '✔' : '↷'} ${rel(scriptDest)}  ${label(scriptStatus)}`)
  console.log(`\n  → 하드코딩 비밀·비밀 파일 커밋·치명적 삭제를 도구 실행 전에 차단한다${options.global ? '(모든 프로젝트)' : ''}. 새 세션부터 적용.`)
}

function install(packs, options) {
  withManifest(options, (manifest) => {
    const results = installRules(withSafety(packs), options, manifest)
    const dest = path.join(rulesBase(options), '.claude/rules/')
    console.log(`\n규칙 설치${options.global ? ' [전역]' : ''} → ${dest}${options.dryRun ? '  [dry-run]' : ''}\n`)
    for (const { pack, status } of results) {
      console.log(`  ${icon(status)} ${pack.file.padEnd(17)} ${label(status)}`)
    }
    const skipped = results.filter((result) => result.status === 'skipped').length
    if (skipped > 0) {
      console.log(`\n  이미 존재하는 파일 ${skipped}개를 건너뛰었습니다. 덮어쓰려면 --force`)
    }

    const stamp = writeStackStamp({ ...options, base: rulesBase(options) }, manifest)
    if (stamp) {
      const fw = stamp.stack.frameworks.length > 0 ? stamp.stack.frameworks.join(', ') : '없음'
      console.log(`\n  스택 스탬프 기록 → .claude/rules/_stack.md  (감지: ${fw})`)
    }
  })
}

export function runUninstall(options) {
  const result = uninstall(options)
  const dry = options.dryRun ? '  [dry-run]' : ''
  console.log(`\n걷어내기${options.global ? ' [전역]' : ''}${dry} — 우리가 쓴 그대로인 파일만 제거\n`)

  if (result.tracked === 0) {
    console.log('  설치 매니페스트가 없습니다 — 제거할 항목이 없거나 이 도구로 설치하지 않았습니다.')
    return
  }

  for (const { file, status } of [...result.rules, ...result.files]) {
    console.log(`  ${uninstallIcon(status)} ${file.padEnd(20)} ${uninstallLabel(status)}`)
  }
  if (result.hook) {
    console.log(`  ${uninstallIcon(result.hook.scriptStatus)} ${'safety-guard.mjs'.padEnd(20)} ${uninstallLabel(result.hook.scriptStatus)}`)
    console.log(`  ${'settings.json PreToolUse:'.padEnd(22)} ${uninstallLabel(result.hook.settingsStatus)}`)
  }

  const modified = [...result.rules, ...result.files].filter((r) => r.status === 'kept-modified')
  if (modified.length > 0) {
    console.log(`\n  ⚠ 수정된 파일 ${modified.length}개는 보존했습니다(직접 편집한 내용). 삭제하려면 수동으로 제거하세요.`)
  }
  if (result.manifestRemoved) console.log('\n  매니페스트 정리 완료.')
}

export function runStatus(options) {
  const claudeDir = resolveClaudeDir(options)
  const manifest = readManifest(claudeDir)
  const entries = [
    ...Object.entries(manifest.rules).map(([file, sha]) => ({ file, sha, dir: path.join(claudeDir, 'rules') })),
    ...Object.entries(manifest.files).map(([file, sha]) => ({ file, sha, dir: claudeDir })),
  ]

  console.log(`\n설치 상태${options.global ? ' [전역]' : ''} — ${path.join(claudeDir, 'rules')}\n`)
  if (entries.length === 0 && !manifest.hook) {
    console.log('  이 스코프에 my-fe-harness 설치 기록이 없습니다.')
    return
  }

  const installedBy = manifest.installedBy ?? '알 수 없음(구버전 매니페스트)'
  console.log(`  설치 버전: ${installedBy}  ·  현재 패키지: ${PACKAGE_VERSION}`)
  if (manifest.installedBy && manifest.installedBy !== PACKAGE_VERSION) {
    console.log('  → 패키지가 갱신됨. update 로 안 건드린 규칙만 최신화할 수 있습니다.\n')
  } else {
    console.log('')
  }

  for (const { file, sha, dir } of entries) {
    console.log(`  ${statusIcon(diskStatus(path.join(dir, file), sha))} ${file.padEnd(20)} ${statusLabel(diskStatus(path.join(dir, file), sha))}`)
  }
  if (manifest.hook) {
    const s = diskStatus(path.join(resolveClaudeDir(options), manifest.hook.rel.replace(/^\.claude\//, '')), manifest.hook.scriptSha)
    console.log(`  ${statusIcon(s)} ${'safety-guard.mjs'.padEnd(20)} ${statusLabel(s)}`)
  }
  const modified = entries.filter(({ file, sha, dir }) => diskStatus(path.join(dir, file), sha) === 'modified')
  if (modified.length > 0) console.log(`\n  ⚠ 수정된 파일 ${modified.length}개 — uninstall/update 시 보존됩니다.`)
}

export function runUpdate(options) {
  // 설치 기록이 없으면 아무것도 하지 않는다(빈 매니페스트를 새로 만드는 부작용 방지).
  if (!fs.existsSync(manifestPath(resolveClaudeDir(options)))) {
    console.log(`\n업데이트${options.global ? ' [전역]' : ''} — 설치 기록이 없습니다. 먼저 add 하세요.`)
    return
  }
  withManifest(options, (manifest) => {
    const claudeDir = resolveClaudeDir(options)
    const rulesDir = path.join(claudeDir, 'rules')
    const dry = options.dryRun ? '  [dry-run]' : ''
    console.log(`\n업데이트${options.global ? ' [전역]' : ''}${dry} — 사용자가 안 건드린 규칙만 최신본으로\n`)

    const files = Object.keys(manifest.rules)
    if (files.length === 0) {
      console.log('  설치 기록이 없습니다 — 먼저 add 하세요.')
      return
    }

    for (const file of files) {
      const dest = path.join(rulesDir, file)
      const src = ruleSourcePath(file)
      const recorded = manifest.rules[file]
      const outcome = updateOne({ dest, src, recorded, dryRun: options.dryRun })
      if (outcome.status === 'updated' && !options.dryRun) manifest.rules[file] = outcome.newSha
      if (outcome.status === 'missing') delete manifest.rules[file]
      console.log(`  ${updateIcon(outcome.status)} ${file.padEnd(20)} ${updateLabel(outcome.status)}`)
    }

    const stamp = writeStackStamp({ ...options, base: rulesBase(options) }, manifest)
    if (stamp) console.log('\n  스택 스탬프 갱신 → .claude/rules/_stack.md')
    console.log('\n  수정한 규칙은 보존됩니다 — 최신 원본을 보려면 해당 파일에 --force로 add 하세요.')
  })
}

// update 대상 한 파일의 판정: 없음 / 수정됨(보존) / 이미 최신 / 갱신.
function updateOne({ dest, src, recorded, dryRun }) {
  if (!fs.existsSync(dest)) return { status: 'missing' }
  if (!fs.existsSync(src)) return { status: 'orphan' }
  if (hashFile(dest) !== recorded) return { status: 'kept-modified' }
  const srcSha = hashFile(src)
  if (srcSha === recorded) return { status: 'up-to-date' }
  if (!dryRun) fs.copyFileSync(src, dest)
  return { status: 'updated', newSha: srcSha }
}

// 파일이 매니페스트 해시와 일치하는지: 우리 것 그대로 / 수정됨 / 없음.
function diskStatus(file, recordedSha) {
  if (!fs.existsSync(file)) return 'missing'
  return hashFile(file) === recordedSha ? 'intact' : 'modified'
}

function statusIcon(status) {
  return { intact: '✔', modified: '⚠', missing: '✖' }[status] ?? '↷'
}

function statusLabel(status) {
  return { intact: '설치됨(원본 그대로)', modified: '수정됨', missing: '없음(삭제됨)' }[status] ?? status
}

function updateIcon(status) {
  return { updated: '↻', 'kept-modified': '⚠', 'up-to-date': '↷', missing: '✖', orphan: '✖' }[status] ?? '↷'
}

function updateLabel(status) {
  return {
    updated: '갱신',
    'kept-modified': '보존(수정됨)',
    'up-to-date': '이미 최신',
    missing: '없음(기록에서 제거)',
    orphan: '원본 없음(구버전 팩)',
  }[status] ?? status
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

function uninstallIcon(status) {
  return { removed: '✔', 'kept-modified': '⚠', missing: '↷', 'outside-skipped': '⛔', 'not-present': '↷', 'parse-error': '✖' }[status] ?? '↷'
}

function uninstallLabel(status) {
  return {
    removed: '제거',
    'kept-modified': '보존(수정됨)',
    missing: '없음(이미 삭제)',
    'outside-skipped': '건너뜀(경로 밖)',
    'not-present': '항목 없음',
    'parse-error': '설정 파싱 실패 — 수동 확인',
  }[status] ?? status
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
  uninstall             설치한 규칙·훅 걷어내기 (별칭: unsync)
                        매니페스트 해시로 검증 — 우리가 쓴 그대로인 파일만 삭제,
                        직접 수정·생성한 파일은 보존
  status                이 프로젝트에 설치된 규칙·훅과 수정 여부 표시
  update                사용자가 안 건드린 규칙만 최신 원본으로 갱신(수정본 보존)
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
