import fs from 'node:fs'
import path from 'node:path'
import { STRUCTURES } from './structures.mjs'
import { readAliasMap } from './detect.mjs'
import { readManifest, resolveClaudeDir } from './manifest.mjs'

const CODE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs', '.vue', '.svelte', '.astro'])
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'out', 'coverage', '__snapshots__'])

const IMPORT_RE = /\b(?:from|import|require)\s*\(?\s*['"]([^'"]+)['"]/g

export function installedStructure(options) {
  const manifest = readManifest(resolveClaudeDir(options))
  return STRUCTURES.find((candidate) => candidate.ruleFile in manifest.rules) ?? null
}

export function checkStructure(options, structure) {
  const srcDir = path.join(options.targetDir, 'src')
  if (!fs.existsSync(srcDir)) return { files: 0, violations: [] }

  const ranks = new Map(structure.dirs.map((dir) => [dir.name, dir.rank]))
  const aliases = readAliasMap(options.targetDir)
  const violations = []
  let files = 0

  for (const file of walk(srcDir)) {
    files += 1
    const from = locate(toPosix(path.relative(srcDir, file)), srcDir)
    if (!ranks.has(from.layer)) continue

    for (const { specifier, line } of importsOf(fs.readFileSync(file, 'utf8'))) {
      const targetRel = resolveToSrc(specifier, { fileDir: path.dirname(file), srcDir, aliases, targetDir: options.targetDir })
      if (!targetRel) continue

      const reason = violationFor(from, locate(targetRel, srcDir), structure, ranks)
      if (reason) violations.push({ file: `src/${from.rel}`, line, specifier, reason })
    }
  }
  return { files, violations }
}

function violationFor(from, to, structure, ranks) {
  if (!ranks.has(to.layer)) return null
  if (ranks.get(to.layer) < ranks.get(from.layer)) {
    return `아래→위 import — ${from.layer} 는 ${to.layer} 를 참조할 수 없다`
  }
  if (!structure.sliceLayers.includes(to.layer)) return null
  if (from.layer === to.layer) {
    const isSameSliceOrBarrel = from.slice === to.slice || isLayerBarrel(from)
    if (isSameSliceOrBarrel) return null
    return `같은 레이어의 다른 슬라이스 직접 import — ${to.layer}/${to.slice}`
  }
  const isDeepImport = to.segments.length > 2 && !to.segments[2].startsWith('index')
  if (isDeepImport) {
    return `슬라이스 내부 deep import — 공개 API(${to.layer}/${to.slice})로만 접근한다`
  }
  return null
}

function locate(rel, srcDir) {
  const segments = rel.split('/')
  const isLayerRootFile = segments.length === 2 && !isDirectory(path.join(srcDir, rel))
  const slice = isLayerRootFile ? segments[1].split('.')[0] : segments[1]
  return { rel, segments, layer: layerName(segments[0]), slice }
}

const layerName = (folder) => folder.replace(/^_/, '')

const isDirectory = (abs) => fs.statSync(abs, { throwIfNoEntry: false })?.isDirectory() ?? false

const LAYER_BARREL_RE = /^index\.[cm]?[jt]s$/
const isLayerBarrel = (location) => location.segments.length === 2 && LAYER_BARREL_RE.test(location.segments[1])

function resolveToSrc(specifier, { fileDir, srcDir, aliases, targetDir }) {
  if (specifier.startsWith('.')) return withinSrc(srcDir, path.resolve(fileDir, specifier))

  const alias = aliases.find(({ prefix }) => prefix && specifier.startsWith(prefix))
  if (!alias) return null
  return withinSrc(srcDir, path.resolve(targetDir, alias.target + specifier.slice(alias.prefix.length)))
}

function withinSrc(srcDir, abs) {
  const rel = path.relative(srcDir, abs)
  const isOutsideSrc = !rel || rel.startsWith('..') || path.isAbsolute(rel)
  if (isOutsideSrc) return null
  return toPosix(rel)
}

function importsOf(content) {
  return [...content.matchAll(IMPORT_RE)].map((match) => ({
    specifier: match[1],
    line: content.slice(0, match.index).split('\n').length,
  }))
}

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const isSkipped = entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)
    if (isSkipped) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(full)
    else if (CODE_EXT.has(path.extname(entry.name))) yield full
  }
}

const toPosix = (value) => value.split(path.sep).join('/')
