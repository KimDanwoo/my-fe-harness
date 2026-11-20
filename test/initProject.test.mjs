import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PACKAGE_VERSION } from '../src/version.mjs'

const BIN = fileURLToPath(new URL('../bin/my-fe-harness.mjs', import.meta.url))
const HARNESS_ROOT = fileURLToPath(new URL('..', import.meta.url))
const RUNTIME = process.env.MY_FE_HARNESS_RUNTIME_DIR || path.join(os.homedir(), '.claude', 'my-fe-harness-runtime')
const RUNTIME_MODULES = path.join(RUNTIME, 'node_modules')
const hasRuntime = ['eslint', 'typescript-eslint', 'typescript'].every((name) => fs.existsSync(path.join(RUNTIME_MODULES, name)))
const skipWithoutRuntime = hasRuntime ? false : 'ESLint 런타임(~/.claude/my-fe-harness-runtime)이 없다'
const HARNESS_SPEC = `github:KimDanwoo/my-fe-harness#v${PACKAGE_VERSION}`

delete process.env.CODEX_HOME

function cli(args, { env } = {}) {
  const result = spawnSync('node', [BIN, ...args], { encoding: 'utf8', env: { ...process.env, ...env } })
  return { code: result.status, out: (result.stdout || '') + (result.stderr || '') }
}

const withTmp = (fn) => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mfh-init-')))
  try {
    return fn(dir)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

const writeFile = (dir, rel, content) => {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true })
  fs.writeFileSync(path.join(dir, rel), content)
}
const writeJson = (dir, rel, value) => writeFile(dir, rel, `${JSON.stringify(value, null, 2)}\n`)
const readText = (dir, rel) => fs.readFileSync(path.join(dir, rel), 'utf8')
const readJson = (dir, rel) => JSON.parse(readText(dir, rel))
const exists = (dir, rel) => fs.existsSync(path.join(dir, rel))

function nextApp(dir, extra = {}) {
  writeJson(dir, 'package.json', {
    name: 'demo',
    packageManager: 'pnpm@10.12.1',
    scripts: { dev: 'next dev' },
    dependencies: { next: '16.0.0', react: '19.0.0', jotai: '2.0.0' },
    devDependencies: { typescript: '5.9.0' },
    ...extra,
  })
  writeJson(dir, 'tsconfig.json', { compilerOptions: { paths: { '@/*': ['./src/*'] } } })
  writeFile(dir, 'pnpm-lock.yaml', '')
}

const init = (dir, ...flags) => cli(['init', '--yes', '--no-install', '--target', dir, ...flags])

test('init: TS 프로젝트에 eslint 설정·package.json·CI를 한 번에 깐다', () =>
  withTmp((dir) => {
    nextApp(dir)
    const { code, out } = init(dir, '--fsd')
    assert.equal(code, 0, out)

    const config = readText(dir, 'eslint.config.mjs')
    assert.match(config, /import \{ fsd, quality \} from 'my-fe-harness\/eslint'/)
    assert.match(config, /fsd\(\{ next: true, jotai: true \}\)/)
    assert.match(config, /'\.claude\/\*\*'/)

    const pkg = readJson(dir, 'package.json')
    assert.equal(pkg.devDependencies['my-fe-harness'], HARNESS_SPEC)
    assert.ok(pkg.devDependencies.eslint)
    assert.ok(pkg.devDependencies['typescript-eslint'])
    assert.deepEqual(pkg.scripts, { dev: 'next dev', lint: 'eslint .', typecheck: 'tsc --noEmit' })

    const workflow = readText(dir, '.github/workflows/harness.yml')
    assert.match(workflow, /pnpm\/action-setup@v4\n/)
    assert.match(workflow, /pnpm install --frozen-lockfile/)
    assert.match(workflow, /pnpm run lint/)
    assert.match(workflow, /pnpm run typecheck/)
    assert.ok(!workflow.includes('working-directory'))

    assert.ok(exists(dir, '.claude/hooks/lint-guard.mjs'))
    assert.ok(exists(dir, '.claude/hooks/verify-gate.mjs'))
    assert.match(out, /pnpm install/)
  }))

test('init: 구조가 fsd가 아니면 fsd()를 넣지 않는다', () =>
  withTmp((dir) => {
    nextApp(dir)
    init(dir)
    assert.ok(!readText(dir, 'eslint.config.mjs').includes('fsd'))
  }))

