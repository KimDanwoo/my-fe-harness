---
paths:
  - "**/*.{ts,tsx,mts,cts}"
---

# TypeScript — 핵심

## 타입

- `type` 우선(확장 필요 시만 `interface`). `any` 금지 — `unknown`으로 받고 좁힌다.
- 외부 입력(API·폼·URL)은 런타임 검증(zod 등) 후 타입 확정. `as` 단언은 최후 수단(타입 가드 우선).
- `enum` 대신 union 리터럴 + `as const`. 공개(export) 함수는 반환 타입 명시.

## 네이밍 · 구조

- 변수/함수 camelCase · 타입 PascalCase · 상수 SCREAMING_SNAKE_CASE.
- boolean은 `is/has/should`, 핸들러는 `handleXxx`/`onXxx`. 매직넘버는 상수로.
- 파라미터 3개 초과면 옵션 객체. 미사용 코드·조급한 추상화 금지(YAGNI).

## 배럴 · import

```ts
// ❌ 내부 구현에 직접 접근 (deep import)
import { formatPrice } from '@/features/cart/lib/format/price'
// ✅ 공개 API(배럴)로만
import { formatPrice } from '@/features/cart'
```

- 공개 경계마다 `index.ts`, 외부는 배럴로만. `export *`·기계적 배럴 금지. 모듈 내부끼리는 상대경로.
- import 순서: 외부 → 절대경로 → 상대경로. 순환 의존 금지.
