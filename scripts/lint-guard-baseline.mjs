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
  'harness/max-props': 'error',
  'harness/component-markup': 'error',
}
const CODE_FILES = ['**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}']
const TOOL_DIRECTIVES = [
  '^\\s*@ts-expect-error\\b',
  '^/\\s*<reference\\b',
  '^\\s*@(?:vitest|jest)-environment\\b',
  '^\\s*(?:webpack[A-Z]\\w*|@vite-ignore)\\b',
  '^\\s*prettier-ignore\\b',
]
const ALIAS_IMPORT_FILES = ['**/*.{js,jsx,ts,tsx}']
const ALIAS_IMPORT_EXEMPT = ['**/*.config.*', '**/*.d.ts']
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

const HARNESS_PREFIX = 'harness/'

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

const registeredHarness = (configs) => configs.find((config) => config?.plugins?.harness)?.plugins.harness

const rulesSupportedBy = (plugin, rules) =>
  Object.fromEntries(Object.entries(rules).filter(([name]) => !name.startsWith(HARNESS_PREFIX) || plugin.rules?.[name.slice(HARNESS_PREFIX.length)]))

export function harnessBaseline(configs = []) {
  const projectConfigs = configs.flat(Infinity)
  const plugin = registeredHarness(projectConfigs) ?? harness
  const harnessRules = (rules) => rulesSupportedBy(plugin, rules)
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
    { files: CODE_FILES, plugins: { harness: plugin }, rules: harnessRules({ 'harness/no-comment': ['error', { allow: TOOL_DIRECTIVES }] }) },
    { files: COMPONENTS_AND_HOOKS, rules: magicNumbers },
    { files: COMPONENT_FILES, plugins: { harness: plugin }, rules: harnessRules(COMPONENT_BODY_RULES) },
    {
      files: ALIAS_IMPORT_FILES,
      ignores: ALIAS_IMPORT_EXEMPT,
      plugins: { harness: plugin },
      rules: harnessRules({ 'harness/no-relative-import': 'error' }),
    },
    { files: COMPONENT_FILES, rules: { 'max-lines': ['error', { max: MAX_COMPONENT_FILE_LINES, ...LENGTH_OPTIONS }] } },
    { files: NUMBER_HOMES, rules: magicNumbersOff },
    { files: TESTS, rules: harnessRules({ ...magicNumbersOff, ...COMPONENT_BODY_RULES_OFF, 'max-lines-per-function': 'off' }) },
  ]
}
