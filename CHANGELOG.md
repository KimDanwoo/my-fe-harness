# Changelog

이 프로젝트는 [Semantic Versioning](https://semver.org/lang/ko/)을 따른다.
1.0 이전(0.x)에서는 기능 추가를 minor, 버그 수정을 patch로 올린다.

## [0.2.0] - 2026-07-03

### Added

- **안전한 걷어내기 (`uninstall`, 별칭 `unsync`)** — 설치 매니페스트(sha256)로 검증해 **우리가 쓴 그대로인 파일만** 삭제한다. 직접 수정·생성한 파일은 보존하고, `settings.json`에서는 안전장치 훅 엔트리만 제거한다.
- **`status` 명령** — 설치된 규칙·훅과 각 파일의 수정 여부(원본 그대로 / 수정됨 / 삭제됨), 설치 버전 대비 현재 버전을 표시한다.
- **`update` 명령** — 사용자가 안 건드린 규칙만(해시 일치) 최신 원본으로 갱신하고, 수정한 파일은 보존한다.
- **스택 스탬프 (`_stack.md`)** — 설치 시 `package.json`을 감지해 프레임워크·모노레포 여부와 설치된 팩을 기록한다. 스택 미감지 프로젝트에서는 생성하지 않는다.
- **스택 미스매칭 가드** — 스택 전용 규칙(`react`·`vue`·`monorepo`)에 "적용 조건"을 명시해 다른 스택에서 스스로 비활성화되게 했다.
- **설치 매니페스트 (`.my-fe-harness-manifest.json`)** — 설치한 파일의 sha256과 설치 버전(`installedBy`)을 기록한다. `status`·`update`·`uninstall`의 기반.
- 규칙 내용 보강 — React 19+ 스탠스, TS 판별 유니온, safety의 CSP·`rel=noopener`·env 스키마 검증·옵저버빌리티, FSD cross-import(`@x`).

### Changed

- 명령당 매니페스트 read-modify-write를 1회로 배칭(`withManifest`).
- 버전 단일 소스화(`src/version.mjs`) — bin·매니페스트 스탬프·status가 `package.json`에서만 읽는다.

### Security

- `uninstall`/`update`는 파일 단위 삭제만 하며 재귀 삭제를 하지 않고, 해석된 경로가 `.claude` 밖이면(변조된 매니페스트) 건너뛴다.

## [0.1.0]

- 최초 릴리스 — 규칙 팩(safety/typescript/react/vue/…), 폴더 구조 스캐폴드(fsd/feature-based/layered), 안전장치 강제 훅(`guard`), npx CLI + Claude Code 플러그인.
