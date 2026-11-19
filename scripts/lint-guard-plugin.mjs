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

export default {
  rules: {
    'component-body': componentBody,
    'no-direct-effect': noDirectEffect,
  },
}
