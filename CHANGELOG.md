# Changelog

이 프로젝트는 [Semantic Versioning](https://semver.org/lang/ko/)을 따른다.
1.0 이전(0.x)에서는 기능 추가를 minor, 버그 수정을 patch로 올린다.

## [Unreleased]

### Added

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
