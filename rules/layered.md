---
paths:
  - "src/**/*"
---

# 폴더 구조 — 계층형 (Layered)

이 프로젝트는 계층형 구조를 따른다. 소규모·프로토타입에 적합하며, 화면이 15~20개를 넘으면 기능 중심(feature-based)이나 FSD 이전을 검토한다.

```
src/
├── pages/       라우트 화면 — 화면 전용 컴포넌트는 pages/<page>/components/에 co-locate
├── components/  두 페이지 이상에서 쓰는 재사용 UI (도메인 무관)
├── hooks/       커스텀 훅 (useXxx)
├── api/         서버 통신 — 클라이언트, 엔드포인트 함수
├── stores/      전역 상태 (꼭 필요할 때만)
├── utils/       순수 함수 유틸 — React·API 의존 금지
├── types/       공용 타입
└── constants/   공용 상수 (매직넘버의 집)
```

## import 방향

```
pages → (components · hooks · api · stores) → (utils · types · constants)
```

- components가 pages를 import 금지. utils가 hooks·api를 import 금지.
- 같은 계층 안에서의 참조는 허용하되 순환 금지.

## 배치 결정 규칙 — "이 코드 어디에 두지?"

1. 한 화면에서만 쓰는 컴포넌트 → `pages/<page>/components/`에 co-locate. 처음부터 components/로 보내지 않는다.
2. 두 페이지 이상에서 쓰게 됐다 → 그때 `components/`로 승격.
3. React에 의존하면 hooks, 서버에 의존하면 api, 둘 다 아니면 utils.
4. API 응답 가공은 컴포넌트가 아니라 **api 계층에서** — 도메인 타입으로 변환해 반환한다.

## 안티패턴

- ❌ `utils/helpers.ts`, `utils/common.ts` 같은 잡동사니 파일 — 파일명으로 책임을 드러낸다 (`formatDate.ts`).
- ❌ components/에 특정 페이지 전용 컴포넌트 축적 — co-locate 원칙 위반.
- ❌ 컴포넌트 안에서 fetch + 응답 가공 — api 계층 + React Query로.
- ❌ stores 남용 — 서버 상태는 React Query, 지역 상태는 useState. 전역은 최후 수단.
- ❌ 빈 폴더 미리 만들기 — 파일이 생길 때 만든다(YAGNI).
