import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { findInRepo } from './packageManager.mjs'

const ESLINT_BIN = 'node_modules/.bin/eslint'
const SRC_DIR = 'src'
const FSD_RULE_PREFIX = 'fsd/'
const PROBE_EXT = new Set(['.ts', '.tsx'])
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'out', 'coverage'])
const MAX_BUFFER_BYTES = 256 * 1024 * 1024
const RULE_OFF = new Set([0, 'off'])

function* sourceFiles(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const isSkipped = entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)
    if (isSkipped) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) yield* sourceFiles(full)
    else if (PROBE_EXT.has(path.extname(entry.name))) yield full
  }
}

function runEslint(eslint, args, cwd) {
  return spawnSync(eslint, args, { cwd, encoding: 'utf8', maxBuffer: MAX_BUFFER_BYTES })
}

function parseJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

const severityOf = (entry) => (Array.isArray(entry) ? entry[0] : entry)

function hasFsdRules(eslint, probe, cwd) {
  const config = parseJson(runEslint(eslint, ['--print-config', probe], cwd).stdout ?? '')
  const rules = Object.entries(config?.rules ?? {})
  return rules.some(([name, entry]) => name.startsWith(FSD_RULE_PREFIX) && !RULE_OFF.has(severityOf(entry)))
}

function fsdViolations(results, targetDir) {
  return results.flatMap(({ filePath, messages }) =>
    messages
      .filter(({ ruleId }) => ruleId?.startsWith(FSD_RULE_PREFIX))
      .map(({ ruleId, line, message }) => ({ file: path.relative(targetDir, filePath).split(path.sep).join('/'), line, rule: ruleId, message })),
  )
}

export function checkFsdWithEslint(targetDir) {
  const srcDir = path.join(targetDir, SRC_DIR)
  const probe = fs.existsSync(srcDir) ? sourceFiles(srcDir).next().value : undefined
  if (!probe) return { status: 'no-source', files: 0, violations: [] }
  const eslint = findInRepo(targetDir, ESLINT_BIN)
  if (!eslint) return { status: 'no-eslint', files: 0, violations: [] }
  if (!hasFsdRules(eslint, probe, targetDir)) return { status: 'no-fsd-rules', files: 0, violations: [] }
  const result = runEslint(eslint, ['--format', 'json', '--no-warn-ignored', SRC_DIR], targetDir)
  const results = parseJson(result.stdout ?? '')
  if (!Array.isArray(results)) return { status: 'eslint-failed', files: 0, violations: [], detail: (result.stderr ?? '').trim() }
  return { status: 'ok', files: results.length, violations: fsdViolations(results, targetDir) }
}
