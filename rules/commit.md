# 커밋 — 핵심

## Conventional Commits

```
<type>(<scope>): <subject>
```

- type: `feat`·`fix`·`refactor`·`perf`·`test`·`docs`·`style`·`chore`·`build`·`ci`·`revert`
- subject: 50자 이내, 명령형, 마침표 없음. body엔 **왜**(무엇은 diff가 말한다). breaking은 `feat!:`.

## 원자성

- 커밋 1개 = 의도 1개. 리팩터링과 기능 변경을 섞지 않는다.
- 무의미 메시지(`wip`·`fix2`) 금지. 시크릿·`.env`·빌드 산출물 커밋 금지.
