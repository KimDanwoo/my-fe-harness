<div align="center">

<img src="assets/logo.svg" alt="my-fe-harness" width="112" height="112" />

# my-fe-harness

**Claude Code용 프론트엔드 컨벤션 하네스**

규칙은 컨텍스트로 *주입*, 안전장치는 훅으로 *강제*, 구조는 코드에서 *되읽어 검증*.

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

다만 규칙은 **주입 시점의 스냅샷**이고 코드는 그 뒤로 계속 자란다.
한 번 심어두고 잊는 하네스는 결국 워터폴이므로, 이 하네스는 세 축으로 동작한다.

| 축 | 언제 | 무엇 | 성격 |
|---|---|---|---|
| **1. 규칙** | 관련 파일을 편집할 때 | 해당 규칙 팩이 컨텍스트로 로드된다 | 권고 |
| **2. 안전장치** | 도구 실행 **직전** | `PreToolUse` 훅이 위반을 물리적으로 차단한다 | 강제 |
| **3. 되읽기** | 원할 때 · CI | `check`가 실제 코드에서 구조 위반을 찾아낸다 | 검증 |

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

---

# 1. 규칙 팩

**과잉 제약 없이 깔끔한 스타일이 딱 나오게** — 기본은 린 코어만, 나머지는 필요할 때 얹는다.

코어 팩은 원칙 나열이 아니라 **❌/✅ 대조 예시**로 쓴다.
LLM에게는 "이렇게 하라"는 문장보다 **틀린 코드와 옳은 코드를 나란히 보여주는 것**이 훨씬 잘 먹힌다.
옵션 팩은 핵심 원칙 몇 줄로 얇게 유지한다.

**코어 (권장 기본)** — `add core react` (또는 `core vue`)

| 팩 | 별칭 | 내용 |
|---|---|---|
| `safety` | `security`, `guard` | **항상 자동 포함·최우선** — 비밀·외부 입력·XSS·토큰·의존성 가드레일 |
| `typescript` | `ts` | `unknown` 좁히기 · `as` 대신 검증/`satisfies` · 판별 유니온 · 배럴 |
| `patterns` | `pattern`, `clean` | 선언형 · early return · 조건 네이밍 · 분기 대신 매핑 |
| `react` | | 이펙트 패칭 금지 · 이벤트 vs 이펙트 · 훅 최상위 · `key`로 상태 리셋 |
| `vue` | | `computed` vs `watch` · `reactive` 구조분해 · `defineModel` · 컴포저블 반응성 |

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

> `safety`는 어떤 설치에도 **항상 자동 포함**된다.
> `add all`은 코어+옵션 12팩 전부(무거움) — 보통은 `core`로 충분하다.

## 폴더 구조 팩 — 하나만 선택

| 구조 | 별칭 | 적합 규모 | 의존 방향 |
|---|---|---|---|
| `fsd` | | 중·대규모 | `app→pages→widgets→features→entities→shared` |
| `feature-based` | `feature` | 중규모 | `app→pages→features→shared` (기능 단위 응집) |
| `layered` | `classic` | 소규모·프로토타입 | `pages→(components·hooks·api·stores)→(utils·types·constants)` |

