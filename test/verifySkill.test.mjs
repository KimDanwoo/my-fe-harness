import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CLI = fileURLToPath(new URL('../bin/my-fe-harness.mjs', import.meta.url))
const SKILL = '.claude/skills/verify/SKILL.md'
const SCREENS = 'scripts/verify/screens.ts'
const RUN = 'scripts/verify/run.mjs'

function fakeProject(files, pkg = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-skill-'))
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify(pkg))
  for (const [rel, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true })
    fs.writeFileSync(path.join(root, rel), content)
  }
  return root
}

const install = (root, ...extra) => spawnSync('node', [CLI, 'verify-skill', '--target', root, ...extra], { encoding: 'utf8' })
const read = (root, rel) => fs.readFileSync(path.join(root, rel), 'utf8')
const exists = (root, rel) => fs.existsSync(path.join(root, rel))

const NEXT_PACKAGE = {
  scripts: { verify: 'pnpm lint && pnpm test', build: 'next build', e2e: 'playwright test' },
  dependencies: { next: '15.0.0' },
}

test('Next.js: 동적 세그먼트·병렬·비공개를 뺀 경로와 감지한 명령으로 채운다', () => {
  const root = fakeProject(
    {
      'pnpm-lock.yaml': '',
      'app/page.tsx': '',
      'app/blog/page.tsx': '',
      'app/blog/[slug]/page.tsx': '',
      'app/(marketing)/about/page.jsx': '',
      'app/@modal/login/page.tsx': '',
      'app/_private/page.tsx': '',
      'app/api/health/route.ts': '',
    },
    NEXT_PACKAGE,
  )
  const result = install(root)
  assert.equal(result.status, 0, result.stderr)
  assert.match(read(root, SCREENS), /'\/',\n {2}'\/about',\n {2}'\/blog',\n\] as const/)
  assert.doesNotMatch(read(root, SCREENS), /slug|modal|private|health/)
  const run = read(root, RUN)
  assert.match(run, /SERVER_COMMAND = \['pnpm', 'exec', 'next', 'start'\]/)
  assert.match(run, /PORT_FLAG = \['-p'\]/)
  assert.match(run, /BUILD_COMMAND = \['pnpm', 'run', 'build'\]/)
  assert.equal(spawnSync('node', ['--check', path.join(root, RUN)]).status, 0)
  const skill = read(root, SKILL)
  assert.match(skill, /^name: verify$/m)
  assert.match(skill, /pnpm run verify\n/)
  assert.doesNotMatch(skill, /pnpm run lint/)
  assert.match(skill, /pnpm run build/)
  assert.match(skill, /pnpm run e2e/)
  assert.match(skill, /pnpm add -D @playwright\/test/)
  assert.match(skill, /tsconfig\.json의 exclude/)
  assert.match(read(root, '.gitignore'), /^\/\.verify\/$/m)
  assert.ok(!exists(root, 'tsconfig.json'))
})

test('Astro: src/pages의 .astro·.md에서 경로를 채우고 astro preview로 서버를 띄운다', () => {
  const root = fakeProject(
    {
      'package-lock.json': '',
      'src/pages/index.astro': '',
      'src/pages/about.md': '',
      'src/pages/blog/index.astro': '',
      'src/pages/blog/[slug].astro': '',
      'src/pages/_draft.md': '',
      'src/pages/rss.xml.ts': '',
    },
    {
      scripts: { lint: 'eslint .', typecheck: 'astro check', test: 'vitest run', build: 'astro build' },
      dependencies: { astro: '5.0.0' },
      devDependencies: { '@playwright/test': '1.50.0' },
    },
  )
  assert.equal(install(root).status, 0)
  assert.match(read(root, SCREENS), /'\/',\n {2}'\/about',\n {2}'\/blog',\n\] as const/)
  const run = read(root, RUN)
  assert.match(run, /SERVER_COMMAND = \['npx', '--no-install', 'astro', 'preview'\]/)
  assert.match(run, /PORT_FLAG = \['--port'\]/)
  assert.match(run, /INSTALL_COMMAND = \['npm', 'ci'\]/)
  const skill = read(root, SKILL)
  assert.match(skill, /npm run lint\nnpm run typecheck\nnpm run test\n/)
  assert.doesNotMatch(skill, /@playwright\/test가 devDependencies에 없다/)
  assert.match(skill, /e2e 스크립트\(`e2e` 또는 `test:e2e`\)가 없다/)
})

