import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { readPackageJson } from './installPackageSetup.mjs'
import { PACKAGE_MANAGERS } from './packageManager.mjs'
import { writeOne } from './projectFiles.mjs'

export const WORKFLOW_REL = '.github/workflows/harness.yml'
const TYPECHECK_SCRIPTS = ['typecheck', 'type-check']
const NODE_VERSION_FILES = ['.nvmrc', '.node-version']
const DEFAULT_NODE_VERSION = 'lts/*'
const FALLBACK_PNPM_MAJOR = '10'
const SETUP_NODE_CACHE = { pnpm: 'pnpm', npm: 'npm', yarn: 'yarn' }

function pnpmVersion(base) {
  const declared = String(readPackageJson(base)?.packageManager ?? '')
  if (declared.startsWith('pnpm@')) return null
  const result = spawnSync('pnpm', ['--version'], { encoding: 'utf8' })
  const major = /^(\d+)\./.exec(result.stdout ?? '')?.[1]
  return major ?? FALLBACK_PNPM_MAJOR
}

function packageManagerSteps(packageManager, base) {
  if (packageManager === 'bun') return ['      - uses: oven-sh/setup-bun@v2']
  if (packageManager !== 'pnpm') return []
  const version = pnpmVersion(base)
  if (!version) return ['      - uses: pnpm/action-setup@v4']
  return ['      - uses: pnpm/action-setup@v4', '        with:', `          version: ${version}`]
}

function setupNodeStep(packageManager, base) {
  const versionFile = NODE_VERSION_FILES.find((name) => fs.existsSync(path.join(base, name)))
  const version = versionFile ? `          node-version-file: ${versionFile}` : `          node-version: '${DEFAULT_NODE_VERSION}'`
  const cache = SETUP_NODE_CACHE[packageManager]
  return ['      - uses: actions/setup-node@v4', '        with:', version, ...(cache ? [`          cache: ${cache}`] : [])]
}

function workingDirectoryLines(base, targetDir) {
  const rel = path.relative(base, targetDir).split(path.sep).join('/')
  if (!rel) return []
  return ['    defaults:', '      run:', `        working-directory: ${rel}`]
}

export function renderWorkflow({ base, targetDir, packageManager, scripts }) {
  const manager = PACKAGE_MANAGERS[packageManager]
  const run = (args) => `      - run: ${args.join(' ')}`
  const typecheck = TYPECHECK_SCRIPTS.find((name) => name in scripts)
  return [
    'name: harness',
    '',
    'on:',
    '  pull_request:',
    '  push:',
    '    branches: [main, master]',
    '',
    'jobs:',
    '  lint:',
    '    runs-on: ubuntu-latest',
    ...workingDirectoryLines(base, targetDir),
    '    steps:',
    '      - uses: actions/checkout@v4',
    ...packageManagerSteps(packageManager, base),
    ...setupNodeStep(packageManager, base),
    run(manager.install),
    run([...manager.run, 'lint']),
    ...(typecheck ? [run([...manager.run, typecheck])] : []),
    '',
  ].join('\n')
}

const WORKFLOWS_DIR = '.github/workflows'
const WORKFLOW_FILE = /\.ya?ml$/
const RUNS_LINT = /\b(?:es)?lint\b/

function workflowRunningLint(base) {
  const dir = path.join(base, WORKFLOWS_DIR)
  if (!fs.existsSync(dir)) return null
  const files = fs.readdirSync(dir).filter((name) => WORKFLOW_FILE.test(name))
  const found = files.find((name) => RUNS_LINT.test(fs.readFileSync(path.join(dir, name), 'utf8')))
  return found ? `${WORKFLOWS_DIR}/${found}` : null
}

export function installCi({ base, targetDir, packageManager, scripts, dryRun }) {
  const dest = path.join(base, WORKFLOW_REL)
  const covering = fs.existsSync(dest) ? null : workflowRunningLint(base)
  if (covering) return { status: 'covered', file: covering }
  const status = writeOne(dest, renderWorkflow({ base, targetDir, packageManager, scripts }), { force: false, dryRun })
  return { status, file: WORKFLOW_REL }
}
