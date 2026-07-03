import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { detectFrameworks } from '../src/detect.mjs'
import { hashFile, readManifest } from '../src/manifest.mjs'
import { PACKAGE_VERSION } from '../src/version.mjs'

const BIN = fileURLToPath(new URL('../bin/my-fe-harness.mjs', import.meta.url))

function cli(args, { input = '', env } = {}) {
  const r = spawnSync('node', [BIN, ...args], { encoding: 'utf8', input, env: env ?? process.env })
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') }
}
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mfh-'))
// 규칙 팩 파일만 — 스택 스탬프(_stack.md)는 제외한다.
const rules = (d) => {
  const p = path.join(d, '.claude/rules')
  return fs.existsSync(p) ? fs.readdirSync(p).filter((f) => f.endsWith('.md') && !f.startsWith('_')).sort() : []
}
const withTmp = (fn) => {
  const d = tmp()
  try { return fn(d) } finally { fs.rmSync(d, { recursive: true, force: true }) }
}

test('--version prints name', () => {
  const { code, out } = cli(['--version'])
  assert.equal(code, 0)
  assert.match(out, /my-fe-harness/)
})

test('add core react = safety+typescript+patterns+react', () =>
  withTmp((d) => {
    cli(['add', 'core', 'react', '--target', d])
    assert.deepEqual(rules(d), ['patterns.md', 'react.md', 'safety.md', 'typescript.md'])
  }))

test('add core vue installs vue, not react', () =>
  withTmp((d) => {
    cli(['add', 'core', 'vue', '--target', d])
    const rr = rules(d)
    assert.ok(rr.includes('vue.md') && rr.includes('safety.md'))
    assert.ok(!rr.includes('react.md'))
  }))

test('add all = 12 rule packs, no structures', () =>
  withTmp((d) => {
    cli(['add', 'all', '--target', d])
    assert.equal(rules(d).length, 12)
    assert.ok(!rules(d).includes('fsd.md'))
  }))

test('aliases resolve', () =>
  withTmp((d) => {
    cli(['add', 'fe', 'clean', 'test', 'style', 'form', 'security', '--target', d])
    for (const f of ['frontend.md', 'patterns.md', 'testing.md', 'styling.md', 'forms.md', 'safety.md'])
      assert.ok(rules(d).includes(f), `missing ${f}`)
  }))

test('unknown token errors with core/all hint', () =>
  withTmp((d) => {
    const { code, out } = cli(['add', 'nope', '--target', d])
    assert.equal(code, 1)
    assert.match(out, /core/)
    assert.match(out, /all/)
  }))

for (const s of ['fsd', 'feature-based', 'layered']) {
  test(`scaffold ${s}: rule + safety + src dirs`, () =>
    withTmp((d) => {
      cli(['scaffold', s, '--target', d])
      assert.ok(rules(d).includes(`${s}.md`))
      assert.ok(rules(d).includes('safety.md'))
      const srcDirs = fs.existsSync(path.join(d, 'src')) ? fs.readdirSync(path.join(d, 'src')) : []
      assert.ok(srcDirs.length >= 4)
      assert.ok(fs.existsSync(path.join(d, 'src', srcDirs[0], 'README.md')))
    }))
}

test('dry-run writes nothing', () =>
  withTmp((d) => {
    cli(['add', 'ts', '--dry-run', '--target', d])
    assert.ok(!fs.existsSync(path.join(d, '.claude')))
  }))

test('re-run is idempotent (skips)', () =>
  withTmp((d) => {
    cli(['add', 'ts', '--target', d])
    assert.match(cli(['add', 'ts', '--target', d]).out, /건너뜀/)
  }))

test('--force overwrites', () =>
  withTmp((d) => {
    cli(['add', 'ts', '--target', d])
    assert.match(cli(['add', 'ts', '--force', '--target', d]).out, /덮어씀/)
  }))

test('guard installs + is idempotent + preserves existing settings', () =>
  withTmp((d) => {
    cli(['guard', '--target', d])
    assert.ok(fs.existsSync(path.join(d, '.claude/settings.json')))
    assert.ok(fs.existsSync(path.join(d, '.claude/hooks/safety-guard.mjs')))
    cli(['guard', '--target', d])
    const s = JSON.parse(fs.readFileSync(path.join(d, '.claude/settings.json'), 'utf8'))
    assert.equal(s.hooks.PreToolUse.length, 1, 'no duplicate hook')
  }))

