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

- 함수 1개 = 책임 1개 = 추상화 수준 1개.
- 매직넘버는 상수로(`RETRY_DELAY_MS = 3_000`). 조급한 추상화 금지 — 세 번째 사용처에서 추출.
- **중첩 삼항 금지.** 셋 이상 갈래는 매핑 객체·early return·작은 함수로.

```ts
// ❌ 중첩 삼항
const issue = year < MIN ? yearMessage : month > MAX ? monthMessage : day ? dayMessage : undefined

// ✅ 순서대로 검사하는 작은 함수 — 우선순위가 줄 순서로 읽힌다
function dateIssue(parts: DateParts) {
  if (isYearOutOfRange(parts.year)) return yearMessage
  if (isMonthOutOfRange(parts.month)) return monthMessage
  return dayMessage(parts)
}
```

## 컴포넌트 본문 — 화면만 남긴다

- 컴포넌트 본문에는 훅 호출, 간단한 파생값, `handleXxx`·`onXxx` 이벤트 핸들러만 둔다.
- 계산·변환·검증은 `lib/` 순수 함수(테스트 가능), 상태·효과 로직은 `useXxx` 훅, 숫자·문구는 `config/` 상수로 뺀다.
- 컴포넌트 안에 컴포넌트를 선언하지 않는다(렌더마다 새 타입이 되어 상태가 초기화된다) — 같은 `ui/`의 파일로.
- 공용 UI(글자·폼·카드·버튼)가 있으면 직접 마크업·클래스 조합으로 다시 만들지 않는다. 같은 모양이 반복되면 공용 컴포넌트로 만든다.

## 잠금 — 규칙은 기계가 지킨다

- 문서로만 둔 규칙은 무너진다. 위 규칙은 ESLint(`no-nested-ternary`, `complexity`, `max-lines-per-function`, `no-magic-numbers`, `react/forbid-elements` 등)와 검사 스크립트로 강제한다.
- 규칙 끄는 인라인 주석(`eslint-disable`)은 쓰지 않는다(`linterOptions.noInlineConfig`). 예외는 설정 파일 한 곳에 이유와 함께 둔다.

## 주석 — 기본은 달지 않는다

```ts
// ❌ 코드가 하는 일을 읽어 주는 주석
// 만료되지 않은 세션만 남긴다
const result = sessions.filter((s) => s.expiresAt > now)

// ✅ 이름이 설명한다 — 주석이 필요 없다
const liveSessions = sessions.filter(isNotExpired)
```

- 설명하고 싶어지면 주석 대신 함수·변수로 추출해 **이름으로 설명**한다.
- 예외는 하나: 코드만 보면 틀려 보이는 **우회·외부 제약**. 이때는 근거(이슈·문서 링크)를 함께 단다.
- 주석 처리된 코드는 남기지 않는다 — 이전 코드는 git에 있다.

## 금지

- 예외 밖의 주석·주석 처리된 코드 · boolean 플래그 파라미터(`render(true)`) · 미사용 코드(YAGNI) · 남은 `console.log`.
