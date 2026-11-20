import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { fsd } from 'my-fe-harness/eslint'
import { FSD_SETTINGS, fsdSettings } from '../scripts/lint-guard-fsd.mjs'

const RUNTIME = process.env.MY_FE_HARNESS_RUNTIME_DIR || path.join(os.homedir(), '.claude', 'my-fe-harness-runtime')
const hasRuntime = fs.existsSync(path.join(RUNTIME, 'node_modules', 'eslint')) && fs.existsSync(path.join(RUNTIME, 'node_modules', 'typescript-eslint'))
const skip = hasRuntime ? false : 'ESLint 런타임(~/.claude/my-fe-harness-runtime)이 없다'

const runtimeRequire = createRequire(path.join(RUNTIME, 'package.json'))
const { Linter } = hasRuntime ? await import(pathToFileURL(runtimeRequire.resolve('eslint')).href) : {}
const tseslint = hasRuntime ? (await import(pathToFileURL(runtimeRequire.resolve('typescript-eslint')).href)).default : null

const CWD = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fsd-')))
const LABS = { layers: { pages: 'views' } }
const NEXT_OFFICIAL = { layers: { app: '_app', pages: '_pages' } }

function lint(code, filename, options, cwd = CWD) {
  const parser = { files: ['**/*.{ts,tsx}'], languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } } }
  return new Linter({ cwd }).verify(code, [parser, ...fsd(options)], { filename: path.join(cwd, filename) })
}

function check(rule, code, filename = 'src/features/first/ui/First.tsx', layout = LABS, cwd = CWD) {
  return lint(code, filename, { next: true, jotai: true, ...layout }, cwd)
    .filter((message) => message.ruleId === `fsd/${rule}`)
    .map((message) => message.message)
}

test('fsd 프리셋: 기본 네 규칙, next면 라우팅 위치·루트 app 공개 API, jotai면 atom 위치까지 켠다', () => {
  const rulesOf = (configs) => configs.flatMap((config) => Object.keys(config.rules))
  assert.deepEqual(rulesOf(fsd()), ['fsd/slice-structure', 'fsd/public-api', 'fsd/independent-slices', 'fsd/component-file'])
  assert.deepEqual(fsd().map((config) => config.files), [['src/**/*.{ts,tsx}']])
  const nextConfigs = fsd({ next: true, jotai: true, ...LABS })
  assert.ok(rulesOf(nextConfigs).includes('fsd/routing-location'))
  assert.ok(rulesOf(nextConfigs).includes('fsd/entity-state'))
  assert.deepEqual(nextConfigs[1].files, ['app/**/*.{ts,tsx}', '*.{ts,tsx}'])
  assert.equal(nextConfigs[0].settings[FSD_SETTINGS].layers.find(({ role }) => role === 'pages').folder, 'views')
})

test('independent-slices: 옆 슬라이스·위 레이어 참조를 막는다(상대경로·재수출·동적 import 포함)', { skip }, () => {
  assert.equal(check('independent-slices', "import { state } from '@features/first/model/store';").length, 0)
  assert.equal(check('independent-slices', "import { state } from '@entities/game';").length, 0)
  for (const code of [
    "import { Other } from '@features/second';",
    "import { Home } from '@views/home';",
    "import { Other } from '../../../views/home/ui/Home';",
    "export { Other } from '@features/second';",
    "export * from '@features/second';",
    "const other = import('@features/second');",
    'const other = import(`@features/second`);',
    "type Other = import('@features/second').Other;",
    "import { Other } from '@features/first/../second';",
  ])
    assert.equal(check('independent-slices', code).length, 1, code)
})

test('slice-structure: 슬라이스는 루트 공개 API와 목적 세그먼트만, shared는 세그먼트·항목 진입점만', { skip }, () => {
  const structure = (filename) => check('slice-structure', 'export const value = 1;', filename).length
  for (const ok of ['src/features/first/index.ts', 'src/features/first/index.server.ts', 'src/features/first/model/hooks/useFirst.ts', 'src/shared/lib/cn/index.ts', 'src/shared/lib/cn.ts', 'src/shared/config/index.ts'])
    assert.equal(structure(ok), 0, ok)
  for (const bad of ['src/features/first/actions.ts', 'src/features/first/hooks/useFirst.ts', 'src/features/first/model/index.ts', 'src/views/home/HomeView.tsx', 'src/shared/lib/index.ts', 'src/shared/world/world.ts', 'src/shared/model/store.ts'])
    assert.equal(structure(bad), 1, bad)
})