test('init: _app·_pages 폴더가 있으면 fsd 레이어 이름으로 쓴다', () =>
  withTmp((dir) => {
    nextApp(dir)
    writeFile(dir, 'src/_pages/README.md', '')
    writeFile(dir, 'src/_app/README.md', '')
    init(dir, '--fsd')
    assert.match(readText(dir, 'eslint.config.mjs'), /layers: \{ app: '_app', pages: '_pages' \}/)
  }))

test('init: 기존 eslint 설정·스크립트·하네스 고정 버전은 건드리지 않는다', () =>
  withTmp((dir) => {
    nextApp(dir, { scripts: { lint: 'next lint' }, devDependencies: { typescript: '5.9.0', 'my-fe-harness': 'catalog:', eslint: '9.0.0' } })
    writeFile(dir, 'eslint.config.mjs', 'export default []\n')
    writeFile(dir, '.github/workflows/harness.yml', 'name: mine\n')

    const { out } = init(dir, '--fsd')
    assert.equal(readText(dir, 'eslint.config.mjs'), 'export default []\n')
    assert.equal(readText(dir, '.github/workflows/harness.yml'), 'name: mine\n')
    const pkg = readJson(dir, 'package.json')
    assert.equal(pkg.scripts.lint, 'next lint')
    assert.equal(pkg.devDependencies['my-fe-harness'], 'catalog:')
    assert.ok(!('typescript-eslint' in pkg.devDependencies))
    assert.match(out, /유지\(이미 존재\)/)
    assert.match(out, /직접 가져오지 않습니다/)
  }))

test('init: 옛 eslintrc면 설정을 만들지 않고 안내한다', () =>
  withTmp((dir) => {
    nextApp(dir)
    writeFile(dir, '.eslintrc.json', '{}\n')
    const { out } = init(dir)
    assert.ok(!exists(dir, 'eslint.config.mjs'))
    assert.ok(!('my-fe-harness' in readJson(dir, 'package.json').devDependencies))
    assert.match(out, /옛 설정 형식/)
  }))

test('init: ESLint 8이면 설정을 만들지 않고 안내한다', () =>
  withTmp((dir) => {
    nextApp(dir, { devDependencies: { typescript: '5.9.0', eslint: '^8.57.0' } })
    const { out } = init(dir)
    assert.ok(!exists(dir, 'eslint.config.mjs'))
    assert.match(out, /8 이하/)
  }))

test('init: JS 프로젝트는 typescript-eslint·typecheck 없이 JS 설정을 깐다', () =>
  withTmp((dir) => {
    writeJson(dir, 'package.json', { name: 'demo', dependencies: { react: '19.0.0' } })
    writeFile(dir, 'package-lock.json', '{}\n')
    init(dir)
    const config = readText(dir, 'eslint.config.mjs')
    assert.ok(!config.includes('typescript-eslint'))
    const pkg = readJson(dir, 'package.json')
    assert.ok(!('typescript-eslint' in pkg.devDependencies))
    assert.deepEqual(pkg.scripts, { lint: 'eslint .' })
    const workflow = readText(dir, '.github/workflows/harness.yml')
    assert.match(workflow, /npm ci/)
    assert.match(workflow, /cache: npm/)
    assert.ok(!workflow.includes('typecheck'))
  }))

test('init: 모노레포 하위 앱이면 workflow를 git 루트에 두고 그 앱 폴더에서 돌린다', () =>
  withTmp((root) => {
    fs.mkdirSync(path.join(root, '.git'))
    writeFile(root, 'pnpm-lock.yaml', '')
    writeFile(root, '.nvmrc', '22\n')
    const app = path.join(root, 'apps/web')
    writeJson(app, 'package.json', { name: 'web', dependencies: { react: '19.0.0' }, devDependencies: { typescript: '5.9.0' } })

    init(app)
    assert.ok(!exists(app, '.github'))
    const workflow = readText(root, '.github/workflows/harness-apps-web.yml')
    assert.match(workflow, /working-directory: "apps\/web"/)
    assert.match(workflow, /node-version-file: \.nvmrc/)
    assert.match(workflow, /pnpm install --frozen-lockfile/)
    assert.match(workflow, /version: \d+/)
  }))

test('init --dry-run은 프로젝트 파일을 쓰지 않는다', () =>
  withTmp((dir) => {
    nextApp(dir)
    const before = readText(dir, 'package.json')
    init(dir, '--fsd', '--dry-run')
    assert.equal(readText(dir, 'package.json'), before)
    assert.ok(!exists(dir, 'eslint.config.mjs'))
    assert.ok(!exists(dir, '.github'))
  }))

