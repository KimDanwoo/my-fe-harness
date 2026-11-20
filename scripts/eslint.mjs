// 프로젝트 ESLint 설정이 가져다 쓰는 하네스 진입점(`my-fe-harness/eslint`). lint-guard 훅과 같은 모듈이라 규칙이 한 곳에만 있다.
import fsdPlugin, { FSD_SETTINGS, fsdSettings } from './lint-guard-fsd.mjs'

export { default as plugin } from './lint-guard-plugin.mjs'
export { harnessBaseline as quality } from './lint-guard-baseline.mjs'
export { fsdPlugin }

const FSD_RULES = ['slice-structure', 'public-api', 'independent-slices', 'component-file']
const NEXT_ROOT_FILES = ['app/**/*.{ts,tsx}', '*.{ts,tsx}']

const errors = (rules) => Object.fromEntries(rules.map((rule) => [`fsd/${rule}`, 'error']))

export function fsd({ next = false, jotai = false, srcDir, layers, ...unknown } = {}) {
  const unknownOptions = Object.keys(unknown)
  if (unknownOptions.length > 0) throw new Error(`fsd: 알 수 없는 옵션 ${unknownOptions.join(', ')} — next·jotai·srcDir·layers만 받는다.`)
  const settings = { [FSD_SETTINGS]: fsdSettings({ srcDir, layers }) }
  const shared = { plugins: { fsd: fsdPlugin }, settings }
  const rules = [...FSD_RULES, ...(next ? ['routing-location'] : []), ...(jotai ? ['entity-state'] : [])]
  const sources = { name: 'my-fe-harness/fsd', ...shared, files: [`${settings[FSD_SETTINGS].srcDir}/**/*.{ts,tsx}`], rules: errors(rules) }
  if (!next) return [sources]
  return [sources, { name: 'my-fe-harness/fsd-next-root', ...shared, files: NEXT_ROOT_FILES, rules: errors(['public-api']) }]
}
