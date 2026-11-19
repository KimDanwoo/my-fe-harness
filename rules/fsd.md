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
- **pages**: 라우트 단위 조립 — 그 화면에서만 쓰는 블록도 여기 (Next.js와 폴더명 충돌 시 아래 Next.js 절 참고)
- **features**: 사용자 행동·흐름 단위 (검색, 좋아요, 로그인) — 여러 페이지에서 쓰는 동작
- **entities**: 도메인 모델 (user, product) — ui·model·api
- **shared**: 프레임워크·비즈니스 맥락 무관 공용 코드 (ui-kit, lib, api client, config)

> **widgets는 공식 비권장**(FSD 문서, 2026-07). 데이터 로딩·상태·이벤트를 품으면 features와 경계가 겹친다.
> 신규로 만들지 않는다. 이미 잘 쓰고 있는 프로젝트는 유지해도 된다(위치는 pages와 features 사이).
> 옮길 때는: 한 화면 전용 → 그 page, 여러 화면에서 쓰는 동작+UI → features,
> 맥락 없는 UI → shared, 앱 전체 레이아웃 → app. `processes`는 계속 deprecated.

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

// ❌ 다른 슬라이스 내부로 deep import — 공개 API를 우회한다
// pages/profile/ui/ProfilePage.tsx
import { userStore } from '@/entities/user/model/store'

// ✅ 공개 API로만 접근하고, 조합은 상위 레이어에서 한다
// pages/product/ui/ProductSection.tsx
import { UserCard } from '@/entities/user'
import { AddToCartButton } from '@/features/cart'
```

- features끼리 조합해야 하면 옆 feature를 import하지 말고 **상위(pages)에서 조합**하거나, 조합 지점을
  props·slot으로 열어 바깥에서 끼우게 한다.
- 같은 레이어 슬라이스 간 참조가 불가피하면(주로 entities 간) **cross-import 공개 API `@x`**로만:
  `entities/A/@x/B.ts`로 B에게만 노출한다.

## 공개 API — 슬라이스의 유일한 출입구

목적은 셋이다: 내부 리팩토링이 바깥을 깨지 않게, 동작이 바뀌면 API가 바뀌게, 필요한 것만 노출.

```
entities/user/
  index.ts          ← 공개 API (유일한 출입구)
  index.server.ts   ← 서버 전용 코드가 있을 때만 (Next.js 등)
  ui/ model/ api/ lib/ config/
```

- 바깥에서는 `@/entities/user`(서버 전용은 `@/entities/user/index.server`)로만 import한다.
- `index.ts`는 **이름을 하나씩 명시해서** 재수출한다. `export *` 금지. 타입은 `export type`.
- **바깥에서 실제로 쓰는 것만** 내보낸다. 안 쓰는 걸 미리 열어 두지 않는다.
- **상대경로(`./`·`../`)를 쓰지 않는다.** 슬라이스 안에서도 별칭 전체 경로로 import한다
  (`entities/user/ui/UserCard.tsx` → `@/entities/user/model/store`). `index.ts`의 재수출도 같다.
  한 파일을 가리키는 import 문자열이 하나로 통일되고, 슬라이스 안에서 파일을 옮겨도 다른 import가 깨지지 않는다.
- 별칭으로 세그먼트까지 들어가는 건 **같은 슬라이스 안에서만**이다. 슬라이스 밖에서는 공개 API로만.
  자기 `index.ts`는 경유하지 않는다 — 순환 의존이 된다.
- 강제는 ESLint로: `no-restricted-imports` 패턴 `^\.{1,2}/`로 상대경로를 막고, 경계는 문자열 패턴이 아니라
  가져오는 쪽 위치를 아는 `import-x/no-restricted-paths`로 지킨다(문자열 패턴은 같은 슬라이스 안의 별칭 경로까지 막는다).
- **세그먼트 안에 `index.ts`(배럴)를 두지 않는다**(`model/index.ts`, `model/hooks/index.ts` 등). 출입구는 루트 하나다.
- 서버 전용 코드(`server-only`, `next/headers`, fs 등)는 `index.ts`에 섞지 않고 `index.server.ts`로 분리한다 —
  클라이언트 번들에 딸려 들어가는 걸 막는다.
- 테스트는 같은 슬라이스 안에 두고 별칭 경로로 대상 파일을 직접 import해도 된다.

## 세그먼트 — 목적으로 이름 짓는다

- 이름은 `ui` / `model` / `api` / `lib` / `config` — **무엇을 위한 코드인지**로 나눈다. 필요한 것만 만든다.
  - `ui` 화면 표시 · `model` 상태·비즈니스 로직·타입 · `api` 백엔드 통신 · `lib` 슬라이스 내부 보조 코드 · `config` 설정·상수
- ❌ `components` / `hooks` / `types` / `utils` / `constants` / `services`를 **세그먼트 이름으로** 쓰지 않는다(종류 기준 이름).
  세그먼트 **안**의 하위 폴더는 자유다(`model/hooks/`, `ui/scene/` 등).
- 상태(store·atom)는 **쓰는 슬라이스의 `model`**에서 시작한다. 여러 곳에서 쓰게 되면 그때 entities로 내린다.

## shared — 슬라이스 없이 세그먼트만

- `shared` 바로 아래는 세그먼트다(`ui`, `lib`, `api`, `config` 등). **도메인 이름 폴더를 두지 않는다**.
- `shared/ui`·`shared/lib`는 **항목마다 진입점**을 둔다: `shared/ui/button/index.ts` → `@/shared/ui/button`.
  전체를 묶는 큰 배럴(`shared/ui/index.ts`)은 만들지 않는다 — 하나만 써도 전부 딸려 온다.
- `shared/api`·`shared/config`는 세그먼트에 `index.ts` 하나를 둔다.

## Next.js(App Router)와 함께 쓸 때

- 라우팅 파일(`page.tsx`, `layout.tsx` 등)은 Next의 `app/`에만 두고, FSD page를 가져와 넘기는 얇은 파일로 유지한다.
- FSD의 `pages`·`app` 폴더가 Next와 이름이 겹친다. 공식 권장은 `_pages`·`_app`이고, `views`로 바꿔도 된다.
  프로젝트 안에서 한 가지로 통일하고 AGENTS.md(또는 CLAUDE.md)에 적는다.

## 안티패턴

- ❌ `shared/lib/formatOrderStatus.ts` — 도메인 지식이 shared에 샜다. 한 화면용이면 그 page에, 추출 조건을 채우면 `entities/order/lib`로.
- ❌ `entities/user/ui/LoginButton.tsx` — entity에 사용자 행동이 들어갔다. 한 화면용이면 그 page에, 공용이면 `features/auth`로.
- ❌ 소비자가 하나뿐인 feature·entity — 그 소비자(page) 안으로 되돌린다.
- ❌ `shared/world/`, `shared/model/` — shared에 도메인 폴더나 `model` 세그먼트. 쓰는 슬라이스로 옮기거나 `lib`·`config`로.
- ❌ 슬라이스 밖에서 `@/entities/user/model/types` — 세그먼트까지 파고드는 import. 바깥은 루트 `index.ts`로만(슬라이스 안에서는 이 경로가 정상).
- ❌ `./`·`../` 상대경로 import — 슬라이스 안에서도 별칭 전체 경로로.
- ❌ 신규 프로젝트에 `widgets/` 생성 — 화면 전용 조합은 pages, 공용 동작은 features, 맥락 없는 UI는 shared로.
- ❌ 처음부터 모든 레이어 스캐폴드 — app·pages·shared부터. 빈 레이어는 만들지 않는다(YAGNI).
