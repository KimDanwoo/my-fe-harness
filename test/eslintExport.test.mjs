import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { plugin, quality } from 'my-fe-harness/eslint'

const GUARD = fileURLToPath(new URL('../scripts/lint-guard.mjs', import.meta.url))
const PLUGIN_URL = new URL('../scripts/lint-guard-plugin.mjs', import.meta.url).href
const RUNTIME = process.env.MY_FE_HARNESS_RUNTIME_DIR || path.join(os.homedir(), '.claude', 'my-fe-harness-runtime')
const hasRuntime = fs.existsSync(path.join(RUNTIME, 'node_modules', 'eslint')) && fs.existsSync(path.join(RUNTIME, 'node_modules', 'typescript-eslint'))
const skipWithoutRuntime = hasRuntime ? false : 'ESLint 런타임(~/.claude/my-fe-harness-runtime)이 없다'

const harnessPluginOf = (configs) => configs.find((config) => config.plugins?.harness)?.plugins.harness

test('my-fe-harness/eslint: 플러그인과 기본 잠금(quality)을 내보낸다', () => {
  assert.ok(plugin.rules['no-relative-import'])
  assert.ok(plugin.rules['component-body'])
  const configs = quality()
  assert.ok(Array.isArray(configs) && configs.length > 0)
  assert.equal(harnessPluginOf(configs), plugin)
})

test('quality: 프로젝트가 이미 harness 플러그인을 등록했으면 그 객체를 재사용한다', () => {
  const projectPlugin = { rules: { ...plugin.rules } }
  assert.equal(harnessPluginOf(quality([{ plugins: { harness: projectPlugin } }])), projectPlugin)
  assert.equal(harnessPluginOf(quality([[{ plugins: { harness: projectPlugin } }]])), projectPlugin)
})

test('quality: 재사용한 플러그인(예전 버전)에 없는 harness 규칙은 켜지 않아 설정 에러로 잠금 전체가 꺼지지 않는다', () => {
  const { 'component-markup': _removed, ...olderRules } = plugin.rules
  const configuredRules = quality([{ plugins: { harness: { rules: olderRules } } }]).flatMap((config) => Object.keys(config.rules ?? {}))
  assert.ok(configuredRules.includes('harness/component-body'))
  assert.ok(!configuredRules.includes('harness/component-markup'))
})

async function lintWith(projectConfigs, code, file) {
  const runtimeRequire = createRequire(path.join(RUNTIME, 'package.json'))
  const { ESLint } = await import(pathToFileURL(runtimeRequire.resolve('eslint')).href)
  const tseslint = (await import(pathToFileURL(runtimeRequire.resolve('typescript-eslint')).href)).default
  const cwd = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'eslint-export-')))
  const parser = { files: ['**/*.tsx'], languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } } }
  const eslint = new ESLint({ cwd, overrideConfigFile: true, overrideConfig: [parser, ...quality(projectConfigs), ...projectConfigs] })
  const [result] = await eslint.lintText(code, { filePath: path.join(cwd, file) })
  return result.messages.map((message) => message.ruleId)
}

const HELPER_IN_COMPONENT = 'export function Card() {\n  const format = () => 1\n  return <p>{format()}</p>\n}\n'

test('ESLint 런타임: 다른 harness 플러그인 객체를 쓰는 프로젝트 설정 위에 깔아도 "Cannot redefine plugin" 없이 잠금이 돈다', { skip: skipWithoutRuntime }, async () => {
  const projectPlugin = { rules: { ...plugin.rules } }
  const projectConfigs = [{ files: ['**/*.tsx'], plugins: { harness: projectPlugin }, rules: { 'harness/max-props': 'error' } }]
  assert.deepEqual(await lintWith(projectConfigs, HELPER_IN_COMPONENT, 'src/Card.tsx'), ['harness/component-body'])
})

test('lint-guard 오버레이: 프로젝트 설정이 자기 harness 플러그인을 등록해도 덧씌운 기본 잠금이 프로젝트 설정만으로 물러나지 않는다', { skip: skipWithoutRuntime }, () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'eslint-export-project-')))
  fs.mkdirSync(path.join(root, 'node_modules', '.bin'), { recursive: true })
  fs.symlinkSync(path.join(RUNTIME, 'node_modules', '.bin', 'eslint'), path.join(root, 'node_modules', '.bin', 'eslint'))
  const projectConfig = [
    `import source from ${JSON.stringify(PLUGIN_URL)}`,
    'const harness = { rules: { ...source.rules } }',
    "export default [{ files: ['**/*.jsx'], languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } }, plugins: { harness } }]",
    '',
  ].join('\n')
  fs.writeFileSync(path.join(root, 'eslint.config.mjs'), projectConfig)
  fs.mkdirSync(path.join(root, 'src'))
  const file = path.join(root, 'src', 'Card.jsx')
  fs.writeFileSync(file, HELPER_IN_COMPONENT)
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'eslint-export-home-'))
  const result = spawnSync('node', [GUARD], {
    encoding: 'utf8',
    input: JSON.stringify({ hook_event_name: 'PostToolUse', tool_name: 'Edit', cwd: root, tool_input: { file_path: file } }),
    env: { ...process.env, HOME: home, MY_FE_HARNESS_LINT_GUARD: '' },
  })
  assert.equal(result.status, 2)
  assert.match(result.stderr, /harness\/component-body/)
})
