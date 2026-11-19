// ESLint가 없는 프로젝트에서 lint-guard가 쓰는 설정. 하네스 런타임 폴더에 복사돼 그 폴더의 eslint·typescript-eslint로 돈다.
// 하네스 기본 잠금만 검사한다. --config로 넘기므로 패턴은 검사하는 프로젝트 루트 기준이다.
import tseslint from 'typescript-eslint'

import { harnessBaseline } from './lint-guard-baseline.mjs'

const SOURCES = ['**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx}']
const GENERATED = ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.next/**', '**/out/**', '**/coverage/**', '**/.astro/**', '**/.vercel/**']
const typescriptPlugin = { plugins: { '@typescript-eslint': tseslint.plugin } }

export default [
  { ignores: GENERATED },
  {
    files: SOURCES,
    ...typescriptPlugin,
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true }, sourceType: 'module' },
    },
  },
  ...harnessBaseline([typescriptPlugin]),
]
