import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import plugin, { bodyProblemOf, componentFunctionsOf, containsStoreCall, isDomainComponent, isEffectCall, passThroughProblem } from '../scripts/lint-guard-plugin.mjs'

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

test('containsStoreCall: store 훅 호출과 그 파생식은 잡고, 함수 안 호출은 넘긴다', () => {
  assert.equal(containsStoreCall(call('useAtomValue', [identifier('modeAtom')])), true)
  assert.equal(containsStoreCall({ type: 'BinaryExpression', left: call('useCartStore', []), right: identifier('LIMIT') }), true)
  assert.equal(containsStoreCall(call('useMemo', [arrow()])), false)
  assert.equal(containsStoreCall(call('useState', [])), false)
})

test('isDomainComponent: 앱 레이어·같은 파일·상대경로 컴포넌트만 대상, shared·외부 패키지는 제외', () => {
  const sources = new Map([
    ['ReportBody', '@pages/report/ui/ReportBody'],
    ['CartList', './CartList'],
    ['Button', '@shared/ui/button'],
    ['Select', '@repo/ui'],
  ])
  assert.equal(isDomainComponent('ReportBody', sources), true)
  assert.equal(isDomainComponent('CartList', sources), true)
  assert.equal(isDomainComponent('LocalPanel', sources), true)
  assert.equal(isDomainComponent('Button', sources), false)
  assert.equal(isDomainComponent('Select', sources), false)
  assert.equal(isDomainComponent('div', sources), false)
  assert.equal(isDomainComponent('AuthContext', sources), false)
  assert.equal(isDomainComponent('ThemeProvider', sources), false)
})

const PASSTHROUGH_COMPONENT = `import { useAtomValue } from 'jotai'
import { ReportBody } from '@pages/report/ui/ReportBody'
import { useCartStore } from '@features/cart/model/store'
import { CartBadge } from '@features/cart/ui/CartBadge'

export function ReportView() {
  const isWebtoon = useAtomValue(modeAtom) === 'webtoon'
  const count = useCartStore((state) => state.count)
  return (
    <section>
      <ReportBody isWebtoon={isWebtoon} />
      <CartBadge count={count} />
    </section>
  )
}
`

const STORE_USED_COMPONENT = `import { useAtomValue } from 'jotai'
import { ReportBody } from '@pages/report/ui/ReportBody'
import { Button } from '@shared/ui/button'

export function ReportView() {
  const isWebtoon = useAtomValue(modeAtom) === 'webtoon'
  const isBusy = useAtomValue(busyAtom)
  const mode = useAtomValue(modeAtom)
  const handleShare = () => share(mode)
  if (!isWebtoon) return <ReportBody isWebtoon={isWebtoon} />
  return <Button disabled={isBusy} onClick={handleShare} />
}
`

test('ESLint 런타임: store 값을 쓰지 않고 앱 컴포넌트에 넘기기만 하면 잡는다', { skip: skipWithoutRuntime }, async () => {
  const rules = await lintWithRuntime(PASSTHROUGH_COMPONENT, 'src/ReportView.tsx')
  assert.deepEqual(rules, ['harness/no-store-passthrough', 'harness/no-store-passthrough'])
})

test('ESLint 런타임: 부모가 store 값을 직접 쓰거나 shared UI에 넘기면 허용한다', { skip: skipWithoutRuntime }, async () => {
  assert.deepEqual(await lintWithRuntime(STORE_USED_COMPONENT, 'src/ReportView.tsx'), [])
})

test('passThroughProblem: store는 자식 수와 무관하게, 커스텀 훅은 자식 하나일 때만, 기본 훅은 대상 아님', () => {
  assert.equal(passThroughProblem({ hooks: ['useAtomValue'], targets: ['A', 'B'] }), 'storePassThrough')
  assert.equal(passThroughProblem({ hooks: ['useReport'], targets: ['A'] }), 'hookPassThrough')
  assert.equal(passThroughProblem({ hooks: ['useReport'], targets: ['A', 'B'] }), null)
  assert.equal(passThroughProblem({ hooks: ['useState'], targets: ['A'] }), null)
  assert.equal(passThroughProblem({ hooks: ['useAtomValue'], targets: null }), null)
})

const HOOK_PASSTHROUGH_COMPONENT = `import { useReportViewModel } from '@pages/report/model/useReportViewModel'
import { ReportBody } from '@pages/report/ui/ReportBody'
import { ReportHeader } from '@pages/report/ui/ReportHeader'

export function SingleChildView() {
  const vm = useReportViewModel()
  return <ReportBody reading={vm.reading} title={vm.title} />
}

export function SharedChildrenView() {
  const vm = useReportViewModel()
  return (
    <>
      <ReportHeader title={vm.title} />
      <ReportBody reading={vm.reading} />
    </>
  )
}

export function ConfiguredFormView({ initial }) {
  const form = useReportViewModel(initial)
  return <ReportBody form={form} />
}

export function RowsView({ rows }) {
  const remove = useReportViewModel()
  return rows.map((row) => <ReportBody key={row.id} onRemove={remove} />)
}
`

test('ESLint 런타임: 커스텀 훅 결과를 자식 하나에만 넘기면 잡고, 여러 자식 공유·목록 행 전달은 허용한다', { skip: skipWithoutRuntime }, async () => {
  assert.deepEqual(await lintWithRuntime(HOOK_PASSTHROUGH_COMPONENT, 'src/ReportViews.tsx'), ['harness/no-store-passthrough'])
})

const PROPS_COMPONENTS = `import type { ComponentProps, ReactNode } from 'react'

interface FiveProps { a: string; b: string; c: string; d: string; e: string }
export function Five(props: FiveProps) { return <div>{props.a}</div> }

type SixProps = { a: string; b: string; c: string; d: string; e: string; f: string }
export function Six({ a }: SixProps) { return <div>{a}</div> }

export const InlineSix = ({ a }: { a: 1; b: 1; c: 1; d: 1; e: 1; f: 1 }) => <div>{a}</div>

interface ButtonProps extends ComponentProps<'button'> { variant?: string; children: ReactNode }
export function Button({ variant, ...props }: ButtonProps) { return <button data-variant={variant} {...props} /> }
`

test('ESLint 런타임: props 6개 이상인 컴포넌트를 잡고, 5개·기본 속성 확장은 허용한다', { skip: skipWithoutRuntime }, async () => {
  assert.deepEqual(await lintWithRuntime(PROPS_COMPONENTS, 'src/Props.tsx'), ['harness/max-props', 'harness/max-props'])
})

const nest = (depth) => (depth === 0 ? 'x' : `<div>${nest(depth - 1)}</div>`)
const MARKUP_COMPONENTS = `export function Shallow() { return ${nest(5)} }
export function Deep() { return ${nest(6)} }
export function Flat() { return <>${'<span />'.repeat(15)}</> }
export function Crowded() { return <>${'<span />'.repeat(16)}</> }
export function Composed() {
  return (
    <Page.Root>
      <Page.Header />
      <Page.Body>
        <Card>
          <Card.Title />
        </Card>
      </Page.Body>
    </Page.Root>
  )
}
`

test('ESLint 런타임: JSX 깊이 6 이상·HTML 요소 16개 이상을 한 컴포넌트에 쌓으면 잡는다', { skip: skipWithoutRuntime }, async () => {
  assert.deepEqual(await lintWithRuntime(MARKUP_COMPONENTS, 'src/Markup.tsx'), ['harness/component-markup', 'harness/component-markup'])
})
