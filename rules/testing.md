---
paths:
  - "**/*.{test,spec}.{ts,tsx,js,jsx,mts,cts}"
  - "**/__tests__/**/*"
---

# 테스트 — 핵심

리팩터링해도 안 깨지고 버그는 잡는다 — 구현이 아니라 **동작**을 검증한다.

```tsx
// ❌ 구현 세부에 결합
expect(wrapper.state('count')).toBe(1)
// ✅ 사용자가 보는 동작 — 접근성 쿼리 + userEvent
await userEvent.click(screen.getByRole('button', { name: '증가' }))
expect(screen.getByText('1')).toBeInTheDocument()
```

- 쿼리 우선순위: `getByRole`/`getByLabelText` > 텍스트 > `getByTestId`(최후).
- 테스트 1개 = 동작 1개(AAA), 각 테스트 독립. 외부 경계(네트워크·시간)만 목, 내부 모듈 목 금지.
- 임의 `sleep` 금지 — 비동기는 `findBy*`/`waitFor`. 시간·랜덤 고정.
- 성공뿐 아니라 에러·경계·빈 상태를 커버. 커버리지 수치가 목표가 아니다.
