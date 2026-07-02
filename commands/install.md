---
description: 규칙 팩을 현재 프로젝트 .claude/rules/에 설치 (권장 린 세트 = core)
argument-hint: "[core react | core vue | a11y styling forms testing frontend commit monorepo | all] [--force]"
---

사용자가 요청한 규칙 팩을 현재 프로젝트에 설치하라.

1. 인자 `$ARGUMENTS`가 비어 있으면 팩 목록을 보여주고, **권장 린 세트 `core react`(또는 `core vue`)**를 기본 제안한다:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/bin/my-fe-harness.mjs" list
   ```
   `core` = safety+typescript+patterns. 접근성·스타일·폼·테스트 등은 필요할 때만 얹는다(과잉 제약 지양).
2. 팩이 정해지면 설치를 실행한다 (`core`=린 세트, `all`=규칙 팩 전체(무거움), 구조 팩은 제외):
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/bin/my-fe-harness.mjs" add $ARGUMENTS --target .
   ```
3. 이미 존재하는 파일은 기본적으로 건너뛴다. 덮어쓰기가 필요하면 대상 파일을 먼저 확인하고 사용자 동의 후 `--force`를 붙인다.
4. 폴더 구조(fsd·feature-based·layered)가 필요해 보이면 `/my-fe-harness:scaffold`를 제안한다. 구조 팩은 상충하므로 하나만 설치한다.
5. 설치 결과(생성/건너뜀)를 요약해 보고한다. 규칙은 `.claude/rules/`에서 Claude Code가 자동 로드한다.
