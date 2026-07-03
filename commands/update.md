---
description: 규칙 원본이 갱신됐을 때 사용자가 안 건드린 파일만 최신본으로 갱신(수정본 보존)
argument-hint: "[--dry-run] [--global]"
---

사용자가 설치된 규칙을 최신 원본으로 맞추려 한다.

1. 먼저 무엇이 바뀔지 미리 보여준다:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/bin/my-fe-harness.mjs" update --dry-run --target . $ARGUMENTS
   ```
2. 설치 매니페스트의 해시로 판별한다 — **현재 파일이 설치 당시 그대로면** 최신 원본으로 교체하고,
   사용자가 직접 편집한 파일은 `보존(수정됨)`으로 남긴다. `_stack.md`도 다시 감지해 갱신한다.
3. 동의하면 실제 갱신을 실행한다:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/bin/my-fe-harness.mjs" update --target . $ARGUMENTS
   ```
4. `보존(수정됨)`으로 남은 파일의 최신 원본을 반영하려면, 대상 파일을 확인시킨 뒤 사용자 동의 하에
   `add <팩> --force`로 덮어쓰도록 안내한다.
