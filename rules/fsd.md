---
paths:
  - "src/**/*"
---

# FSD (Feature-Sliced Design) 규칙

## 레이어 — 위에서 아래로만 import 가능

```
app → pages → features → entities → shared
```

- **app**: 진입점 — 프로바이더, 라우팅 설정, 전역 스타일, 앱 전체 레이아웃
- **pages**: 라우트 단위 조립 — 그 화면에서만 쓰는 블록도 여기 (Next.js와 폴더명 충돌 시 `views`로 개명)
- **features**: 사용자 행동·흐름 단위 (검색, 좋아요, 로그인) — 여러 페이지에서 쓰는 동작
- **entities**: 도메인 모델 (user, product) — ui·model·api
- **shared**: 프레임워크·비즈니스 맥락 무관 공용 코드 (ui-kit, lib, api client, config)

> **widgets는 공식 비권장**(FSD 문서, 2026-07). 데이터 로딩·상태·이벤트를 품으면 features와 경계가 겹친다.
> 신규 프로젝트에선 만들지 않는다. 이미 잘 쓰고 있는 프로젝트는 유지해도 된다 — 위치는 pages와 features 사이.
> `processes`는 계속 deprecated.

## 배치 결정 규칙 — "이 코드 어디에 두지?"

**pages-first — 먼저 쓰는 곳(그 화면의 pages 슬라이스)에 둔다.** 화면 전용 폼·상태·API·비즈니스 로직도 pages에 둬도 된다.
프로바이더·라우팅·전역 스타일·앱 레이아웃은 **app**. 아래 레이어로 내리는 건 **세 조건이 모두** 맞을 때만:

1. 지금 실제로 여러 곳에서 쓴다 (예정·가정 말고).
2. 특정 소비자 하나와 무관한 독립된 변경 이유가 있다.
3. 경계의 책임이 하나로 응집된다.

내릴 곳은 성격으로 정한다:

- 비즈니스 규칙이 **없는** 인프라 (UI kit, 유틸, API 클라이언트) → **shared**.
- 여러 소비자가 쓰는 완결된 사용자 **동작** (로그인한다, 좋아요한다) → **features**.
- 여러 소비자가 쓰는 도메인 **모델** (user, product, order) → **entities**.

**두 곳에서 쓴다는 이유만으로 레이어·슬라이스를 만들지 않는다** — 관리 가능한 중복은 각 페이지에 둬도 된다.
확신이 없으면 pages에 둔다. 내리는 건 쉽고, 성급히 내린 걸 도로 올리는 건 어렵다.

## import 방향 위반 — 가장 흔한 세 가지

```ts
// ❌ 아래 레이어가 위를 import — 의존 방향 역전, 구조가 무너지는 첫 신호
// entities/user/ui/UserCard.tsx
import { LoginForm } from '@/features/auth'

// ❌ 같은 레이어의 옆 슬라이스를 직접 import (pages끼리도 마찬가지)
// features/cart/model/store.ts
import { toggleLike } from '@/features/like'

// ❌ 슬라이스 내부로 deep import — 공개 API를 우회한다
import { userStore } from '@/entities/user/model/store'

// ✅ 공개 API로만 접근하고, 조합은 상위 레이어에서 한다
// pages/product/ui/ProductSection.tsx
import { UserCard } from '@/entities/user'
import { AddToCartButton } from '@/features/cart'
```

- 슬라이스는 공개 API(`index.ts`)로만 노출. 슬라이스 내부에서 자기 배럴을 경유해 참조하지 않는다 — 순환 의존이 된다.
- 슬라이스 내부 세그먼트는 `ui` / `model` / `api` / `lib` 중 **필요한 것만** 만든다.
- 같은 레이어 슬라이스 간 참조가 불가피하면(주로 entities 간) **cross-import 공개 API `@x`**로만:
  `entities/A/@x/B.ts`로 B에게만 노출한다. 일반 `index.ts` deep import로 옆 슬라이스를 끌어오지 않는다.
- features끼리 조합해야 하면 옆 feature를 import하지 말고 **상위(pages)에서 조합**하거나, 조합 지점을
  props·slot으로 열어 바깥에서 끼우게 한다.

## 안티패턴

- ❌ `shared/lib/formatOrderStatus.ts` — 도메인 지식이 shared에 샜다. 한 화면용이면 그 page에, 추출 조건을 채우면 `entities/order/lib`로.
- ❌ `entities/user/ui/LoginButton.tsx` — entity에 사용자 행동이 들어갔다. 한 화면용이면 그 page에, 공용이면 `features/auth`로.
- ❌ 소비자가 하나뿐인 feature·entity — 그 소비자(page) 안으로 되돌린다.
- ❌ 신규 프로젝트에 `widgets/` 생성 — 화면 전용 조합은 pages, 공용 동작은 features, 맥락 없는 UI는 shared로.
- ❌ 처음부터 모든 레이어 스캐폴드 — app·pages·shared부터. 빈 레이어는 만들지 않는다(YAGNI).
