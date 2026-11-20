// FSD(Feature-Sliced Design) 구조 규칙 — ESLint 플러그인 `fsd`(의존성 0). 프로젝트는 `my-fe-harness/eslint`의 fsd(options) 프리셋으로 켠다.
// 레이어는 표준 역할(app·pages·widgets·features·entities·shared)로 판정하고, 실제 폴더 이름은 설정이 정한다(labs: pages → views, Next 공식: _app·_pages).

import path from 'node:path'

import { resolveAliasSpecifier, staticSpecifier } from './lint-guard-plugin.mjs'

export const FSD_SETTINGS = 'my-fe-harness/fsd'
const ROLES = ['app', 'pages', 'widgets', 'features', 'entities', 'shared']
const SLICED_ROLES = new Set(['pages', 'widgets', 'features', 'entities'])
const SLICE_SEGMENTS = new Set(['ui', 'model', 'api', 'lib', 'config'])
const SHARED_SEGMENTS = new Set(['ui', 'lib', 'api', 'config'])
const ITEM_ENTRY_SEGMENTS = new Set(['ui', 'lib'])
const PUBLIC_ENTRY = /^index(?:\.server)?(?:\.tsx?)?$/
const INDEX_FILE = /^index(?:\.server)?\.tsx?$/
const TEST_FILE = /\/__tests__\/|\.(?:test|spec)\.[cm]?[jt]sx?$/
const ROUTE_FILE = /^(?:page|layout|route|error|loading|not-found|global-error|template|default|sitemap|robots|manifest)$/
const JOTAI_MODULE = /^jotai(?:\/|$)|^jotai-family$/
const ATOM_FACTORY = /^atom(?:With\w+|Family)?$/
const SCRIPT_EXTENSION = /\.[cm]?[jt]sx?$/
const FUNCTION_EXPRESSIONS = new Set(['ArrowFunctionExpression', 'FunctionExpression'])
const DEFAULT_SRC = 'src'
const SEGMENT_ENTRY_DEPTH = 2
const SHARED_ITEM_DEPTH = 2
const CROSS_IMPORT_FOLDER = '@x'
const CROSS_IMPORT_DEPTH = 2

const toPosix = (file) => file.replaceAll('\\', '/')

function normalizeSrcDir(srcDir) {
  const normalized = typeof srcDir === 'string' ? toPosix(srcDir).replace(/^(?:\.\/)+/, '').replace(/\/+$/, '') : ''
  if (!normalized || normalized === '.') throw new Error(`fsd: srcDir는 레이어 폴더를 담은 경로다(예: 'src'). 받은 값: ${JSON.stringify(srcDir)}`)
  return normalized
}

function layerOf(role, folder) {
  if (folder === false) return []
  if (typeof folder !== 'string' || !folder) throw new Error(`fsd: layers.${role}는 폴더 이름(문자열)이거나 끄려면 false다.`)
  return [{ role, folder }]
}

function layerList(layers) {
  if (layers === null || typeof layers !== 'object') throw new TypeError('fsd: layers는 { 역할: 폴더 이름 | false } 객체다.')
  const unknown = Object.keys(layers).filter((role) => !ROLES.includes(role))
  if (unknown.length > 0) throw new Error(`fsd: 알 수 없는 레이어 역할 ${unknown.join(', ')} — ${ROLES.join('·')} 중에서 쓴다.`)
  return ROLES.flatMap((role) => layerOf(role, layers[role] ?? role))
}

export function fsdSettings({ srcDir = DEFAULT_SRC, layers = {} } = {}) {
  return { srcDir: normalizeSrcDir(srcDir), layers: layerList(layers) }
}

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const layoutCache = new Map()

