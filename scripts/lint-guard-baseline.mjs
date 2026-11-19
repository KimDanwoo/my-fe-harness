// my-fe-harness 기본 잠금(바닥선). lint-guard가 어느 프로젝트에서든 그 프로젝트 ESLint 설정 "아래에" 깐다.
// ESLint 기본 규칙과 의존성 없는 하네스 플러그인(lint-guard-plugin.mjs)만 쓰고, 프로젝트 설정이 뒤에 오므로 프로젝트가 필요한 곳을 명시적으로 끌 수 있다.

import harness from './lint-guard-plugin.mjs'

const MAX_COMPLEXITY = 10
const MAX_DEPTH = 3
const MAX_FUNCTION_LINES = 120
const MAX_COMPONENT_FILE_LINES = 250
const ALLOWED_NUMBERS = [-1, 0, 1, 2, 100]
const LENGTH_OPTIONS = { skipBlankLines: true, skipComments: true }
const NUMBER_HOMES = ['**/config/**', '**/constants/**', '**/constants.*', '**/*.config.*']
const COMPONENT_FILES = ['**/*.tsx', '**/*.jsx']
const COMPONENT_BODY_RULES = {
  'harness/component-body': 'error',
  'harness/no-direct-effect': 'error',
  'harness/no-store-passthrough': 'error',
}
const COMPONENT_BODY_RULES_OFF = Object.fromEntries(Object.keys(COMPONENT_BODY_RULES).map((rule) => [rule, 'off']))
const TESTS = ['**/__tests__/**', '**/*.test.*', '**/*.spec.*', '**/e2e/**']
const COMPONENTS_AND_HOOKS = ['**/*.tsx', '**/*.jsx', '**/use[A-Z]*.{ts,js,mts,mjs}']
const GENERATED_AND_VENDOR = [
  '**/storybook-static/**',
  '**/public/**',
  '**/vendor/**',
  '**/*.min.js',
  '**/.turbo/**',
  '**/generated/**',
]

const usesTypeScriptPlugin = (configs) => configs.some((config) => config?.plugins?.['@typescript-eslint'])

function magicNumbersRule(configs) {
  const common = { ignore: ALLOWED_NUMBERS, ignoreArrayIndexes: true, ignoreDefaultValues: true, ignoreClassFieldInitialValues: true }
  if (!usesTypeScriptPlugin(configs)) return { 'no-magic-numbers': ['error', common] }
  return {
    '@typescript-eslint/no-magic-numbers': [
      'error',
      { ...common, ignoreEnums: true, ignoreNumericLiteralTypes: true, ignoreReadonlyClassProperties: true, ignoreTypeIndexes: true },
    ],
  }
}

export function harnessBaseline(projectConfigs) {
  const magicNumbers = magicNumbersRule(projectConfigs)
  const magicNumbersOff = Object.fromEntries(Object.keys(magicNumbers).map((rule) => [rule, 'off']))
  return [
    { ignores: GENERATED_AND_VENDOR },
    { linterOptions: { noInlineConfig: true } },
    {
      rules: {
        'no-nested-ternary': 'error',
        complexity: ['error', MAX_COMPLEXITY],
        'max-depth': ['error', MAX_DEPTH],
        'max-lines-per-function': ['error', { max: MAX_FUNCTION_LINES, ...LENGTH_OPTIONS }],
      },
    },
    { files: COMPONENTS_AND_HOOKS, rules: magicNumbers },
    { files: COMPONENT_FILES, plugins: { harness }, rules: COMPONENT_BODY_RULES },
    { files: COMPONENT_FILES, rules: { 'max-lines': ['error', { max: MAX_COMPONENT_FILE_LINES, ...LENGTH_OPTIONS }] } },
    { files: NUMBER_HOMES, rules: magicNumbersOff },
    { files: TESTS, rules: { ...magicNumbersOff, ...COMPONENT_BODY_RULES_OFF, 'max-lines-per-function': 'off' } },
  ]
}
