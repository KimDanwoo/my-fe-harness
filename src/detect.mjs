import fs from 'node:fs'
import path from 'node:path'

// package.json 의존성을 보고 규칙 팩이 있는 프레임워크를 감지한다.
// 감지 대상은 팩이 존재하는 react·vue만 (svelte 등은 팩 추가 시 확장).
const FRAMEWORK_DEPS = {
  react: ['react', 'next', 'react-native', '@remix-run/react'],
  vue: ['vue', 'nuxt'],
}

// 같은 역할의 라이브러리가 둘씩 깔리는 것을 막는다 — 에이전트가 제일 자주 내는 사고다.
// 이 목록은 설치 시점 스냅샷이므로 낡을 수 있다. 낡음 감지는 stack.mjs의 stampState가 맡는다.
const CONVENTION_DEPS = {
  '데이터/상태': [
    '@tanstack/react-query', '@tanstack/vue-query', 'swr',
    'zustand', 'jotai', 'valtio', 'recoil', 'mobx',
    '@reduxjs/toolkit', 'redux', 'pinia', 'vuex',
  ],
  '폼/검증': ['zod', 'yup', 'valibot', 'superstruct', 'react-hook-form', 'formik', 'vee-validate'],
  '스타일': [
    'tailwindcss', 'styled-components', '@emotion/react', '@emotion/styled',
    '@vanilla-extract/css', '@stitches/react', '@pandacss/dev', 'sass', 'less',
  ],
  '테스트': [
    'vitest', 'jest', 'playwright', '@playwright/test', 'cypress', 'msw',
    '@testing-library/react', '@testing-library/vue',
  ],
  'API/통신': ['axios', 'ky', 'ofetch', '@apollo/client', '@trpc/client', 'graphql'],
}

const TSCONFIG_FILES = ['tsconfig.json', 'jsconfig.json']
// Next.js는 src/ 없이 루트 app/ 을 쓰기도 한다.
const SOURCE_ROOTS = ['src', 'app']
const MAX_LISTED_DIRS = 12

export function detectFrameworks(targetDir) {
  return frameworksFromDeps(readDeps(targetDir))
}

function frameworksFromDeps(deps) {
  if (!deps) return []
  return Object.entries(FRAMEWORK_DEPS)
    .filter(([, names]) => names.some((name) => name in deps))
    .map(([framework]) => framework)
}

// 스택 스탬프(_stack.md)용 요약: 프레임워크 + Next/모노레포 여부 + 실제 컨벤션. package.json은 한 번만 읽는다.
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
    conventions: detectConventions(targetDir, deps),
  }
}

// 감지된 스택도 배치 규칙도 없는지(비-프론트엔드/비-Node 프로젝트) 판별 — 항상 로드되는 빈 스탬프를 만들지 않기 위한 게이트.
export function isStackEmpty(stack) {
  const { libs, sourceDirs, aliases } = stack.conventions
  return (
    stack.frameworks.length === 0 &&
    !stack.nextjs &&
    !stack.monorepo &&
    libs.length === 0 &&
    !sourceDirs &&
    aliases.length === 0
  )
}

// 사실만 수집한다 — 판정하지 않는다. 어떤 단계든 실패하면 그 항목만 비운다(fail-open).
function detectConventions(targetDir, deps) {
  return {
    libs: Object.entries(CONVENTION_DEPS)
      .map(([label, names]) => [label, names.filter((name) => name in deps)])
      .filter(([, found]) => found.length > 0),
    sourceDirs: readSourceDirs(targetDir),
    aliases: readAliasMap(targetDir).map((alias) => alias.key).slice(0, MAX_LISTED_DIRS),
  }
}

// 소스 루트의 최상위 디렉토리 — 에이전트가 새 파일을 어디에 둘지 판단하는 근거. depth 1만 읽는다.
function readSourceDirs(targetDir) {
  for (const root of SOURCE_ROOTS) {
    try {
      const dirs = fs
        .readdirSync(path.join(targetDir, root), { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
        .map((entry) => entry.name)
        .sort()
      if (dirs.length > 0) return { root, dirs: dirs.slice(0, MAX_LISTED_DIRS), truncated: dirs.length > MAX_LISTED_DIRS }
    } catch {
      // 없거나 못 읽으면 다음 후보로.
    }
  }
  return null
}

// tsconfig의 path alias. 스탬프는 표시용 key만 쓰고, check는 specifier를 실제 경로로 풀 때 prefix/target을 쓴다.
export function readAliasMap(targetDir) {
  for (const file of TSCONFIG_FILES) {
    try {
      const raw = fs.readFileSync(path.join(targetDir, file), 'utf8')
      const paths = JSON.parse(stripJsonc(raw))?.compilerOptions?.paths
      if (paths) return Object.entries(paths).flatMap(([key, targets]) => toAlias(key, targets?.[0]) ?? [])
    } catch {
      // 없거나 파싱 실패 시 이 항목만 비운다.
    }
  }
  return []
}

// '@/*' + './src/*' → { key: '@/*', prefix: '@/', target: 'src/' }. 와일드카드가 없으면 정확 일치 별칭이 된다.
function toAlias(key, target) {
  if (typeof key !== 'string' || typeof target !== 'string') return null
  const strip = (value) => value.replace(/\*$/, '').replace(/^\.\//, '')
  return { key, prefix: strip(key), target: strip(target) }
}

// ponytail: 정규식 JSONC 스트립 — 문자열 안의 `//`나 `/*`는 오인할 수 있다. 실패하면 호출부가 삼키므로 alias 한 줄만 빠진다.
// 오탐이 실제로 문제가 되면 그때 진짜 JSONC 파서로 교체한다.
function stripJsonc(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:"'\\])\/\/.*$/gm, '$1')
    .replace(/,(\s*[}\]])/g, '$1')
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
