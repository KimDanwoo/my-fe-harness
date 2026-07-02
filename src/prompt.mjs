import readline from 'node:readline/promises'
import { PACKS, resolvePacks } from './packs.mjs'
import { STRUCTURES, resolveStructure } from './structures.mjs'

export async function promptPackSelection(defaultTokens = null) {
  requireInteractive()
  printPackMenu()
  const rec = defaultTokens?.length ? defaultTokens.join(' ') : 'core react'
  const onEmpty = defaultTokens?.length ? () => resolvePacks(defaultTokens) : () => null
  const hint = defaultTokens?.length
    ? `\n설치할 팩 (엔터 = 권장 "${rec}" 설치 · all = 전체 · 번호·이름 가능 · Ctrl-C 취소): `
    : `\n설치할 팩 (권장: core react · all = 전체 · 번호·이름 가능 · 엔터 = 취소): `
  return askUntilValid(hint, (answer) => resolvePacks(packTokensFrom(answer)), onEmpty)
}

export async function promptStructureSelection() {
  requireInteractive()
  printStructureMenu()
  return askUntilValid(
    '\n적용할 구조 (번호·이름, 엔터 = 건너뜀): ',
    (answer) => resolveStructure(structureTokenFrom(answer)),
  )
}

export async function promptYesNo(question) {
  requireInteractive()
  const rl = createRl()
  try {
    const answer = (await rl.question(`${question} (y/N): `)).trim().toLowerCase()
    return answer === 'y' || answer === 'yes'
  } finally {
    rl.close()
  }
}

async function askUntilValid(question, parse, onEmpty = () => null) {
  requireInteractive()
  const rl = createRl()
  try {
    while (true) {
      const answer = (await rl.question(question)).trim()
      if (!answer) return onEmpty()
      try {
        return parse(answer)
      } catch (error) {
        console.error(`  ✖ ${error.message}`)
      }
    }
  } finally {
    rl.close()
  }
}

function requireInteractive() {
  if (process.stdin.isTTY) return
  throw new Error(
    '대화형 입력이 불가한 환경입니다(비-TTY). 팩·구조를 인자로 지정하세요.\n' +
      '  예: my-fe-harness add ts react commit --structure feature-based',
  )
}

function createRl() {
  return readline.createInterface({ input: process.stdin, output: process.stdout })
}

function printPackMenu() {
  console.log('\n사용 가능한 규칙 팩:\n')
  PACKS.forEach((pack, index) => {
    const kind = pack.kind === 'structure' ? ' [폴더 구조]' : ''
    console.log(`  ${index + 1}. ${pack.id.padEnd(14)} ${pack.title}${kind} — ${pack.description}`)
  })
}

function printStructureMenu() {
  console.log('\n폴더 구조 스캐폴드 (src/ 아래 레이어 폴더 + 규칙 설치):\n')
  STRUCTURES.forEach((structure, index) => {
    console.log(`  ${index + 1}. ${structure.id.padEnd(14)} ${structure.title} — ${structure.description}`)
  })
}

function packTokensFrom(answer) {
  return answer
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((token) => {
      const number = Number(token)
      const isIndex = Number.isInteger(number) && number >= 1 && number <= PACKS.length
      return isIndex ? PACKS[number - 1].id : token
    })
}

function structureTokenFrom(answer) {
  const token = answer.split(/[\s,]+/).filter(Boolean)[0] ?? answer
  const number = Number(token)
  const isIndex = Number.isInteger(number) && number >= 1 && number <= STRUCTURES.length
  return isIndex ? STRUCTURES[number - 1].id : token
}
