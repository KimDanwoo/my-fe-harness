import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { hashFile, writeFileAtomic } from './manifest.mjs'
import { renderSkill, setupNotes } from './verifySkillDocs.mjs'
import { detectProject } from './verifySkillProject.mjs'

const TEMPLATE_DIR = fileURLToPath(new URL('../assets/verify-skill/', import.meta.url))
const SKILL_REL = '.claude/skills/verify/SKILL.md'
const VERIFY_SCRIPTS_REL = 'scripts/verify'
const GITIGNORE_ENTRY = '/.verify/'
const GITIGNORE_EQUIVALENTS = new Set(['/.verify/', '.verify/', '/.verify', '.verify'])
const FIXED_NOW = '2026-01-01T10:00:00+09:00'
const PRUNABLE_DIRS = ['.claude/skills/verify', '.claude/skills', VERIFY_SCRIPTS_REL]

const quote = (text) => `'${text}'`
const formatArray = (items) => `[${items.map(quote).join(', ')}]`
const readTemplate = (name) => fs.readFileSync(path.join(TEMPLATE_DIR, name), 'utf8')

function renderRunScript(project) {
  const { commands } = project
  const values = {
    INSTALL_COMMAND: formatArray(commands.install),
    BUILD_COMMAND: formatArray(commands.build),
    SERVER_COMMAND: formatArray(commands.server),
    PORT_FLAG: formatArray(commands.portFlag),
    PLAYWRIGHT_COMMAND: formatArray(commands.playwright),
  }
  return readTemplate('run.mjs.tpl').replace(/\{\{(\w+)\}\}/g, (placeholder, key) => values[key] ?? placeholder)
}

function renderScreens({ routes }) {
  const guidance = routes.isFound ? [] : ['// 경로를 자동으로 찾지 못했다. 화면 비교할 경로를 아래 ROUTES에 채운다.']
  return [
    `export const FIXED_NOW = ${quote(FIXED_NOW)};`,
    '',
    ...guidance,
    'export const ROUTES = [',
    ...routes.list.map((route) => `  ${quote(route)},`),
    '] as const;',
    '',
    'export const screenName = (route: string) =>',
    "  route.replace(/[/?=&]+/g, '-').replace(/^-|-$/g, '') || 'root';",
    '',
  ].join('\n')
}

function renderFiles(project) {
  return {
    [SKILL_REL]: renderSkill(project),
    [`${VERIFY_SCRIPTS_REL}/run.mjs`]: renderRunScript(project),
    [`${VERIFY_SCRIPTS_REL}/playwright.verify.config.ts`]: readTemplate('playwright.verify.config.ts.tpl'),
    [`${VERIFY_SCRIPTS_REL}/screens.ts`]: renderScreens(project),
    [`${VERIFY_SCRIPTS_REL}/screens.verify.ts`]: readTemplate('screens.verify.ts.tpl'),
  }
}

function writeOne(dest, content, { force, dryRun }) {
  const exists = fs.existsSync(dest)
  if (exists && !force) return 'kept'
  if (!dryRun) {
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.writeFileSync(dest, content)
  }
  return exists ? 'overwritten' : 'created'
}

function ensureGitignore(targetDir, dryRun) {
  const file = path.join(targetDir, '.gitignore')
  const exists = fs.existsSync(file)
  const current = exists ? fs.readFileSync(file, 'utf8') : ''
  if (current.split(/\r?\n/).some((line) => GITIGNORE_EQUIVALENTS.has(line.trim()))) return 'exists'
  const separator = current === '' || current.endsWith('\n') ? '' : '\n'
  if (!dryRun) writeFileAtomic(file, `${current}${separator}${GITIGNORE_ENTRY}\n`)
  return exists ? 'added' : 'created'
}

function recordedShas(rels, statuses, previous, targetDir) {
  const entries = rels.flatMap((rel) => {
    if (statuses[rel] !== 'kept') return [[rel, hashFile(path.join(targetDir, rel))]]
    return previous[rel] ? [[rel, previous[rel]]] : []
  })
  return Object.fromEntries(entries)
}

// 대상 프로젝트에 verify 스킬과 화면 비교 스크립트를 깐다. 기존 파일은 --force 없이는 보존한다.
export function installVerifySkill(options, manifest) {
  if (options.global) throw new Error('verify-skill은 프로젝트 전용입니다 — --global 없이 대상 프로젝트에서 실행하세요.')
  const { targetDir } = options
  const project = detectProject(targetDir)
  const files = renderFiles(project)
  const rels = Object.keys(files)
  const statuses = Object.fromEntries(rels.map((rel) => [rel, writeOne(path.join(targetDir, rel), files[rel], options)]))
  const gitignore = ensureGitignore(targetDir, options.dryRun)
  if (!options.dryRun) manifest.verifySkill = { files: recordedShas(rels, statuses, manifest.verifySkill?.files ?? {}, targetDir) }
  return { project, files: rels.map((rel) => ({ rel, status: statuses[rel] })), gitignore, notes: setupNotes(project) }
}

export function removeVerifySkillDirs(base, dryRun) {
  if (dryRun) return
  for (const rel of PRUNABLE_DIRS) {
    const dir = path.join(base, rel)
    if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) fs.rmdirSync(dir)
  }
}
