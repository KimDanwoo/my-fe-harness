import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { aliasPathFor, aliasRootsOf, parseJsonc } from '../scripts/lint-guard-plugin.mjs'

const RUNTIME = path.join(os.homedir(), '.claude', 'my-fe-harness-runtime')
const hasRuntime = fs.existsSync(path.join(RUNTIME, 'node_modules', 'eslint')) && fs.existsSync(path.join(RUNTIME, 'node_modules', 'typescript-eslint'))
const skipWithoutRuntime = hasRuntime ? false : 'ESLint 런타임(~/.claude/my-fe-harness-runtime)이 없다'

const PROJECT = path.resolve('/project')
const at = (...parts) => path.join(PROJECT, ...parts)

test('parseJsonc: 주석·끝 쉼표가 있는 tsconfig를 읽고, 문자열 안의 //는 지우지 않는다', () => {
  const text = `{
    // 별칭
    "$schema": "https://json.schemastore.org/tsconfig",
    "compilerOptions": { /* 경로 */ "paths": { "~/*": ["./src/*"], }, },
  }`
  assert.deepEqual(parseJsonc(text), {
    $schema: 'https://json.schemastore.org/tsconfig',
    compilerOptions: { paths: { '~/*': ['./src/*'] } },
  })
  assert.equal(parseJsonc('{ 깨진'), null)
})

test('aliasRootsOf: 와일드카드 별칭만, 긴 폴더가 먼저, baseUrl 기준', () => {
  const config = { compilerOptions: { baseUrl: '.', paths: { '@/*': ['./*'], '@features/*': ['./src/features/*'], '@env': ['./src/env.ts'] } } }
  assert.deepEqual(aliasRootsOf(config, PROJECT), [
    { prefix: '@features/', dir: at('src', 'features') },
    { prefix: '@/', dir: PROJECT },
  ])
  assert.deepEqual(aliasRootsOf({ compilerOptions: { baseUrl: 'src', paths: { '~/*': ['*'] } } }, PROJECT), [{ prefix: '~/', dir: at('src') }])
  assert.deepEqual(aliasRootsOf(null, PROJECT), [])
})

test('aliasPathFor: 가져오는 파일과 대상이 모두 별칭 범위 안이면 별칭 경로를 돌려준다', () => {
  const roots = aliasRootsOf({ compilerOptions: { paths: { '~/*': ['./src/*'] } } }, PROJECT)
  const importer = at('src', 'components', 'Card.tsx')
  assert.equal(aliasPathFor(importer, './Badge', roots), '~/components/Badge')
  assert.equal(aliasPathFor(importer, '../lib/format', roots), '~/lib/format')
  assert.equal(aliasPathFor(importer, '.', roots), '~/components')
  assert.equal(aliasPathFor(importer, '~/lib/format', roots), null)
  assert.equal(aliasPathFor(importer, 'react', roots), null)
  assert.equal(aliasPathFor(importer, '../../scripts/x', roots), null)
  assert.equal(aliasPathFor(at('scripts', 'build.ts'), './util', roots), null)
  assert.equal(aliasPathFor(at('scripts', 'build.ts'), '../src/lib/format', roots), null)
})

test('aliasPathFor: 가장 구체적인 별칭을 고른다', () => {
  const roots = aliasRootsOf({ compilerOptions: { paths: { '@/*': ['./*'], '@features/*': ['./src/features/*'] } } }, PROJECT)
  assert.equal(aliasPathFor(at('src', 'features', 'auth', 'ui', 'Form.tsx'), '../model/useAuth', roots), '@features/auth/model/useAuth')
  assert.equal(aliasPathFor(at('e2e', 'login.e2e.ts'), './fixtures', roots), '@/e2e/fixtures')
})

async function lintProject(files, target, { fix = false } = {}) {
  const runtimeRequire = createRequire(path.join(RUNTIME, 'package.json'))
  const { ESLint } = await import(pathToFileURL(runtimeRequire.resolve('eslint')).href)
  const tseslint = (await import(pathToFileURL(runtimeRequire.resolve('typescript-eslint')).href)).default
  const { harnessBaseline } = await import('../scripts/lint-guard-baseline.mjs')
  const cwd = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'no-relative-import-')))
  for (const [file, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true })
    fs.writeFileSync(path.join(cwd, file), content)
  }
  const eslint = new ESLint({
    cwd,
    fix,
    overrideConfigFile: true,
    overrideConfig: [{ files: ['**/*.{ts,tsx,js,mjs}'], languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } } }, ...harnessBaseline([])],
  })
  const [result] = await eslint.lintFiles([path.join(cwd, target)])
  if (fix) return result.output
  return result.messages.filter((message) => message.ruleId === 'harness/no-relative-import').map((message) => message.message)
}