test('guard preserves pre-existing settings keys', () =>
  withTmp((d) => {
    fs.mkdirSync(path.join(d, '.claude'), { recursive: true })
    fs.writeFileSync(
      path.join(d, '.claude/settings.json'),
      JSON.stringify({ model: 'opus', hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo x' }] }] } }),
    )
    cli(['guard', '--target', d])
    const s = JSON.parse(fs.readFileSync(path.join(d, '.claude/settings.json'), 'utf8'))
    assert.equal(s.model, 'opus')
    assert.equal(s.hooks.PreToolUse.length, 2)
  }))

test('init --all installs rules + guard', () =>
  withTmp((d) => {
    cli(['init', '--all', '--target', d])
    assert.equal(rules(d).length, 12)
    assert.ok(fs.existsSync(path.join(d, '.claude/hooks/safety-guard.mjs')))
  }))

test('non-TTY init errors cleanly (no hang)', () =>
  withTmp((d) => {
    const { code, out } = cli(['init', '--target', d])
    assert.equal(code, 1)
    assert.match(out, /비-TTY/)
  }))

// ---- --global (sandboxed HOME so the real home is never touched) ----
test('add --global writes to sandboxed ~/.claude/rules', () =>
  withTmp((home) => {
    cli(['add', 'core', '--global'], { env: { ...process.env, HOME: home } })
    const rr = fs.readdirSync(path.join(home, '.claude/rules')).sort()
    assert.deepEqual(rr, ['patterns.md', 'safety.md', 'typescript.md'])
  }))

test('guard --global uses ${HOME} hook path in ~/.claude/settings.json', () =>
  withTmp((home) => {
    cli(['guard', '--global'], { env: { ...process.env, HOME: home } })
    const s = JSON.parse(fs.readFileSync(path.join(home, '.claude/settings.json'), 'utf8'))
    const arg = s.hooks.PreToolUse[0].hooks[0].args[0]
    assert.match(arg, /^\$\{HOME\}\/\.claude\/hooks\/safety-guard\.mjs$/)
    assert.ok(fs.existsSync(path.join(home, '.claude/hooks/safety-guard.mjs')))
  }))

// ---- framework auto-detect ----
test('detectFrameworks reads package.json deps', () =>
  withTmp((d) => {
    fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify({ dependencies: { react: '18', next: '14' } }))
    assert.deepEqual(detectFrameworks(d), ['react'])
    fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify({ devDependencies: { vue: '3' } }))
    assert.deepEqual(detectFrameworks(d), ['vue'])
    fs.writeFileSync(path.join(d, 'package.json'), '{ not json')
    assert.deepEqual(detectFrameworks(d), [])
  }))

test('detectFrameworks returns [] when no package.json', () => withTmp((d) => assert.deepEqual(detectFrameworks(d), [])))

// ---- 스택 스탬프(_stack.md) ----
const readStamp = (d) => fs.readFileSync(path.join(d, '.claude/rules/_stack.md'), 'utf8')

test('install writes _stack.md recording detected framework + installed packs', () =>
  withTmp((d) => {
    fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify({ dependencies: { react: '18' } }))
    cli(['add', 'core', 'react', '--target', d])
    const stamp = readStamp(d)
    assert.match(stamp, /react/)
    assert.match(stamp, /typescript/)
    // 팩 개수 카운트는 스탬프를 세지 않는다.
    assert.equal(rules(d).length, 4)
  }))

test('_stack.md not written for --global (no single project stack)', () =>
  withTmp((home) => {
    cli(['add', 'core', '--global'], { env: { ...process.env, HOME: home } })
    assert.ok(!fs.existsSync(path.join(home, '.claude/rules/_stack.md')))
  }))

test('_stack.md skipped when no FE stack detected', () =>
  withTmp((d) => {
    // package.json 없음 → 스택 미감지 → 항상-로드되는 스탬프를 만들지 않는다.
    cli(['add', 'ts', '--target', d])
    assert.ok(!fs.existsSync(path.join(d, '.claude/rules/_stack.md')))
    // 비-FE 의존성만 있어도 스킵.
    fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify({ dependencies: { lodash: '4' } }))
    cli(['add', 'ts', '--force', '--target', d])
    assert.ok(!fs.existsSync(path.join(d, '.claude/rules/_stack.md')))
  }))

// ---- status ----
test('status shows intact then modified', () =>
  withTmp((d) => {
    cli(['add', 'ts', '--target', d])
    assert.match(cli(['status', '--target', d]).out, /원본 그대로/)
    fs.appendFileSync(path.join(d, '.claude/rules/typescript.md'), '\n// mine\n')
    assert.match(cli(['status', '--target', d]).out, /수정됨/)
  }))