test('public-api: 슬라이스는 공개 API로만, shared는 항목 진입점까지만, 슬라이스 안은 별칭으로 안쪽 파일 직접', { skip }, () => {
  const api = (code, filename) => check('public-api', code, filename).length
  for (const ok of [
    "import { Game } from '@entities/game';",
    "import { loadGame } from '@entities/game/index.server';",
    "import { First } from '@features/first/ui/First';",
    "import { state } from '@features/first/model/store';",
    "import { cn } from '@shared/lib/cn';",
    "import { SITE } from '@shared/config';",
  ])
    assert.equal(api(ok), 0, ok)
  for (const bad of [
    "import { Game } from '@entities/game/model/types';",
    "import { Game } from '../../../entities/game/ui/Game';",
    "export { Game } from '@entities/game/ui/Game';",
    "const game = import('@entities/game/ui/Game');",
    "type Game = import('@entities/game/model/types').Game;",
    "import { First } from '@features/first';",
    "import { cn } from '@shared/lib';",
    "import { cn } from '@shared/lib/cn/cn';",
  ])
    assert.equal(api(bad), 1, bad)
  assert.equal(api("import { Home } from '@views/home';", 'app/page.tsx'), 0)
  assert.equal(api("import { Home } from '@views/home/ui/Home';", 'app/page.tsx'), 1)
  assert.equal(api("import { cn } from '@shared/lib/cn';", 'src/shared/ui/button/Button.tsx'), 0)
  assert.equal(api("import { variants } from '@shared/ui/button/variants';", 'src/shared/ui/button/Button.tsx'), 0)
  assert.equal(api("import { app } from '@shared/lib/firebase/config';", 'src/shared/ui/button/Button.tsx'), 1)
  assert.equal(api("import { Game } from '@entities/game/model/types';", 'src/features/first/model/first.test.ts'), 0)
})

test('public-api: 공개 API는 export *를 쓰지 않는다', { skip }, () => {
  const entry = (code) => check('public-api', code, 'src/features/first/index.ts').length
  assert.equal(entry("export * from '@features/first/ui/First';"), 1)
  assert.equal(entry("export { First } from '@features/first/ui/First';"), 0)
  assert.equal(entry("export type { First } from '@features/first/model/types';"), 0)
})

test('component-file: 컴포넌트는 ui/의 같은 이름 파일에, 훅 파일에 숨기지 않는다', { skip }, () => {
  assert.equal(check('component-file', 'function First() { return <div />; }').length, 0)
  assert.equal(check('component-file', 'function First() { return <div />; } function Other() { return <div />; }').length, 1)
  assert.equal(check('component-file', 'const Other = () => <div />;').length, 1)
  assert.equal(check('component-file', 'function Provider() { return <div />; }', 'src/entities/game/model/hooks/useGame.tsx').length, 1)
  assert.equal(check('component-file', 'function Other() { return <div />; }', 'src/entities/game/config/ui/Other.tsx').length, 1)
})

test('routing-location: Next 라우팅 파일은 FSD app 레이어에 두지 않는다', { skip }, () => {
  assert.equal(check('routing-location', 'export default function Page() {}', 'src/app/page.tsx').length, 1)
  assert.equal(check('routing-location', 'export function AppProviders() {}', 'src/app/providers/AppProviders.tsx').length, 0)
})

test('entity-state: 전역 atom은 슬라이스 model/에서만', { skip }, () => {
  const state = (code, filename) => check('entity-state', code, filename).length
  const atom = "import { atom } from 'jotai';\nconst value = atom(0);"
  assert.equal(state(atom), 1)
  assert.equal(state(atom, 'src/shared/lib/store.ts'), 1)
  assert.equal(state(atom, 'src/views/home/ui/model/state.ts'), 1)
  assert.equal(state(atom, 'src/entities/game/model/store/game.ts'), 0)
  assert.equal(state("import { atomWithStorage } from 'jotai/utils';\nconst value = atomWithStorage('key', 0);", 'src/views/home/model/store.ts'), 0)
  assert.equal(state("import { atom as makeAtom } from 'jotai/vanilla';\nconst value = makeAtom(0);"), 1)
  assert.equal(state("import * as jotai from 'jotai';\nconst value = jotai.atom(0);"), 1)
  assert.equal(state("import { atom } from './chemistry';\nconst value = atom(0);"), 0)
})

