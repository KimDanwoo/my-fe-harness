import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { isAllowedComment } from '../scripts/lint-guard-plugin.mjs'

const RUNTIME = path.join(os.homedir(), '.claude', 'my-fe-harness-runtime')
const hasRuntime = fs.existsSync(path.join(RUNTIME, 'node_modules', 'eslint')) && fs.existsSync(path.join(RUNTIME, 'node_modules', 'typescript-eslint'))
const skipWithoutRuntime = hasRuntime ? false : 'ESLint 런타임(~/.claude/my-fe-harness-runtime)이 없다'

test('isAllowedComment: shebang과 허용 패턴에 맞는 지시문만 통과한다', () => {
  const allowed = [/^\s*@ts-expect-error\b/]
  assert.equal(isAllowedComment({ type: 'Shebang', value: '/usr/bin/env node' }, allowed), true)
  assert.equal(isAllowedComment({ type: 'Line', value: ' @ts-expect-error 외부 타입 오류' }, allowed), true)
  assert.equal(isAllowedComment({ type: 'Line', value: ' 만료된 세션을 거른다' }, allowed), false)
  assert.equal(isAllowedComment({ type: 'Block', value: '* 합계를 구한다 ' }, allowed), false)
  assert.equal(isAllowedComment({ type: 'Line', value: ' @ts-expect-error' }, []), false)
})

async function commentLines(file, content) {
  const runtimeRequire = createRequire(path.join(RUNTIME, 'package.json'))
  const { ESLint } = await import(pathToFileURL(runtimeRequire.resolve('eslint')).href)
  const tseslint = (await import(pathToFileURL(runtimeRequire.resolve('typescript-eslint')).href)).default
  const { harnessBaseline } = await import('../scripts/lint-guard-baseline.mjs')
  const cwd = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'no-comment-')))
  fs.mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true })
  fs.writeFileSync(path.join(cwd, file), content)
  const eslint = new ESLint({
    cwd,
    overrideConfigFile: true,
    overrideConfig: [{ files: ['**/*.{ts,tsx}'], languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } } }, ...harnessBaseline([])],
  })
  const [result] = await eslint.lintFiles([path.join(cwd, file)])
  return result.messages.filter((message) => message.ruleId === 'harness/no-comment').map((message) => message.line)
}

const MIXED_COMMENTS = [
  '#!/usr/bin/env node',
  '/// <reference types="vite/client" />',
  '// @vitest-environment jsdom',
  '// 만료되지 않은 세션만 남긴다',
  '/** 합계를 구한다 */',
  'export const total = (a: number, b: number) => a + b',
  '/* 블록 주석 */',
  '// @ts-expect-error 외부 타입이 틀렸다',
  'export const lazy = () => import(/* webpackChunkName: "chart" */ "chart")',
  '// @ts-ignore',
  '// prettier-ignore',
  'export const grid = [1, 0, 0]',
  '// https://example.com/issue 링크가 있어도 설명 주석이다',
  '',
].join('\n')

test('ESLint 런타임: 설명 주석·JSDoc·@ts-ignore·링크 주석을 잡고 도구 지시문과 shebang은 통과시킨다', { skip: skipWithoutRuntime }, async () => {
  assert.deepEqual(await commentLines('src/sample.ts', MIXED_COMMENTS), [4, 5, 7, 10, 13])
})

test('ESLint 런타임: .mjs·.tsx·테스트 파일에도 같은 규칙이 걸린다', { skip: skipWithoutRuntime }, async () => {
  assert.deepEqual(await commentLines('scripts/build.mjs', '// 빌드한다\nexport const build = () => null\n'), [1])
  assert.deepEqual(await commentLines('src/Card.tsx', 'export const Card = () => <div>{/* 카드 */}</div>\n'), [1])
  assert.deepEqual(await commentLines('src/__tests__/a.test.ts', '// 준비\nexport const a = 1\n'), [1])
})