test('status with no install is a clean message', () =>
  withTmp((d) => {
    assert.match(cli(['status', '--target', d]).out, /설치 기록이 없습니다/)
  }))

test('install records installedBy = current package version', () =>
  withTmp((d) => {
    cli(['add', 'ts', '--target', d])
    assert.equal(readManifest(path.join(d, '.claude')).installedBy, PACKAGE_VERSION)
  }))

test('status hints update when installed version is older', () =>
  withTmp((d) => {
    cli(['add', 'ts', '--target', d])
    // 오래된 버전으로 설치한 것처럼 매니페스트를 바꿔둔다.
    const mfPath = path.join(d, '.claude/.my-fe-harness-manifest.json')
    const m = JSON.parse(fs.readFileSync(mfPath, 'utf8'))
    m.installedBy = '0.0.1'
    fs.writeFileSync(mfPath, JSON.stringify(m))
    const { out } = cli(['status', '--target', d])
    assert.match(out, /0\.0\.1/)
    assert.match(out, /update/)
  }))

// ---- update ----
test('update refreshes an unmodified stale rule to latest source', () =>
  withTmp((d) => {
    const rulesDir = path.join(d, '.claude/rules')
    fs.mkdirSync(rulesDir, { recursive: true })
    // 구버전 설치본 + 그 해시를 매니페스트에 기록(사용자 미수정 상태를 흉내).
    const dest = path.join(rulesDir, 'typescript.md')
    fs.writeFileSync(dest, '# 구버전\n')
    fs.writeFileSync(
      path.join(d, '.claude/.my-fe-harness-manifest.json'),
      JSON.stringify({ version: 1, rules: { 'typescript.md': hashFile(dest) }, files: {}, hook: null }),
    )
    const { out } = cli(['update', '--target', d])
    assert.match(out, /갱신/)
    assert.notEqual(fs.readFileSync(dest, 'utf8'), '# 구버전\n', '최신 원본으로 교체')
  }))

test('update preserves user-modified rule', () =>
  withTmp((d) => {
    cli(['add', 'ts', '--target', d])
    const dest = path.join(d, '.claude/rules/typescript.md')
    fs.appendFileSync(dest, '\n// 내 수정\n')
    const before = fs.readFileSync(dest, 'utf8')
    const { out } = cli(['update', '--target', d])
    assert.match(out, /보존/)
    assert.equal(fs.readFileSync(dest, 'utf8'), before, '수정본 그대로')
  }))

// ---- 매니페스트 ----
test('install records sha256 manifest for written rules', () =>
  withTmp((d) => {
    cli(['add', 'ts', '--target', d])
    const m = readManifest(path.join(d, '.claude'))
    assert.equal(m.rules['typescript.md'], hashFile(path.join(d, '.claude/rules/typescript.md')))
  }))

// ---- uninstall ----
test('uninstall removes tracked rules + manifest', () =>
  withTmp((d) => {
    cli(['add', 'core', 'react', '--target', d])
    assert.ok(rules(d).length > 0)
    const { out } = cli(['uninstall', '--target', d])
    assert.match(out, /제거/)
    assert.equal(rules(d).length, 0)
    assert.ok(!fs.existsSync(path.join(d, '.claude/.my-fe-harness-manifest.json')))
    assert.ok(!fs.existsSync(path.join(d, '.claude/rules/_stack.md')))
  }))

test('unsync alias works', () =>
  withTmp((d) => {
    cli(['add', 'ts', '--target', d])
    cli(['unsync', '--target', d])
    assert.equal(rules(d).length, 0)
  }))

test('uninstall preserves user-modified rule (hash mismatch)', () =>
  withTmp((d) => {
    cli(['add', 'ts', '--target', d])
    const file = path.join(d, '.claude/rules/typescript.md')
    fs.appendFileSync(file, '\n<!-- 내가 직접 추가 -->\n')
    const { out } = cli(['uninstall', '--target', d])
    assert.ok(fs.existsSync(file), '수정된 파일은 보존되어야 한다')
    assert.match(out, /보존/)
  }))

test('uninstall does not touch untracked user files', () =>
  withTmp((d) => {
    cli(['add', 'ts', '--target', d])
    const mine = path.join(d, '.claude/rules/my-own.md')
    fs.writeFileSync(mine, '# 내 규칙')
    cli(['uninstall', '--target', d])
    assert.ok(fs.existsSync(mine), '추적하지 않는 사용자 파일은 보존')
  }))