test('uninstall: 하네스가 쓴 그대로인 파일·키만 걷어낸다', () =>
  withTmp((dir) => {
    nextApp(dir)
    init(dir, '--fsd')
    const pkg = readJson(dir, 'package.json')
    pkg.scripts.lint = 'eslint . --max-warnings 0'
    writeJson(dir, 'package.json', pkg)

    const status = cli(['status', '--target', dir]).out
    assert.match(status, /eslint\.config\.mjs/)
    assert.match(status, /\.github\/workflows\/harness\.yml/)

    cli(['uninstall', '--target', dir])
    assert.ok(!exists(dir, 'eslint.config.mjs'))
    assert.ok(!exists(dir, '.github/workflows/harness.yml'))
    const after = readJson(dir, 'package.json')
    assert.ok(!('my-fe-harness' in after.devDependencies))
    assert.ok(!('typecheck' in after.scripts))
    assert.equal(after.scripts.lint, 'eslint . --max-warnings 0')
  }))

const FAKE_ESLINT = `#!/usr/bin/env node
const isPrintConfig = process.argv[2] === '--print-config'
const isTypeScriptProbe = /\\.tsx?$/.test(process.argv[3] || '')
const config = isTypeScriptProbe ? process.env.FAKE_CONFIG : process.env.FAKE_CONFIG_JS || process.env.FAKE_CONFIG
process.stdout.write((isPrintConfig ? config : process.env.FAKE_RESULTS) || '')
process.exitCode = isPrintConfig ? 0 : 1
`

function fsdProject(dir) {
  cli(['scaffold', 'fsd', '--target', dir])
  writeFile(dir, 'src/entities/user/ui/UserCard.tsx', 'export const UserCard = 1\n')
}

function fakeEslint(dir) {
  writeFile(dir, 'node_modules/.bin/eslint', FAKE_ESLINT)
  fs.chmodSync(path.join(dir, 'node_modules/.bin/eslint'), 0o755)
}

const FSD_CONFIG = JSON.stringify({ rules: { 'fsd/public-api': [2], 'no-console': [0] } })

test('check(fsd): ESLint가 없으면 실패시키고 init을 안내한다', () =>
  withTmp((dir) => {
    fsdProject(dir)
    const { code, out } = cli(['check', '--target', dir])
    assert.equal(code, 1)
    assert.match(out, /ESLint가 없습니다/)
  }))

test('check(fsd): ESLint 설정에 fsd 규칙이 없으면 실패시킨다', () =>
  withTmp((dir) => {
    fsdProject(dir)
    fakeEslint(dir)
    const { code, out } = cli(['check', '--target', dir], { env: { FAKE_CONFIG: JSON.stringify({ rules: { 'fsd/public-api': 'off' } }) } })
    assert.equal(code, 1)
    assert.match(out, /fsd 규칙이 없습니다/)
  }))

test('check(fsd): 프로젝트 ESLint 결과에서 fsd 규칙 위반만 파일:줄로 보고한다', () =>
  withTmp((dir) => {
    fsdProject(dir)
    fakeEslint(dir)
    const results = [
      {
        filePath: path.join(dir, 'src/entities/user/ui/UserCard.tsx'),
        messages: [
          { ruleId: 'fsd/independent-slices', line: 3, message: 'entities에서 상위 레이어 features를 참조할 수 없다.' },
          { ruleId: 'no-console', line: 4, message: 'Unexpected console statement.' },
        ],
      },
    ]
    const { code, out } = cli(['check', '--target', dir], { env: { FAKE_CONFIG: FSD_CONFIG, FAKE_RESULTS: JSON.stringify(results) } })
    assert.equal(code, 1)
    assert.match(out, /src\/entities\/user\/ui\/UserCard\.tsx:3/)
    assert.match(out, /fsd\/independent-slices/)
    assert.ok(!out.includes('no-console'))
    assert.match(out, /위반 1건/)
  }))

test('check(fsd): fsd 위반이 없으면 통과한다', () =>
  withTmp((dir) => {
    fsdProject(dir)
    fakeEslint(dir)
    const results = [{ filePath: path.join(dir, 'src/entities/user/ui/UserCard.tsx'), messages: [] }]
    const { code, out } = cli(['check', '--target', dir], { env: { FAKE_CONFIG: FSD_CONFIG, FAKE_RESULTS: JSON.stringify(results) } })
    assert.equal(code, 0, out)
    assert.match(out, /위반 없음/)
  }))