test('그 외 프레임워크: 경로는 /만, 채우라는 안내, pnpm preview로 서버를 띄운다', () => {
  const root = fakeProject({}, { scripts: { build: 'vite build' }, dependencies: { vite: '6.0.0' } })
  const result = install(root)
  assert.equal(result.status, 0)
  assert.match(read(root, SCREENS), /채운다\.\nexport const ROUTES = \[\n {2}'\/',\n\] as const/)
  assert.match(read(root, RUN), /SERVER_COMMAND = \['pnpm', 'preview'\]/)
  assert.match(read(root, SKILL), /경로를 자동으로 찾지 못했다/)
  assert.match(read(root, SKILL), /preview\(빌드 결과를 서빙\)가 있어야/)
  assert.match(result.stdout, /직접 해야 할 일/)
})

test('기존 파일은 --force 없이는 보존하고, 보존한 파일은 uninstall이 건드리지 않는다', () => {
  const root = fakeProject({ [SCREENS]: 'MINE\n', '.gitignore': 'node_modules' }, NEXT_PACKAGE)
  assert.equal(install(root).status, 0)
  assert.equal(read(root, SCREENS), 'MINE\n')
  assert.equal(read(root, '.gitignore'), 'node_modules\n/.verify/\n')
  assert.equal(install(root).status, 0)
  assert.equal(read(root, '.gitignore'), 'node_modules\n/.verify/\n')

  assert.equal(spawnSync('node', [CLI, 'uninstall', '--target', root]).status, 0)
  assert.equal(read(root, SCREENS), 'MINE\n')
  assert.ok(!exists(root, SKILL))
  assert.ok(!exists(root, RUN))
  assert.ok(!exists(root, '.claude/skills'))
})

test('--force는 덮어쓰고, 사용자가 고친 파일은 uninstall이 보존한다', () => {
  const root = fakeProject({ [SCREENS]: 'MINE\n' }, NEXT_PACKAGE)
  assert.equal(install(root, '--force').status, 0)
  assert.match(read(root, SCREENS), /export const ROUTES/)
  fs.appendFileSync(path.join(root, RUN), '// edited\n')
  const result = spawnSync('node', [CLI, 'uninstall', '--target', root], { encoding: 'utf8' })
  assert.match(result.stdout, /scripts\/verify\/run\.mjs.*(?:수정|보존)/)
  assert.ok(exists(root, RUN))
  assert.ok(!exists(root, SCREENS))
})

test('status가 설치된 verify 스킬 파일을 보여준다', () => {
  const root = fakeProject({}, NEXT_PACKAGE)
  install(root)
  const result = spawnSync('node', [CLI, 'status', '--target', root], { encoding: 'utf8' })
  assert.match(result.stdout, /scripts\/verify\/run\.mjs/)
})

test('--dry-run은 아무것도 쓰지 않고, --global은 거부한다', () => {
  const root = fakeProject({}, NEXT_PACKAGE)
  assert.equal(install(root, '--dry-run').status, 0)
  assert.ok(!exists(root, SKILL))
  assert.ok(!exists(root, '.gitignore'))
  assert.ok(!exists(root, '.claude/.my-fe-harness-manifest.json'))
  const rejected = install(root, '--global')
  assert.notEqual(rejected.status, 0)
  assert.match(rejected.stderr, /프로젝트 전용/)
})

test('package.json이 없으면 실패한다', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-skill-empty-'))
  const result = install(root)
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /package\.json/)
})
