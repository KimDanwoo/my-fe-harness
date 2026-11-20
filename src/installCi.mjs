import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { readPackageJson } from './installPackageSetup.mjs'
import { PACKAGE_MANAGERS, hasLockfile, isYarnBerry } from './packageManager.mjs'
import { writeOne } from './projectFiles.mjs'

const WORKFLOWS_DIR = '.github/workflows'
const WORKFLOW_NAME = 'harness'
const TYPECHECK_SCRIPTS = ['typecheck', 'type-check']
const NODE_VERSION_FILES = ['.nvmrc', '.node-version']
const DEFAULT_NODE_VERSION = 'lts/*'
const FALLBACK_PNPM_MAJOR = '10'
const SETUP_NODE_CACHE = { pnpm: 'pnpm', npm: 'npm', yarn: 'yarn' }
const YARN_BERRY_INSTALL = ['yarn', 'install', '--immutable']
const WORKFLOW_FILE = /\.ya?ml$/
const COMMENT_LINE = /^\s*#/
const RUNS_ESLINT = /\beslint\b|\b(?:pnpm|npm|yarn|bun)(?:\s+run)?\s+lint\b/

const toPosix = (rel) => rel.split(path.sep).join('/')
const declaredPnpm = (pkg) => /^pnpm@(\d[^+]*)/.exec(String(pkg?.packageManager ?? ''))?.[1] ?? null

export function workflowRel(base, targetDir) {
  const rel = toPosix(path.relative(base, targetDir))
  const suffix = rel ? `-${rel.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '')}` : ''
  return `${WORKFLOWS_DIR}/${WORKFLOW_NAME}${suffix}.yml`
}

function pnpmVersion(base, targetDir) {
  if (declaredPnpm(readPackageJson(base))) return null
  const own = declaredPnpm(readPackageJson(targetDir))
  if (own) return own
  const result = spawnSync('pnpm', ['--version'], { cwd: base, encoding: 'utf8' })
  return /^(\d+)\./.exec(result.stdout ?? '')?.[1] ?? FALLBACK_PNPM_MAJOR
}

function packageManagerSteps({ packageManager, base, targetDir }) {
  if (packageManager === 'bun') return ['      - uses: oven-sh/setup-bun@v2']
  if (packageManager !== 'pnpm') return []
  const version = pnpmVersion(base, targetDir)
  if (!version) return ['      - uses: pnpm/action-setup@v4']
  return ['      - uses: pnpm/action-setup@v4', '        with:', `          version: ${version}`]
}

function setupNodeSteps({ packageManager, base, isLocked, isBerry }) {
  const versionFile = NODE_VERSION_FILES.find((name) => fs.existsSync(path.join(base, name)))
  const version = versionFile ? `          node-version-file: ${versionFile}` : `          node-version: '${DEFAULT_NODE_VERSION}'`
  const shouldCache = isLocked && !isBerry
  const cache = shouldCache ? SETUP_NODE_CACHE[packageManager] : null
  const setupNode = ['      - uses: actions/setup-node@v4', '        with:', version, ...(cache ? [`          cache: ${cache}`] : [])]
  return isBerry ? [...setupNode, '      - run: corepack enable'] : setupNode
}

function installCommand({ packageManager, isLocked, isBerry }) {
  const manager = PACKAGE_MANAGERS[packageManager]
  if (!isLocked) return manager.update
  return isBerry ? YARN_BERRY_INSTALL : manager.install
}

function workingDirectoryLines(base, targetDir) {
  const rel = toPosix(path.relative(base, targetDir))
  if (!rel) return []
  return ['    defaults:', '      run:', `        working-directory: ${JSON.stringify(rel)}`]
}

export function renderWorkflow(project) {
  const { base, targetDir, packageManager, scripts } = project
  const manager = PACKAGE_MANAGERS[packageManager]
  const run = (args) => `      - run: ${args.join(' ')}`
  const typecheck = TYPECHECK_SCRIPTS.find((name) => name in scripts)
  return [
    `name: ${WORKFLOW_NAME}`,
    '',
    'on:',
    '  pull_request:',
    '  push:',
    '    branches: [main, master]',
    '',
    'permissions:',
    '  contents: read',
    '',
    'jobs:',
    '  lint:',
    '    runs-on: ubuntu-latest',
    ...workingDirectoryLines(base, targetDir),
    '    steps:',
    '      - uses: actions/checkout@v4',
    ...packageManagerSteps(project),
    ...setupNodeSteps(project),
    run(installCommand(project)),
    run([...manager.run, 'lint']),
    ...(typecheck ? [run([...manager.run, typecheck])] : []),
    '',
  ].join('\n')
}

function runsEslint(content) {
  const lines = content.split('\n').filter((line) => !COMMENT_LINE.test(line))
  return RUNS_ESLINT.test(lines.join('\n'))
}

function workflowRunningLint(base) {
  const dir = path.join(base, WORKFLOWS_DIR)
  if (!fs.existsSync(dir)) return null
  const isOthersWorkflow = (name) => WORKFLOW_FILE.test(name) && !name.startsWith(WORKFLOW_NAME)
  const files = fs.readdirSync(dir).filter(isOthersWorkflow)
  const found = files.find((name) => runsEslint(fs.readFileSync(path.join(dir, name), 'utf8')))
  return found ? `${WORKFLOWS_DIR}/${found}` : null
}

export function installCi({ base, targetDir, packageManager, pkg, scripts, dryRun }) {
  const file = workflowRel(base, targetDir)
  const dest = path.join(base, file)
  const covering = fs.existsSync(dest) ? null : workflowRunningLint(base)
  if (covering) return { status: 'covered', file: covering, isLocked: true }
  const isLocked = hasLockfile(targetDir)
  const project = { base, targetDir, packageManager, scripts, isLocked, isBerry: packageManager === 'yarn' && isYarnBerry(targetDir, pkg) }
  const status = writeOne(dest, renderWorkflow(project), { force: false, dryRun })
  return { status, file, isLocked }
}
