import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import plugin, { bodyProblemOf, componentFunctionsOf, isEffectCall } from '../scripts/lint-guard-plugin.mjs'

const GUARD = fileURLToPath(new URL('../scripts/lint-guard.mjs', import.meta.url))
const RUNTIME = path.join(os.homedir(), '.claude', 'my-fe-harness-runtime')
const hasRuntime = fs.existsSync(path.join(RUNTIME, 'node_modules', 'eslint')) && fs.existsSync(path.join(RUNTIME, 'node_modules', 'typescript-eslint'))
const skipWithoutRuntime = hasRuntime ? false : 'ESLint 런타임(~/.claude/my-fe-harness-runtime)이 없다'

const identifier = (name) => ({ type: 'Identifier', name })
const block = (body = []) => ({ type: 'BlockStatement', body })
const arrow = () => ({ type: 'ArrowFunctionExpression', body: block() })
const call = (name, args) => ({ type: 'CallExpression', callee: identifier(name), arguments: args })
const functionDeclaration = (name, body = []) => ({ type: 'FunctionDeclaration', id: identifier(name), body: block(body) })
const variable = (name, init) => ({ type: 'VariableDeclaration', declarations: [{ id: identifier(name), init }] })

test('bodyProblemOf: 핸들러는 통과, 보조 함수·중첩 컴포넌트는 문제', () => {
  assert.equal(bodyProblemOf('handleClick'), null)
  assert.equal(bodyProblemOf('onSelect'), null)
  assert.equal(bodyProblemOf('formatPrice'), 'helperFunction')
  assert.equal(bodyProblemOf('handle'), 'helperFunction')
  assert.equal(bodyProblemOf('once'), 'helperFunction')
  assert.equal(bodyProblemOf('Row'), 'nestedComponent')
})

test('componentFunctionsOf: 최상위 컴포넌트(함수·화살표·memo/forwardRef·export)만 찾는다', () => {
  const declaration = functionDeclaration('Card')
  assert.deepEqual(componentFunctionsOf(declaration), [declaration])
  assert.deepEqual(componentFunctionsOf({ type: 'ExportDefaultDeclaration', declaration }), [declaration])
  assert.deepEqual(componentFunctionsOf({ type: 'ExportNamedDeclaration', declaration }), [declaration])
  assert.deepEqual(componentFunctionsOf(functionDeclaration('formatPrice')), [])
  const component = arrow()
  assert.deepEqual(componentFunctionsOf(variable('Panel', component)), [component])
  assert.deepEqual(componentFunctionsOf(variable('Panel', call('memo', [component]))), [component])
  assert.deepEqual(componentFunctionsOf(variable('Panel', call('memo', [call('forwardRef', [component])]))), [component])
  assert.deepEqual(componentFunctionsOf(variable('Panel', call('createThing', [component]))), [])
  assert.deepEqual(componentFunctionsOf(variable('MAX_ITEMS', arrow())), [])
  assert.deepEqual(componentFunctionsOf(variable('useThing', arrow())), [])
})

test('isEffectCall: useEffect·useLayoutEffect(React. 포함)만 잡는다', () => {
  assert.equal(isEffectCall(call('useEffect', [])), true)
  assert.equal(isEffectCall(call('useLayoutEffect', [])), true)
  assert.equal(isEffectCall(call('useMemo', [])), false)
  const member = { callee: { type: 'MemberExpression', computed: false, object: identifier('React'), property: identifier('useEffect') } }
  assert.equal(isEffectCall(member), true)
})

function reportsOf(rule, program, filename = 'Card.tsx') {
  const reports = []
  rule.create({ filename, report: (report) => reports.push(report) }).Program(program)
  return reports.map(({ messageId, data }) => `${messageId}:${data.name}`)
}

test('component-body 규칙 함수: 본문 최상위의 보조 함수·중첩 컴포넌트를 보고하고 핸들러·호출식은 허용한다', () => {
  const body = [
    variable('handleClick', arrow()),
    variable('memoized', call('useCallback', [arrow()])),
    variable('format', arrow()),
    variable('Row', arrow()),
    functionDeclaration('helper'),
    functionDeclaration('onSelect'),
  ]
  const program = { body: [{ ...functionDeclaration('Card'), body: block(body) }] }
  assert.deepEqual(reportsOf(plugin.rules['component-body'], program), ['helperFunction:format', 'nestedComponent:Row', 'helperFunction:helper'])
})

