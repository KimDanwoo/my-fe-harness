---
description: my-fe-harness가 설치한 규칙·안전장치 훅을 안전하게 걷어낸다 (해시 검증, 수정본 보존)
argument-hint: "[--dry-run] [--global]"
---

사용자가 my-fe-harness 설치물을 걷어내려 한다.

1. 먼저 무엇이 지워질지 **dry-run으로 미리 보여준다**:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/bin/my-fe-harness.mjs" uninstall --dry-run --target . $ARGUMENTS
   ```
2. 결과를 확인시킨다. 이 명령은 설치 매니페스트(`.claude/.my-fe-harness-manifest.json`)에 기록된 해시와
   현재 파일이 **정확히 일치할 때만** 삭제한다. 사용자가 직접 편집했거나 새로 만든 파일은 `보존(수정됨)`으로 남긴다.
3. 사용자가 동의하면 실제 제거를 실행한다:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/bin/my-fe-harness.mjs" uninstall --target . $ARGUMENTS
   ```
4. 전역(`~/.claude`) 설치를 걷어내려면 `--global`을 붙인다.
5. 규칙 파일 삭제 + `settings.json`의 안전장치 PreToolUse 훅 엔트리 제거 + `safety-guard.mjs` 삭제 결과를 요약한다.
   `보존(수정됨)`으로 남은 파일이 있으면, 지우려면 직접 삭제해야 함을 안내한다.
