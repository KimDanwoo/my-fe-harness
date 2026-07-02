---
name: my-fe-harness
description: 프론트엔드 컨벤션·안전장치 하네스. TypeScript·React·Vue 코드를 작성/리뷰할 때, 보안·안전(비밀 노출·XSS·입력 검증) 점검, 커밋 메시지 작성, 폴더 구조(FSD·기능 중심·계층형)나 모노레포 작업을 할 때 사용. 규칙 팩 설치와 구조 스캐폴드 지원.
---

# my-fe-harness

프론트엔드 컨벤션 규칙 팩 묶음. 전체 규칙은 `${CLAUDE_PLUGIN_ROOT}/rules/`에 있다.

- 코어(권장): `safety`(항상) · `typescript` · `patterns` · `react`/`vue`
- 옵션(필요 시): `a11y` · `styling` · `forms` · `frontend` · `testing` · `commit` · `monorepo`
- 구조 팩(하나만 선택): `fsd` · `feature-based` · `layered`

영구 적용: `/my-fe-harness:install` (권장 `add core react`) → `.claude/rules/`. 구조: `/my-fe-harness:scaffold`. 목록: `/my-fe-harness:list`.

과잉 제약 없이 깔끔한 스타일이 나오게 — 규칙은 원칙 몇 줄이고 경로 스코핑되어 관련 파일에만 로드된다.
`safety`는 권고 위에 **강제 계층**(`PreToolUse` 훅)이 있어 하드코딩 비밀·비밀 파일 커밋·`rm -rf` 루트/홈을 실행 전 차단한다 — 애초에 그렇게 짜지 않는다.

## 코어 요약 (항상 챙김)

- **안전장치**: 비밀을 코드·번들·로그에 노출 금지(`NEXT_PUBLIC_`/`VITE_`=공개), 외부 입력 검증, `dangerouslySetInnerHTML`/`v-html` 금지, 없는 패키지·API 지어내지 않기.
- **TypeScript**: `type` 우선·`any` 금지(→`unknown` 좁히기), enum 대신 union 리터럴, 공개 경계 배럴(deep import 금지), import 순서 외부→절대→상대.
- **좋은 패턴**: early return(중첩 3단계 금지), 선언형 체인, 조건에 이름, if/switch 대신 매핑, 흐름 설명 주석 금지, 매직넘버 상수화.
- **React**: 함수 컴포넌트·`React.FC` 지양, 비동기는 React Query(useEffect 패칭 금지), 파생값은 렌더 중 계산, 전역은 최소.
- **Vue 3**: `<script setup lang="ts">`, `ref`+`computed`(watch로 상태 복사 금지), 전역은 Pinia.

## 옵션 요약 (설치 시 해당 파일에서 적용)

- **a11y**: 네이티브 요소(`div+onClick` 금지)·`aria-label`·`label` 연결·키보드/포커스·대비. **styling**: 디자인 토큰(하드코딩 금지)·다크모드·모션 최소. **forms**: 스키마 검증·서버 재검증·제출 중 잠금. **frontend**: 로딩·에러·빈·성공 4상태·캐싱·SEO. **testing**: 동작 검증·Testing Library·flaky 방지. **commit**: Conventional Commits. **monorepo**: apps→packages 단방향.

## 폴더 구조 규칙

프로젝트 `.claude/rules/`에 구조 팩(fsd·feature-based·layered)이 설치되어 있으면 **그 구조의 import 방향·배치 결정 규칙·안티패턴을 우선 적용**한다. 새 파일을 만들기 전 "이 코드 어디에 두지?" 결정 규칙을 먼저 확인한다.

세부 판단이 필요하면 해당 팩의 규칙 파일 전문을 읽고 적용한다.
