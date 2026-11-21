import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { fsd, fsdPlugin, plugin, quality } from '../scripts/eslint.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const RULES_DIR = path.join(ROOT, 'rules')
const DOC_DIRS = ['rules', 'commands', 'skills']
const LOCK_LINE = /^- 잠금: ((?:`[^`]+`\s*)+)/gm
const CODE_SPAN = /`([^`]+)`/g
const PLUGIN_RULE_MENTION = /`((?:harness|fsd)\/[a-z-]+)`/g
const PLUGIN_RULES = new Set([
  ...Object.keys(plugin.rules).map((name) => `harness/${name}`),
  ...Object.keys(fsdPlugin.rules).map((name) => `fsd/${name}`),
])

const OFF_LEVELS = new Set([0, 'off'])
const TYPESCRIPT_PROJECT = [{ plugins: { '@typescript-eslint': {} } }]

const isOn = (entry) => !OFF_LEVELS.has(Array.isArray(entry) ? entry[0] : entry)
const enabledRules = (configs) => configs.flatMap((config) => Object.entries(config.rules ?? {}).filter(([, entry]) => isOn(entry)).map(([name]) => name))

const LOCKED_RULES = new Set(enabledRules([...quality(), ...quality(TYPESCRIPT_PROJECT), ...fsd({ next: true, jotai: true })]))

function markdownFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return markdownFiles(full)
    return entry.name.endsWith('.md') ? [full] : []
  })
}

const matchesOf = (text, pattern) => [...text.matchAll(pattern)].map((match) => match[1])

function lockedInDocs() {
  return markdownFiles(RULES_DIR).flatMap((file) => {
    const text = fs.readFileSync(file, 'utf8')
    const rel = path.relative(ROOT, file)
    return matchesOf(text, LOCK_LINE).flatMap((line) => matchesOf(line, CODE_SPAN).map((rule) => ({ rule, rel })))
  })
}

function pluginRuleMentions() {
  const files = [path.join(ROOT, 'README.md'), ...DOC_DIRS.flatMap((dir) => markdownFiles(path.join(ROOT, dir)))]
  return files.flatMap((file) => matchesOf(fs.readFileSync(file, 'utf8'), PLUGIN_RULE_MENTION).map((rule) => ({ rule, rel: path.relative(ROOT, file) })))
}

test('규칙 문서의 잠금: 줄은 하네스가 실제로 켜는 규칙만 적는다', () => {
  const unknown = lockedInDocs().filter(({ rule }) => !LOCKED_RULES.has(rule))
  assert.deepEqual(unknown, [])
})

test('하네스가 켜는 잠금 규칙은 모두 규칙 문서의 잠금: 줄에 있다', () => {
  const documented = new Set(lockedInDocs().map(({ rule }) => rule))
  const undocumented = [...LOCKED_RULES].filter((rule) => !documented.has(rule))
  assert.deepEqual(undocumented, [])
})

test('문서에 적은 harness/·fsd/ 규칙 이름은 플러그인에 있다', () => {
  const unknown = pluginRuleMentions().filter(({ rule }) => !PLUGIN_RULES.has(rule))
  assert.deepEqual(unknown, [])
})

test('플러그인 규칙은 모두 기본 잠금이나 fsd 프리셋에서 켜진다', () => {
  const unused = [...PLUGIN_RULES].filter((rule) => !LOCKED_RULES.has(rule))
  assert.deepEqual(unused, [])
})
