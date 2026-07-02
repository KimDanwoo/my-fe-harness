# claude-harness

> 누구나 받아 쓰는 프론트엔드 컨벤션 하네스.
> **TypeScript · React · Vue · 프론트 공통 · 좋은 패턴 · 커밋 · 모노레포** 규칙 팩과
> **폴더 구조 3종(FSD · 기능 중심 · 계층형)** 을
> **Claude Code 플러그인** 또는 **npx CLI**로 프로젝트에 설치한다.

컨벤션이 위키에 흩어져 아무도(사람도, AI도) 안 읽는 문제를 해결한다.
규칙을 한 곳(`rules/`)에만 정의하고, 각 프로젝트의 `.claude/rules/`로 배포해
Claude Code가 자동으로 로드하게 만든다. 규칙에는 좋은 예/안티패턴 코드 예시가
함께 들어 있어, 도입만 하면 선택한 구조에 맞게 일관되게 짜게 된다.

## 규칙 팩

| 팩 | 별칭 | 내용 |
|---|---|---|
| `typescript` | `ts` | 타입 전략(any 금지·unknown 좁히기), **배럴 패턴**, 네이밍, import 순서 |
| `react` | | 함수 컴포넌트, 상태 전략(React Query·Jotai/Zustand), Hooks, 안티패턴 예시 |
| `vue` | | Vue 3 script setup, ref/computed, Pinia, 템플릿 규칙 |
| `frontend` | `front`, `fe` | 보안(XSS·비밀 노출), 접근성, 성능, 에러 상태 설계 |
| `patterns` | `pattern`, `clean` | 선언형·early return·조건 네이밍·매핑 컴포지션 — ❌/✅ 코드 예시 |
| `commit` | `git` | Conventional Commits, 원자적 커밋 |
| `monorepo` | `mono` | pnpm workspace 구조, 의존 방향, 공용 설정 |

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
/plugin marketplace add danwoo/claude-harness
/plugin install claude-harness@claude-harness
```

설치하면:

- **스킬**: TS/React/Vue 작업·커밋·구조 작업 시 규칙 요약 자동 적용
- **`/claude-harness:install`** — 원하는 팩을 프로젝트 `.claude/rules/`에 영구 설치
- **`/claude-harness:scaffold [구조]`** — 폴더 구조 선택 스캐폴드

## 설치 방법 B — npx CLI

```bash
# 대화형: 규칙 팩 선택 → 폴더 구조 선택
npx github:danwoo/claude-harness init

# 지정 설치
npx github:danwoo/claude-harness add ts react commit
npx github:danwoo/claude-harness add all                # 규칙 팩 전체 (구조 제외)

# 폴더 구조 스캐폴드 + 해당 규칙 설치
npx github:danwoo/claude-harness scaffold feature-based
npx github:danwoo/claude-harness scaffold               # 대화형 선택

# 팩·구조 목록
npx github:danwoo/claude-harness list
```

옵션: `--all` 규칙 팩 전체 · `--structure <id>` 구조 지정 · `--fsd` = `--structure fsd` ·
`-t, --target <경로>` 대상 프로젝트 · `--force` 덮어쓰기 · `--dry-run` 미리보기

npm에 배포했다면 `npx claude-harness init`으로 바로 쓸 수 있다.

## 설치 결과

```
my-project/
├── .claude/
│   └── rules/               # 선택한 팩 — Claude Code가 자동 로드
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

## 팀 규칙으로 커스터마이즈

1. 이 저장소를 포크한다.
2. `rules/*.md`를 팀 규칙으로 수정하거나, 새 팩을 추가하고 `src/packs.mjs`에 등록한다.
   구조를 추가하려면 `src/structures.mjs`에 레이어 정의를 등록한다.
3. 팀원들은 포크 저장소로 위 설치 방법 A/B를 그대로 사용한다.

규칙 파일은 순수 마크다운이라 Claude 외에 Cursor 등 다른 도구로도 변환·재사용하기 쉽다.

## 프로젝트 구조

```
claude-harness/
├── rules/                 # 규칙 팩 원본 (단일 진실원천)
├── bin/ src/              # 의존성 0개 npx CLI
├── commands/              # 플러그인 슬래시 커맨드 (/install, /scaffold)
├── skills/                # 플러그인 스킬 (컨벤션 자동 적용)
└── .claude-plugin/        # plugin.json + marketplace.json
```

## License

MIT