function buildLayout(settings) {
  const folders = settings.layers.map(({ folder }) => escapeRegExp(folder)).join('|')
  return {
    ...settings,
    pattern: new RegExp(`^(.*)/${escapeRegExp(settings.srcDir)}/(${folders})/(.*)$`),
    roleOf: new Map(settings.layers.map(({ role, folder }) => [folder, role])),
    aliasFolder: new Map(settings.layers.flatMap(({ role, folder }) => [[role, folder], [folder, folder]])),
  }
}

function layoutOf(context) {
  const settings = context.settings?.[FSD_SETTINGS] ?? fsdSettings()
  const key = JSON.stringify(settings)
  if (!layoutCache.has(key)) layoutCache.set(key, buildLayout(settings))
  return layoutCache.get(key)
}

function locate(file, layout) {
  const match = toPosix(file).match(layout.pattern)
  if (!match) return null
  const [, root, folder, rest] = match
  return { root, folder, role: layout.roleOf.get(folder), rest, slice: rest.split('/')[0] }
}

function conventionalAlias(importer, specifier, layout, cwd) {
  if (!specifier.startsWith('@')) return null
  const [head, ...tail] = specifier.slice(1).split('/')
  const folder = layout.aliasFolder.get(head)
  if (!folder) return null
  const root = locate(importer, layout)?.root ?? toPosix(cwd)
  return locate(path.posix.normalize(`${root}/${layout.srcDir}/${[folder, ...tail].join('/')}`), layout)
}

function locateImport(importer, specifier, layout, cwd) {
  if (specifier.startsWith('.')) return locate(path.resolve(path.dirname(importer), specifier), layout)
  const aliased = path.isAbsolute(importer) ? resolveAliasSpecifier(importer, specifier) : null
  if (aliased) return locate(aliased, layout)
  return conventionalAlias(importer, specifier, layout, cwd)
}

function importVisitors(check) {
  const visit = (node) => {
    const source = node.source ?? node.argument?.literal ?? node.argument
    const specifier = staticSpecifier(source)
    if (specifier !== null) check(source, specifier)
  }
  return { ImportDeclaration: visit, ExportNamedDeclaration: visit, ExportAllDeclaration: visit, ImportExpression: visit, TSImportType: visit }
}

const segmentOf = (own) => own.rest.split('/')[1]

// FSD 교차 import 공개 API: <레이어>/A/@x/B.ts는 같은 레이어의 B 슬라이스에만 여는 A의 API다(https://feature-sliced.design/docs/reference/public-api).
function crossImportConsumer(located) {
  const [, folder, file, ...deeper] = located.rest.split('/')
  if (folder !== CROSS_IMPORT_FOLDER || !file || deeper.length > 0) return null
  return file.replace(SCRIPT_EXTENSION, '')
}

const isCrossImportFor = (from, to) => from?.role === to.role && from.slice !== to.slice && crossImportConsumer(to) === from.slice
const sharedItem = (rest) => {
  const [segment, item = ''] = rest.split('/')
  return `${segment}/${item.replace(SCRIPT_EXTENSION, '')}`
}

function sharedStructureProblem(own) {
  const parts = own.rest.split('/')
  if (!SHARED_SEGMENTS.has(parts[0])) return `${own.folder} 바로 아래는 ui/, lib/, api/, config/ 세그먼트만 둔다. 도메인 코드는 쓰는 슬라이스로 옮긴다.`
  if (parts.length === SEGMENT_ENTRY_DEPTH && ITEM_ENTRY_SEGMENTS.has(parts[0]) && INDEX_FILE.test(parts[1]))
    return `${own.folder}/${parts[0]} 전체를 묶는 index.ts를 두지 않는다. 항목마다 진입점을 둔다.`
  return null
}

