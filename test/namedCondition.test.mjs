import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { isCompoundCondition, isConditionValue } from '../scripts/lint-guard-plugin.mjs'

const RUNTIME = path.join(os.homedir(), '.claude', 'my-fe-harness-runtime')
const hasRuntime = fs.existsSync(path.join(RUNTIME, 'node_modules', 'eslint')) && fs.existsSync(path.join(RUNTIME, 'node_modules', 'typescript-eslint'))
const skipWithoutRuntime = hasRuntime ? false : 'ESLint 런타임(~/.claude/my-fe-harness-runtime)이 없다'

const identifier = (name) => ({ type: 'Identifier', name })
const logical = (operator) => ({ type: 'LogicalExpression', operator, left: identifier('a'), right: identifier('b') })
const not = (argument) => ({ type: 'UnaryExpression', operator: '!', argument })
const binary = (operator) => ({ type: 'BinaryExpression', operator, left: identifier('a'), right: identifier('b') })

test('isCompoundCondition: &&·||(부정 포함)만 복합 조건으로 본다', () => {
  assert.equal(isCompoundCondition(logical('&&')), true)
  assert.equal(isCompoundCondition(logical('||')), true)
  assert.equal(isCompoundCondition(not(logical('&&'))), true)
  assert.equal(isCompoundCondition(logical('??')), false)
  assert.equal(isCompoundCondition(binary('===')), false)
  assert.equal(isCompoundCondition(identifier('isOpen')), false)
})

test('isConditionValue: 복합 조건과 비교식만 조건 값으로 본다', () => {
  assert.equal(isConditionValue(logical('&&')), true)
  assert.equal(isConditionValue(binary('>=')), true)
  assert.equal(isConditionValue(not(binary('instanceof'))), true)
  assert.equal(isConditionValue(binary('+')), false)
  assert.equal(isConditionValue(identifier('user')), false)
})

async function conditionMessages(content) {
  const runtimeRequire = createRequire(path.join(RUNTIME, 'package.json'))
  const { ESLint } = await import(pathToFileURL(runtimeRequire.resolve('eslint')).href)
  const tseslint = (await import(pathToFileURL(runtimeRequire.resolve('typescript-eslint')).href)).default
  const { harnessBaseline } = await import('../scripts/lint-guard-baseline.mjs')
  const cwd = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'named-condition-')))
  const file = path.join(cwd, 'src', 'sample.ts')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, content)
  const eslint = new ESLint({
    cwd,
    overrideConfigFile: true,
    overrideConfig: [{ files: ['**/*.ts'], languageOptions: { parser: tseslint.parser } }, ...harnessBaseline([])],
  })
  const [result] = await eslint.lintFiles([file])
  return result.messages.filter((message) => message.ruleId === 'harness/named-condition').map((message) => `${message.line}:${message.messageId}`)
}

const CONDITIONS = [
  'export function run(user: { age: number; banned: boolean }, isOpen: boolean, items: number[]) {',
  '  if (user.age >= 19 && !user.banned) return 1',
  '  const label = isOpen || items.length > 0 ? "a" : "b"',
  '  while (!(isOpen && user.banned)) break',
  '  const ok = user.age >= 19',
  '  if (ok) return 2',
  '  const canPurchase = user.age >= 19 && !user.banned',
  '  if (canPurchase) return 3',
  '  if (!isOpen) return 4',
  '  if (user.age > 0) return 5',
  '  if (items.some((item) => item > 0 && item < 9)) return 6',
  '  const name = label ?? "guest"',
  '  if (name) return 7',
  '  return label',
  '}',
  '',
].join('\n')

test('ESLint 런타임: if·삼항·while의 &&·|| 조건과 is·has·should·can 없는 조건 변수를 잡는다', { skip: skipWithoutRuntime }, async () => {
  assert.deepEqual(await conditionMessages(CONDITIONS), ['2:compoundCondition', '3:compoundCondition', '4:compoundCondition', '6:conditionName'])
})
