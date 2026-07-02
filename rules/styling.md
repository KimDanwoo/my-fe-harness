---
paths:
  - "**/*.{css,scss,less,tsx,jsx,vue,svelte,astro}"
---

# 스타일 · 디자인 시스템 — 핵심

```tsx
// ❌ 하드코딩된 원시값 — 테마·다크모드·일관성 붕괴
<div style={{ color: '#1a1a1a', padding: '13px' }} />
// ✅ 의미 토큰
<div className="text-fg-default p-3" />
```

- 색·간격·타이포·radius·모션은 디자인 토큰에서. 매직값·하드코딩 색 금지, 간격은 스케일(4/8pt).
- 사용처에선 의미 토큰(`--color-fg-default`), 원시 팔레트(`blue-500`) 직접 사용 금지.
- 다크모드·테마는 토큰 레이어로 — 색 하드코딩 금지, `prefers-color-scheme` 존중.
- 모션은 `transform`·`opacity`만(레이아웃 속성 금지), `prefers-reduced-motion` 존중.
- 스타일 방식(Tailwind·CSS Modules·CSS-in-JS)은 하나로 통일.
