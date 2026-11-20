import fs from 'node:fs'
import path from 'node:path'
import { PACKAGE_MANAGERS, detectPackageManager } from './packageManager.mjs'

const QUICK_SCRIPTS = ['lint', 'typecheck', 'type-check', 'test']
const E2E_SCRIPTS = ['e2e', 'test:e2e']
const NEXT_APP_ROOTS = ['app', 'src/app']
const NEXT_PAGE_FILE = /^page\.(?:tsx|jsx|ts|js)$/
const NEXT_DROPPED_SEGMENT = /^(?:\[|@|_|\(\.{1,3}\))/
const NEXT_GROUP_SEGMENT = /^\([^)]+\)$/
const ASTRO_PAGES_ROOT = 'src/pages'
const ASTRO_PAGE_FILE = /\.(?:astro|mdx?)$/
const ASTRO_DROPPED_SEGMENT = /^[[_]/
const FALLBACK_ROUTES = ['/']
const SERVER_BY_FRAMEWORK = {
  next: { command: ['next', 'start'], portFlag: ['-p'] },
  astro: { command: ['astro', 'preview'], portFlag: ['--port'] },
}

function readPackage(targetDir) {
  const file = path.join(targetDir, 'package.json')
  if (!fs.existsSync(file)) throw new Error(`${file} 가 없습니다 — package.json이 있는 프로젝트 루트에서 실행하세요.`)
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    throw new Error(`${file} 파싱 실패 — 유효한 JSON이 아닙니다.`)
  }
}

function detectFramework(deps) {
  if ('next' in deps) return 'next'
  if ('astro' in deps) return 'astro'
  return 'other'
}

function listFiles(root, prefix = '') {
  if (!fs.existsSync(root)) return []
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name
    if (!entry.isDirectory()) return [rel]
    return entry.name === 'node_modules' ? [] : listFiles(path.join(root, entry.name), rel)
  })
}

const toRoute = (segments) => `/${segments.join('/')}`

function nextRoutes(targetDir) {
  const root = NEXT_APP_ROOTS.map((dir) => path.join(targetDir, dir)).find((dir) => fs.existsSync(dir))
  if (!root) return []
  return listFiles(root)
    .map((file) => file.split('/'))
    .filter((segments) => NEXT_PAGE_FILE.test(segments.at(-1)))
    .map((segments) => segments.slice(0, -1))
    .filter((segments) => !segments.some((segment) => NEXT_DROPPED_SEGMENT.test(segment)))
    .map((segments) => toRoute(segments.filter((segment) => !NEXT_GROUP_SEGMENT.test(segment))))
}

function astroRoutes(targetDir) {
  return listFiles(path.join(targetDir, ASTRO_PAGES_ROOT))
    .filter((file) => ASTRO_PAGE_FILE.test(file))
    .map((file) => file.replace(ASTRO_PAGE_FILE, '').split('/'))
    .filter((segments) => !segments.some((segment) => ASTRO_DROPPED_SEGMENT.test(segment)))
    .map((segments) => toRoute(segments.at(-1) === 'index' ? segments.slice(0, -1) : segments))
}

function detectRoutes(targetDir, framework) {
  const finders = { next: nextRoutes, astro: astroRoutes }
  const found = [...new Set(finders[framework]?.(targetDir) ?? [])].sort()
  return found.length > 0 ? { list: found, isFound: true } : { list: FALLBACK_ROUTES, isFound: false }
}

export function detectProject(targetDir) {
  const pkg = readPackage(targetDir)
  const deps = { ...pkg.dependencies, ...pkg.devDependencies }
  const scripts = pkg.scripts ?? {}
  const framework = detectFramework(deps)
  const packageManager = detectPackageManager(targetDir, pkg)
  return {
    packageManager,
    framework,
    scripts,
    hasPlaywright: '@playwright/test' in deps,
    routes: detectRoutes(targetDir, framework),
    quickScripts: scripts.verify ? ['verify'] : QUICK_SCRIPTS.filter((name) => name in scripts),
    e2eScript: E2E_SCRIPTS.find((name) => name in scripts) ?? null,
    commands: commandsFor(packageManager, framework, scripts),
  }
}

function commandsFor(packageManager, framework, scripts) {
  const manager = PACKAGE_MANAGERS[packageManager]
  const server = SERVER_BY_FRAMEWORK[framework]
  const frameworkBuild = server ? [...manager.exec, framework, 'build'] : null
  return {
    run: manager.run,
    install: manager.install,
    build: 'build' in scripts ? [...manager.run, 'build'] : (frameworkBuild ?? [...manager.run, 'build']),
    server: server ? [...manager.exec, ...server.command] : manager.preview,
    portFlag: server ? server.portFlag : ['--port'],
    playwright: [...manager.exec, 'playwright'],
    addDev: manager.add,
  }
}
