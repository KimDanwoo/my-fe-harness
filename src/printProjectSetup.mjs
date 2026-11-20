import { PACKAGE_MANAGERS } from './packageManager.mjs'

const FILE_WIDTH = 34
const INDENT = '      '

const ESLINT_LINES = {
  created: ({ file }) => `  ✔ ${file.padEnd(FILE_WIDTH)} 생성`,
  overwritten: ({ file }) => `  ↻ ${file.padEnd(FILE_WIDTH)} 덮어씀`,
  kept: ({ file, usesHarness }) => `  ↷ ${file.padEnd(FILE_WIDTH)} 유지(이미 존재)${usesHarness ? ' — my-fe-harness/eslint 사용 중' : ''}`,
  legacy: ({ file }) => `  ✖ ${file.padEnd(FILE_WIDTH)} 옛 설정 형식(eslintrc) — ESLint 9 flat config로 옮긴 뒤 다시 실행하세요`,
  outdated: () => `  ✖ ${'ESLint'.padEnd(FILE_WIDTH)} 8 이하 — ESLint 9 이상으로 올린 뒤 다시 실행하세요`,
}

const CI_LABELS = { created: '생성', overwritten: '덮어씀', kept: '유지(이미 존재)', covered: '이미 lint를 돌리는 workflow — 새로 만들지 않음' }
const CI_ICONS = { created: '✔', overwritten: '↻', kept: '↷', covered: '↷' }

const indent = (text) => text.trimEnd().split('\n').map((line) => `${INDENT}${line}`).join('\n')

const EXAMPLE_INTROS = {
  kept: [
    '이 설정은 my-fe-harness/eslint를 직접 가져오지 않습니다. 공유 설정 패키지로 이미 쓰고 있으면 그대로 두고,',
    '아니면 아래 예시처럼 합쳐야 편집기·CI가 훅과 같은 규칙을 씁니다.',
  ],
  legacy: ['flat config로 옮긴 뒤 아래 예시를 eslint.config.mjs로 쓰면 편집기·CI가 훅과 같은 규칙을 씁니다.'],
  outdated: ['ESLint 9 이상으로 올린 뒤 아래 예시를 eslint.config.mjs로 쓰면 편집기·CI가 훅과 같은 규칙을 씁니다.'],
}

function printEslint(eslint) {
  console.log(ESLINT_LINES[eslint.status](eslint))
  const shouldShowExample = !eslint.usesHarness
  if (!shouldShowExample) return
  console.log(`\n${EXAMPLE_INTROS[eslint.status].map((line) => `    ${line}`).join('\n')}\n`)
  console.log(`${indent(eslint.content)}\n`)
}

function describeAdditions(additions) {
  const parts = Object.entries(additions)
    .filter(([, entries]) => Object.keys(entries).length > 0)
    .map(([section, entries]) => `${section}: ${Object.keys(entries).join(', ')}`)
  return parts.join(' · ')
}

function printPackage(additions) {
  const description = describeAdditions(additions)
  if (!description) console.log(`  ↷ ${'package.json'.padEnd(FILE_WIDTH)} 추가할 항목 없음`)
  else console.log(`  ✔ ${'package.json'.padEnd(FILE_WIDTH)} ${description}`)
}

const INSTALL_LINES = {
  installed: (manager) => `  ✔ ${'의존성 설치'.padEnd(FILE_WIDTH)} ${manager} 설치 완료`,
  failed: (manager) => `  ✖ ${'의존성 설치'.padEnd(FILE_WIDTH)} 실패 — ${manager}로 직접 설치하세요`,
  skipped: (manager) => `  ⚠ ${'의존성 설치'.padEnd(FILE_WIDTH)} 건너뜀 — 직접 실행하세요: ${manager} (안 하면 CI의 lockfile 고정 설치가 실패합니다)`,
}

function printInstall(installStatus, packageManager) {
  const line = INSTALL_LINES[installStatus]
  if (line) console.log(line(PACKAGE_MANAGERS[packageManager].update.join(' ')))
}

const SKIPPED_MESSAGES = {
  global: '  전역 설치라 프로젝트 lint·CI 설정은 건너뜁니다.',
  'no-package': '  package.json이 없어 프로젝트 lint·CI 설정은 건너뜁니다.',
}

export function printProjectSetup(result, { dryRun }) {
  console.log(`\n프로젝트 lint·CI 설정${dryRun ? '  [dry-run]' : ''}\n`)
  const skipped = SKIPPED_MESSAGES[result.status]
  if (skipped) {
    console.log(skipped)
    return
  }
  printEslint(result.eslint)
  printPackage(result.additions)
  printInstall(result.installStatus, result.packageManager)
  console.log(`  ${CI_ICONS[result.ci.status]} ${result.ci.file.padEnd(FILE_WIDTH)} ${CI_LABELS[result.ci.status]}`)
  if (!result.ci.isLocked) console.log('    lockfile이 없어 CI가 lockfile 고정·캐시 없이 설치합니다. 설치로 생긴 lockfile을 커밋하고 workflow의 설치 명령을 고정 설치로 바꾸세요.')
  if (result.eslint.usesHarness) console.log('\n  → 훅(Claude가 고친 파일)·편집기·lint 스크립트·CI가 같은 하네스 규칙으로 검사합니다.')
}

const FSD_CHECK_PROBLEMS = {
  'no-source': '  검사할 소스가 없습니다 (src/ 아래 코드 파일 없음).',
  'no-eslint': '  ✖ ESLint가 없습니다 — `my-fe-harness init`으로 eslint.config.mjs·의존성을 깔거나 ESLint를 설치하세요.',
  'no-fsd-rules': '  ✖ ESLint 설정에 fsd 규칙이 없습니다 — eslint.config에 my-fe-harness/eslint의 fsd()를 넣으세요(README의 "FSD 구조 잠금").',
}

const FSD_CHECK_DETAIL_TITLES = {
  unreadable: '  ✖ ESLint가 읽지 못한 파일이 있어 fsd 규칙을 확인하지 못했습니다(문법 오류 등):',
  'eslint-failed': '  ✖ ESLint 실행 실패',
}

function printFsdProblem(result) {
  const message = FSD_CHECK_PROBLEMS[result.status] ?? `${FSD_CHECK_DETAIL_TITLES[result.status]}\n${indent(result.detail || '(출력 없음)')}`
  console.log(message)
  const isFailure = result.status !== 'no-source'
  if (isFailure) process.exitCode = 1
}

export function printFsdCheck(result) {
  console.log(`\n구조 점검 [fsd] — 프로젝트 ESLint의 fsd 규칙${result.status === 'ok' ? `, 파일 ${result.files}개` : ''}\n`)
  if (result.status !== 'ok') return printFsdProblem(result)
  if (result.violations.length === 0) return console.log('  ✔ 의존 방향 위반 없음')
  for (const { file, line, rule, message } of result.violations) {
    console.log(`  ✖ ${file}:${line}`)
    console.log(`      ${rule}  —  ${message}`)
  }
  console.log(`\n  위반 ${result.violations.length}건 — .claude/rules/fsd.md 의 의존 방향 규칙을 보세요.`)
  process.exitCode = 1
}
