const COMPONENT_NAME = /^[A-Z][A-Za-z0-9]*$/
const HANDLER_NAME = /^(?:handle|on)[A-Z]/
const EFFECT_HOOK = /^(?:useEffect|useLayoutEffect)$/
const COMPONENT_WRAPPER = /^(?:memo|forwardRef)$/
const EFFECT_ALLOWED_FILE = /(?:^|[\\/])(?:error|global-error)\.[jt]sx$/
const FUNCTION_EXPRESSIONS = new Set(['ArrowFunctionExpression', 'FunctionExpression'])
const EXPORT_DECLARATIONS = new Set(['ExportNamedDeclaration', 'ExportDefaultDeclaration'])

const isFunctionExpression = (node) => FUNCTION_EXPRESSIONS.has(node?.type)

function calleeName(callee) {
  if (callee.type === 'Identifier') return callee.name
  if (callee.type === 'MemberExpression' && callee.object.type === 'Identifier' && !callee.computed) return callee.property.name
  return null
}

function functionsOfInitializer(initializer) {
  if (isFunctionExpression(initializer)) return [initializer]
  if (initializer?.type !== 'CallExpression') return []
  if (!COMPONENT_WRAPPER.test(calleeName(initializer.callee) ?? '')) return []
  return initializer.arguments.slice(0, 1).flatMap(functionsOfInitializer)
}

export function componentFunctionsOf(statement) {
  const declaration = EXPORT_DECLARATIONS.has(statement.type) ? statement.declaration : statement
  if (declaration?.type === 'FunctionDeclaration') return COMPONENT_NAME.test(declaration.id?.name ?? '') ? [declaration] : []
  if (declaration?.type !== 'VariableDeclaration') return []
  return declaration.declarations.flatMap(({ id, init }) => (id.type === 'Identifier' && COMPONENT_NAME.test(id.name) ? functionsOfInitializer(init) : []))
}

export function bodyProblemOf(name) {
  if (COMPONENT_NAME.test(name)) return 'nestedComponent'
  if (HANDLER_NAME.test(name)) return null
  return 'helperFunction'
}

function declaredFunctions(statement) {
  if (statement.type === 'FunctionDeclaration' && statement.id) return [{ name: statement.id.name, node: statement }]
  if (statement.type !== 'VariableDeclaration') return []
  return statement.declarations
    .filter(({ id, init }) => id.type === 'Identifier' && isFunctionExpression(init))
    .map((declarator) => ({ name: declarator.id.name, node: declarator }))
}

function bodyStatementsOf(componentFunction) {
  return componentFunction.body.type === 'BlockStatement' ? componentFunction.body.body : []
}

export function isEffectCall(node) {
  return EFFECT_HOOK.test(calleeName(node.callee) ?? '')
}

function topLevelStatementOf(node) {
  let current = node
  while (current.parent && current.parent.type !== 'Program') current = current.parent
  return current.parent ? current : null
}

function isInsideComponent(node) {
  const statement = topLevelStatementOf(node)
  if (!statement) return false
  const components = componentFunctionsOf(statement)
  for (let ancestor = node.parent; ancestor; ancestor = ancestor.parent) {
    if (components.includes(ancestor)) return true
  }
  return false
}

const filenameOf = (context) => context.filename ?? context.getFilename()

const componentBody = {
  meta: {
    type: 'suggestion',
    schema: [],
    messages: {
      helperFunction: '{{name}}: 컴포넌트 안에는 이벤트 핸들러(handleXxx·onXxx)만 함수로 둔다. 계산은 lib/, 상태 로직은 useXxx 훅으로 뺀다.',
      nestedComponent: '{{name}}: 컴포넌트 안에 컴포넌트를 선언하지 않는다. 별도 파일로 뺀다.',
    },
  },
  create(context) {
    return {
      Program(program) {
        const components = program.body.flatMap(componentFunctionsOf)
        const declared = components.flatMap(bodyStatementsOf).flatMap(declaredFunctions)
        for (const { name, node } of declared) {
          const messageId = bodyProblemOf(name)
          if (messageId) context.report({ node, messageId, data: { name } })
        }
      },
    }
  },
}

const noDirectEffect = {
  meta: {
    type: 'suggestion',
    schema: [],
    messages: { directEffect: '컴포넌트에서 효과를 직접 걸지 않는다. useXxx 훅으로 뺀다.' },
  },
  create(context) {
    if (EFFECT_ALLOWED_FILE.test(filenameOf(context))) return {}
    return {
      CallExpression(node) {
        if (isEffectCall(node) && isInsideComponent(node)) context.report({ node, messageId: 'directEffect' })
      },
    }
  },
}

