---
paths:
  - "src/**/*"
---

# 폴더 구조 — 기능 중심 (Feature-based)

이 프로젝트는 기능 중심 구조를 따른다. 새 파일을 만들 때 반드시 아래 배치 규칙을 적용한다.

```
src/
├── app/        진입점 — 라우팅, 프로바이더, 전역 스타일
├── pages/      라우트 화면 — features를 조립만 한다
├── features/   기능 단위 (auth, cart, search …)
│   └── auth/
│       ├── components/   기능 전용 UI
│       ├── hooks/        기능 전용 훅
│       ├── api/          기능 전용 서버 통신
│       ├── model/        타입·스토어·비즈니스 로직
│       └── index.ts      ← 공개 API (배럴) — 외부는 여기로만 접근
└── shared/     도메인 무관 공용 코드
    ├── ui/  ├── hooks/  ├── lib/  ├── api/  └── config/
```

## import 방향 — 위에서 아래로만

```
app → pages → features → shared
```

- **feature 간 직접 import 금지.** 필요하면 pages에서 조합하거나 공통 부분을 shared로 내린다.
- feature 외부에서는 배럴(`features/auth/index.ts`)로만 import. 내부 파일 deep import 금지.
- feature 내부끼리는 상대경로 직접 import (자기 배럴 경유 금지 — 순환).

## 배치 결정 규칙 — "이 코드 어디에 두지?"

1. 한 기능에서만 쓴다 → 그 **feature 안에**.
2. 두 기능 이상에서 쓰고 도메인 지식이 없다 → **shared**.
3. 두 기능 이상에서 쓰고 도메인 지식이 있다 → **pages에서 조합**하거나 독립 feature로.
4. 확신이 없으면 일단 feature 안에 — 승격(shared로)은 쉽고 강등은 어렵다.

## 안티패턴

- ❌ shared에 도메인 로직 (`shared/lib/calcCartTotal.ts`) — cart feature로.
- ❌ `features/auth`가 `features/cart`를 import — 결합 시작, 구조 붕괴 신호.
- ❌ pages에 비즈니스 로직 — pages는 조립·레이아웃만.
- ❌ src 최상위에 `components/`, `hooks/` 같은 기술 폴더 추가 — shared 아래로.
- ❌ 폴더 먼저 만들기 — 파일이 생길 때 폴더를 만든다(YAGNI).
