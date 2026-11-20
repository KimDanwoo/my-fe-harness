import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { RUNTIME_PACKAGES } from './installLintHook.mjs'
import { writeFileAtomic } from './manifest.mjs'
import { PACKAGE_MANAGERS } from './packageManager.mjs'
import { PACKAGE_VERSION } from './version.mjs'

export const HARNESS_PACKAGE = 'my-fe-harness'
export const HARNESS_SPEC = `github:KimDanwoo/my-fe-harness#v${PACKAGE_VERSION}`
const LINT_SCRIPT = 'eslint .'
const TYPECHECK_SCRIPT = 'tsc --noEmit'
const TYPECHECK_SCRIPTS = ['typecheck', 'type-check']
const INSTALL_TIMEOUT_MS = 300_000
const DEFAULT_INDENT = 2
const PACKAGE_SECTIONS = ['devDependencies', 'scripts']
const BYTE_ORDER_MARK = /^\uFEFF/

export function readPackageJson(targetDir) {
  const file = path.join(targetDir, 'package.json')
  if (!fs.existsSync(file)) return null
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(BYTE_ORDER_MARK, ''))
  } catch {
    throw new Error(`${file} 파싱 실패 — 유효한 JSON이 아닙니다.`)
  }
}

export const allDeps = (pkg) => ({ ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies, ...pkg.optionalDependencies })

const missing = (present, entries) => Object.fromEntries(entries.filter(([name]) => !(name in present)))

function plannedDevDependencies(pkg, { isTypeScript, needsHarnessDeps }) {
  if (!needsHarnessDeps) return {}
  return missing(allDeps(pkg), [
    [HARNESS_PACKAGE, HARNESS_SPEC],
    ['eslint', `^${RUNTIME_PACKAGES.eslint}`],
    ...(isTypeScript ? [['typescript-eslint', `^${RUNTIME_PACKAGES['typescript-eslint']}`], ['typescript', `^${RUNTIME_PACKAGES.typescript}`]] : []),
  ])
}

function plannedScripts(pkg, { isTypeScript, devDependencies }) {
  const scripts = pkg.scripts ?? {}
  const hasTypecheck = TYPECHECK_SCRIPTS.some((name) => name in scripts)
  const hasTypescript = 'typescript' in allDeps(pkg) || 'typescript' in devDependencies
  const shouldAddTypecheck = isTypeScript && hasTypescript && !hasTypecheck
  return missing(scripts, [['lint', LINT_SCRIPT], ...(shouldAddTypecheck ? [['typecheck', TYPECHECK_SCRIPT]] : [])])
}

function indentOf(source) {
  const match = /^([ \t]+)"/m.exec(source)
  return match ? match[1] : DEFAULT_INDENT
}

function writePackageSections(file, additions) {
  const source = fs.readFileSync(file, 'utf8').replace(BYTE_ORDER_MARK, '')
  const pkg = JSON.parse(source)
  for (const section of PACKAGE_SECTIONS) {
    const hasAdditions = Object.keys(additions[section]).length > 0
    if (hasAdditions) pkg[section] = { ...pkg[section], ...additions[section] }
  }
  writeFileAtomic(file, `${JSON.stringify(pkg, null, indentOf(source))}\n`)
}

export function setupPackageJson({ targetDir, pkg, isTypeScript, needsHarnessDeps, dryRun }) {
  const devDependencies = plannedDevDependencies(pkg, { isTypeScript, needsHarnessDeps })
  const additions = { devDependencies, scripts: plannedScripts(pkg, { isTypeScript, devDependencies }) }
  const createdSections = PACKAGE_SECTIONS.filter((section) => Object.keys(additions[section]).length > 0 && !pkg[section])
  const hasChanges = PACKAGE_SECTIONS.some((section) => Object.keys(additions[section]).length > 0)
  const shouldWrite = hasChanges && !dryRun
  if (shouldWrite) writePackageSections(path.join(targetDir, 'package.json'), additions)
  return { ...additions, createdSections }
}

function parsePackage(source) {
  try {
    return JSON.parse(source)
  } catch {
    return null
  }
}

function dropEmptySections(pkg, sections) {
  for (const section of sections) {
    const isEmpty = Object.keys(pkg[section] ?? {}).length === 0
    if (isEmpty) delete pkg[section]
  }
}

export function removePackageAdditions(file, recorded, dryRun) {
  if (!fs.existsSync(file)) return 'missing'
  const source = fs.readFileSync(file, 'utf8').replace(BYTE_ORDER_MARK, '')
  const pkg = parsePackage(source)
  if (!pkg) return 'parse-error'
  const removed = PACKAGE_SECTIONS.flatMap((section) =>
    Object.entries(recorded[section] ?? {})
      .filter(([name, value]) => pkg[section]?.[name] === value)
      .map(([name]) => [section, name]),
  )
  if (removed.length === 0) return 'not-present'
  for (const [section, name] of removed) delete pkg[section][name]
  dropEmptySections(pkg, recorded.createdSections ?? [])
  if (!dryRun) writeFileAtomic(file, `${JSON.stringify(pkg, null, indentOf(source))}\n`)
  return 'removed'
}

export function installDependencies({ targetDir, packageManager, devDependencies, install, dryRun }) {
  const hasNewDeps = Object.keys(devDependencies).length > 0
  if (!hasNewDeps) return 'not-needed'
  const shouldSkip = !install || dryRun || process.env.MY_FE_HARNESS_SKIP_INSTALL === '1'
  if (shouldSkip) return 'skipped'
  const [command, ...args] = PACKAGE_MANAGERS[packageManager].update
  const result = spawnSync(command, args, { cwd: targetDir, stdio: 'inherit', timeout: INSTALL_TIMEOUT_MS })
  return result.status === 0 ? 'installed' : 'failed'
}
