const FENCE = '```'
const SCREENS_COMMAND = 'node scripts/verify/run.mjs'
const FRAMEWORK_LABELS = { next: 'Next.js', astro: 'Astro', other: '그 외' }

const shell = (parts) => parts.join(' ')
const runScript = (project, name) => shell([...project.commands.run, name])
const codeBlock = (lines) => [`${FENCE}bash`, ...lines, FENCE]

export function setupNotes(project) {
  const { commands, hasPlaywright, routes, framework, scripts } = project
  const notes = []
  if (!hasPlaywright) {
    notes.push(`@playwright/test가 devDependencies에 없다(자동 설치하지 않았다): ${commands.addDev} @playwright/test  →  ${shell([...commands.playwright, 'install', 'chromium'])}`)
  }
  if (!routes.isFound) notes.push('경로를 자동으로 찾지 못했다: scripts/verify/screens.ts의 ROUTES에 화면 비교할 경로를 채운다.')
  if (framework === 'other' && !('preview' in scripts)) notes.push('package.json scripts에 preview(빌드 결과를 서빙)가 있어야 서버를 띄울 수 있다.')
  notes.push('tsconfig.json의 exclude에 scripts/verify 를 추가한다(앱 타입 검사에 섞이지 않게).')
  notes.push('vitest·jest 설정의 exclude에 scripts/verify/** 를 추가한다.')
  notes.push('ESLint의 ignores에 scripts/verify/** 를 추가한다.')
  return notes
}

function quickSection(project) {
  if (project.quickScripts.length === 0) {
    return ['빠른 검사 스크립트를 찾지 못했다. package.json scripts에 lint·typecheck·test(또는 이를 묶은 verify)를 만들어 여기에 적는다.']
  }
  return [
    ...codeBlock(project.quickScripts.map((name) => runScript(project, name))),
    '실패하면 고치고 다시. 같은 검사가 **세 번째에도 실패하면 멈추고 사용자에게** 무엇이 왜 막혔는지 보고한다. 테스트를 건너뛰거나, sleep·재시도를 넣거나, 규칙을 끄지 않는다.',
  ]
}

function e2eSection(project) {
  if (!project.e2eScript) return ['e2e 스크립트(`e2e` 또는 `test:e2e`)가 없다. 사용자 흐름을 검증할 e2e가 생기면 여기에 명령을 적는다.']
  return codeBlock([runScript(project, project.e2eScript)])
}

function screensSection(project) {
  const { routes, commands } = project
  const server = shell([...commands.server, ...commands.portFlag, '<포트>'])
  return [
    ...codeBlock([`${SCREENS_COMMAND}                    # 기준: HEAD(커밋 안 된 변경을 검증)`, `${SCREENS_COMMAND} --base origin/main   # PR 전체를 검증할 때는 PR의 base`, `${SCREENS_COMMAND} --skip-build         # 방금 빌드했으면 현재 빌드를 건너뜀`]),
    `- 기준 커밋을 \`.verify/base\` 작업 사본에 꺼내 빌드하고(커밋이 같으면 다시 빌드하지 않음), 기준 서버로 "정답" 스크린샷을 찍은 뒤 현재 서버로 같은 화면을 찍어 픽셀 단위로 비교한다. 서버는 \`${server}\` 로 띄운다.`,
    `- 대상: \`scripts/verify/screens.ts\`의 경로 ${routes.list.length}개 × mobile·desktop. 날짜는 고정.`,
    '- 결과: `.verify/report/index.html` — 다른 화면마다 기준·현재·차이 이미지.',
    '- **다른 화면이 나오면 이미지를 직접 열어 본다.** 의도한 변화인지, 깨짐·넘침·겹침인지 판단해 보고에 "의도한 차이" 목록으로 적는다. 판단이 안 서면 사용자에게 묻는다.',
    '- 새 화면·흐름(동적 경로, 입력·로그인 흐름)을 만들었으면 `scripts/verify/screens.ts`·`screens.verify.ts`에 추가한다(검증 범위를 코드와 함께 키운다).',
  ]
}

export function renderSkill(project) {
  const framework = FRAMEWORK_LABELS[project.framework]
  const build = shell(project.commands.build)
  return [
    '---',
    'name: verify',
    'description: 변경을 커밋·PR하기 전에 실제로 앱을 띄워 증거로 확인한다 — 빠른 검사 → 운영 빌드 → 기준 커밋 대비 화면 비교(경로 목록 × 모바일·데스크톱) → e2e. "검증해줘", "verify", 커밋·PR 직전, 화면·UI·공용 컴포넌트를 바꾼 뒤에 쓴다.',
    'argument-hint: [--base <git ref>] [--skip-build]',
    '---',
    '',
    '# 검증 (verify)',
    '',
    `테스트 통과가 아니라 **바뀐 앱을 실제로 돌려 본 증거**로 끝낸다. 커밋·PR 전에는 이 순서를 끝까지 돈다. (감지된 프로젝트: ${framework}, ${project.packageManager})`,
    '',
    '## 준비 (처음 한 번)',
    '',
    ...setupNotes(project).map((note) => `- ${note}`),
    '',
    '## 1. 빠른 검사부터',
    '',
    ...quickSection(project),
    '',
    '## 2. 운영 빌드',
    '',
    ...codeBlock([build]),
    '',
    '## 3. 화면 비교 (기준 커밋 대비)',
    '',
    ...screensSection(project),
    '',
    '## 4. e2e',
    '',
    ...e2eSection(project),
    '',
    '## 5. 증거로 보고',
    '',
    '보고와 커밋 메시지에 무엇으로 확인했는지 남긴다:',
    ...codeBlock(['Verified: lint·tsc·unit(N) · build · screens(N/M same, K intended) · e2e(N)']),
    '돌리지 못한 것은 `none`·이유와 함께 적는다(예: 로그인이 필요한 화면).',
    '',
    '## 메모',
    '',
    '- `.verify/`는 커밋하지 않는다(.gitignore). 기준 작업 사본은 `git worktree list`에 보인다.',
    '- 기준 빌드에는 `.env`·`.env.local`을 복사해 쓴다. 비밀은 출력하지 않는다.',
    '',
  ].join('\n')
}