test('check(fsd): ESLint가 JSON을 내지 못하면 실패시킨다', () =>
  withTmp((dir) => {
    fsdProject(dir)
    fakeEslint(dir)
    const { code, out } = cli(['check', '--target', dir], { env: { FAKE_CONFIG: FSD_CONFIG, FAKE_RESULTS: 'Oops! Something went wrong!' } })
    assert.equal(code, 1)
    assert.match(out, /ESLint 실행 실패/)
  }))

function linkRuntime(dir) {
  fs.mkdirSync(path.join(dir, 'node_modules/.bin'), { recursive: true })
  for (const name of ['eslint', 'typescript-eslint', 'typescript']) fs.symlinkSync(path.join(RUNTIME_MODULES, name), path.join(dir, 'node_modules', name))
  fs.symlinkSync(HARNESS_ROOT, path.join(dir, 'node_modules/my-fe-harness'))
  fs.symlinkSync(path.join(RUNTIME_MODULES, 'eslint/bin/eslint.js'), path.join(dir, 'node_modules/.bin/eslint'))
}

const runEslint = (dir) => spawnSync(path.join(dir, 'node_modules/.bin/eslint'), ['.'], { cwd: dir, encoding: 'utf8' })

test('init이 만든 TS 설정은 실제 ESLint로 로드되고 check가 FSD 위반을 잡는다', { skip: skipWithoutRuntime }, () =>
  withTmp((dir) => {
    nextApp(dir)
    init(dir, '--fsd')
    linkRuntime(dir)
    writeFile(dir, 'src/features/auth/index.ts', 'export const LoginForm = 1\n')
    writeFile(dir, 'src/entities/user/ui/UserCard.tsx', "import { LoginForm } from '@/features/auth'\n\nexport function UserCard() {\n  return LoginForm\n}\n")

    const lint = runEslint(dir)
    assert.equal(lint.status, 1, lint.stderr)
    assert.match(lint.stdout, /fsd\/independent-slices/)
    assert.ok(!lint.stdout.includes('.claude'), lint.stdout)

    const { code, out } = cli(['check', '--target', dir])
    assert.equal(code, 1, out)
    assert.match(out, /src\/entities\/user\/ui\/UserCard\.tsx:1/)
    assert.match(out, /위반 1건/)
  }))

test('init이 만든 JS 설정은 실제 ESLint로 로드되고 깨끗한 코드를 통과시킨다', { skip: skipWithoutRuntime }, () =>
  withTmp((dir) => {
    writeJson(dir, 'package.json', { name: 'demo', type: 'module', dependencies: { react: '19.0.0' } })
    init(dir)
    linkRuntime(dir)
    writeFile(dir, 'src/App.jsx', 'export function App() {\n  return <main />\n}\n')

    const lint = runEslint(dir)
    assert.equal(lint.status, 0, lint.stdout + lint.stderr)
  }))

test('init: 이미 lint를 돌리는 workflow가 있으면 harness.yml을 만들지 않는다', () =>
  withTmp((dir) => {
    nextApp(dir)
    writeFile(dir, '.github/workflows/ci.yml', 'jobs:\n  check:\n    steps:\n      - run: pnpm lint\n')
    const { out } = init(dir)
    assert.ok(!exists(dir, '.github/workflows/harness.yml'))
    assert.match(out, /\.github\/workflows\/ci\.yml\s+이미 lint를 돌리는 workflow/)
  }))

test('init: 여러 줄 run 블록에서 eslint를 부르는 workflow도 lint workflow로 본다', () =>
  withTmp((dir) => {
    nextApp(dir)
    writeFile(dir, '.github/workflows/ci.yml', 'jobs:\n  check:\n    steps:\n      - name: Lint\n        run: |\n          pnpm exec eslint --no-warn-ignored\n')
    init(dir)
    assert.ok(!exists(dir, '.github/workflows/harness.yml'))
  }))

test('init: lint를 돌리지 않는 workflow만 있으면 harness.yml을 만든다', () =>
  withTmp((dir) => {
    nextApp(dir)
    writeFile(dir, '.github/workflows/deploy.yml', 'jobs:\n  deploy:\n    steps:\n      - name: Deploy\n        run: pnpm build\n')
    init(dir)
    assert.ok(exists(dir, '.github/workflows/harness.yml'))
  }))

