import fs from 'node:fs'
import path from 'node:path'
import { writeOne } from './projectFiles.mjs'

export const ESLINT_CONFIG_FILE = 'eslint.config.mjs'
const FLAT_CONFIG_NAMES = ['eslint.config.js', 'eslint.config.mjs', 'eslint.config.cjs', 'eslint.config.ts', 'eslint.config.mts', 'eslint.config.cts']
const LEGACY_CONFIG_NAMES = ['.eslintrc', '.eslintrc.js', '.eslintrc.cjs', '.eslintrc.yaml', '.eslintrc.yml', '.eslintrc.json']
const FLAT_CONFIG_MIN_MAJOR = 9
const NEXT_LAYER_FOLDERS = { app: '_app', pages: '_pages' }
const HARNESS_IMPORT = 'my-fe-harness/eslint'

const IGNORED_LINE = "const ignored = { ignores: ['.claude/**', '.next/**', 'dist/**', 'build/**', 'out/**', 'coverage/**'] }"

const TYPESCRIPT_TEMPLATE = (fsdCall) => `import tseslint from 'typescript-eslint'
import { ${fsdCall ? 'fsd, quality' : 'quality'} } from '${HARNESS_IMPORT}'

${IGNORED_LINE}
const typescript = tseslint.configs.recommended

export default [ignored, ...quality(typescript), ...typescript${fsdCall ? `, ...${fsdCall}` : ''}]
`

const JAVASCRIPT_TEMPLATE = `import { quality } from '${HARNESS_IMPORT}'

${IGNORED_LINE}
const javascript = [{ files: ['**/*.{js,jsx,mjs,cjs}'], languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } } }]

export default [ignored, ...quality(javascript), ...javascript]
`

const VALUE_FORMATTERS = {
  object: (value) => formatObject(value),
  string: (value) => `'${value}'`,
  boolean: (value) => String(value),
}

const formatValue = (value) => VALUE_FORMATTERS[typeof value](value)

function formatObject(object) {
  const entries = Object.entries(object).map(([key, value]) => `${key}: ${formatValue(value)}`)
  return `{ ${entries.join(', ')} }`
}

function fsdLayers(targetDir, srcDir) {
  const entries = Object.entries(NEXT_LAYER_FOLDERS).filter(([, folder]) => fs.existsSync(path.join(targetDir, srcDir, folder)))
  return Object.fromEntries(entries)
}

export function fsdOptionsFor(targetDir, deps) {
  const layers = fsdLayers(targetDir, 'src')
  const hasLayers = Object.keys(layers).length > 0
  return {
    ...('next' in deps ? { next: true } : {}),
    ...('jotai' in deps ? { jotai: true } : {}),
    ...(hasLayers ? { layers } : {}),
  }
}

export function renderEslintConfig({ isTypeScript, fsdOptions }) {
  if (!isTypeScript) return JAVASCRIPT_TEMPLATE
  if (!fsdOptions) return TYPESCRIPT_TEMPLATE(null)
  const hasOptions = Object.keys(fsdOptions).length > 0
  return TYPESCRIPT_TEMPLATE(`fsd(${hasOptions ? formatObject(fsdOptions) : ''})`)
}

const existingIn = (targetDir, names) => names.find((name) => fs.existsSync(path.join(targetDir, name))) ?? null

function eslintMajor(deps) {
  const match = /\d+/.exec(String(deps.eslint ?? ''))
  return match ? Number(match[0]) : null
}

function blockedReason(targetDir, deps, pkg) {
  const legacy = existingIn(targetDir, LEGACY_CONFIG_NAMES)
  if (legacy) return { status: 'legacy', file: legacy }
  if (pkg.eslintConfig) return { status: 'legacy', file: 'package.json#eslintConfig' }
  const major = eslintMajor(deps)
  const isOutdated = major !== null && major < FLAT_CONFIG_MIN_MAJOR
  return isOutdated ? { status: 'outdated', file: null } : null
}

export function installEslintConfig({ targetDir, pkg, deps, isTypeScript, fsdOptions, dryRun }) {
  const content = renderEslintConfig({ isTypeScript, fsdOptions })
  const existing = existingIn(targetDir, FLAT_CONFIG_NAMES)
  if (existing) {
    const usesHarness = fs.readFileSync(path.join(targetDir, existing), 'utf8').includes(HARNESS_IMPORT)
    return { status: 'kept', file: existing, usesHarness, content }
  }
  const blocked = blockedReason(targetDir, deps, pkg)
  if (blocked) return { ...blocked, usesHarness: false, content }
  const status = writeOne(path.join(targetDir, ESLINT_CONFIG_FILE), content, { force: false, dryRun })
  return { status, file: ESLINT_CONFIG_FILE, usesHarness: true, content }
}
