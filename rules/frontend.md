---
paths:
  - "**/*.{ts,tsx,js,jsx,mts,cts,mjs,cjs,vue,svelte,astro}"
---

# 프론트엔드 공통 — 핵심

> 보안=`safety`, 접근성=`a11y`, 스타일=`styling`, 폼=`forms`가 각각 담당. 여기선 나머지 공통.

- 서버 상태는 캐싱 계층(React Query 등)으로. 컴포넌트에서 직접 `fetch`+상태 복사 금지.
- 모든 비동기 UI는 로딩·에러·빈·성공 상태를 함께 설계한다.
- 에러는 사용자 언어로 보여주고 원본은 로깅으로 보존. 에러 바운더리로 전체 붕괴를 막는다.
- 성능: 라우트 코드 스플리팅, 이미지 지연 로딩+명시 width/height(CLS), 큰 라이브러리는 도입 전 대안 확인.
- SEO: 라우트별 고유 `title`/`meta description`, 시맨틱 마크업.
- 날짜·숫자·통화는 `Intl`로 포맷 — 수동 문자열 조합 금지.
