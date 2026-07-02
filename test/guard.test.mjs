import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const GUARD = fileURLToPath(new URL('../scripts/safety-guard.mjs', import.meta.url))

function decide(input) {
  const r = spawnSync('node', [GUARD], { encoding: 'utf8', input: typeof input === 'string' ? input : JSON.stringify(input) })
  let decision = 'allow'
  try { decision = JSON.parse(r.stdout).hookSpecificOutput?.permissionDecision ?? 'allow' }
  catch { decision = r.stdout.trim() ? 'PARSE_ERR' : 'allow' }
  return { code: r.status, decision }
}

const OPENAI = 'sk-' + 'A'.repeat(40)
const AWS = 'AKIA' + 'ABCDEFGHIJKLMNOP'
const PRIV = '-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----'

// [name, tool input, expected decision]
const cases = [
  ['deny hardcoded OpenAI key', { tool_name: 'Write', tool_input: { file_path: 'src/a.ts', content: `k="${OPENAI}"` } }, 'deny'],
  ['deny hardcoded AWS key', { tool_name: 'Write', tool_input: { file_path: 'c.ts', content: AWS } }, 'deny'],
  ['deny private key', { tool_name: 'Write', tool_input: { file_path: 'k.ts', content: PRIV } }, 'deny'],
  ['deny secret in Edit', { tool_name: 'Edit', tool_input: { file_path: 'a.ts', new_string: AWS } }, 'deny'],
  ['deny secret in MultiEdit', { tool_name: 'MultiEdit', tool_input: { file_path: 'a.ts', edits: [{ new_string: 'ok' }, { new_string: AWS }] } }, 'deny'],
  ['allow secret into .env', { tool_name: 'Write', tool_input: { file_path: '.env', content: `K=${OPENAI}` } }, 'allow'],
  ['allow secret into .env.local', { tool_name: 'Write', tool_input: { file_path: 'apps/w/.env.local', content: AWS } }, 'allow'],
  ['allow normal component', { tool_name: 'Write', tool_input: { file_path: 'a.tsx', content: 'export const A=()=><div/>' } }, 'allow'],
  ['allow short sk placeholder', { tool_name: 'Write', tool_input: { file_path: 'README.md', content: 'e.g. sk-xxxxxxxx' } }, 'allow'],
  ['deny git add .env', { tool_name: 'Bash', tool_input: { command: 'git add .env' } }, 'deny'],
  ['deny git commit id_rsa', { tool_name: 'Bash', tool_input: { command: 'git commit deploy/id_rsa' } }, 'deny'],
  ['allow git add .env.example', { tool_name: 'Bash', tool_input: { command: 'git add .env.example' } }, 'allow'],
  ['allow git add .env.template', { tool_name: 'Bash', tool_input: { command: 'git add config/.env.template' } }, 'allow'],
  ['allow commit msg mentioning .env', { tool_name: 'Bash', tool_input: { command: 'git commit -m "fix .env loading order"' } }, 'allow'],
  ['allow git add source', { tool_name: 'Bash', tool_input: { command: 'git add src/index.ts && git commit -m ok' } }, 'allow'],
  ['deny rm -rf /', { tool_name: 'Bash', tool_input: { command: 'rm -rf /' } }, 'deny'],
  ['deny rm -rf ~', { tool_name: 'Bash', tool_input: { command: 'rm -rf ~' } }, 'deny'],
  ['deny rm -rf $HOME', { tool_name: 'Bash', tool_input: { command: 'rm -rf $HOME' } }, 'deny'],
  ['deny sudo rm -rf /*', { tool_name: 'Bash', tool_input: { command: 'sudo rm -rf /*' } }, 'deny'],
  ['allow rm -rf ./build', { tool_name: 'Bash', tool_input: { command: 'rm -rf ./build' } }, 'allow'],
  ['allow rm -rf node_modules', { tool_name: 'Bash', tool_input: { command: 'rm -rf node_modules' } }, 'allow'],
  ['allow rm -rf ~/proj/dist', { tool_name: 'Bash', tool_input: { command: 'rm -rf ~/proj/dist' } }, 'allow'],
  ['allow npm test', { tool_name: 'Bash', tool_input: { command: 'npm test' } }, 'allow'],
  ['allow untracked tool (Read)', { tool_name: 'Read', tool_input: { file_path: '.env' } }, 'allow'],
  ['fail-open on malformed json', 'not json{', 'allow'],
  ['fail-open on empty stdin', '', 'allow'],
]

for (const [name, input, want] of cases) {
  test(`guard: ${name}`, () => {
    const { code, decision } = decide(input)
    assert.equal(code, 0, 'guard must always exit 0')
    assert.equal(decision, want)
  })
}