function sliceStructureProblem(own) {
  const inner = own.rest.split('/').slice(1)
  const basename = inner.at(-1)
  if (inner.length === 1) return INDEX_FILE.test(basename) ? null : '슬라이스 루트에는 공개 API(index.ts, index.server.ts)만 둔다.'
  if (inner[0] === CROSS_IMPORT_FOLDER) return inner.length === CROSS_IMPORT_DEPTH ? null : '@x 안에는 소비 슬라이스 이름의 파일(@x/<슬라이스>.ts)만 둔다.'
  if (!SLICE_SEGMENTS.has(inner[0])) return '슬라이스는 ui/, model/, api/, lib/, config/ 세그먼트로 나눈다.'
  if (INDEX_FILE.test(basename)) return '세그먼트 안에 index.ts를 두지 않는다. 공개 API는 슬라이스 루트 하나다.'
  return null
}

const sliceStructure = {
  meta: { type: 'problem', schema: [] },
  create(context) {
    return {
      Program(node) {
        const own = locate(context.filename, layoutOf(context))
        if (!own) return
        const problem = own.role === 'shared' ? sharedStructureProblem(own) : SLICED_ROLES.has(own.role) && sliceStructureProblem(own)
        if (problem) context.report({ node, message: problem })
      },
    }
  },
}

function sharedImportProblem(from, to) {
  const parts = to.rest.split('/').filter((part) => !PUBLIC_ENTRY.test(part))
  if (from?.role === 'shared' && sharedItem(from.rest) === sharedItem(to.rest)) return null
  if (parts.length > SHARED_ITEM_DEPTH) return `${to.folder}는 세그먼트 또는 항목 진입점까지만 import한다(@${to.folder}/lib/<항목>).`
  if (parts.length === 1 && ITEM_ENTRY_SEGMENTS.has(parts[0])) return `${to.folder}/${parts[0]}/<항목>처럼 항목 진입점으로 import한다.`
  return null
}

function slicedImportProblem(from, to) {
  if (isCrossImportFor(from, to)) return null
  const consumer = crossImportConsumer(to)
  if (consumer) return `${to.folder}/${to.slice}/@x/${consumer}는 같은 레이어의 ${consumer} 슬라이스 전용이다. 다른 곳은 공개 API(index.ts)로 가져온다.`
  const inner = to.rest.split('/').slice(1)
  const isEntry = inner.length === 0 || (inner.length === 1 && PUBLIC_ENTRY.test(inner[0]))
  const isOwnSlice = from?.role === to.role && from.slice === to.slice
  if (!isOwnSlice) return isEntry ? null : `${to.folder}/${to.slice}는 공개 API(index.ts)로만 import한다.`
  return isEntry ? '슬라이스 안에서 자기 공개 API를 import하지 않는다(순환 참조).' : null
}

function publicApiProblem(from, to) {
  if (to.role === 'shared') return sharedImportProblem(from, to)
  return SLICED_ROLES.has(to.role) ? slicedImportProblem(from, to) : null
}

const publicApi = {
  meta: { type: 'problem', schema: [] },
  create(context) {
    const filename = toPosix(context.filename)
    if (TEST_FILE.test(filename)) return {}
    const layout = layoutOf(context)
    const from = locate(filename, layout)
    const isEntryFile = Boolean(from) && INDEX_FILE.test(path.posix.basename(filename))
    const check = (node, specifier) => {
      const to = locateImport(context.filename, specifier, layout, context.cwd)
      const message = to && publicApiProblem(from, to)
      if (message) context.report({ node, message })
    }
    const visitors = importVisitors(check)
    return {
      ...visitors,
      ExportAllDeclaration(node) {
        if (isEntryFile) return context.report({ node, message: '공개 API에서 export *를 쓰지 않는다. 이름을 명시한다.' })
        return visitors.ExportAllDeclaration(node)
      },
    }
  },
}

function dependencyProblem(from, to) {
  if (ROLES.indexOf(to.role) < ROLES.indexOf(from.role)) return `${from.folder}에서 상위 레이어 ${to.folder}를 참조할 수 없다.`
  if (from.role !== to.role || !SLICED_ROLES.has(from.role) || from.slice === to.slice) return null
  if (isCrossImportFor(from, to)) return null
  return `같은 레이어의 ${from.slice} → ${to.slice} 교차 참조를 금지한다. 도메인을 합치거나 공통 책임을 하위 레이어로 옮긴다.`
}