const BAD_COMPONENT = `import { useEffect } from 'react'

export function Card({ id }: { id: number }) {
  const format = (value: number) => value + 1
  const Row = () => <li />
  function summarize() {
    return id
  }
  useEffect(() => {
    summarize()
  }, [])
  return <ul>{format(id)}<Row /></ul>
}
`

const GOOD_COMPONENT = `import { memo, useCallback, useEffect } from 'react'

export function Card() {
  const handleClick = () => undefined
  const onSelect = function () {
    return undefined
  }
  const stable = useCallback(() => undefined, [])
  function handleSubmit() {
    return undefined
  }
  return <button onClick={handleClick} onSelect={onSelect} onBlur={stable} onSubmit={handleSubmit} />
}

export const Panel = memo(function Panel() {
  const handleClose = () => undefined
  return <button onClick={handleClose} />
})

export const useMounted = () => {
  useEffect(() => undefined, [])
}

function helper() {
  return 1
}
`

async function lintWithRuntime(code, relativePath) {
  const runtimeRequire = createRequire(path.join(RUNTIME, 'package.json'))
  const { ESLint } = await import(pathToFileURL(runtimeRequire.resolve('eslint')).href)
  const tseslint = (await import(pathToFileURL(runtimeRequire.resolve('typescript-eslint')).href)).default
  const { harnessBaseline } = await import('../scripts/lint-guard-baseline.mjs')
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'component-body-'))
  const eslint = new ESLint({
    cwd,
    overrideConfigFile: true,
    overrideConfig: [{ files: ['**/*.tsx'], languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } } }, ...harnessBaseline([])],
  })
  const [result] = await eslint.lintText(code, { filePath: path.join(cwd, relativePath) })
  return result.messages.filter((message) => message.ruleId?.startsWith('harness/')).map((message) => message.ruleId)
}

test('ESLint 런타임: 기본 잠금이 컴포넌트 본문 위반을 잡는다', { skip: skipWithoutRuntime }, async () => {
  const rules = await lintWithRuntime(BAD_COMPONENT, 'src/Card.tsx')
  assert.deepEqual([...rules].sort(), ['harness/component-body', 'harness/component-body', 'harness/component-body', 'harness/no-direct-effect'])
})

test('ESLint 런타임: 핸들러·useCallback·memo·훅·최상위 보조 함수는 허용한다', { skip: skipWithoutRuntime }, async () => {
  assert.deepEqual(await lintWithRuntime(GOOD_COMPONENT, 'src/Card.tsx'), [])
})

test('ESLint 런타임: error.tsx는 효과 직접 호출을 허용하고, 테스트 파일은 규칙을 끈다', { skip: skipWithoutRuntime }, async () => {
  const errorBoundary = "export default function Error() {\n  useEffect(() => undefined, [])\n  return <p />\n}\n"
  assert.deepEqual(await lintWithRuntime(errorBoundary, 'app/error.tsx'), [])
  assert.deepEqual(await lintWithRuntime(errorBoundary, 'app/page.tsx'), ['harness/no-direct-effect'])
  assert.deepEqual(await lintWithRuntime(BAD_COMPONENT, 'src/Card.test.tsx'), [])
})

test('lint-guard 오버레이: 프로젝트 ESLint 설정 아래에 깔린 컴포넌트 본문 규칙이 동작한다', { skip: skipWithoutRuntime }, () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'component-body-project-')))
  fs.mkdirSync(path.join(root, 'node_modules', '.bin'), { recursive: true })
  fs.symlinkSync(path.join(RUNTIME, 'node_modules', '.bin', 'eslint'), path.join(root, 'node_modules', '.bin', 'eslint'))
  fs.writeFileSync(path.join(root, 'eslint.config.mjs'), "export default [{ files: ['**/*.jsx'], languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } } }]\n")
  fs.mkdirSync(path.join(root, 'src'))
  const file = path.join(root, 'src', 'Card.jsx')
  fs.writeFileSync(file, 'export function Card() {\n  const format = (value) => value\n  return <p>{format(1)}</p>\n}\n')
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'component-body-home-'))
  const result = spawnSync('node', [GUARD], {
    encoding: 'utf8',
    input: JSON.stringify({ hook_event_name: 'PostToolUse', tool_name: 'Edit', cwd: root, tool_input: { file_path: file } }),
    env: { ...process.env, HOME: home, MY_FE_HARNESS_LINT_GUARD: '' },
  })
  assert.equal(result.status, 2)
  assert.match(result.stderr, /format: 컴포넌트 안에는 이벤트 핸들러/)
  assert.match(result.stderr, /harness\/component-body/)
})
