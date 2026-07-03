import fs from 'node:fs'
import path from 'node:path'

// package.json 의존성을 보고 규칙 팩이 있는 프레임워크를 감지한다.
// 감지 대상은 팩이 존재하는 react·vue만 (svelte 등은 팩 추가 시 확장).
const FRAMEWORK_DEPS = {
  react: ['react', 'next', 'react-native', '@remix-run/react'],
  vue: ['vue', 'nuxt'],
}

export function detectFrameworks(targetDir) {
  return frameworksFromDeps(readDeps(targetDir))
}

function frameworksFromDeps(deps) {
  if (!deps) return []
  return Object.entries(FRAMEWORK_DEPS)
    .filter(([, names]) => names.some((name) => name in deps))
    .map(([framework]) => framework)
}

// 스택 스탬프(_stack.md)용 요약: 프레임워크 + Next/모노레포 여부. package.json은 한 번만 읽는다.
export function detectStack(targetDir) {
  const deps = readDeps(targetDir) ?? {}
  const has = (name) => name in deps
  return {
    frameworks: frameworksFromDeps(deps),
    nextjs: has('next'),
    monorepo:
      has('turbo') ||
      has('nx') ||
      fs.existsSync(path.join(targetDir, 'pnpm-workspace.yaml')) ||
      fs.existsSync(path.join(targetDir, 'turbo.json')) ||
      fs.existsSync(path.join(targetDir, 'nx.json')) ||
      (fs.existsSync(path.join(targetDir, 'apps')) && fs.existsSync(path.join(targetDir, 'packages'))),
  }
}

// 감지된 스택이 하나도 없는지(비-프론트엔드/비-Node 프로젝트) 판별.
export function isStackEmpty(stack) {
  return stack.frameworks.length === 0 && !stack.nextjs && !stack.monorepo
}

function readDeps(targetDir) {
  const pkgPath = path.join(targetDir, 'package.json')
  if (!fs.existsSync(pkgPath)) return null
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
    return { ...pkg.dependencies, ...pkg.devDependencies }
  } catch {
    return null
  }
}
