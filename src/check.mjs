import fs from 'node:fs'
import path from 'node:path'
import { STRUCTURES } from './structures.mjs'
import { readAliasMap } from './detect.mjs'
import { readManifest, resolveClaudeDir } from './manifest.mjs'

const CODE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs', '.vue', '.svelte', '.astro'])
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'out', 'coverage', '__snapshots__'])

// ponytail: 정규식 import 스캔 — 주석·문자열 안의 import 문을 위반으로 오인할 수 있다.
// `from '…'` / `import '…'` / `import('…')` / `require('…')` 를 모두 잡는다. 파서를 붙일 만큼 흔한 문제는 아니다.
const IMPORT_RE = /\b(?:from|import|require)\s*\(?\s*['"]([^'"]+)['"]/g

// 규칙은 설치 시점에 주입됐지만, 코드는 그 뒤로 계속 자란다.
// 여기서 재는 건 "하네스가 시킨 의존 방향이 지금 코드에서 지켜지고 있는가" 하나다 — 판정은 결정론적인 것만.
export function checkStructure(options) {
  const manifest = readManifest(resolveClaudeDir(options))
  const structure = STRUCTURES.find((candidate) => candidate.ruleFile in manifest.rules) ?? null
  const srcDir = path.join(options.targetDir, 'src')
  if (!structure || !fs.existsSync(srcDir)) return { structure, files: 0, violations: [] }

  const ranks = new Map(structure.dirs.map((dir) => [dir.name, dir.rank]))
  const aliases = readAliasMap(options.targetDir)
  const violations = []
  let files = 0

  for (const file of walk(srcDir)) {
    files += 1
    const from = locate(toPosix(path.relative(srcDir, file)))
    if (!ranks.has(from.layer)) continue

    for (const { specifier, line } of importsOf(fs.readFileSync(file, 'utf8'))) {
      const targetRel = resolveToSrc(specifier, { fileDir: path.dirname(file), srcDir, aliases, targetDir: options.targetDir })
      if (!targetRel) continue

      const reason = violationFor(from, locate(targetRel), structure, ranks)
      if (reason) violations.push({ file: `src/${from.rel}`, line, specifier, reason })
    }
  }
  return { structure, files, violations }
}

// 위반 판정 — 위중한 순서대로 하나만 보고한다. 레이어 밖 파일은 판단하지 않는다.
function violationFor(from, to, structure, ranks) {
  if (!ranks.has(to.layer)) return null
  if (ranks.get(to.layer) < ranks.get(from.layer)) {
    return `아래→위 import — ${from.layer} 는 ${to.layer} 를 참조할 수 없다`
  }
  if (!structure.sliceLayers.includes(to.layer)) return null
  if (from.layer === to.layer) {
    if (from.slice === to.slice) return null
    return `같은 레이어의 다른 슬라이스 직접 import — ${to.layer}/${to.slice}`
  }
  if (to.segments.length > 2 && !to.segments[2].startsWith('index')) {
    return `슬라이스 내부 deep import — 공개 API(${to.layer}/${to.slice})로만 접근한다`
  }
  return null
}

// 'entities/user/ui/Card.tsx' → 레이어 entities, 슬라이스 user.
function locate(rel) {
  const segments = rel.split('/')
  return { rel, segments, layer: segments[0], slice: segments[1] }
}

// specifier를 src 기준 상대경로로 푼다. src 밖이거나 외부 패키지면 null(검사 대상 아님).
function resolveToSrc(specifier, { fileDir, srcDir, aliases, targetDir }) {
  if (specifier.startsWith('.')) return withinSrc(srcDir, path.resolve(fileDir, specifier))

  const alias = aliases.find(({ prefix }) => prefix && specifier.startsWith(prefix))
  if (!alias) return null
  return withinSrc(srcDir, path.resolve(targetDir, alias.target + specifier.slice(alias.prefix.length)))
}

function withinSrc(srcDir, abs) {
  const rel = path.relative(srcDir, abs)
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null
  return toPosix(rel)
}

// 여러 줄에 걸친 import도 잡히도록 파일 전체에서 매칭하고, 매치 위치로 줄 번호를 센다.
function importsOf(content) {
  return [...content.matchAll(IMPORT_RE)].map((match) => ({
    specifier: match[1],
    line: content.slice(0, match.index).split('\n').length,
  }))
}

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(full)
    else if (CODE_EXT.has(path.extname(entry.name))) yield full
  }
}

const toPosix = (value) => value.split(path.sep).join('/')
