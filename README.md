<div align="center">

<img src="assets/logo.svg" alt="my-fe-harness" width="112" height="112" />

# my-fe-harness

**Claude Code용 프론트엔드 컨벤션 하네스**

안전장치는 훅으로 *강제*, 스타일 규칙은 린 코어로 *깔끔하게* — 나머지는 필요할 때만.

[![CI](https://github.com/KimDanwoo/my-fe-harness/actions/workflows/ci.yml/badge.svg)](https://github.com/KimDanwoo/my-fe-harness/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
![node](https://img.shields.io/badge/node-%E2%89%A518-3C873A.svg)
![dependencies](https://img.shields.io/badge/dependencies-0-3C873A.svg)
![Claude Code](https://img.shields.io/badge/Claude%20Code-plugin%20%2B%20npx-8B5CF6.svg)

</div>

---

컨벤션이 위키에 흩어져 아무도(사람도, AI도) 안 읽는 문제를 해결한다.
규칙을 한 곳(`rules/`)에 정의하고 각 프로젝트의 `.claude/rules/`로 배포하면,
Claude Code가 **해당 파일을 편집할 때 자동으로 로드**해 일관된 스타일로 짜게 만든다.
보안 같은 **안전장치는 규칙(권고)에 더해 `PreToolUse` 훅으로 실행 전에 강제 차단**한다.

**Claude Code 플러그인** 또는 **의존성 0의 npx CLI**로 설치한다.

## 빠른 시작

```bash
# Claude Code 플러그인 (강제 훅 자동 활성화)
/plugin marketplace add KimDanwoo/my-fe-harness
/plugin install my-fe-harness@my-fe-harness

# 또는 설치 없이 npx — 권장 린 세트(코어 + 프레임워크)
npx github:KimDanwoo/my-fe-harness add core react
```

→ `safety`(+강제 훅)·`typescript`·`patterns`·`react`가 `.claude/rules/`에 깔리고,
이후 Claude가 이 프로젝트에서 **자동으로 지킨다.** 접근성·폼·테스트 등은 필요할 때 `add`로 얹는다.

## 규칙 팩

**과잉 제약 없이 깔끔한 스타일이 딱 나오게** — 기본은 린 코어만, 나머지는 필요할 때 얹는다.
각 규칙은 체크리스트가 아니라 **핵심 원칙 몇 줄**이다.

**코어 (권장 기본)** — `add core react` (또는 `core vue`)

| 팩 | 별칭 | 내용 |
|---|---|---|
| `safety` | `security`, `guard` | **항상 자동 포함·최우선** — 비밀·외부 입력·XSS·토큰·의존성 가드레일 |
| `typescript` | `ts` | 타입 전략(any 금지), 배럴, 네이밍, import 순서 |
| `patterns` | `pattern`, `clean` | 선언형·early return·조건 네이밍·매핑 — ❌/✅ 예시 |
| `react` / `vue` | | 함수 컴포넌트·상태 전략·Hooks / script setup·ref·computed |

**옵션 (필요할 때만 `add`)**

| 팩 | 별칭 | 내용 |
|---|---|---|
| `a11y` | `accessibility` | 웹 접근성(WCAG AA) — 시맨틱·키보드·포커스·ARIA·대비 |
| `styling` | `style`, `design` | 디자인 토큰·테마·다크모드·반응형·모션 |
| `forms` | `form` | 스키마 검증·상태·제출·폼 라이브러리 |
| `frontend` | `front`, `fe` | 데이터·에러·SEO·성능·국제화 |
| `testing` | `test` | 동작 중심 테스트·Testing Library·flaky 방지 |
| `commit` | `git` | Conventional Commits, 원자적 커밋 |
| `monorepo` | `mono` | pnpm workspace 구조·의존 방향 |

> `safety`는 어떤 설치에도 **항상 자동 포함**된다. `add all`은 코어+옵션 전부(무거움) — 보통은 `core`로 충분하다.

## 폴더 구조 팩 — 하나만 선택

| 구조 | 별칭 | 적합 규모 | 형태 |
|---|---|---|---|
| `fsd` | | 중·대규모 | `app→pages→widgets→features→entities→shared` |
| `feature-based` | `feature` | 중규모 | `app→pages→features→shared` (기능 단위 응집) |
| `layered` | `classic` | 소규모·프로토타입 | `pages/components/hooks/api/utils…` |

구조 팩은 규칙 설치 + `src/` 스캐폴드(레이어별 역할·의존 규칙 README)가 함께 된다.
각 규칙에는 **"이 코드 어디에 두지?" 배치 결정 규칙**과 **안티패턴 목록**이 들어 있다.
구조 팩끼리는 상충하므로 `add all`에 포함되지 않는다 — 명시적으로 하나만 고른다.

## 설치 방법 A — Claude Code 플러그인

```
/plugin marketplace add KimDanwoo/my-fe-harness
/plugin install my-fe-harness@my-fe-harness
```

설치하면:

- **안전장치 강제 훅**: 플러그인이 켜지면 `PreToolUse` 훅이 자동 활성화 — 하드코딩 비밀·비밀 파일 커밋·치명적 삭제를 **실행 전에 차단**(아래 "2중 방어")
- **스킬**: TS/React/Vue 작업·커밋·구조 작업 시 규칙 요약 자동 적용
- **`/my-fe-harness:install`** — 원하는 팩을 프로젝트 `.claude/rules/`에 영구 설치
- **`/my-fe-harness:scaffold [구조]`** — 폴더 구조 선택 스캐폴드
- **`/my-fe-harness:guard`** — (플러그인 없이 쓸 때) 강제 훅을 프로젝트에 설치
- **`/my-fe-harness:uninstall`** — 설치한 규칙·훅을 안전하게 걷어냄(해시 검증, 수정본 보존)
- **`/my-fe-harness:status`** — 설치된 규칙·훅과 수정 여부 표시 · **`/my-fe-harness:update`** — 안 건드린 규칙만 최신 원본으로 갱신

## 설치 방법 B — npx CLI

```bash
# 대화형: package.json에서 프레임워크 자동 감지 → 규칙 팩·폴더 구조 선택
npx github:KimDanwoo/my-fe-harness init

# 권장(린): 코어 + 프레임워크 — 깔끔한 스타일에 필요한 최소
npx github:KimDanwoo/my-fe-harness add core react
# 필요할 때 옵션 얹기
npx github:KimDanwoo/my-fe-harness add a11y styling
npx github:KimDanwoo/my-fe-harness add all                # 코어+옵션 전부 (무거움, 구조 제외)

# 전역 설치 — 모든 프로젝트에 적용 (~/.claude)
npx github:KimDanwoo/my-fe-harness add core --global      # 규칙을 전역으로
npx github:KimDanwoo/my-fe-harness guard --global         # 안전장치 훅을 전역으로(항상 켜둠)

# 폴더 구조 스캐폴드 + 해당 규칙 설치
npx github:KimDanwoo/my-fe-harness scaffold feature-based
npx github:KimDanwoo/my-fe-harness scaffold               # 대화형 선택

# 설치 상태 확인 — 뭐가 깔렸나 / 어떤 게 수정됐나
npx github:KimDanwoo/my-fe-harness status

# 규칙 원본 갱신 — 사용자가 안 건드린 파일만 최신으로(수정본 보존)
npx github:KimDanwoo/my-fe-harness update

# 걷어내기 — 우리가 쓴 그대로인 파일만 안전 삭제(수정본 보존)
npx github:KimDanwoo/my-fe-harness uninstall --dry-run   # 먼저 미리보기
npx github:KimDanwoo/my-fe-harness uninstall             # 실제 제거 (별칭: unsync)
npx github:KimDanwoo/my-fe-harness uninstall --global    # 전역(~/.claude) 걷어내기

# 팩·구조 목록 · 버전
npx github:KimDanwoo/my-fe-harness list
npx github:KimDanwoo/my-fe-harness --version
```

옵션: `--all` 규칙 팩 전체 · `--structure <id>` 구조 지정 · `--fsd` = `--structure fsd` ·
`-t, --target <경로>` 대상 프로젝트 · `-g, --global` `~/.claude`에 설치(모든 프로젝트) ·
`--force` 덮어쓰기 · `--dry-run` 미리보기 · `-v, --version` 버전 · `-h, --help` 도움말

CI 등 비-TTY 환경에서는 `init`/`scaffold`의 대화형 선택 대신 팩·구조를 인자로 지정한다
(예: `add ts react --structure feature-based`).

npm에 배포했다면 `npx my-fe-harness init`으로 바로 쓸 수 있다.

## 설치 결과

```
my-project/
├── .claude/
│   ├── .my-fe-harness-manifest.json  # 설치본 sha256 기록 — 안전한 uninstall용
│   └── rules/               # 선택한 팩 — Claude Code가 자동 로드
│       ├── _stack.md         # 감지된 스택 스탬프 (아래 참고)
│       ├── typescript.md
│       ├── patterns.md
│       └── feature-based.md # 선택한 구조 규칙 (배치 규칙 + 안티패턴)
└── src/                     # 선택한 구조로 스캐폴드 (레이어별 README 포함)
    ├── app/  ├── pages/  ├── features/  └── shared/
```

- 기존 파일은 절대 덮어쓰지 않는다(`--force`를 명시했을 때만).
- 구버전 Claude Code처럼 `.claude/rules/` 자동 로드가 없는 환경에서는
  CLAUDE.md에 `@.claude/rules/typescript.md` 형태로 import 한 줄을 추가하면 된다.
- Next.js에서 fsd/feature-based를 쓰면 `pages`가 라우팅과 충돌하므로 `views`로 개명한다.

## 스택 스탬프 & 안전한 걷어내기

- **스택 스탬프(`_stack.md`)**: 설치 시 `package.json`을 감지해 프레임워크(React/Vue/Next)·모노레포 여부와
  설치된 팩을 `.claude/rules/_stack.md`에 기록한다. Claude가 **스택과 맞지 않는 규칙은 무시**하도록 돕는다
  — 규칙 파일 자체에도 "적용 조건"(예: `react.md` = React 전용)이 명시돼 있어 스택 미스매칭을 이중으로 방어한다.
  스택이 하나도 감지되지 않는 프로젝트(비-FE/비-Node)에서는 항상-로드되는 이 파일을 만들지 않는다(토큰 낭비 방지).
- **설치 매니페스트(`.my-fe-harness-manifest.json`)**: 우리가 쓴 각 파일의 sha256을 기록한다. 아래 세 명령의 기반.
- **`status`**: 설치된 규칙·훅과 각 파일의 수정 여부(원본 그대로 / 수정됨 / 삭제됨)를 표로 보여준다.
- **`update`**: 규칙 원본이 갱신됐을 때 **사용자가 안 건드린 파일만**(해시 일치) 최신본으로 교체하고,
  직접 수정한 파일은 `보존(수정됨)`으로 남긴다.
- **`uninstall`(별칭 `unsync`)**: 매니페스트 해시와 현재 파일이 **정확히 일치할 때만** 삭제한다.
  직접 편집·생성한 파일은 `보존(수정됨)`으로 남기고, `settings.json`에서는 우리 안전장치 훅 엔트리만 제거한다.
  경로가 `.claude` 밖을 가리키면(변조된 매니페스트) 건너뛴다 — 파일 단위 삭제만 하며 재귀 삭제는 하지 않는다.

```bash
npx github:KimDanwoo/my-fe-harness status                # 설치·수정 현황
npx github:KimDanwoo/my-fe-harness update                # 안 건드린 규칙만 최신으로
npx github:KimDanwoo/my-fe-harness uninstall --dry-run   # 무엇이 지워질지 먼저 확인
npx github:KimDanwoo/my-fe-harness uninstall             # 실제 제거
```

## 규칙 로딩 방식 — 토큰 최소화 설계

Claude Code는 `.claude/rules/*.md`를 세션 시작에 로드한다
([공식 문서](https://docs.claude.com/en/docs/claude-code/memory)). 규칙을 전부 항상 로드하면
컨텍스트(=토큰)를 낭비하므로, 이 하네스는 **가드레일만 항상 로드하고 나머지는 관련 파일을 열 때만**
로드되도록 `paths:` frontmatter로 스코핑한다.

| 규칙 | `paths` | 로드 시점 |
|---|---|---|
| `safety` | (없음) | **항상 · 최우선** — 안전장치 |
| `commit` | (없음) | **항상** — 커밋 규칙(파일 경로 없음) |
| `typescript` | `**/*.{ts,tsx,mts,cts}` | TS 파일 편집 시 |
| `react` | `**/*.{tsx,jsx}` | 컴포넌트 파일 편집 시 |
| `vue` | `**/*.vue` | SFC 편집 시 |
| `a11y` | `**/*.{tsx,jsx,vue,svelte,astro,html}` | 마크업·컴포넌트 편집 시 |
| `styling` | `**/*.{css,scss,less,tsx,jsx,vue,svelte,astro}` | 컴포넌트·스타일 편집 시 |
| `forms` | `**/*.{tsx,jsx,vue,svelte}` | 컴포넌트 편집 시 |
| `patterns`·`frontend` | 코드 파일 전체 | 코드 편집 시 |
| `testing` | `**/*.{test,spec}.*`·`__tests__/**` | 테스트 파일 편집 시 |
| `monorepo` | `apps/**`·`packages/**`·워크스페이스 설정 | 패키지 경계 작업 시 |
| `fsd`·`feature-based`·`layered` | `src/**/*` | `src/` 작업 시 |

- **항상 로드되는 건 `safety`(+`commit`)뿐** — 나머지는 매칭 파일을 열 때만 들어온다.
  "도입했더니 토큰이 많이 나간다"는 상황을 구조적으로 막는다.
- 순수 `.ts` 훅·컴포저블 파일에는 React/Vue **컴포넌트** 규칙이 안 걸릴 수 있으나,
  `safety`·`typescript`·`patterns`는 그대로 적용된다.
- 특정 규칙을 항상 로드하고 싶으면 그 파일의 `paths:` frontmatter를 지운다.

## 안전장치 — 권고 + 강제(2중 방어)

Claude Code는 `.claude/rules/`를 **컨텍스트(권고)로만** 취급한다 — 공식 문서도
"어떤 규칙도 LLM이 무시할 수 있으며, 무조건 막으려면 `PreToolUse` 훅을 쓰라"고 명시한다
([hooks 문서](https://docs.claude.com/en/docs/claude-code/hooks)). 그래서 안전장치는 2층으로 둔다.

| 층 | 무엇 | 성격 |
|---|---|---|
| `safety.md` (규칙) | LLM에게 "왜"를 설명 — 항상 로드·최우선 | **권고** |
| `safety-guard.mjs` (훅) | 도구 실행 **전에** 위반을 물리적으로 차단 | **강제** |

강제 훅이 `PreToolUse`에서 막는 것 — LLM이 무시하려 해도 불가능:

1. **하드코딩된 실제 비밀** 쓰기(개인키·AWS·GitHub·OpenAI·Anthropic·Slack·Google·Stripe 등). `.env*` 파일은 예외(비밀의 정당한 위치).
2. **비밀 파일 커밋** — `.env`·`*.pem`·`id_rsa`·`credentials` 등의 `git add`/`commit`.
3. **치명적 삭제** — `rm -rf` 로 루트(`/`)·홈(`~`·`$HOME`) 통째 삭제.

설계상 안전(=신뢰성):

- **정상 작업엔 무간섭**: 위 3가지 외에는 아무 출력 없이 통과 → 컨텍스트·**토큰 0**, 방해 0.
- **fail-open**: 훅 내부 오류·미지의 입력은 전부 통과 → 훅이 세션을 절대 깨지 않는다.
- **의존성 0**: 순수 Node 스크립트. 플러그인이면 자동, npx면 `guard`로 설치.

```bash
# 플러그인 없이 쓸 때 — 강제 훅을 프로젝트에 설치(.claude/settings.json 병합, idempotent)
npx github:KimDanwoo/my-fe-harness guard
```

> 오탐을 극도로 줄이려 **확실한 위반만** 막는다. 더 넓은 정책(예: `dangerouslySetInnerHTML` 차단)은
> 포크해서 `scripts/safety-guard.mjs`에 규칙을 추가하면 된다.

## 팀 규칙으로 커스터마이즈

1. 이 저장소를 포크한다.
2. `rules/*.md`를 팀 규칙으로 수정하거나, 새 팩을 추가하고 `src/packs.mjs`에 등록한다.
   구조를 추가하려면 `src/structures.mjs`에 레이어 정의를 등록한다.
3. 팀원들은 포크 저장소로 위 설치 방법 A/B를 그대로 사용한다.

규칙 파일은 순수 마크다운이라 Claude 외에 Cursor 등 다른 도구로도 변환·재사용하기 쉽다.

## 프로젝트 구조

```
my-fe-harness/
├── assets/logo.svg        # 대표 아이콘
├── rules/                 # 규칙 팩 원본 (단일 진실원천, safety.md 포함)
├── bin/ src/              # 의존성 0개 npx CLI
├── scripts/               # safety-guard.mjs — 강제 훅 스크립트(의존성 0)
├── hooks/hooks.json       # 플러그인 PreToolUse 훅 배선
├── commands/              # 플러그인 슬래시 커맨드 (/install, /scaffold, /guard, /status, /update, /uninstall, /list)
├── skills/                # 플러그인 스킬 (컨벤션 자동 적용)
├── test/                  # node:test 검증 스위트 (구조·CLI·가드)
├── .github/workflows/     # CI (Node 18/20/22)
└── .claude-plugin/        # plugin.json + marketplace.json
```

## 개발 · 테스트

의존성 0. 테스트는 Node 내장 러너를 쓴다.

```bash
node --test        # 또는 npm test — 구조 무결성 + CLI 여정 + 안전장치 가드 매트릭스
```

- `test/structure` — 팩↔파일 정합성, JSON 유효성, 경로 스코핑, `node --check`.
- `test/cli` — `add`/`scaffold`/`guard`/`uninstall`/`init`/`--global`/자동 감지 + 매니페스트·스탬프·경로 탈출 방어 (임시 디렉토리, 실제 `~` 미변경).
- `test/guard` — 비밀·비밀 파일 커밋·`rm -rf` 차단 + 오탐 방지 매트릭스.

## License

MIT
