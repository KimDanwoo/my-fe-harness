---
description: 폴더 구조(fsd·feature-based·layered)를 선택해 src/ 스캐폴드 + 해당 구조 규칙 설치
argument-hint: "[fsd | feature-based | layered]"
---

현재 프로젝트에 폴더 구조를 스캐폴드하라.

1. 인자 `$ARGUMENTS`가 비어 있으면 세 구조의 차이를 보여주고 무엇을 쓸지 물어본다:
   - `fsd` — 중·대규모. app→pages→widgets→features→entities→shared
   - `feature-based` — 중규모. app→pages→features→shared (기능 단위 응집)
   - `layered` — 소규모·프로토타입. pages/components/hooks/api 기술 계층
2. 구조가 정해지면 실행한다:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/bin/my-fe-harness.mjs" scaffold $ARGUMENTS --target .
   ```
   `src/` 아래 레이어 폴더(역할·의존 규칙 README 포함)가 생성되고, 해당 구조 규칙이 `.claude/rules/`에 설치된다. 기존 파일은 건너뛴다.
3. Next.js 프로젝트에서 fsd/feature-based를 선택했다면 `src/pages`가 Next 라우팅과 충돌하므로 `views`로 개명할지 사용자에게 확인한다.
4. 생성 결과를 요약해 보고한다. 이후 코드 작성 시 설치된 구조 규칙(배치 결정 규칙·안티패턴)을 따른다.
