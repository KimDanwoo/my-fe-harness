---
description: 안전장치 강제 훅을 현재 프로젝트에 설치 — 하드코딩 비밀·비밀 파일 커밋·치명적 삭제를 실행 전 차단
argument-hint: ""
---

이 프로젝트에 안전장치 강제 계층(PreToolUse 훅)을 설치하라.

> 플러그인으로 설치했다면 이 훅은 이미 자동 적용된다. 이 명령은 플러그인 없이(순수 파일 배포로) 강제 계층을 원하는 프로젝트에 쓴다.

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/my-fe-harness.mjs" guard --target .
# 모든 프로젝트에 항상 켜두려면 전역 설치:
node "${CLAUDE_PLUGIN_ROOT}/bin/my-fe-harness.mjs" guard --global
```

1. `.claude/hooks/safety-guard.mjs`(의존성 0 강제 스크립트)를 복사하고 `.claude/settings.json`의 `PreToolUse`에 훅을 병합한다(이미 있으면 건너뜀).
2. 이 훅은 도구 실행 **전에** 다음을 차단한다: 소스에 하드코딩된 실제 비밀, `.env`·키·자격증명의 `git add`/`commit`, `rm -rf` 루트/홈. 정상 작업엔 간섭하지 않고, 훅 내부 오류 시 통과(fail-open)한다.
3. 설치 후에는 세션을 재시작해야 새 훅이 로드된다는 점을 안내한다.
