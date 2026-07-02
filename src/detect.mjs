import fs from 'node:fs'
import path from 'node:path'

// package.json 의존성을 보고 규칙 팩이 있는 프레임워크를 감지한다.
// 감지 대상은 팩이 존재하는 react·vue만 (svelte 등은 팩 추가 시 확장).
const FRAMEWORK_DEPS = {
  react: ['react', 'next', 'react-native', '@remix-run/react'],
  vue: ['vue', 'nuxt'],
}

export function detectFrameworks(targetDir) {
  const deps = readDeps(targetDir)
  if (!deps) return []
  return Object.entries(FRAMEWORK_DEPS)
    .filter(([, names]) => names.some((name) => name in deps))
    .map(([framework]) => framework)
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
