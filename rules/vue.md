---
paths:
  - "**/*.vue"
---

# Vue 3 — 핵심

- Composition API + `<script setup lang="ts">`만(Options API 금지). 컴포넌트 이름은 2단어 이상.
- props는 타입 기반 `defineProps<Props>()`, 이벤트는 `defineEmits`. props는 읽기 전용(props down, events up).
- 기본 `ref`, 파생은 `computed`. `watch`로 상태→상태 복사 금지, `watchEffect`보다 소스 명시적인 `watch` 우선.
- 서버/비동기 상태는 vue-query·컴포저블로 캡슐화, 전역은 꼭 필요할 때만 Pinia(setup 문법).
- 템플릿엔 표현만(로직은 `computed`), `v-for`엔 안정된 `:key`, `v-if`와 `v-for` 같은 요소 금지.
- 컴포저블은 `useXxx`, `setup` 최상위에서만 호출.