const STORE_HOOK = /^(?:useAtomValue|useAtom|useSelector|useStore|useContext|useSyncExternalStore|use[A-Z][A-Za-z0-9]*Store)$/
const CUSTOM_HOOK = /^use[A-Z]/
const LOCAL_REACT_HOOKS = new Set([
  'useState', 'useReducer', 'useRef', 'useMemo', 'useCallback', 'useId', 'useTransition', 'useDeferredValue',
  'useOptimistic', 'useActionState', 'useImperativeHandle', 'useEffect', 'useLayoutEffect', 'useInsertionEffect',
  'useDebugValue', 'useFormStatus',
])
const DOMAIN_SOURCE = /^\.{1,2}\/|(?:^|[/@])(?:_?pages|views|features|entities|widgets|_?app)(?:\/|$)/

const CONTEXT_COMPONENT = /(?:Context|Provider)$/

const hookNameOf = (node) => (node?.type === 'CallExpression' ? calleeName(node.callee) ?? '' : '')
const isStoreHook = (name) => STORE_HOOK.test(name)
const isSubscribingHook = (name) => CUSTOM_HOOK.test(name) && !LOCAL_REACT_HOOKS.has(name)
const isSubscriptionCall = (node) => {
  const name = hookNameOf(node)
  return isStoreHook(name) || (isSubscribingHook(name) && node.arguments.length === 0)
}
const childNodesOf = (value) => (Array.isArray(value) ? value : [value]).filter((item) => typeof item?.type === 'string')

export function subscriptionsIn(node) {
  if (typeof node?.type !== 'string' || isFunctionExpression(node)) return []
  const own = isSubscriptionCall(node) ? [hookNameOf(node)] : []
  const nested = Object.entries(node).flatMap(([key, value]) => (key === 'parent' ? [] : childNodesOf(value).flatMap(subscriptionsIn)))
  return [...own, ...nested]
}

export const containsStoreCall = (node) => subscriptionsIn(node).some(isStoreHook)

function jsxRootName(name) {
  if (name.type === 'JSXMemberExpression') return jsxRootName(name.object)
  return name.type === 'JSXIdentifier' ? name.name : null
}

function outermostMemberOf(identifier) {
  let current = identifier
  while (current.parent?.type === 'MemberExpression' && current.parent.object === current) current = current.parent
  return current
}

function passedPropTarget(reference, component) {
  if (reference.from.variableScope.block !== component) return null
  const container = outermostMemberOf(reference.identifier).parent
  if (container?.type !== 'JSXExpressionContainer' || container.parent?.type !== 'JSXAttribute') return null
  return jsxRootName(container.parent.parent.name)
}

function importSourcesOf(program) {
  const imports = program.body.filter((statement) => statement.type === 'ImportDeclaration')
  return new Map(imports.flatMap((declaration) => declaration.specifiers.map((specifier) => [specifier.local.name, declaration.source.value])))
}

export function isDomainComponent(name, importSources) {
  if (!COMPONENT_NAME.test(name ?? '') || CONTEXT_COMPONENT.test(name)) return false
  const source = importSources.get(name)
  return source === undefined || DOMAIN_SOURCE.test(source)
}

function passThroughTargets(variables, component, importSources) {
  const reads = variables.flatMap((variable) => variable.references.filter((reference) => reference.isRead()))
  if (reads.length === 0) return null
  const targets = reads.map((reference) => passedPropTarget(reference, component))
  return targets.every((target) => isDomainComponent(target, importSources)) ? [...new Set(targets)] : null
}

export function passThroughProblem({ hooks, targets }) {
  if (!targets) return null
  if (hooks.some(isStoreHook)) return 'storePassThrough'
  if (hooks.some(isSubscribingHook) && targets.length === 1) return 'hookPassThrough'
  return null
}

const hookDeclaratorsOf = (component) =>
  bodyStatementsOf(component)
    .filter((statement) => statement.type === 'VariableDeclaration')
    .flatMap((statement) => statement.declarations)
    .map((declarator) => ({ declarator, hooks: subscriptionsIn(declarator.init) }))
    .filter(({ hooks }) => hooks.length > 0)

