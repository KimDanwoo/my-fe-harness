---
paths:
  - "src/**/*"
---

# FSD (Feature-Sliced Design) 규칙

## 레이어 — 위에서 아래로만 import 가능

```
app → pages → widgets → features → entities → shared
```

- **app**: 진입점 — 프로바이더, 라우팅 설정, 전역 스타일
- **pages**: 라우트 단위 조립 (Next.js와 폴더명 충돌 시 `views`로 개명)
- **widgets**: 페이지를 구성하는 독립 UI 블록
- **features**: 사용자 행동 단위 (검색, 좋아요, 로그인)
- **entities**: 도메인 모델 (user, product) — ui·model·api
- **shared**: 프레임워크 무관 공용 코드 (ui-kit, lib, api client, config)

## 배치 결정 규칙 — "이 코드 어디에 두지?"

1. 도메인 지식이 **없고** 프레임워크와 무관하다 → **shared**.
2. 도메인 **명사**의 데이터·표현이다 (user, product, order) → **entities**.
3. 사용자 **동사**다 (로그인한다, 좋아요한다, 검색한다) → **features**.
4. 여러 feature·entity를 묶은, 페이지에 꽂아 쓰는 독립 블록이다 → **widgets**.
5. 라우트 하나를 조립한다 → **pages**. 프로바이더·라우팅·전역 스타일 → **app**.
6. **확신이 없으면 아래로 내리지 말고 쓰는 곳 가까이(위쪽)에 둔다.** 재사용이 실제로 생겼을 때 내리면 된다 —
   내리는 건 쉽고, 성급히 내린 걸 도로 올리는 건 어렵다.

## import 방향 위반 — 가장 흔한 세 가지

```ts
// ❌ 아래 레이어가 위를 import — 의존 방향 역전, 구조가 무너지는 첫 신호
// entities/user/ui/UserCard.tsx
import { LoginForm } from '@/features/auth'

// ❌ 같은 레이어의 옆 슬라이스를 직접 import
// features/cart/model/store.ts
import { toggleLike } from '@/features/like'

// ❌ 슬라이스 내부로 deep import — 공개 API를 우회한다
import { userStore } from '@/entities/user/model/store'

// ✅ 공개 API로만 접근하고, 조합은 상위 레이어에서 한다
// widgets/product-card/ui/ProductCard.tsx
import { UserCard } from '@/entities/user'
import { AddToCartButton } from '@/features/cart'
```

- 슬라이스는 공개 API(`index.ts`)로만 노출. 슬라이스 내부끼리는 상대경로(자기 배럴 경유 금지 — 순환).
- 슬라이스 내부 세그먼트는 `ui` / `model` / `api` / `lib` 중 **필요한 것만** 만든다.
- 같은 레이어 슬라이스 간 참조가 불가피하면(주로 entities 간) **cross-import 공개 API `@x`**로만:
  `entities/A/@x/B.ts`로 B에게만 노출한다. 일반 `index.ts` deep import로 옆 슬라이스를 끌어오지 않는다.

## 안티패턴

- ❌ `shared/lib/formatOrderStatus.ts` — 도메인 지식이 shared에 샜다. `entities/order/lib`로.
- ❌ `entities/user/ui/LoginButton.tsx` — entity에 사용자 행동이 들어갔다. `features/auth`로.
- ❌ pages에 비즈니스 로직 — pages는 조립·레이아웃만. 로직은 feature/entity의 `model`로.
- ❌ 한 페이지에서만 쓰는 블록을 widgets에 — 그 페이지 안에 둔다. widgets는 **재사용되는** 블록이다.
- ❌ 처음부터 6개 레이어 전부 스캐폴드 — shared·entities·pages부터. 빈 레이어는 만들지 않는다(YAGNI).