const independentSlices = {
  meta: { type: 'problem', schema: [] },
  create(context) {
    const layout = layoutOf(context)
    const from = locate(context.filename, layout)
    if (!from) return {}
    return importVisitors((node, specifier) => {
      const to = locateImport(context.filename, specifier, layout, context.cwd)
      const message = to && dependencyProblem(from, to)
      if (message) context.report({ node, message })
    })
  },
}

function componentProblem(own, name, basename) {
  if (!name || !/^[A-Z]/.test(name)) return null
  if (segmentOf(own) !== 'ui') return '컴포넌트는 ui/에 둔다. 훅 파일에 Provider를 함께 선언하지 않는다.'
  return name === basename ? null : `컴포넌트 ${name}은 ${name}.tsx로 분리한다.`
}

const componentFile = {
  meta: { type: 'problem', schema: [] },
  create(context) {
    if (!context.filename.endsWith('.tsx')) return {}
    const own = locate(context.filename, layoutOf(context))
    if (!own || !SLICED_ROLES.has(own.role)) return {}
    const basename = path.basename(context.filename, '.tsx')
    const check = (node, name) => {
      const message = componentProblem(own, name, basename)
      if (message) context.report({ node, message })
    }
    return {
      FunctionDeclaration: (node) => check(node, node.id?.name),
      ClassDeclaration: (node) => node.superClass && check(node, node.id?.name),
      VariableDeclarator: (node) => FUNCTION_EXPRESSIONS.has(node.init?.type) && node.id.type === 'Identifier' && check(node, node.id.name),
    }
  },
}

const routingLocation = {
  meta: { type: 'problem', schema: [] },
  create(context) {
    return {
      Program(node) {
        const own = locate(context.filename, layoutOf(context))
        if (own?.role !== 'app' || !ROUTE_FILE.test(path.basename(context.filename).split('.')[0])) return
        context.report({ node, message: `Next 라우팅 파일은 앱 루트 app/에 둔다. ${own.folder}/는 전역 설정과 providers만 담당한다.` })
      },
    }
  },
}

function jotaiFactories(node, factories, namespaces) {
  if (!JOTAI_MODULE.test(node.source.value)) return
  for (const specifier of node.specifiers) {
    if (specifier.type === 'ImportNamespaceSpecifier') namespaces.add(specifier.local.name)
    else if (specifier.type === 'ImportSpecifier' && ATOM_FACTORY.test(specifier.imported.name)) factories.add(specifier.local.name)
  }
}

function isAtomFactory(callee, factories, namespaces) {
  if (callee.type === 'Identifier') return factories.has(callee.name)
  return (
    callee.type === 'MemberExpression' &&
    callee.object.type === 'Identifier' &&
    namespaces.has(callee.object.name) &&
    callee.property.type === 'Identifier' &&
    ATOM_FACTORY.test(callee.property.name)
  )
}

const entityState = {
  meta: { type: 'problem', schema: [] },
  create(context) {
    const own = locate(context.filename, layoutOf(context))
    if (!own || (SLICED_ROLES.has(own.role) && segmentOf(own) === 'model')) return {}
    const factories = new Set()
    const namespaces = new Set()
    return {
      ImportDeclaration: (node) => jotaiFactories(node, factories, namespaces),
      CallExpression(node) {
        if (isAtomFactory(node.callee, factories, namespaces)) context.report({ node, message: '전역 atom은 쓰는 슬라이스의 model/에서 정의한다.' })
      },
    }
  },
}

export default {
  rules: {
    'slice-structure': sliceStructure,
    'public-api': publicApi,
    'independent-slices': independentSlices,
    'component-file': componentFile,
    'routing-location': routingLocation,
    'entity-state': entityState,
  },
}