const noStorePassthrough = {
  meta: {
    type: 'suggestion',
    schema: [],
    messages: {
      storePassThrough: '{{hook}}: 이 컴포넌트는 store 값을 쓰지 않고 {{child}}에 넘기기만 한다. 값을 쓰는 자식에서 직접 구독한다.',
      hookPassThrough: '{{hook}}(): 인자 없는 구독 훅 결과를 쓰지 않고 {{child}} 하나에만 넘긴다. {{child}}에서 직접 부른다.',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode()
    return {
      Program(program) {
        const importSources = importSourcesOf(program)
        for (const component of program.body.flatMap(componentFunctionsOf)) {
          for (const { declarator, hooks } of hookDeclaratorsOf(component)) {
            const targets = passThroughTargets(sourceCode.getDeclaredVariables(declarator), component, importSources)
            const messageId = passThroughProblem({ hooks, targets })
            if (messageId) context.report({ node: declarator, messageId, data: { hook: hooks[0], child: targets.join('·') } })
          }
        }
      },
    }
  },
}

const MAX_PROPS = 5
const MAX_JSX_DEPTH = 5
const MAX_HOST_ELEMENTS = 15
const HOST_TAG = /^[a-z]/

const declarationOf = (statement) => (EXPORT_DECLARATIONS.has(statement.type) ? statement.declaration : statement)

function componentNameOf(statement) {
  const declaration = declarationOf(statement)
  const id = declaration?.type === 'FunctionDeclaration' ? declaration.id : declaration?.declarations?.[0]?.id
  return id?.name ?? 'default'
}

function componentsOf(program) {
  return program.body.flatMap((statement) => componentFunctionsOf(statement).map((node) => ({ node, name: componentNameOf(statement) })))
}

function typeLiteralCount(declaration) {
  if (declaration?.type === 'TSInterfaceDeclaration') return declaration.body.body.length
  if (declaration?.type === 'TSTypeAliasDeclaration' && declaration.typeAnnotation.type === 'TSTypeLiteral') return declaration.typeAnnotation.members.length
  return null
}

export function propsTypeCounts(program) {
  const counts = new Map()
  for (const statement of program.body) {
    const declaration = declarationOf(statement)
    const count = typeLiteralCount(declaration)
    if (count !== null) counts.set(declaration.id.name, count)
  }
  return counts
}

export function propsCountOf(component, counts) {
  const type = component.params[0]?.typeAnnotation?.typeAnnotation
  if (type?.type === 'TSTypeLiteral') return type.members.length
  if (type?.type === 'TSTypeReference' && type.typeName.type === 'Identifier') return counts.get(type.typeName.name) ?? null
  return null
}

const maxProps = {
  meta: {
    type: 'suggestion',
    schema: [{ type: 'object', properties: { max: { type: 'integer' } }, additionalProperties: false }],
    messages: {
      tooManyProps:
        '{{name}}: props {{count}}개(최대 {{max}}). 합성 컴포넌트로 나눈다 — Root가 상태를 context로 내려주고 파트가 구독하거나, 내용은 children으로 조립한다.',
    },
  },
  create(context) {
    const max = context.options[0]?.max ?? MAX_PROPS
    return {
      Program(program) {
        const counts = propsTypeCounts(program)
        for (const { node, name } of componentsOf(program)) {
          const count = propsCountOf(node, counts)
          if (count !== null && count > max) context.report({ node, messageId: 'tooManyProps', data: { name, count, max } })
        }
      },
    }
  },
}

const isHostElement = (node) => node.openingElement.name.type === 'JSXIdentifier' && HOST_TAG.test(node.openingElement.name.name)
const childrenOf = (node) => Object.entries(node).flatMap(([key, value]) => (key === 'parent' ? [] : childNodesOf(value)))

export function markupOf(root) {
  const markup = { depth: 0, hostElements: 0 }
  const visit = (node, depth) => {
    const isElement = node.type === 'JSXElement'
    const nextDepth = isElement ? depth + 1 : depth
    if (isElement) {
      markup.depth = Math.max(markup.depth, nextDepth)
      if (isHostElement(node)) markup.hostElements += 1
    }
    for (const child of childrenOf(node)) visit(child, nextDepth)
  }
  visit(root, 0)
  return markup
}

const componentMarkup = {
  meta: {
    type: 'suggestion',
    schema: [
      {
        type: 'object',
        properties: { maxDepth: { type: 'integer' }, maxHostElements: { type: 'integer' } },
        additionalProperties: false,
      },
    ],
    messages: {
      tooMuchMarkup:
        '{{name}}: JSX 깊이 {{depth}}(최대 {{maxDepth}})·HTML 요소 {{hostElements}}개(최대 {{maxHostElements}}). 구획을 이름 붙은 하위 컴포넌트로 나누고, 반복 모양은 설정 배열 + map이나 공용 컴포넌트로 바꾼다.',
    },
  },
  create(context) {
    const maxDepth = context.options[0]?.maxDepth ?? MAX_JSX_DEPTH
    const maxHostElements = context.options[0]?.maxHostElements ?? MAX_HOST_ELEMENTS
    return {
      Program(program) {
        for (const { node, name } of componentsOf(program)) {
          const { depth, hostElements } = markupOf(node)
          if (depth <= maxDepth && hostElements <= maxHostElements) continue
          context.report({ node, messageId: 'tooMuchMarkup', data: { name, depth, maxDepth, hostElements, maxHostElements } })
        }
      },
    }
  },
}

export default {
  rules: {
    'component-body': componentBody,
    'no-direct-effect': noDirectEffect,
    'no-store-passthrough': noStorePassthrough,
    'max-props': maxProps,
    'component-markup': componentMarkup,
  },
}