- 규칙 설치 + `src/` 스캐폴드(레이어별 역할·의존 규칙 README)가 함께 된다.
- 각 규칙에 **"이 코드 어디에 두지?" 배치 결정 규칙**, **안티패턴**, **❌/✅ import 예시**가 들어 있다.
- 구조 팩끼리는 상충하므로 `add all`에 포함되지 않는다 — 명시적으로 하나만 고른다.
- 여기 적힌 의존 방향이 곧 [`check`](#3-되읽기--check로-구조-부식-점검)의 판정 근거다.

## 규칙 로딩 — 토큰 최소화 설계

`paths:` frontmatter가 **없는** 규칙만 세션 시작에 로드되고, 있는 규칙은 매칭 파일을 다룰 때만 로드된다
([공식 문서](https://docs.claude.com/en/docs/claude-code/memory)). 공식 문서도 컨텍스트를 아끼는 수단으로
path 스코핑을 지목한다 — *"Use path-scoped rules to load instructions only when Claude works with matching files."*

그래서 이 하네스는 **가드레일만 항상 로드하고 나머지는 전부 스코핑한다.**

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

- 순수 `.ts` 훅·컴포저블 파일에는 React/Vue **컴포넌트** 규칙이 안 걸릴 수 있으나,
  `safety`·`typescript`·`patterns`는 그대로 적용된다.
- 특정 규칙을 항상 로드하고 싶으면 그 파일의 `paths:` frontmatter를 지운다.

### 실제로 얼마나 드나 — 측정치

추정이 아니라 [`InstructionsLoaded` 훅](https://docs.claude.com/en/docs/claude-code/hooks)으로 로드 시점을 직접 찍었다.
동일한 프로젝트 두 벌(규칙 있음/없음)에 `.tsx` 2개와 `.ts` 1개를 두고 **한 턴에 셋 다 읽혔다.**
환경: Claude Code 2.1.221, 설치 구성 = `core react` + `fsd`.

```
load_reason=session_start    _stack.md, safety.md
load_reason=path_glob_match  patterns.md, react.md, typescript.md, fsd.md   ← prompt_id 하나에 각 1회
```

**파일마다 재주입되지 않는다.** 한 턴에서 매칭 파일을 셋 읽었는데 `react.md`는 정확히 한 번 로드됐다.
훅 페이로드에 `prompt_id` 필드가 있으므로 스코프는 아무리 커도 **프롬프트 단위**이지 파일 단위가 아니다.

| | 토큰 |
|---|---:|
| 항상 로드 (`safety`+`commit`+`_stack`) | 850 ~ 1,100 |
| \+ `.tsx` 편집 (린 코어) | 3,300 ~ 4,200 |
| \+ `src/*.tsx` 편집 (린 코어 + `fsd`) | 4,100 ~ 5,200 |
| \+ `src/*.tsx` 편집 (`add all` + `fsd`) | 5,000 ~ 6,300 |

토큰 수는 문자 비율 기반 **추정 범위**다(한글은 토크나이저에 불리해 상·하한을 함께 냈다).
반면 아래 기준선은 실측이다 — 규칙을 하나도 안 깐 쪽도 사소한 프롬프트 하나에 **약 90,000 토큰**을 썼다.
전역 CLAUDE.md·플러그인·MCP 도구 정의가 이미 그만큼 차지한다.
**하네스가 얹는 4~5천은 그 위의 약 5%다.**

**아직 확인되지 않은 것**: 같은 세션의 *다음* 프롬프트에서 재주입되는지.
`--resume`은 프로세스를 새로 띄우므로 이 질문의 답이 될 수 없다. 재주입되더라도 내용이 동일하므로
프롬프트 캐시에 걸릴 가능성이 높지만, **그건 측정하지 않았다.**
긴 세션 중간에 `/context`를 두 번 찍으면 30초에 확정된다.

> 결론: `add all`(5,000~6,300)보다 **린 코어(3,300~4,200)를 쓰라**는 권장은 취향이 아니라 측정에 근거한다.
> 코어 팩이 두꺼운 건 의도한 거래다 — 규칙이 얇아 에이전트가 안 지키면
> 잘못 짠 코드를 발견하고 고치는 왕복이 생기고, 그 왕복 한 번이 규칙 전체보다 비싸다.

---

# 2. 안전장치 — 권고 + 강제(2중 방어)

Claude Code는 `.claude/rules/`를 **컨텍스트(권고)로만** 취급한다 — 공식 문서도
"어떤 규칙도 LLM이 무시할 수 있으며, 무조건 막으려면 `PreToolUse` 훅을 쓰라"고 명시한다
([hooks 문서](https://docs.claude.com/en/docs/claude-code/hooks)). 그래서 안전장치만 2층으로 둔다.

| 층 | 무엇 | 성격 |
|---|---|---|
| `safety.md` (규칙) | LLM에게 "왜"를 설명 — 항상 로드·최우선 | **권고** |
| `safety-guard.mjs` (훅) | 도구 실행 **전에** 위반을 물리적으로 차단 | **강제** |

강제 훅이 `PreToolUse`에서 막는 것 — LLM이 무시하려 해도 불가능:

1. **하드코딩된 실제 비밀** 쓰기(개인키·AWS·GitHub·OpenAI·Anthropic·Slack·Google·Stripe 등).
   `.env*` 파일은 예외(비밀의 정당한 위치).
2. **비밀 파일 커밋** — `.env`·`*.pem`·`id_rsa`·`credentials` 등의 `git add`/`commit`.
3. **치명적 삭제** — `rm -rf`로 루트(`/`)·홈(`~`·`$HOME`) 통째 삭제.

설계상 안전(=신뢰성):

- **정상 작업엔 무간섭** — 위 3가지 외에는 아무 출력 없이 통과. 컨텍스트·**토큰 0**, 방해 0.
- **fail-open** — 훅 내부 오류·미지의 입력은 전부 통과. 훅이 세션을 절대 깨지 않는다.
- **의존성 0** — 순수 Node 스크립트. 플러그인이면 자동, npx면 `guard`로 설치.

```bash
# 플러그인 없이 쓸 때 — 강제 훅을 프로젝트에 설치(.claude/settings.json 병합, idempotent)
npx github:KimDanwoo/my-fe-harness guard
```

> 오탐을 극도로 줄이려 **확실한 위반만** 막는다. 더 넓은 정책(예: `dangerouslySetInnerHTML` 차단)은
> 포크해서 `scripts/safety-guard.mjs`에 규칙을 추가하면 된다.

---

# 3. 되읽기 — `check`로 구조 부식 점검

규칙은 설치 시점에 주입되지만 코드는 그 뒤로 계속 자란다.
**설치한 구조 규칙이 지금 코드에서 지켜지고 있는지**는 코드를 되읽어야만 알 수 있다.

```bash
npx github:KimDanwoo/my-fe-harness check
```

```
구조 점검 [fsd] — src/ 코드 파일 92개

  ✖ src/entities/user/ui/UserCard.tsx:1
      @/features/auth  —  아래→위 import — entities 는 features 를 참조할 수 없다
  ✖ src/features/cart/model/store.ts:1
      @/features/like  —  같은 레이어의 다른 슬라이스 직접 import — features/like
  ✖ src/pages/HomePage.tsx:1
      @/entities/user/model/store  —  슬라이스 내부 deep import — 공개 API(entities/user)로만 접근한다

  위반 3건 — .claude/rules/fsd.md 의 의존 방향 규칙을 보세요.
```

- **하네스만 할 수 있는 검사다.** 이 프로젝트가 *어떤 구조 팩을 골랐는지* 아는 건 하네스뿐이라,
  범용 린터가 설정 없이는 잡아주지 않는 의존 방향을 판정한다. `tsconfig`/`jsconfig`의 path alias를 그대로 해석한다.
- **결정론적 판정만** 한다 — 아래→위 import, 옆 슬라이스 직접 참조, 배럴 우회 deep import 셋뿐.
  "추상화가 과한가" 같은 판단은 하지 않는다. **볼 곳을 좁혀줄 뿐 자동 수정하지 않는다.**
- 상대경로·외부 패키지·슬라이스 없는 레이어(`shared` 등) 내부 경로는 위반이 아니다(오탐 방지).
- 위반이 있으면 **종료 코드 1** — CI에 그대로 걸 수 있다.

## 스택·컨벤션 스탬프

설치 시 `package.json`·`tsconfig`·소스 디렉토리를 감지해 `.claude/rules/_stack.md`에 기록한다.
**보편 규칙 팩으로는 쓸 수 없고 이 코드베이스에서만 읽어낼 수 있는 사실**을 에이전트 컨텍스트에 고정한다.

- **스택** — 프레임워크(React/Vue/Next)·모노레포 여부·설치된 팩.
  Claude가 **스택과 맞지 않는 규칙은 무시**하도록 돕는다(규칙 파일 자체에도 "적용 조건"이 있어 이중 방어).
- **실제로 쓰는 것** — 데이터/상태·폼/검증·스타일·테스트·API 라이브러리, `src/` 최상위 구조, import alias.
  이미 `jotai`를 쓰는데 `zustand`를 새로 끌어오거나, alias 대신 상대경로로 뒤집히거나,
  구조 밖에 새 디렉토리를 만드는 사고를 줄인다.

**낡음 감지** — 스탬프는 설치 시점 스냅샷이라 **나중에 라이브러리를 깔면 조용히 낡는다.**
낡은 사실은 사실이 없는 것보다 나쁘므로(에이전트가 없는 라이브러리를 쓴다),
`status`가 지금 프로젝트 상태로 스탬프를 다시 렌더해 파일과 비교하고 **다를 때만** 경고한다 → `update`로 갱신.
의존성뿐 아니라 `src/` 구조·alias 변경도 같이 잡히며, 별도 상태를 저장하지 않는다.

전부 결정론적 감지이고 **사실만 적는다** — 판정·권고는 규칙 팩의 몫이다.
감지 단계가 실패하면 그 항목만 비운다(fail-open).
스택도 컨벤션도 하나도 감지되지 않는 프로젝트에서는 항상-로드되는 이 파일을 아예 만들지 않는다.

---

# 설치

## A. Claude Code 플러그인

```
/plugin marketplace add KimDanwoo/my-fe-harness
/plugin install my-fe-harness@my-fe-harness
```

설치하면 **안전장치 강제 훅이 자동 활성화**되고, TS/React/Vue·커밋·구조 작업 시 규칙 요약을 적용하는
**스킬**과 아래 슬래시 커맨드가 붙는다.

| 커맨드 | 하는 일 |
|---|---|
| `/my-fe-harness:install` | 원하는 팩을 프로젝트 `.claude/rules/`에 영구 설치 |
| `/my-fe-harness:scaffold [구조]` | 폴더 구조 선택 스캐폴드 |
| `/my-fe-harness:check` | 구조 팩의 의존 방향이 실제 코드에서 지켜지는지 점검 |
| `/my-fe-harness:status` | 설치된 규칙·훅과 수정 여부, 스탬프 낡음 표시 |
| `/my-fe-harness:update` | 안 건드린 규칙만 최신 원본으로 갱신 |
| `/my-fe-harness:guard` | (플러그인 없이 쓸 때) 강제 훅을 프로젝트에 설치 |
| `/my-fe-harness:uninstall` | 설치한 규칙·훅을 안전하게 걷어냄(해시 검증, 수정본 보존) |

## B. npx CLI (의존성 0)

```bash
# 대화형: package.json에서 프레임워크 자동 감지 → 규칙 팩·폴더 구조 선택
npx github:KimDanwoo/my-fe-harness init
```

| 명령 | 하는 일 |
|---|---|
| `add core react` | **권장(린)** — 코어 + 프레임워크. 깔끔한 스타일에 필요한 최소 |
| `add a11y styling` | 옵션 팩 얹기 |
| `add all` | 코어+옵션 12팩 전부 (무거움, 구조 팩 제외) |
| `scaffold feature-based` | 폴더 구조 스캐폴드 + 해당 규칙 설치 (인자 없으면 대화형) |
| `guard` | 안전장치 강제 훅 설치 (`.claude/settings.json` 병합, idempotent) |
| `check` | 구조 의존 방향 점검 — 위반 시 종료 코드 1 |
| `status` | 설치·수정 현황 + 스탬프 낡음 여부 |
| `update` | 안 건드린 규칙만 최신 원본으로 (수정본 보존) |
| `uninstall` | 우리가 쓴 그대로인 파일만 안전 삭제 (별칭 `unsync`) |
| `list` · `--version` | 팩·구조 목록 · 버전 |

```bash
# 전역 — 모든 프로젝트에 적용 (~/.claude)
npx github:KimDanwoo/my-fe-harness add core --global
npx github:KimDanwoo/my-fe-harness guard --global      # 안전장치를 항상 켜둠

# 걷어내기 전 미리보기
npx github:KimDanwoo/my-fe-harness uninstall --dry-run
```

**옵션** — `--all` 규칙 팩 전체 · `--structure <id>` 구조 지정 · `--fsd` = `--structure fsd` ·
`-t, --target <경로>` 대상 프로젝트 · `-g, --global` `~/.claude`에 설치 ·
`--force` 덮어쓰기 · `--dry-run` 미리보기 · `-v, --version` · `-h, --help`

CI 등 비-TTY 환경에서는 `init`/`scaffold`의 대화형 선택 대신 팩·구조를 인자로 지정한다
(예: `add ts react --structure feature-based`). npm에 배포했다면 `npx my-fe-harness init`으로 바로 쓸 수 있다.

## 설치 결과

```
my-project/
├── .claude/
│   ├── .my-fe-harness-manifest.json  # 설치본 sha256 기록 — 안전한 uninstall용
│   └── rules/                        # 선택한 팩 — Claude Code가 자동 로드
│       ├── _stack.md                 # 감지된 스택·컨벤션 스탬프
│       ├── typescript.md
│       ├── patterns.md
│       └── feature-based.md          # 선택한 구조 규칙 (배치 규칙 + 안티패턴)
└── src/                              # 선택한 구조로 스캐폴드 (레이어별 README 포함)
    ├── app/  ├── pages/  ├── features/  └── shared/
```

- 기존 파일은 절대 덮어쓰지 않는다(`--force`를 명시했을 때만).
- 구버전 Claude Code처럼 `.claude/rules/` 자동 로드가 없는 환경에서는
  CLAUDE.md에 `@.claude/rules/typescript.md` 형태로 import 한 줄을 추가하면 된다.
- Next.js에서 `fsd`/`feature-based`를 쓰면 `pages`가 라우팅과 충돌하므로 `views`로 개명한다.

## 생애주기 — 안전한 갱신·걷어내기

설치 매니페스트(`.my-fe-harness-manifest.json`)에 **우리가 쓴 각 파일의 sha256**을 기록한다.
아래 세 명령이 전부 이 해시를 근거로 동작하므로, **직접 편집한 파일은 절대 잃지 않는다.**

| 명령 | 동작 |
|---|---|
| `status` | 파일별로 `원본 그대로` / `수정됨` / `없음(삭제됨)`을 표시. 스탬프가 낡았으면 함께 경고 |
| `update` | **해시가 일치하는 파일만** 최신 원본으로 교체. 수정한 파일은 `보존(수정됨)` |
| `uninstall` | 해시가 **정확히 일치할 때만** 삭제. `settings.json`에서는 우리 훅 엔트리만 제거 |

`uninstall`은 매니페스트 경로가 `.claude` 밖을 가리키면(변조된 매니페스트) 건너뛴다 —
파일 단위 삭제만 하며 재귀 삭제는 하지 않는다.

---

# 팀 규칙으로 커스터마이즈

1. 이 저장소를 포크한다.
2. `rules/*.md`를 팀 규칙으로 수정하거나, 새 팩을 추가하고 `src/packs.mjs`에 등록한다.
   구조를 추가하려면 `src/structures.mjs`에 레이어 정의(`rank`·`sliceLayers` 포함)를 등록한다 —
   그 정의가 곧 `check`의 판정 근거가 된다.
3. 팀원들은 포크 저장소로 위 설치 방법 A/B를 그대로 사용한다.

규칙 파일은 순수 마크다운이라 Claude 외에 Cursor 등 다른 도구로도 변환·재사용하기 쉽다.

# 프로젝트 구조

```
my-fe-harness/
├── assets/logo.svg        # 대표 아이콘
├── rules/                 # 규칙 팩 원본 (단일 진실원천, safety.md 포함)
├── bin/ src/              # 의존성 0개 npx CLI (check.mjs = 구조 되읽기)
├── scripts/               # safety-guard.mjs — 강제 훅 스크립트(의존성 0)
├── hooks/hooks.json       # 플러그인 PreToolUse 훅 배선
├── commands/              # 플러그인 슬래시 커맨드
├── skills/                # 플러그인 스킬 (컨벤션 자동 적용)
├── test/                  # node:test 검증 스위트
├── .github/workflows/     # CI (Node 18/20/22)
└── .claude-plugin/        # plugin.json + marketplace.json
```

# 개발 · 테스트

의존성 0. 테스트는 Node 내장 러너를 쓴다.

```bash
npm test        # 또는 node --test
```

- `test/structure` — 팩↔파일 정합성, JSON 유효성, 경로 스코핑, `node --check`.
- `test/cli` — `add`/`scaffold`/`guard`/`check`/`status`/`update`/`uninstall`/`init`/`--global`/자동 감지
  \+ 매니페스트·스탬프 낡음·구조 위반 판정·경로 탈출 방어 (임시 디렉토리, 실제 `~` 미변경).
- `test/guard` — 비밀·비밀 파일 커밋·`rm -rf` 차단 + 오탐 방지 매트릭스.

# License

MIT
