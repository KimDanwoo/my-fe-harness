import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const PACKAGE_MANAGERS = {
  pnpm: {
    run: ['pnpm', 'run'],
    install: ['pnpm', 'install', '--frozen-lockfile', '--prefer-offline'],
    update: ['pnpm', 'install'],
    exec: ['pnpm', 'exec'],
    preview: ['pnpm', 'preview'],
    add: 'pnpm add -D',
  },
  npm: { run: ['npm', 'run'], install: ['npm', 'ci'], update: ['npm', 'install'], exec: ['npx', '--no-install'], preview: ['npm', 'run', 'preview', '--'], add: 'npm install -D' },
  yarn: { run: ['yarn', 'run'], install: ['yarn', 'install', '--frozen-lockfile'], update: ['yarn', 'install'], exec: ['yarn'], preview: ['yarn', 'preview'], add: 'yarn add -D' },
  bun: { run: ['bun', 'run'], install: ['bun', 'install', '--frozen-lockfile'], update: ['bun', 'install'], exec: ['bunx'], preview: ['bun', 'run', 'preview'], add: 'bun add -d' },
}
const LOCKFILES = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['bun.lockb', 'bun'],
  ['bun.lock', 'bun'],
  ['package-lock.json', 'npm'],
]
const DEFAULT_PACKAGE_MANAGER = 'pnpm'
const FALLBACK_INSTALL_MANAGER = 'npm'
const YARN_BERRY_MIN_MAJOR = 2
const YARN_BERRY_CONFIG = '.yarnrc.yml'

function ancestorsOf(startDir) {
  const dirs = []
  let current = path.resolve(startDir)
  while (!dirs.includes(current)) {
    dirs.push(current)
    current = path.dirname(current)
  }
  return dirs
}

export function findGitRoot(startDir) {
  const home = os.homedir()
  const isRepoRoot = (dir) => dir !== home && fs.existsSync(path.join(dir, '.git'))
  return ancestorsOf(startDir).find(isRepoRoot) ?? null
}

export function projectBase(targetDir) {
  return findGitRoot(targetDir) ?? path.resolve(targetDir)
}

export function repoDirsOf(targetDir) {
  const dirs = ancestorsOf(targetDir)
  const root = findGitRoot(targetDir)
  return root ? dirs.slice(0, dirs.indexOf(root) + 1) : dirs.slice(0, 1)
}

export function findInRepo(targetDir, rel) {
  const dir = repoDirsOf(targetDir).find((candidate) => fs.existsSync(path.join(candidate, rel)))
  return dir ? path.join(dir, rel) : null
}

function lockfileManager(dir) {
  return LOCKFILES.find(([name]) => fs.existsSync(path.join(dir, name)))?.[1] ?? null
}

const knownManager = (name) => (Object.hasOwn(PACKAGE_MANAGERS, name) ? name : null)
const declaredManager = (pkg) => knownManager(String(pkg?.packageManager ?? '').split('@')[0])
const lockedManager = (targetDir) => repoDirsOf(targetDir).map(lockfileManager).find(Boolean) ?? null
const invokingManager = () => knownManager(String(process.env.npm_config_user_agent ?? '').split('/')[0])

export const hasLockfile = (targetDir) => lockedManager(targetDir) !== null

export function detectPackageManager(targetDir, pkg) {
  return declaredManager(pkg) ?? lockedManager(targetDir) ?? DEFAULT_PACKAGE_MANAGER
}

export function chooseInstallManager(targetDir, pkg) {
  return declaredManager(pkg) ?? lockedManager(targetDir) ?? invokingManager() ?? FALLBACK_INSTALL_MANAGER
}

export function isYarnBerry(targetDir, pkg) {
  const declared = /^yarn@(\d+)/.exec(String(pkg?.packageManager ?? ''))
  if (declared) return Number(declared[1]) >= YARN_BERRY_MIN_MAJOR
  return findInRepo(targetDir, YARN_BERRY_CONFIG) !== null
}
