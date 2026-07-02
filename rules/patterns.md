---
paths:
  - "**/*.{ts,tsx,js,jsx,mts,cts,mjs,cjs,vue,svelte,astro}"
---

# 좋은 패턴 — 선언형·가독성

코드는 "한눈에 읽히게". 아래 패턴을 기본값으로 삼는다.

## Early return — 중첩 대신 조기 탈출

```ts
// ❌ 중첩 3단계
function getDiscount(user: User | null): number {
  if (user) {
    if (user.isMember) {
      if (user.years > 5) return 0.2
      return 0.1
    }
  }
  return 0
}

// ✅ 조기 탈출 + 상수화
function getDiscount(user: User | null): number {
  if (!user?.isMember) return 0
  return user.years > LOYAL_YEARS ? LOYAL_DISCOUNT : MEMBER_DISCOUNT
}
```

## 선언형 — 어떻게(how)가 아니라 무엇(what)

```ts
// ❌ 임시 변수 + push 루프
const result = []
for (let i = 0; i < users.length; i++) {
  if (users[i].active && users[i].paid) result.push(users[i].name)
}

// ✅ 이름 있는 조건 + 체인
const activePaidNames = users.filter(isActive).filter(isPaid).map((user) => user.name)
```

## 조건에 이름 붙이기

```ts
// ❌ 읽는 사람이 해석해야 하는 조건
if (user.age >= 19 && user.country === 'KR' && !user.banned) { ... }

// ✅ 의도가 이름에 드러난다
const canPurchase = isAdult(user) && isKorean(user) && !user.banned
if (canPurchase) { ... }
```

## 분기보다 매핑 — 컴포지션

```tsx
// ❌ 늘어나는 if/switch
if (status === 'pending') return <PendingBadge />
if (status === 'done') return <DoneBadge />

// ✅ 매핑 객체 — 케이스 추가가 한 줄, 누락은 타입이 잡는다
const BADGE_BY_STATUS = {
  pending: PendingBadge,
  done: DoneBadge,
  failed: FailedBadge,
} satisfies Record<Status, ComponentType>

const Badge = BADGE_BY_STATUS[status]
return <Badge />
```

## 함수 · 추상화

- 주석을 달고 싶어지면 함수로 추출해 **이름으로 설명**한다. 함수 1개 = 책임 1개 = 추상화 수준 1개.
- 매직넘버는 상수로(`RETRY_DELAY_MS = 3_000`). 조급한 추상화 금지 — 세 번째 사용처에서 추출.

## 금지

- 흐름 설명 주석(주석은 "왜"에만) · boolean 플래그 파라미터(`render(true)`) · 미사용 코드(YAGNI) · 남은 `console.log`·주석 처리된 코드.
