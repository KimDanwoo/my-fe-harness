import fs from 'node:fs'
import path from 'node:path'
import { installCi } from './installCi.mjs'
import { fsdOptionsFor, installEslintConfig } from './installEslintConfig.mjs'
import { allDeps, installDependencies, readPackageJson, removePackageAdditions, setupPackageJson } from './installPackageSetup.mjs'
import { hashFile, isInside } from './manifest.mjs'
import { chooseInstallManager, projectBase } from './packageManager.mjs'

const TSCONFIG_FILES = ['tsconfig.json']
const WRITTEN = new Set(['created', 'overwritten'])
const PRUNABLE_DIRS = ['.github/workflows', '.github']

const toKey = (base, file) => path.relative(base, file).split(path.sep).join('/')

function isTypeScriptProject(targetDir, deps) {
  const hasTsconfig = TSCONFIG_FILES.some((name) => fs.existsSync(path.join(targetDir, name)))
  return hasTsconfig || 'typescript' in deps
}

function writtenFiles(base, steps) {
  const entries = steps
    .filter(({ status }) => WRITTEN.has(status))
    .map(({ abs }) => [toKey(base, abs), hashFile(abs)])
  return Object.fromEntries(entries)
}

function recordProject(manifest, { base, targetDir, steps, additions }) {
  const previous = manifest.project ?? { files: {}, packageJson: null }
  const previousPackage = previous.packageJson ?? { devDependencies: {}, scripts: {}, createdSections: [] }
  manifest.project = {
    files: { ...previous.files, ...writtenFiles(base, steps) },
    packageJson: {
      file: toKey(base, path.join(targetDir, 'package.json')),
      devDependencies: { ...previousPackage.devDependencies, ...additions.devDependencies },
      scripts: { ...previousPackage.scripts, ...additions.scripts },
      createdSections: [...new Set([...previousPackage.createdSections, ...additions.createdSections])],
    },
  }
}

export function installProjectSetup(options, manifest, { hasFsd }) {
  if (options.global) return { status: 'global' }
  const { targetDir, dryRun, install } = options
  const pkg = readPackageJson(targetDir)
  if (!pkg) return { status: 'no-package' }
  const deps = allDeps(pkg)
  const base = projectBase(targetDir)
  const isTypeScript = isTypeScriptProject(targetDir, deps)
  const shouldUseFsd = hasFsd && isTypeScript
  const fsdOptions = shouldUseFsd ? fsdOptionsFor(targetDir, deps) : null
  const eslint = installEslintConfig({ targetDir, pkg, deps, isTypeScript, fsdOptions, dryRun })
  const additions = setupPackageJson({ targetDir, pkg, isTypeScript, needsHarnessDeps: eslint.status === 'created', dryRun })
  const packageManager = chooseInstallManager(targetDir, pkg)
  const installStatus = installDependencies({ targetDir, packageManager, devDependencies: additions.devDependencies, install, dryRun })
  const ci = installCi({ base, targetDir, packageManager, pkg, scripts: { ...pkg.scripts, ...additions.scripts }, dryRun })
  const steps = [
    { status: eslint.status, abs: path.join(targetDir, eslint.file ?? '') },
    { status: ci.status, abs: path.join(base, ci.file) },
  ]
  if (!dryRun) recordProject(manifest, { base, targetDir, steps, additions })
  return { status: 'done', base, eslint, additions, packageManager, installStatus, ci, hasFsd: shouldUseFsd, isTypeScript }
}

function removeProjectFile(base, key, recordedSha, dryRun) {
  const dest = path.join(base, key)
  if (!isInside(base, dest)) return { file: key, status: 'outside-skipped' }
  if (!fs.existsSync(dest)) return { file: key, status: 'missing' }
  if (hashFile(dest) !== recordedSha) return { file: key, status: 'kept-modified' }
  if (!dryRun) fs.unlinkSync(dest)
  return { file: key, status: 'removed' }
}

function pruneEmptyDirs(base) {
  for (const rel of PRUNABLE_DIRS) {
    const dir = path.join(base, rel)
    const isEmptyDir = fs.existsSync(dir) && fs.readdirSync(dir).length === 0
    if (isEmptyDir) fs.rmdirSync(dir)
  }
}

function removePackageRecord(base, packageJson, dryRun) {
  if (!packageJson) return null
  const file = path.join(base, packageJson.file)
  if (!isInside(base, file)) return { file: packageJson.file, status: 'outside-skipped' }
  return { file: packageJson.file, status: removePackageAdditions(file, packageJson, dryRun) }
}

export function removeProjectSetup(targetDir, project, dryRun) {
  const base = projectBase(targetDir)
  const files = Object.entries(project.files).map(([key, sha]) => removeProjectFile(base, key, sha, dryRun))
  if (!dryRun) pruneEmptyDirs(base)
  const packageJson = removePackageRecord(base, project.packageJson, dryRun)
  return { files, packageJson }
}

export function projectFileStatuses(targetDir, project) {
  const base = projectBase(targetDir)
  return Object.entries(project.files).map(([key, sha]) => ({ key, abs: path.join(base, key), sha }))
}
