---
paths:
  - "src/**/*"
---

# FSD (Feature-Sliced Design) 규칙

## 레이어 — 위에서 아래로만 import 가능

```
app → pages → widgets → features → entities → shared
```

- **app**: 진입점 — 프로바이더, 라우팅 설정, 전역 스타일
- **pages**: 라우트 단위 조립 (Next.js와 폴더명 충돌 시 `views`로 개명)
- **widgets**: 페이지를 구성하는 독립 UI 블록
- **features**: 사용자 행동 단위 (검색, 좋아요, 로그인)
- **entities**: 도메인 모델 (user, product) — ui·model·api
- **shared**: 프레임워크 무관 공용 코드 (ui-kit, lib, api client, config)

## 규칙

- 아래→위 import 금지. 같은 레이어의 다른 슬라이스 직접 import 금지.
- 슬라이스는 공개 API(`index.ts`)로만 노출 — 외부에서 내부 파일 deep import 금지.
- 슬라이스 내부 세그먼트는 `ui` / `model` / `api` / `lib` 중 필요한 것만 만든다.
- shared에는 도메인 지식을 두지 않는다.
- 슬라이스 간 참조가 필요해지면 상위 레이어에서 조합하거나 entities `@x` 표기를 검토한다.

## 시작 규칙

- 처음부터 모든 레이어를 만들지 않는다 — shared·entities·pages부터, 필요할 때 확장.
- 레이어가 비어 있으면 만들지 않는다(YAGNI).
