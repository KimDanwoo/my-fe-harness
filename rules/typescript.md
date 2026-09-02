---
paths:
  - "**/*.{ts,tsx,mts,cts}"
---

# TypeScript — 핵심

## any 대신 unknown으로 받고 좁힌다

```ts
// ❌ any — 이 지점부터 타입 검사가 통째로 꺼진다
function parseItems(raw: any) {
  return raw.data.items
}

// ✅ unknown으로 받고 런타임 스키마로 좁힌다 — 여기서부터 타입이 보장된다
function parseItems(raw: unknown) {
  return responseSchema.parse(raw).data.items
}
```

외부 입력(API 응답·폼·URL·`localStorage`)은 **전부** 경계에서 검증한다. 타입 선언은 런타임 보장이 아니다.

## as 단언은 최후 수단

```ts
// ❌ as — 컴파일러만 속인다. 실제 응답이 다르면 런타임에 터진다
const user = JSON.parse(text) as User

// ✅ 검증으로 타입을 "얻는다"
const user = userSchema.parse(JSON.parse(text))
```

```ts
// ❌ as — 값이 타입에 맞는지 검사되지 않고, 리터럴 타입도 잃는다
const ROUTES = { home: '/', post: '/post/:id' } as Record<RouteKey, string>

// ✅ satisfies — 검사는 받되 각 값의 리터럴 타입은 좁게 유지된다
const ROUTES = { home: '/', post: '/post/:id' } satisfies Record<RouteKey, string>
```

좁혀야 할 땐 단언 말고 **타입 가드**(`in`·`typeof`·`is` 술어).

## 불법 상태를 타입으로 차단한다 — 판별 유니온

```ts
// ❌ 옵셔널 나열 — "로딩 중인데 data가 있는" 불가능한 조합이 타입상 허용된다
type Result = { isLoading: boolean; data?: User; error?: string }

// ✅ 판별 유니온 — 불가능한 조합이 애초에 표현되지 않는다
type Result =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; data: User }

function label(result: Result): string {
  switch (result.status) {
    case 'loading': return '불러오는 중'
    case 'error': return result.message
    case 'success': return result.data.name
    // 케이스를 빠뜨리면 여기서 컴파일 에러 — 유니온이 늘어날 때 자동으로 잡힌다
    default: { const exhaustive: never = result; return exhaustive }
  }
}
```

## enum 대신 union 리터럴

```ts
// ❌ enum — 런타임 객체가 생기고 구조적 타이핑과 어긋난다
enum Status { Idle, Loading }

// ✅ as const + 인덱스 접근 — 값 목록과 타입이 한 곳에서 나온다
const STATUSES = ['idle', 'loading', 'done'] as const
type Status = (typeof STATUSES)[number]
```

## 배럴 · import

```ts
// ❌ 내부 구현에 직접 접근 (deep import)
import { formatPrice } from '@/features/cart/lib/format/price'

// ✅ 공개 API(배럴)로만
import { formatPrice } from '@/features/cart'
```

- 공개 경계마다 `index.ts`, 외부는 배럴로만. `export *`·기계적 배럴 금지.
- import 순서: 외부 → 절대경로 → 상대경로. **순환 의존 금지.**

## 네이밍 · 시그니처

- 변수/함수 camelCase · 타입 PascalCase · 상수 SCREAMING_SNAKE_CASE.
- boolean은 `is/has/should`, 핸들러는 `handleXxx`/`onXxx`. 매직넘버는 상수로.
- `type` 우선(선언 병합·확장이 필요할 때만 `interface`). 공개(export) 함수는 반환 타입 명시.
- 파라미터 3개 초과면 옵션 객체. boolean 플래그 파라미터 금지. 미사용 코드·조급한 추상화 금지(YAGNI).
