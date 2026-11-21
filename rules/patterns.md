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

- `if`·삼항·`while` 조건에 `&&`·`||`를 바로 쓰지 않는다. 조건이 하나(`if (!sheet)`, `if (phase !== PHASE.idle)`)면 그대로 둔다.
- 조건을 담는 변수는 `is`·`has`·`should`·`can`으로 시작한다. `const ok = a && b`처럼 의미 없는 이름은 막힌다.
- 자동 수정은 없다 — 이름은 의미를 아는 사람이 짓는다.
- 잠금: `harness/named-condition`

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

- 함수 1개 = 책임 1개 = 추상화 수준 1개. 순환 복잡도 10, 블록 중첩 3단계, 함수 120줄(빈 줄 제외)을 넘기지 않는다.
- 매직넘버는 상수로(`RETRY_DELAY_MS = 3_000`). 컴포넌트·훅에서는 `-1·0·1·2·100`만 그대로 쓰고, 나머지는 `config/`·`constants`의 이름 있는 상수로 둔다. 조급한 추상화 금지 — 세 번째 사용처에서 추출.
- **중첩 삼항 금지.** 셋 이상 갈래는 매핑 객체·early return·작은 함수로.
- 잠금: `complexity` `max-depth` `max-lines-per-function` `no-magic-numbers` `@typescript-eslint/no-magic-numbers` `no-nested-ternary` — 매직넘버는 `@typescript-eslint`를 쓰는 프로젝트에서 TS 버전이 켜진다.

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
- 컴포넌트에서 `useEffect`·`useLayoutEffect`를 직접 부르지 않는다. 효과는 이름 있는 `useXxx` 훅으로 뺀다(Next의 `error`·`global-error` 파일은 예외).
- 공용 UI(글자·폼·카드·버튼)가 있으면 직접 마크업·클래스 조합으로 다시 만들지 않는다. 같은 모양이 반복되면 공용 컴포넌트로 만든다.
- 잠금: `harness/component-body` `harness/no-direct-effect`

## 화면은 구획 조립 — props 릴레이 대신 합성 컴포넌트

```tsx
// ❌ props를 늘리고, 중간 컴포넌트가 구독한 상태를 자식에게 넘기기만 한다
<ProductCard title={title} price={price} badge={badge} icon={icon} isSoldOut={isSoldOut} onAdd={onAdd} />

// ✅ Root가 상태를 context로 내려주고, 파트가 구독한다. 내용은 children으로 조립한다
<ProductCard.Root product={product}>
  <ProductCard.Badge />
  <ProductCard.Price />
  <ProductCard.AddButton />
</ProductCard.Root>
```

- props는 5개까지. 넘으면 합성 컴포넌트(`Xxx.Root` + 파트)로 나눈다.
- 구독한 store 값을 쓰지 않고 자식에게 넘기기만 하지 않는다. 값을 쓰는 자식이 직접 구독한다.
- 한 컴포넌트에 마크업을 쌓지 않는다. JSX 깊이 5, HTML 요소 15개, 컴포넌트 파일 250줄을 넘으면 이름 붙은 구획으로 나누고, 반복 모양은 설정 배열 + `map`이나 공용 컴포넌트로 바꾼다.
- 화면은 구획(`HomeHero`·`HomeCategories`)만 나열하고, 각 구획이 데이터를 직접 가져와 해당할 때만 그린다(표시 조건을 부모가 계산해 넘기지 않는다).
- 잠금: `harness/max-props` `harness/no-store-passthrough` `harness/component-markup` `max-lines`

## 잠금 — 규칙은 기계가 지킨다

- 문서로만 둔 규칙은 무너진다. 각 절 끝의 `잠금:` 줄은 그 절의 규칙 중 ESLint가 강제하는 것을 적는다. 적힌 규칙이 막는 항목만 기계가 지키고, 나머지 항목과 `잠금:` 줄이 없는 절은 판단이 필요한 권고다.
- 잠금은 Claude가 고친 파일마다 도는 lint 훅과, `my-fe-harness init`이 까는 `eslint.config.mjs`(`my-fe-harness/eslint`의 `quality()`)가 같은 모듈에서 가져온다 — 편집기·`lint` 스크립트·CI가 훅과 같은 판정을 쓴다.
- 규칙 끄는 인라인 주석(`eslint-disable`)은 쓰지 않는다(`linterOptions.noInlineConfig`로 무시된다). 예외는 설정 파일 한 곳에 이유와 함께 둔다.

## 주석 — 달지 않는다

```ts
// ❌ 코드가 하는 일을 읽어 주는 주석
// 만료되지 않은 세션만 남긴다
const result = sessions.filter((s) => s.expiresAt > now)

// ✅ 이름이 설명한다 — 주석이 필요 없다
const liveSessions = sessions.filter(isNotExpired)
```

- 주석을 달고 싶어지면 그 자리의 코드가 덜 깔끔하다는 신호다. 함수·변수로 추출해 **이름으로 설명**한다.
- JSDoc(`/** */`)·링크를 단 주석·주석 처리된 코드도 같다. 이전 코드는 git에, 근거는 커밋 메시지·PR에 둔다.
- 남는 것은 사람이 아니라 도구가 읽는 지시문뿐이다: `@ts-expect-error 이유`, `/// <reference>`, `@vitest-environment`, 번들러 매직 주석, `prettier-ignore`.
- 허용 지시문 목록은 `lint-guard-baseline.mjs`의 `TOOL_DIRECTIVES` 한 곳에만 있다.
- 잠금: `harness/no-comment`

## 금지

- 주석(도구 지시문 제외) · boolean 플래그 파라미터(`render(true)`) · 미사용 코드(YAGNI) · 남은 `console.log`.
