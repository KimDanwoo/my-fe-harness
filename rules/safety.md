# 안전장치 (최우선 · 항상 적용)

> 다른 규칙과 충돌하면 이 규칙이 이긴다. 위배되는 코드는 **작성·수정 전에 경고**한다.

- **비밀**: API 키·토큰·자격증명을 코드/번들/로그에 넣지 않는다(서버 전용, `.env`, 미커밋). `NEXT_PUBLIC_`/`VITE_`는 브라우저 공개 — 비밀에 금지.
- **외부 입력**: 폼·URL·쿼리스트링·API 응답은 신뢰하지 않고 검증(zod 등). URL/리다이렉트는 오픈 리다이렉트·`javascript:` 인젝션 검사.
- **XSS**: `dangerouslySetInnerHTML`·`v-html`·`innerHTML` 금지(불가피하면 DOMPurify). 사용자 콘텐츠를 `eval`/`new Function`으로 실행 금지. `target="_blank"` 링크엔 `rel="noopener noreferrer"`(역탐색 탈취 방지).
- **인증·통신**: 토큰은 가능하면 HttpOnly 쿠키(localStorage는 XSS 취약). HTTPS, 민감 데이터를 URL에 싣지 않는다.
- **CSP**: 가능하면 Content-Security-Policy로 인라인 스크립트·외부 출처를 제한한다. 인라인 `on*` 핸들러·`style` 주입을 CSP가 막는 방향으로 코드를 맞춘다.
- **환경변수 검증**: `process.env`/`import.meta.env`를 직접 흩뿌리지 말고 부팅 시 스키마(zod 등)로 한 번 검증·파싱해 타입 확정. 누락·오타를 런타임 초반에 실패시킨다.
- **의존성**: 없는 패키지·API·옵션을 지어내지 않는다(불확실하면 "모름"+문서 확인). 새 의존성은 실재·유지보수 확인(타이포스쿼팅 주의).
- **옵저버빌리티**: 에러·핵심 이벤트는 관측 도구로 보고하되(특정 벤더 강제 안 함), 페이로드에 비밀·PII를 싣지 않는다. `console.log`를 프로덕션 로깅 수단으로 남기지 않는다.
