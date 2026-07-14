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
const GH_PAT = 'github_pat_' + '1'.repeat(22) + '_' + 'a'.repeat(59)
const GLPAT = 'glpat-' + 'A'.repeat(20)
const XAPP = 'xapp-1-A000-000-' + 'abcdef'
const RK_LIVE = 'rk_live_' + '0123456789ABCDEFabcdef'

// [name, tool input, expected decision]
const cases = [
  ['deny hardcoded OpenAI key', { tool_name: 'Write', tool_input: { file_path: 'src/a.ts', content: `k="${OPENAI}"` } }, 'deny'],
  ['deny hardcoded AWS key', { tool_name: 'Write', tool_input: { file_path: 'c.ts', content: AWS } }, 'deny'],
  ['deny private key', { tool_name: 'Write', tool_input: { file_path: 'k.ts', content: PRIV } }, 'deny'],
  // 미탐 회귀: 최신 자격증명 포맷.
  ['deny github fine-grained PAT', { tool_name: 'Write', tool_input: { file_path: 'c.ts', content: GH_PAT } }, 'deny'],
  ['deny gitlab PAT', { tool_name: 'Write', tool_input: { file_path: 'c.ts', content: GLPAT } }, 'deny'],
  ['deny slack app token', { tool_name: 'Write', tool_input: { file_path: 'c.ts', content: XAPP } }, 'deny'],
  ['deny stripe restricted key', { tool_name: 'Write', tool_input: { file_path: 'c.ts', content: RK_LIVE } }, 'deny'],
  ['allow github_pat placeholder', { tool_name: 'Write', tool_input: { file_path: 'README.md', content: 'e.g. github_pat_xxx' } }, 'allow'],
  ['deny secret in Edit', { tool_name: 'Edit', tool_input: { file_path: 'a.ts', new_string: AWS } }, 'deny'],
  ['deny secret in MultiEdit', { tool_name: 'MultiEdit', tool_input: { file_path: 'a.ts', edits: [{ new_string: 'ok' }, { new_string: AWS }] } }, 'deny'],
  ['allow secret into .env', { tool_name: 'Write', tool_input: { file_path: '.env', content: `K=${OPENAI}` } }, 'allow'],
  ['allow secret into .env.local', { tool_name: 'Write', tool_input: { file_path: 'apps/w/.env.local', content: AWS } }, 'allow'],
  ['allow secret into .env.production', { tool_name: 'Write', tool_input: { file_path: '.env.production', content: AWS } }, 'allow'],
  // 회귀: .env.example·.sample 은 커밋되는 템플릿이므로 실제 비밀 쓰기는 차단(placeholder는 허용).
  ['deny real secret into .env.example', { tool_name: 'Write', tool_input: { file_path: '.env.example', content: `K=${AWS}` } }, 'deny'],
  ['deny real secret into .env.sample', { tool_name: 'Write', tool_input: { file_path: 'config/.env.sample', content: AWS } }, 'deny'],
  ['allow placeholder into .env.example', { tool_name: 'Write', tool_input: { file_path: '.env.example', content: 'K=<YOUR_KEY>' } }, 'allow'],
  ['allow normal component', { tool_name: 'Write', tool_input: { file_path: 'a.tsx', content: 'export const A=()=><div/>' } }, 'allow'],
  ['allow short sk placeholder', { tool_name: 'Write', tool_input: { file_path: 'README.md', content: 'e.g. sk-xxxxxxxx' } }, 'allow'],
  ['deny git add .env', { tool_name: 'Bash', tool_input: { command: 'git add .env' } }, 'deny'],
  ['deny git commit id_rsa', { tool_name: 'Bash', tool_input: { command: 'git commit deploy/id_rsa' } }, 'deny'],
  // 미탐 회귀: 추가 비밀 파일 유형.
  ['deny git add id_ecdsa', { tool_name: 'Bash', tool_input: { command: 'git add deploy/id_ecdsa' } }, 'deny'],
  ['deny git add .p8', { tool_name: 'Bash', tool_input: { command: 'git add certs/AuthKey_ABC.p8' } }, 'deny'],
  ['deny git add server.key', { tool_name: 'Bash', tool_input: { command: 'git add nginx/server.key' } }, 'deny'],
  ['allow git add public.crt', { tool_name: 'Bash', tool_input: { command: 'git add ssl/public.crt' } }, 'allow'],
  ['allow git add .env.example', { tool_name: 'Bash', tool_input: { command: 'git add .env.example' } }, 'allow'],
  ['allow git add .env.template', { tool_name: 'Bash', tool_input: { command: 'git add config/.env.template' } }, 'allow'],
  ['allow commit msg mentioning .env', { tool_name: 'Bash', tool_input: { command: 'git commit -m "fix .env loading order"' } }, 'allow'],
  ['allow git add source', { tool_name: 'Bash', tool_input: { command: 'git add src/index.ts && git commit -m ok' } }, 'allow'],
  // 우회 회귀: Bash 리다이렉션·heredoc으로 비밀을 써도 차단해야 한다.
  ['deny secret via > redirect', { tool_name: 'Bash', tool_input: { command: `echo ${AWS} > src/config.ts` } }, 'deny'],
  ['deny secret via >> append', { tool_name: 'Bash', tool_input: { command: `printf %s ${OPENAI} >> .config.js` } }, 'deny'],
  ['deny secret via heredoc', { tool_name: 'Bash', tool_input: { command: `cat > c.ts <<EOF\nk="${AWS}"\nEOF` } }, 'deny'],
  ['allow redirect without secret', { tool_name: 'Bash', tool_input: { command: 'echo hello > out.txt' } }, 'allow'],
  ['allow secret redirected into .env', { tool_name: 'Bash', tool_input: { command: `echo K=${AWS} > .env` } }, 'allow'],
  // 우회 회귀: 리다이렉션 외 파일 쓰기 경로(tee, >|, 인라인 인터프리터)도 막아야 한다.
  ['deny secret via tee', { tool_name: 'Bash', tool_input: { command: `echo ${AWS} | tee src/config.ts` } }, 'deny'],
  ['deny secret via sudo tee', { tool_name: 'Bash', tool_input: { command: `echo ${AWS} | sudo tee /etc/app/config` } }, 'deny'],
  ['deny secret via >| noclobber', { tool_name: 'Bash', tool_input: { command: `echo ${AWS} >| src/config.ts` } }, 'deny'],
  ['deny secret in node -e inline', { tool_name: 'Bash', tool_input: { command: `node -e "const k='${OPENAI}'"` } }, 'deny'],
  ['allow tee into .env', { tool_name: 'Bash', tool_input: { command: `echo ${AWS} | tee .env` } }, 'allow'],
  ['allow tee without secret', { tool_name: 'Bash', tool_input: { command: 'echo hi | tee out.txt' } }, 'allow'],
  ['allow node script run (no inline)', { tool_name: 'Bash', tool_input: { command: 'node build.js' } }, 'allow'],
  ['deny tee -a secret append', { tool_name: 'Bash', tool_input: { command: `echo ${AWS} | tee -a src/c.ts` } }, 'deny'],
  ['allow build pipe to tee log', { tool_name: 'Bash', tool_input: { command: 'npm run build | tee build.log' } }, 'allow'],
  // 체이닝·세미콜론으로도 치명적 삭제는 잡힌다.
  ['deny chained rm home', { tool_name: 'Bash', tool_input: { command: 'rm -rf "$HOME" && echo done' } }, 'deny'],
  ['deny find home after cd', { tool_name: 'Bash', tool_input: { command: 'cd /tmp; find ~ -delete' } }, 'deny'],
  // 문서화된 한계(현재 allow — 무오탐 우선). 향후 오탐 회귀를 잡기 위한 앵커.
  ['known-gap allow rm -rf /usr (specific path)', { tool_name: 'Bash', tool_input: { command: 'rm -rf /usr' } }, 'allow'],
  ['known-gap allow git add -A', { tool_name: 'Bash', tool_input: { command: 'git add -A' } }, 'allow'],
  // 리다이렉션이 없으면 조회 명령은 스캔하지 않는다(오탐 방지).
  ['allow grep of secret-looking token (no write)', { tool_name: 'Bash', tool_input: { command: `grep ${AWS} audit.log` } }, 'allow'],
  ['deny rm -rf /', { tool_name: 'Bash', tool_input: { command: 'rm -rf /' } }, 'deny'],
  ['deny rm -rf ~', { tool_name: 'Bash', tool_input: { command: 'rm -rf ~' } }, 'deny'],
  ['deny rm -rf $HOME', { tool_name: 'Bash', tool_input: { command: 'rm -rf $HOME' } }, 'deny'],
  ['deny sudo rm -rf /*', { tool_name: 'Bash', tool_input: { command: 'sudo rm -rf /*' } }, 'deny'],
  // 우회 회귀: 따옴표로 경계를 숨겨도 차단해야 한다.
  ['deny quoted rm -rf "$HOME"', { tool_name: 'Bash', tool_input: { command: 'rm -rf "$HOME"' } }, 'deny'],
  ['deny quoted rm -rf "/"', { tool_name: 'Bash', tool_input: { command: 'rm -rf "/"' } }, 'deny'],
  ['deny single-quoted rm -rf \'/\'', { tool_name: 'Bash', tool_input: { command: "rm -rf '/'" } }, 'deny'],
  // 우회 회귀: 루트/홈 대상이면 -f 없어도 재귀 삭제는 치명적.
  ['deny rm -r / (no -f)', { tool_name: 'Bash', tool_input: { command: 'rm -r /' } }, 'deny'],
  ['deny rm --recursive ~', { tool_name: 'Bash', tool_input: { command: 'rm --recursive ~' } }, 'deny'],
  // 우회 회귀: find 로 rm 을 우회한 대량 삭제.
  ['deny find / -delete', { tool_name: 'Bash', tool_input: { command: 'find / -delete' } }, 'deny'],
  ['deny find ~ -delete', { tool_name: 'Bash', tool_input: { command: 'find ~ -delete' } }, 'deny'],
  ['deny find / -exec rm', { tool_name: 'Bash', tool_input: { command: 'find / -name x -exec rm {} +' } }, 'deny'],
  ['allow find ./src -delete', { tool_name: 'Bash', tool_input: { command: 'find ./src -name "*.tmp" -delete' } }, 'allow'],
  ['allow find ~/proj -delete', { tool_name: 'Bash', tool_input: { command: 'find ~/proj/tmp -delete' } }, 'allow'],
  ['allow rm -rf ./build', { tool_name: 'Bash', tool_input: { command: 'rm -rf ./build' } }, 'allow'],
  ['allow rm -rf node_modules', { tool_name: 'Bash', tool_input: { command: 'rm -rf node_modules' } }, 'allow'],
  ['allow rm -rf ~/proj/dist', { tool_name: 'Bash', tool_input: { command: 'rm -rf ~/proj/dist' } }, 'allow'],
  ['allow quoted rm -rf "./build"', { tool_name: 'Bash', tool_input: { command: 'rm -rf "./build"' } }, 'allow'],
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