test('check(fsd): ESLint가 읽지 못한 파일(문법 오류)이 있으면 통과시키지 않는다', () =>
  withTmp((dir) => {
    fsdProject(dir)
    fakeEslint(dir)
    const results = [{ filePath: path.join(dir, 'src/features/a/index.ts'), messages: [{ ruleId: null, fatal: true, line: 1, message: 'Parsing error: Expression expected.' }] }]
    const { code, out } = cli(['check', '--target', dir], { env: { FAKE_CONFIG: FSD_CONFIG, FAKE_RESULTS: JSON.stringify(results) } })
    assert.equal(code, 1)
    assert.match(out, /읽지 못한 파일/)
    assert.match(out, /src\/features\/a\/index\.ts:1/)
  }))

test('check(fsd): fsd 규칙 확인은 .js보다 .ts 파일로 한다', () =>
  withTmp((dir) => {
    fsdProject(dir)
    fakeEslint(dir)
    writeFile(dir, 'src/app/legacy.js', 'export const legacy = 1\n')
    const env = { FAKE_CONFIG: FSD_CONFIG, FAKE_CONFIG_JS: JSON.stringify({ rules: {} }), FAKE_RESULTS: '[]' }
    const { code, out } = cli(['check', '--target', dir], { env })
    assert.equal(code, 0, out)
  }))

test('check(fsd): JS 파일만 있고 fsd 규칙이 JS에 걸리지 않으면 실패시킨다', () =>
  withTmp((dir) => {
    cli(['scaffold', 'fsd', '--target', dir])
    writeFile(dir, 'src/entities/user/ui/UserCard.jsx', 'export const UserCard = 1\n')
    fakeEslint(dir)
    const { code, out } = cli(['check', '--target', dir], { env: { FAKE_CONFIG: FSD_CONFIG, FAKE_CONFIG_JS: JSON.stringify({ rules: {} }) } })
    assert.equal(code, 1)
    assert.match(out, /fsd 규칙이 없습니다/)
  }))

test('init: lockfile이 없으면 npm으로 설치하고 CI는 고정 설치·캐시를 쓰지 않는다', () =>
  withTmp((dir) => {
    writeJson(dir, 'package.json', { name: 'demo', dependencies: { react: '19.0.0' } })
    const { out } = cli(['init', '--yes', '--no-install', '--target', dir], { env: { npm_config_user_agent: '' } })
    const workflow = readText(dir, '.github/workflows/harness.yml')
    assert.match(workflow, /- run: npm install\n/)
    assert.ok(!workflow.includes('cache:'))
    assert.match(out, /lockfile이 없어/)
  }))

test('init: lockfile이 없으면 실행한 패키지 매니저를 따른다', () =>
  withTmp((dir) => {
    writeJson(dir, 'package.json', { name: 'demo', dependencies: { react: '19.0.0' } })
    cli(['init', '--yes', '--no-install', '--target', dir], { env: { npm_config_user_agent: 'bun/1.2.0 npm/? node/v22' } })
    const workflow = readText(dir, '.github/workflows/harness.yml')
    assert.match(workflow, /oven-sh\/setup-bun@v2/)
    assert.match(workflow, /- run: bun install\n/)
  }))

test('init: 하위 앱에만 packageManager가 있으면 그 pnpm 버전을 CI에 쓴다', () =>
  withTmp((root) => {
    fs.mkdirSync(path.join(root, '.git'))
    writeFile(root, 'pnpm-lock.yaml', '')
    const app = path.join(root, 'apps/web')
    writeJson(app, 'package.json', { name: 'web', packageManager: 'pnpm@9.1.0', dependencies: { react: '19.0.0' } })
    init(app)
    assert.match(readText(root, '.github/workflows/harness-apps-web.yml'), /version: 9\.1\.0/)
  }))

test('init: 루트 package.json에 packageManager가 있으면 pnpm 버전을 따로 넣지 않는다', () =>
  withTmp((root) => {
    fs.mkdirSync(path.join(root, '.git'))
    writeFile(root, 'pnpm-lock.yaml', '')
    writeJson(root, 'package.json', { name: 'root', private: true, packageManager: 'pnpm@10.12.1' })
    const app = path.join(root, 'apps/web')
    writeJson(app, 'package.json', { name: 'web', dependencies: { react: '19.0.0' } })
    init(app)
    const workflow = readText(root, '.github/workflows/harness-apps-web.yml')
    assert.match(workflow, /pnpm\/action-setup@v4\n {6}- uses: actions\/setup-node/)
  }))

