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
  { name: 'GitHub fine-grained 토큰', re: /\bgithub_pat_[A-Za-z0-9_]{40,}\b/ },
  { name: 'GitLab 토큰', re: /\bglpat-[A-Za-z0-9_-]{20,}\b/ },
  { name: 'Anthropic 키', re: /\bsk-ant-[A-Za-z0-9_-]{24,}\b/ },
  { name: 'OpenAI 키', re: /\bsk-(?:proj-)?[A-Za-z0-9]{32,}\b/ },
  { name: 'Slack 토큰', re: /\bxox[baprse]-[A-Za-z0-9-]{10,}\b/ },
  { name: 'Slack 앱 토큰', re: /\bxapp-[A-Za-z0-9-]{10,}\b/ },
  { name: 'Google API 키', re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: 'Stripe 시크릿 키', re: /\bsk_live_[0-9a-zA-Z]{20,}\b/ },
  { name: 'Stripe 제한 키', re: /\brk_live_[0-9a-zA-Z]{20,}\b/ },
]

// 비밀이 정당하게 들어가는 로컬 파일 — 여기 쓰는 건 막지 않는다(커밋만 막음).
// 단 `.env.example`·`.env.sample` 등 커밋되는 템플릿은 예외에서 빼서(=스캔 대상) 실제 비밀이 템플릿에 박히는 걸 막는다.
const ENV_FILE = /(^|\/)\.env(?!\.(?:example|sample|template|dist|defaults|schema))(\.[\w.-]+)?$/

// 커밋되면 안 되는 민감 파일. `.env.example`·`.env.sample`·`.env.template` 등 안전한 템플릿은 제외.
const SECRET_FILE = /(^|[\s"'=/])(\.env(?!\.(?:example|sample|template|dist|defaults|schema))(?:\.[\w.-]+)?|id_rsa\b|id_ed25519\b|id_ecdsa\b|id_dsa\b|[\w.-]*\.pem\b|[\w.-]*\.p12\b|[\w.-]*\.pfx\b|[\w.-]*\.p8\b|[\w.-]*\.key\b|credentials(\.json)?\b|\.npmrc\b)/

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

function isRecursiveRm(cmd) {
  return /(^|\s)-[A-Za-z]*r[A-Za-z]*(\s|$)/i.test(cmd) || /--recursive\b/.test(cmd)
}

function isCatastrophicTarget(cmd) {
  return /(^|\s)(\/|~|\$HOME|\/\*|~\/\*?|\$\{?HOME\}?\/?\*?)(\s|$)/.test(cmd)
}

// 인라인 코드 실행(node -e, python -c 등) — 대상 파일을 특정할 수 없어도 비밀이 인라인이면 스캔.
const INLINE_INTERP = /\b(?:node|deno|bun|python3?|ruby|perl|php)\b[^\n]*?\s-(?:e|-eval|c|-)\b/

// 파일 쓰기 대상 목록: 리다이렉션(>, >>, >|)과 tee. `2>&1` 같은 fd 리다이렉션은 대상이 없어 제외된다.
function fileWriteTargets(cmd) {
  const targets = []
  for (const m of cmd.matchAll(/>>?\|?\s*([^\s;|&<>]+)/g)) targets.push(m[1].replace(/['"]/g, ''))
  for (const m of cmd.matchAll(/\btee\b(?:\s+-\S+)*\s+([^\s;|&<>]+)/g)) targets.push(m[1].replace(/['"]/g, ''))
  return targets
}

// 파일에 쓰는 명령이고 대상 중 하나라도 .env가 아니면 본문을 스캔한다.
// .env 전용 쓰기는 비밀이 정당하게 가는 경로이므로(Write 경로와 동일) 건너뛴다. 조회 명령은 스캔 안 함.
function shouldScanBashWrite(cmd) {
  const targets = fileWriteTargets(cmd)
  if (targets.length > 0) return targets.some((target) => !ENV_FILE.test(target))
  return INLINE_INTERP.test(cmd)
}

function checkBash(input) {
  const cmd = typeof input.command === 'string' ? input.command : ''
  if (!cmd) return

  // 1) 루트·홈 통째 삭제. 따옴표를 공백으로 중화해 rm -rf "$HOME"·"/" 우회를 막는다.
  //    (git 검사와 달리 따옴표 '내용'을 지우면 대상 토큰까지 사라지므로 공백 치환이어야 한다.)
  //    루트/홈이 대상이면 재귀 삭제(-r)만으로도 치명적이라 -f 는 요구하지 않는다.
  const unquoted = cmd.replace(/['"]/g, ' ')
  if (/\brm\b/.test(unquoted) && isRecursiveRm(unquoted) && isCatastrophicTarget(unquoted)) {
    deny(`치명적 삭제로 보입니다(rm -r 루트/홈). 대상 경로를 구체적으로 지정하세요.`)
  }

  // 1-b) find 로 rm 을 우회한 대량 삭제: find <루트/홈> -delete | -exec rm ...
  const findDestroys = /\s-delete\b/.test(unquoted) || /-exec(?:dir)?\s+rm\b/.test(unquoted)
  if (/\bfind\b/.test(unquoted) && findDestroys && isCatastrophicTarget(unquoted)) {
    deny(`치명적 삭제로 보입니다(find 루트/홈 -delete). 대상 경로를 구체적으로 지정하세요.`)
  }

  // 2) 비밀 파일을 git에 스테이징/커밋. 따옴표 문자열(커밋 메시지)은 제외해 오탐 방지.
  const cmdNoQuotes = cmd.replace(/"[^"]*"/g, ' ').replace(/'[^']*'/g, ' ')
  if (/\bgit\s+(?:add|commit|stage)\b/.test(cmd) && SECRET_FILE.test(cmdNoQuotes)) {
    deny(
      `비밀 파일(.env·키·자격증명)을 커밋하려는 것으로 보입니다. ` +
        `.gitignore에 추가하고 커밋에서 제외하세요. 이미 커밋됐다면 히스토리에서 제거해야 합니다.`,
    )
  }

  // 3) 파일에 쓰는 명령이면 본문도 비밀 스캔.
  //    Write/Edit 경로만 막으면 echo/cat > 파일, heredoc, tee, >|, node -e 로 비밀을 써서 우회할 수 있다.
  if (shouldScanBashWrite(cmd)) scanContent(cmd, '명령')
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
