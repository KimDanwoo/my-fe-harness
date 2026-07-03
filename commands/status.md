---
description: 이 프로젝트에 my-fe-harness가 설치한 규칙·훅과 각 파일의 수정 여부를 표시
argument-hint: "[--global]"
---

사용자가 my-fe-harness 설치 현황을 알고 싶어 한다.

1. 설치 매니페스트를 읽어 현황을 보여준다:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/bin/my-fe-harness.mjs" status --target . $ARGUMENTS
   ```
2. 각 규칙·`_stack.md`·안전장치 훅에 대해 `설치됨(원본 그대로)` / `수정됨` / `없음(삭제됨)`을 표로 보여준다.
   `수정됨`은 사용자가 직접 편집한 것으로, `update`·`uninstall` 시 보존된다.
3. 전역(`~/.claude`) 설치 현황은 `--global`을 붙인다.