test('init: 모노레포 앱마다 workflow를 따로 두고 다른 앱의 하네스 workflow를 lint CI로 보지 않는다', () =>
  withTmp((root) => {
    fs.mkdirSync(path.join(root, '.git'))
    writeFile(root, 'pnpm-lock.yaml', '')
    for (const name of ['web', 'admin']) {
      const app = path.join(root, 'apps', name)
      writeJson(app, 'package.json', { name, dependencies: { react: '19.0.0' } })
      init(app)
    }
    assert.ok(exists(root, '.github/workflows/harness-apps-web.yml'))
    assert.ok(exists(root, '.github/workflows/harness-apps-admin.yml'))
  }))

test('init: yarn Berry는 --immutable 설치와 corepack을 쓴다', () =>
  withTmp((dir) => {
    writeJson(dir, 'package.json', { name: 'demo', packageManager: 'yarn@4.5.0', dependencies: { react: '19.0.0' } })
    writeFile(dir, 'yarn.lock', '')
    init(dir)
    const workflow = readText(dir, '.github/workflows/harness.yml')
    assert.match(workflow, /yarn install --immutable/)
    assert.match(workflow, /corepack enable/)
    assert.ok(!workflow.includes('cache:'))
  }))

test('init: 다른 도구의 lint(golangci-lint)나 주석 속 lint는 lint CI로 보지 않는다', () =>
  withTmp((dir) => {
    nextApp(dir)
    writeFile(dir, '.github/workflows/go.yml', 'jobs:\n  go:\n    steps:\n      # pnpm lint is elsewhere\n      - run: golangci-lint run\n')
    init(dir)
    assert.ok(exists(dir, '.github/workflows/harness.yml'))
  }))

test('init: package.json이 깨져 있으면 아무것도 쓰지 않고 멈춘다', () =>
  withTmp((dir) => {
    writeFile(dir, 'package.json', '{bad')
    const { code, out } = init(dir)
    assert.equal(code, 1)
    assert.match(out, /파싱 실패/)
    assert.deepEqual(fs.readdirSync(dir), ['package.json'])
  }))

test('init --global은 프로젝트 lint·CI 설정을 건너뛴다', () =>
  withTmp((home) =>
    withTmp((dir) => {
      nextApp(dir)
      const { out } = cli(['init', '--yes', '--no-install', '--global', '--target', dir], { env: { HOME: home, MY_FE_HARNESS_SKIP_RUNTIME: '1' } })
      assert.match(out, /전역 설치라 프로젝트 lint·CI 설정은 건너뜁니다/)
      assert.ok(!exists(dir, 'eslint.config.mjs'))
    })))

test('uninstall: 하네스가 새로 만든 devDependencies 구획과 빈 .github 폴더까지 정리한다', () =>
  withTmp((dir) => {
    writeJson(dir, 'package.json', { name: 'demo', dependencies: { react: '19.0.0' } })
    writeFile(dir, 'package-lock.json', '{}\n')
    init(dir)
    cli(['uninstall', '--target', dir])
    const pkg = readJson(dir, 'package.json')
    assert.ok(!('devDependencies' in pkg))
    assert.ok(!('scripts' in pkg))
    assert.ok(!exists(dir, '.github'))
  }))

test('uninstall: 변조된 매니페스트가 가리키는 프로젝트 밖 파일은 건드리지 않는다', () =>
  withTmp((outside) =>
    withTmp((dir) => {
      writeFile(outside, 'victim.txt', 'keep\n')
      nextApp(dir)
      init(dir)
      const manifestFile = path.join(dir, '.claude/.my-fe-harness-manifest.json')
      const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'))
      const escape = path.relative(dir, path.join(outside, 'victim.txt'))
      manifest.project.files[escape] = 'x'
      manifest.project.packageJson.file = path.relative(dir, path.join(outside, 'package.json'))
      fs.writeFileSync(manifestFile, JSON.stringify(manifest))
      const { out } = cli(['uninstall', '--target', dir])
      assert.equal(readText(outside, 'victim.txt'), 'keep\n')
      assert.match(out, /건너뜀\(경로 밖\)/)
    })))
