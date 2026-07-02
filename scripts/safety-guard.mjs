#!/usr/bin/env node
// my-fe-harness 안전장치 강제 계층 (PreToolUse 훅).
// safety.md는 "권고"일 뿐 LLM이 무시할 수 있으므로, 객관적으로 탐지 가능한
// 최소한의 치명적 위반만 여기서 "무조건 차단"한다.
//
// 원칙:
// - 정상 흐름에서는 아무것도 출력하지 않고 종료(exit 0) → 컨텍스트·토큰 0.
// - 위반이 확실할 때만 deny를 출력한다(오탐 최소화).
// - 내부 오류·미지의 입력은 전부 통과(fail-open) → 훅이 세션을 절대 깨지 않는다.
// - 외부 의존성 0.

const MAX_SCAN = 256 * 1024 // 대용량 쓰기 방어 — 앞부분만 검사

// 실제 자격증명 형식만 (일반 단어 오탐 없음)
const SECRET_PATTERNS = [
  { name: '개인 키(PRIVATE KEY)', re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/ },
  { name: 'AWS 액세스 키', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'GitHub 토큰', re: /\bgh[posru]_[A-Za-z0-9]{36,}\b/ },
  { name: 'Anthropic 키', re: /\bsk-ant-[A-Za-z0-9_-]{24,}\b/ },
  { name: 'OpenAI 키', re: /\bsk-(?:proj-)?[A-Za-z0-9]{32,}\b/ },
  { name: 'Slack 토큰', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { name: 'Google API 키', re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: 'Stripe 시크릿 키', re: /\bsk_live_[0-9a-zA-Z]{20,}\b/ },
]

// 비밀이 정당하게 들어가는 로컬 파일 — 여기 쓰는 건 막지 않는다(커밋만 막음).
const ENV_FILE = /(^|\/)\.env(\.[\w.-]+)?$/

// 커밋되면 안 되는 민감 파일. `.env.example`·`.env.sample`·`.env.template` 등 안전한 템플릿은 제외.
const SECRET_FILE = /(^|[\s"'=/])(\.env(?!\.(?:example|sample|template|dist|defaults|schema))(?:\.[\w.-]+)?|id_rsa\b|id_ed25519\b|[\w.-]*\.pem\b|[\w.-]*\.p12\b|[\w.-]*\.pfx\b|credentials(\.json)?\b|\.npmrc\b)/

function deny(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: `[my-fe-harness 안전장치] ${reason}`,
      },
    }),
  )
  process.exit(0)
}

function scanContent(text, file) {
  const body = text.length > MAX_SCAN ? text.slice(0, MAX_SCAN) : text
  for (const { name, re } of SECRET_PATTERNS) {
    if (re.test(body)) {
      deny(
        `${file || '파일'}에 ${name}로 보이는 비밀이 하드코딩됩니다. ` +
          `코드/설정에 비밀을 넣지 말고 .env(서버 전용, 미커밋)로 옮겨 참조하세요. ` +
          `실제 값이 아니라면 자리표시자(예: <YOUR_KEY>)를 쓰세요.`,
      )
    }
  }
}

function checkWriteLike(input) {
  const file = input.file_path || input.path || input.notebook_path || ''
  if (ENV_FILE.test(file)) return // .env에 비밀 쓰기는 허용
  const parts = [input.content, input.new_string, input.new_source]
  if (Array.isArray(input.edits)) {
    for (const edit of input.edits) parts.push(edit && edit.new_string)
  }
  const text = parts.filter((p) => typeof p === 'string').join('\n')
  if (text) scanContent(text, file)
}

function hasForceRecursive(cmd) {
  const r = /(^|\s)-[A-Za-z]*r[A-Za-z]*(\s|$)/i.test(cmd) || /--recursive\b/.test(cmd)
  const f = /(^|\s)-[A-Za-z]*f[A-Za-z]*(\s|$)/i.test(cmd) || /--force\b/.test(cmd)
  return r && f
}

function checkBash(input) {
  const cmd = typeof input.command === 'string' ? input.command : ''
  if (!cmd) return

  // 1) 파일시스템 루트·홈 통째 삭제
  if (/\brm\b/.test(cmd) && hasForceRecursive(cmd)) {
    const catastrophic = /(^|\s)(\/|~|\$HOME|\/\*|~\/\*?|\$\{?HOME\}?\/?\*?)(\s|$)/.test(cmd)
    if (catastrophic) {
      deny(`치명적 삭제로 보입니다(rm -rf 루트/홈). 대상 경로를 구체적으로 지정하세요.`)
    }
  }

  // 2) 비밀 파일을 git에 스테이징/커밋. 따옴표 문자열(커밋 메시지)은 제외해 오탐 방지.
  const cmdNoQuotes = cmd.replace(/"[^"]*"/g, ' ').replace(/'[^']*'/g, ' ')
  if (/\bgit\s+(?:add|commit|stage)\b/.test(cmd) && SECRET_FILE.test(cmdNoQuotes)) {
    deny(
      `비밀 파일(.env·키·자격증명)을 커밋하려는 것으로 보입니다. ` +
        `.gitignore에 추가하고 커밋에서 제외하세요. 이미 커밋됐다면 히스토리에서 제거해야 합니다.`,
    )
  }
}

async function readStdin() {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

async function main() {
  let data
  try {
    data = JSON.parse(await readStdin())
  } catch {
    process.exit(0) // 입력 파싱 실패 → 통과
  }
  try {
    const tool = data.tool_name
    const input = data.tool_input || {}
    if (tool === 'Write' || tool === 'Edit' || tool === 'MultiEdit' || tool === 'NotebookEdit') {
      checkWriteLike(input)
    } else if (tool === 'Bash') {
      checkBash(input)
    }
  } catch {
    // 내부 오류 → 통과(fail-open). 훅이 세션을 막지 않는다.
  }
  process.exit(0)
}

main()