test('uninstall --dry-run removes nothing', () =>
  withTmp((d) => {
    cli(['add', 'ts', '--target', d])
    cli(['uninstall', '--dry-run', '--target', d])
    assert.ok(fs.existsSync(path.join(d, '.claude/rules/typescript.md')))
    assert.ok(fs.existsSync(path.join(d, '.claude/.my-fe-harness-manifest.json')))
  }))

test('uninstall with no manifest is a clean no-op', () =>
  withTmp((d) => {
    const { code, out } = cli(['uninstall', '--target', d])
    assert.equal(code, 0)
    assert.match(out, /매니페스트가 없습니다|제거할 항목/)
  }))

test('uninstall strips only our guard hook, preserves other settings', () =>
  withTmp((d) => {
    fs.mkdirSync(path.join(d, '.claude'), { recursive: true })
    fs.writeFileSync(
      path.join(d, '.claude/settings.json'),
      JSON.stringify({ model: 'opus', hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo x' }] }] } }),
    )
    cli(['guard', '--target', d])
    cli(['uninstall', '--target', d])
    const s = JSON.parse(fs.readFileSync(path.join(d, '.claude/settings.json'), 'utf8'))
    assert.equal(s.model, 'opus', '무관한 설정 보존')
    assert.equal(s.hooks.PreToolUse.length, 1, '사용자 훅만 남는다')
    assert.equal(s.hooks.PreToolUse[0].hooks[0].command, 'echo x')
    assert.ok(!fs.existsSync(path.join(d, '.claude/hooks/safety-guard.mjs')), '가드 스크립트 삭제')
  }))

test('uninstall preserves user-modified guard script', () =>
  withTmp((d) => {
    cli(['guard', '--target', d])
    const script = path.join(d, '.claude/hooks/safety-guard.mjs')
    fs.appendFileSync(script, '\n// 내가 수정\n')
    cli(['uninstall', '--target', d])
    assert.ok(fs.existsSync(script), '수정된 가드 스크립트는 보존')
  }))

// guard가 기존 스크립트를 kept(미갱신)할 때 매니페스트는 소스가 아니라 디스크 해시를 기록해야
// 이후 uninstall이 그 스크립트를 올바르게 제거한다(패키지 업데이트로 소스 해시가 바뀌어도).
test('uninstall removes a kept (pre-existing) guard script via disk hash', () =>
  withTmp((d) => {
    const script = path.join(d, '.claude/hooks/safety-guard.mjs')
    fs.mkdirSync(path.dirname(script), { recursive: true })
    fs.writeFileSync(script, '// 구버전 가드 스크립트\n')
    cli(['guard', '--target', d]) // 존재 → kept, 매니페스트엔 디스크 해시 기록
    cli(['uninstall', '--target', d])
    assert.ok(!fs.existsSync(script), 'kept 스크립트도 매니페스트 해시와 일치하면 제거')
  }))

test('uninstall --global removes from sandboxed ~/.claude', () =>
  withTmp((home) => {
    const env = { ...process.env, HOME: home }
    cli(['add', 'core', '--global'], { env })
    cli(['guard', '--global'], { env })
    cli(['uninstall', '--global'], { env })
    assert.ok(!fs.existsSync(path.join(home, '.claude/rules/safety.md')))
    assert.ok(!fs.existsSync(path.join(home, '.claude/hooks/safety-guard.mjs')))
  }))

// ---- 보안: 매니페스트 변조 경로 탈출 차단 ----
test('uninstall refuses to delete files outside .claude via tampered manifest', () =>
  withTmp((d) => {
    cli(['add', 'ts', '--target', d])
    const victim = path.join(d, 'IMPORTANT.txt')
    fs.writeFileSync(victim, 'do not delete')
    // 매니페스트를 변조: rules 밖(../../IMPORTANT.txt)을 정확한 해시로 겨냥.
    const mfPath = path.join(d, '.claude/.my-fe-harness-manifest.json')
    const m = JSON.parse(fs.readFileSync(mfPath, 'utf8'))
    m.rules['../../IMPORTANT.txt'] = hashFile(victim)
    fs.writeFileSync(mfPath, JSON.stringify(m))
    const { out } = cli(['uninstall', '--target', d])
    assert.ok(fs.existsSync(victim), '경로 탈출 대상은 삭제되지 않아야 한다')
    assert.match(out, /경로 밖/)
  }))
