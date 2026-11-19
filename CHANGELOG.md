# Changelog

이 프로젝트는 [Semantic Versioning](https://semver.org/lang/ko/)을 따른다.
1.0 이전(0.x)에서는 기능 추가를 minor, 버그 수정을 patch로 올린다.

## [Unreleased]

### Added

- **lint-guard 강화** — 고친 파일을 `eslint --fix`로 먼저 자동 수정하고 남은 에러만 되돌린다. 끝낼 때는 그 세션·그 에이전트가
  고친 파일만 본다(다른 에이전트 작업 중인 파일로 막지 않음). 서브에이전트 종료(SubagentStop)도 같은 검사를 받는다.
- **기본 잠금(바닥선) `lint-guard-baseline.mjs`** — 중첩 삼항·복잡도 10·중첩 깊이 3·함수 120줄·컴포넌트 파일 250줄·매직넘버·
  인라인 끄기 금지를 ESLint 기본 규칙으로 정의해, 프로젝트 설정 "아래에" 깔고 검사한다. 프로젝트가 필요한 곳은 뒤에서 끌 수 있고,
  덧씌움이 실패하면 프로젝트 설정만으로 검사한다.

- **린트 강제 훅 `lint-guard`** — PostToolUse(Write·Edit·MultiEdit)에서 고친 파일을 프로젝트 ESLint로 검사해
  에러를 Claude에게 되돌리고, Stop에서 바뀐 파일에 에러가 남으면 끝내지 못하게 한다(세션당 3번까지, fail-open,
  `MY_FE_HARNESS_LINT_GUARD=off`로 끔). 플러그인은 `hooks.json`으로 자동, npx는 `lint-guard` 명령으로 프로젝트별 설치.
  `uninstall`·`status`도 이 훅을 다룬다.
  전역 사본이 있으면 프로젝트·플러그인 사본은 양보한다(중복 검사 방지).

### Fixed

- **`--global` 훅 경로** — exec 형식(`args`)은 셸이 없어 `${HOME}`이 펼쳐지지 않는다. 전역 설치(`guard`·`lint-guard`)는
  셸 형식 `node "$HOME/.claude/hooks/…"`으로 쓰고, 이미 셸 형식으로 등록된 훅도 알아봐 중복 추가하지 않는다.

### Changed

- **FSD: Next.js 레이어 이름은 `_app`·`_pages`** — FSD 공식 Next.js 가이드대로 둘 다 밑줄 접두로 바꾸도록 했다(`views` 대안 제거).
  `check`는 `_app`·`_pages` 폴더를 같은 레이어로 검사한다. 정적 자산은 쓰는 곳에(슬라이스 `assets/` 또는 `shared/assets/`),
  전역 스타일은 `_app/styles/`에 두도록 적었다.

- **patterns: 중첩 삼항 금지·컴포넌트 본문 규칙·잠금 절** — 셋 이상 갈래는 매핑 객체·early return·함수로. 컴포넌트
  본문에는 훅 호출·파생값·이벤트 핸들러만 두고 계산은 `lib/`, 상태 로직은 훅, 상수는 `config/`로. 공용 UI가 있으면
  직접 마크업으로 다시 만들지 않는다. 규칙은 lint·검사 스크립트로 강제하고 인라인 비활성화 주석은 쓰지 않는다.

- **TypeScript·FSD: 상대경로 import 금지** — 슬라이스 안에서도 `./`·`../` 대신 별칭 전체 경로로 import한다
  (`index.ts` 재수출 포함). 한 파일을 가리키는 import 문자열이 하나로 통일되고, 슬라이스 안에서 파일을 옮겨도
  다른 import가 깨지지 않는다. 별칭으로 세그먼트까지 들어가는 건 같은 슬라이스 안에서만 허용하고, 경계는
  `import-x/no-restricted-paths`(위치 기반)로 지키도록 적었다. **기본 규칙이 바뀌므로**, 상대경로를 유지하려면
  설치된 `fsd.md`·`typescript.md`를 직접 고쳐 두면 `update`가 보존한다.

## [0.4.0] - 2026-11-17

### Changed

- **TypeScript·React: 객체 계약은 `interface`** — `type` 우선이던 기본값을 바꿨다. props 같은 객체 계약은
  `interface`(공유 축은 `extends`), 유니온·유틸리티 조합·별칭은 `type`을 쓴다. TypeScript 핸드북의
  권고("`type` 기능이 필요해질 때까지 `interface`")와 typescript-eslint `consistent-type-definitions`
  기본값(`interface`)에 맞춘 것이다. `react.md`의 props 예시도 `interface XxxProps`로 고쳤다.
  **기본 규칙이 바뀌므로**, `type` 우선을 유지하려면 설치된 `typescript.md`·`react.md`를 직접 고쳐 두면
  `update`가 보존한다.
- **FSD: widgets 문구 보강** — 신규로 만들지 않되 잘 쓰는 기존 프로젝트는 유지해도 된다는 공식 입장은
  그대로 두고, 옮기기로 했을 때의 목적지(한 화면 전용 → page, 공용 동작+UI → features, 맥락 없는 UI →
  shared, 앱 레이아웃 → app)를 적었다.
- **patterns: 주석 규칙을 별도 절로** — "기본은 달지 않는다"를 ❌/✅ 예시와 함께 분리했다. 예외는
  코드만 보면 틀려 보이는 우회·외부 제약 하나이고, 이때는 근거 링크를 함께 단다.

### Added

- **FSD: 공개 API·세그먼트·shared·Next.js 절** — 공식 문서의 Public API·Slices and segments·Next.js
  가이드를 규칙으로 옮겼다. `index.ts`는 이름을 명시해 재수출(`export *` 금지), 슬라이스 안에서는
  상대경로, 세그먼트 안 배럴 금지, 서버 전용 코드는 `index.server.ts`로 분리. 세그먼트 이름은
  목적 기준(`ui`·`model`·`api`·`lib`·`config`)이고 `components`·`hooks`·`types` 같은 종류 기준 이름은
  쓰지 않는다. `shared`는 슬라이스 없이 세그먼트만 두며 `shared/ui`·`shared/lib`는 항목마다 진입점을
  둔다. Next.js와 폴더명이 겹치면 `_pages`·`_app`(공식 권장) 또는 `views`로 통일한다.

## [0.3.0] - 2026-11-17

### Changed

- **FSD: widgets 레이어 비권장 반영** — FSD 공식 문서가 widgets를 기본 레이어에서 뺐다
  ([feature-sliced/documentation#933](https://github.com/feature-sliced/documentation/pull/933), 2026-07-29).
  `fsd.md` 기본 레이어를 `app→pages→features→entities→shared`로 바꾸고, 화면 전용 조합은 pages·
  공용 동작은 features·맥락 없는 UI는 shared·앱 레이아웃은 app으로 배치 규칙을 고쳤다. 공식
  [feature-sliced/skills](https://github.com/feature-sliced/skills)의 pages-first("두 곳에서 쓴다는 이유만으로
  레이어를 만들지 않는다")와 추출 3조건(지금 여러 곳에서 사용·독립된 변경 이유·응집된 책임)도 넣어,
  화면 전용 로직은 pages에 두는 것을 기본으로 했다. `scaffold fsd`는 `app·pages·shared`만 만든다
  (빈 features·entities·widgets 폴더 생성 안 함). `check`는 그대로 다섯 레이어와 기존 프로젝트의
  `widgets/`까지 같은 의존 방향으로 검사한다.

### Fixed

- **`check`: FSD `pages` 슬라이스 격리 누락** — `pages/a`가 `pages/b`를 직접 import해도 통과하던 문제.
  pages-first에서 코드가 pages에 모이므로 페이지 간 결합을 잡도록 pages를 슬라이스 레이어에 넣었다.
  레이어 바로 아래 평평한 파일은 첫 `.` 앞을 슬라이스로 보고(`Home.tsx`·`Home.test.tsx`·`Home.styles.ts`는
  같은 슬라이스), 레이어 루트 배럴(`pages/index.ts`)의 re-export는 위반으로 보지 않는다.

### Added

- **직접 호출 작업 스킬 3종** — 플러그인에 `state-machine-hunter`(암묵적 상태 머신 찾기)·`bug-triager`
  (빈도×심각도 점수화, 곱이 5 미만이면 이슈로만 등록)·`ci-auditor`(`gh`로 최근 CI 실행을 대기·셋업·실행
  단계로 분석, 코드 수정 없음)를 추가했다. 모두 `disable-model-invocation: true`라 자동으로 발동하지 않고
  `/my-fe-harness:<이름>`으로 부를 때만 실행된다. 플러그인 전용이며 npx 설치·`AGENTS.md` 내보내기 대상은 아니다.

- **Codex 등 다른 에이전트 지원 — `AGENTS.md` 규칙 블록** — `add`·`update`가 설치된 `.claude/rules/` 규칙을
  `AGENTS.md`의 마커 블록(`<!-- my-fe-harness:start/end -->`)으로도 내보낸다. 프로젝트는 `<target>/AGENTS.md`,
  `--global`은 Codex 홈(`CODEX_HOME` 또는 `~/.codex`)이 있을 때만 `~/.codex/AGENTS.md`. frontmatter `paths`는
  `> 적용 대상:` 한 줄로 바꾼다. 블록 sha256을 매니페스트(`agents`)에 기록해 `status`가 상태를 보여주고,
  `update`·`uninstall`은 직접 고친 블록을 보존한다. 블록 밖 사용자 내용은 그대로 두며, 마커가 깨졌거나 중복이면
  손대지 않는다. 우리가 만든 파일만 비었을 때 삭제한다. `--no-agents`로 생략. 파일이 크거나 `AGENTS.override.md`가
  있으면 경고한다.

- **프로젝트 고유 컨벤션 감지** — `_stack.md` 스탬프가 "이 프로젝트가 실제로 쓰는 것"을 함께 기록한다:
  데이터/상태·폼/검증·스타일·테스트·API 라이브러리(`package.json`), `src/`(없으면 `app/`) 최상위 구조,
  import alias(`tsconfig`/`jsconfig`의 `paths`). 보편 규칙 팩으로는 표현할 수 없는, 코드베이스에서만
  읽어낼 수 있는 사실을 에이전트 컨텍스트에 고정한다. 결정론적 감지이며 사실만 적고 판정하지 않는다.

- **`check` 명령 — 구조 의존 방향 되읽기.** 규칙은 설치 시점에 주입되지만 코드는 그 뒤로 자란다.
  설치된 구조 팩(`fsd`·`feature-based`·`layered`)의 의존 방향을 실제 `src/` 코드에 대해 점검하고
  `파일:줄`로 보고한다. 잡는 것은 결정론적인 세 가지뿐 — 아래→위 import, 같은 레이어의 다른 슬라이스
  직접 import, 슬라이스 내부 deep import(배럴 우회). `tsconfig`/`jsconfig`의 path alias를 해석하며
  상대경로·외부 패키지·슬라이스 없는 레이어(`shared` 등)는 오탐하지 않는다.
  위반 시 종료 코드 1(CI 연동), 자동 수정은 하지 않는다. 슬래시 커맨드 `/my-fe-harness:check` 동봉.
- **스탬프 낡음 감지** — 스탬프는 설치 시점 스냅샷이라 나중에 라이브러리를 깔면 조용히 낡는다.
  `status`가 지금 프로젝트 상태로 스탬프를 다시 렌더해 파일과 비교하고, 다를 때만 경고한다(`update`로 갱신).
  의존성·`src/` 구조·alias 변경을 모두 잡으며 별도 상태를 저장하지 않는다.

- **토큰 비용 측정치 문서화** — "규칙을 두껍게 하면 토큰이 낭비되지 않나"에 추정 대신 측정으로 답한다.
  `InstructionsLoaded` 훅으로 로드 시점을 찍어 **path-scoped 규칙이 파일마다 재주입되지 않음**을 확인했고
  (한 턴에 매칭 파일 3개를 읽어도 `react.md`는 1회 로드), 구성별 토큰 추정 범위와
  규칙 0개일 때의 실측 기준선(~90,000)을 README에 넣었다. 미확인 항목(같은 세션의 다음 프롬프트에서의
  재주입 여부)도 명시했다.

### Changed

- **코어 규칙 팩 재작성 (`react`·`vue`·`typescript`)** — 원칙 나열에서 **❌/✅ 대조 예시** 형식으로 바꿨다
  (`patterns.md`가 쓰던 형식). LLM에게는 틀린 코드와 옳은 코드를 나란히 보여주는 편이 문장보다 잘 먹힌다.
  - `react` (33→91줄): 이펙트 패칭·파생 상태 복사, 이벤트 vs 이펙트, early return 뒤 훅, 상태 초기화는 `key`로.
    React 19절 정정 — `use()`는 다른 훅과 달리 조건·루프 안에서 호출 가능하다(종전 서술이 반대였다).
  - `typescript` (39→96줄): `any`→`unknown`+스키마, `as` 대신 검증/`satisfies`, 옵셔널 나열 대신 판별 유니온
    (`never` 완전성 검사 포함), `enum` 대신 `as const` 유니온.
  - `vue` (15→88줄): `watch` 상태 복사 대신 `computed`, `reactive` 구조분해 반응성 상실, props 변이 대신
    `defineModel`/`emit`, 컴포저블 `MaybeRefOrGetter`+`toValue`, 템플릿 로직 추출, `v-if`+`v-for` 분리.
- **구조 팩 보강 (`fsd`·`feature-based`·`layered`)** — 배치 실수를 ❌/✅ **import 예시**로 보여준다.
  - `fsd` (32→62줄): 배치 결정 규칙(명사→entities / 동사→features / 확신 없으면 쓰는 곳 가까이)과
    안티패턴 절을 신설해 나머지 두 팩과 밀도를 맞췄다. 의존 방향 역전·옆 슬라이스 직접 import·deep import 예시 추가.
  - `feature-based` (48→62줄): feature 간 직접 import 대신 pages에서 조합하는 예시 추가.
  - `layered` (44→57줄): 방향 역전, `utils`에 훅이 섞이는 경우, 화면 전용 컴포넌트 co-locate 예시 추가.
- 스탬프 생성 게이트가 완화됐다 — 프레임워크가 감지되지 않아도 컨벤션이 하나라도 잡히면 스탬프를 쓴다.
  스택도 컨벤션도 없으면 종전대로 만들지 않는다.
- 감지 실패는 항목 단위 fail-open — 깨진 `tsconfig`가 설치를 막지 않고 alias 줄만 빠진다.

## [0.2.0] - 2026-07-03

### Added

- **안전한 걷어내기 (`uninstall`, 별칭 `unsync`)** — 설치 매니페스트(sha256)로 검증해 **우리가 쓴 그대로인 파일만** 삭제한다. 직접 수정·생성한 파일은 보존하고, `settings.json`에서는 안전장치 훅 엔트리만 제거한다.
- **`status` 명령** — 설치된 규칙·훅과 각 파일의 수정 여부(원본 그대로 / 수정됨 / 삭제됨), 설치 버전 대비 현재 버전을 표시한다.
- **`update` 명령** — 사용자가 안 건드린 규칙만(해시 일치) 최신 원본으로 갱신하고, 수정한 파일은 보존한다.
- **스택 스탬프 (`_stack.md`)** — 설치 시 `package.json`을 감지해 프레임워크·모노레포 여부와 설치된 팩을 기록한다. 스택 미감지 프로젝트에서는 생성하지 않는다.
- **스택 미스매칭 가드** — 스택 전용 규칙(`react`·`vue`·`monorepo`)에 "적용 조건"을 명시해 다른 스택에서 스스로 비활성화되게 했다.
- **설치 매니페스트 (`.my-fe-harness-manifest.json`)** — 설치한 파일의 sha256과 설치 버전(`installedBy`)을 기록한다. `status`·`update`·`uninstall`의 기반.
- 규칙 내용 보강 — React 19+ 스탠스, TS 판별 유니온, safety의 CSP·`rel=noopener`·env 스키마 검증·옵저버빌리티, FSD cross-import(`@x`).

### Changed

- 명령당 매니페스트 read-modify-write를 1회로 배칭(`withManifest`).
- 버전 단일 소스화(`src/version.mjs`) — bin·매니페스트 스탬프·status가 `package.json`에서만 읽는다.

### Security

- `uninstall`/`update`는 파일 단위 삭제만 하며 재귀 삭제를 하지 않고, 해석된 경로가 `.claude` 밖이면(변조된 매니페스트) 건너뛴다.

## [0.1.0]

- 최초 릴리스 — 규칙 팩(safety/typescript/react/vue/…), 폴더 구조 스캐폴드(fsd/feature-based/layered), 안전장치 강제 훅(`guard`), npx CLI + Claude Code 플러그인.