test('레이어 이름은 설정으로: Next 공식(_app·_pages)에서도 같은 판정, 별칭은 역할 이름(@pages)도 받는다', { skip }, () => {
  const official = (rule, code, filename) => check(rule, code, filename, NEXT_OFFICIAL).length
  assert.equal(official('independent-slices', "import { Report } from '@pages/report';", 'src/features/share/ui/Share.tsx'), 1)
  assert.equal(official('public-api', "import { User } from '@entities/user/model/types';", 'src/_pages/home/ui/Home.tsx'), 1)
  assert.equal(official('public-api', "import { User } from '@entities/user';", 'src/_pages/home/ui/Home.tsx'), 0)
  assert.equal(official('routing-location', 'export default function Page() {}', 'src/_app/page.tsx'), 1)
  assert.equal(official('slice-structure', 'export const value = 1;', 'src/_pages/home/HomeView.tsx'), 1)
})

test('별칭은 tsconfig paths가 먼저: 관례와 다른 별칭도, 관례와 충돌하는 별칭도 실제 폴더로 풀어 판정한다', { skip }, () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fsd-tsconfig-')))
  const paths = { '~feature/*': ['./src/features/*'], '~/*': ['./src/*'], '@features/*': ['./src/entities/*'] }
  fs.writeFileSync(path.join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: { paths } }))
  const api = (code) => check('public-api', code, 'src/views/home/ui/Home.tsx', LABS, root)
  assert.equal(api("import { Like } from '~feature/like/ui/LikeButton';").length, 1)
  assert.equal(api("import { Like } from '~feature/like';").length, 0)
  assert.equal(api("import { User } from '~/entities/user/model/types';").length, 1)
  assert.deepEqual(api("import { User } from '@features/user/model/types';"), ['entities/user는 공개 API(index.ts)로만 import한다.'])
})

test('기본 레이어 이름(pages·widgets)과 레이어 방향: app은 아래를 다 쓰고, 아래는 위를 못 쓴다', { skip }, () => {
  const deps = (code, filename) => check('independent-slices', code, filename, {}).length
  assert.equal(deps("import { Other } from '@pages/other';", 'src/pages/home/ui/Home.tsx'), 1)
  assert.equal(deps("import { Header } from '@widgets/header';", 'src/features/like/ui/Like.tsx'), 1)
  assert.equal(deps("import { Header } from '@widgets/header';", 'src/pages/home/ui/Home.tsx'), 0)
  assert.equal(deps("import { Home } from '@pages/home';", 'src/app/providers/Router.tsx'), 0)
  assert.equal(deps("import { Like } from '@features/like';", 'src/shared/ui/button/Button.tsx'), 1)
})

test('프리셋 적용 범위: srcDir 밖·루트 app은 next일 때만 공개 API, 테스트 파일은 공개 API 제외', { skip }, () => {
  const deep = "import { Home } from '@views/home/ui/Home';"
  const rules = (filename, options) => lint(deep, filename, { ...LABS, ...options }).map((message) => message.ruleId)
  assert.deepEqual(rules('app/page.tsx', { next: true }), ['fsd/public-api'])
  assert.deepEqual(rules('app/page.tsx', {}), [])
  assert.deepEqual(rules('scripts/build.ts', { next: true }), [])
  assert.ok(!rules('src/features/first/model/__tests__/first.test.ts', {}).includes('fsd/public-api'))
  assert.ok(rules('src/features/first/model/first.ts', {}).includes('fsd/public-api'))
})

test('srcDir 표기는 정규화하고(./src/, 역슬래시), 쓰지 않는 레이어는 false로 끈다', { skip }, () => {
  const violation = "import { Game } from '@entities/game/model/types';"
  for (const srcDir of ['./src/', 'src/', 'src\\']) assert.equal(lint(violation, 'src/features/first/ui/First.tsx', { srcDir }).length, 1, srcDir)
  const pagesRouterFile = 'src/pages/index.tsx'
  assert.ok(lint('export default function Home() {}', pagesRouterFile, {}).length > 0)
  assert.equal(lint('export default function Home() {}', pagesRouterFile, { layers: { pages: false } }).length, 0)
  assert.equal(check('routing-location', 'export default function Page() {}', 'src/app/page.tsx', NEXT_OFFICIAL).length, 0)
})

test('잘못된 설정은 조용히 규칙을 끄지 않고 에러를 낸다', () => {
  assert.throws(() => fsd({ nxt: true }), /알 수 없는 옵션 nxt/)
  assert.throws(() => fsd({ layers: { page: 'views' } }), /알 수 없는 레이어 역할 page/)
  assert.throws(() => fsd({ layers: { pages: '' } }), /layers\.pages/)
  assert.throws(() => fsd({ layers: null }), TypeError)
  assert.throws(() => fsd({ srcDir: '.' }), /srcDir/)
  assert.throws(() => fsd({ srcDir: '' }), /srcDir/)
  assert.equal(fsdSettings({ srcDir: './apps/web/src/' }).srcDir, 'apps/web/src')
})