const TSCONFIG = '{\n  // 별칭\n  "compilerOptions": { "paths": { "~/*": ["./src/*"] } },\n}\n'
const RELATIVE_IMPORTS = "import { a } from './a'\nexport { b } from '../lib/b'\nexport * from './c'\nconst d = () => import('./d')\nimport e from '~/lib/e'\n"

test('ESLint 런타임: 별칭이 있는 프로젝트의 상대경로 import·export·동적 import를 잡는다', { skip: skipWithoutRuntime }, async () => {
  const messages = await lintProject({ 'tsconfig.json': TSCONFIG, 'src/ui/index.ts': RELATIVE_IMPORTS }, 'src/ui/index.ts')
  assert.deepEqual(messages, [
    "'./a': 상대경로 대신 별칭 전체 경로로 가져온다 → '~/ui/a'",
    "'../lib/b': 상대경로 대신 별칭 전체 경로로 가져온다 → '~/lib/b'",
    "'./c': 상대경로 대신 별칭 전체 경로로 가져온다 → '~/ui/c'",
    "'./d': 상대경로 대신 별칭 전체 경로로 가져온다 → '~/ui/d'",
  ])
})

test('ESLint 런타임: --fix가 상대경로를 별칭 경로로 바꾸고 따옴표 모양을 지킨다', { skip: skipWithoutRuntime }, async () => {
  const output = await lintProject({ 'tsconfig.json': TSCONFIG, 'src/ui/index.ts': RELATIVE_IMPORTS.replace("'./a'", '"./a"') }, 'src/ui/index.ts', { fix: true })
  assert.equal(output, 'import { a } from "~/ui/a"\nexport { b } from \'~/lib/b\'\nexport * from \'~/ui/c\'\nconst d = () => import(\'~/ui/d\')\nimport e from \'~/lib/e\'\n')
})

test('ESLint 런타임: 별칭이 없거나, 별칭 밖 파일·설정 파일·선언 파일·.mjs는 건드리지 않는다', { skip: skipWithoutRuntime }, async () => {
  assert.deepEqual(await lintProject({ 'tsconfig.json': TSCONFIG, 'src/next-env.d.ts': "import './.next/types/routes.d.ts'\n" }, 'src/next-env.d.ts'), [])
  assert.deepEqual(await lintProject({ 'src/ui/index.ts': RELATIVE_IMPORTS }, 'src/ui/index.ts'), [])
  assert.deepEqual(await lintProject({ 'tsconfig.json': TSCONFIG, 'scripts/build.ts': "import x from '../src/lib/x'\n" }, 'scripts/build.ts'), [])
  assert.deepEqual(await lintProject({ 'tsconfig.json': TSCONFIG, 'src/vite.config.ts': "import x from './lib/x'\n" }, 'src/vite.config.ts'), [])
  assert.deepEqual(await lintProject({ 'tsconfig.json': TSCONFIG, 'src/lib/plugin.mjs': "import x from './x.mjs'\n" }, 'src/lib/plugin.mjs'), [])
})

test('ESLint 런타임: 모노레포는 파일마다 가장 가까운 tsconfig의 별칭을 쓴다', { skip: skipWithoutRuntime }, async () => {
  const files = {
    'tsconfig.json': '{}',
    'apps/web/tsconfig.json': '{ "compilerOptions": { "paths": { "@features/*": ["./src/features/*"] } } }',
    'apps/web/src/features/auth/ui/Form.ts': "import { useAuth } from '../model/useAuth'\n",
    'packages/util/src/index.ts': "export * from './date'\n",
  }
  assert.deepEqual(await lintProject(files, 'apps/web/src/features/auth/ui/Form.ts'), [
    "'../model/useAuth': 상대경로 대신 별칭 전체 경로로 가져온다 → '@features/auth/model/useAuth'",
  ])
  assert.deepEqual(await lintProject(files, 'packages/util/src/index.ts'), [])
})
