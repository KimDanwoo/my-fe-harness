---
paths:
  - "apps/**/*"
  - "packages/**/*"
  - "**/pnpm-workspace.yaml"
  - "**/turbo.json"
  - "**/nx.json"
---

# 모노레포 — 핵심 (pnpm workspace)

- 구조: `apps/`(배포 단위) · `packages/`(공유 코드). `apps → packages` 단방향, 역참조·순환 금지.
- 내부 참조는 `workspace:*`. 패키지는 공개 API(`exports`/`index.ts`)로만 소비, deep import 금지.
- 공용 설정(tsconfig·eslint)은 `packages/config-*`에 두고 extends. 루트엔 전역 스크립트·devDeps만.
- 스크립트 이름 표준화(`dev`/`build`/`test`/`lint`/`typecheck`), 빌드·테스트는 turbo/nx 파이프라인으로.
- 복붙 코드는 세 번째 사용처가 보일 때 packages로 승격 — 조급한 추상화 금지.
