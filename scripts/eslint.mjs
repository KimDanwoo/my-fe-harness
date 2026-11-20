// 프로젝트 ESLint 설정이 가져다 쓰는 하네스 진입점(`my-fe-harness/eslint`). lint-guard 훅과 같은 모듈이라 규칙이 한 곳에만 있다.
export { default as plugin } from './lint-guard-plugin.mjs'
export { harnessBaseline as quality } from './lint-guard-baseline.mjs'
