---
paths:
  - "**/*.vue"
---

# Vue 3 — 핵심

> 적용 조건: **Vue 3 프로젝트에만.** React/기타 스택이면 이 규칙을 무시한다.

Composition API + `<script setup lang="ts">`만(Options API 금지). 컴포넌트 이름은 2단어 이상.
props는 타입 기반 `defineProps<Props>()`, 이벤트는 `defineEmits`.

## 파생 값은 watch가 아니라 computed

```ts
// ❌ watch로 상태를 복사 — 원본과 사본이 어긋나고 갱신 순서에 의존한다
const fullName = ref('')
watch([firstName, lastName], () => {
  fullName.value = `${firstName.value} ${lastName.value}`
})

// ✅ 파생은 computed — 항상 원본에서 다시 계산된다
const fullName = computed(() => `${firstName.value} ${lastName.value}`)
```

`watch`는 **부수효과**(요청·저장·로깅)에만. 소스가 명시되지 않는 `watchEffect`보다 `watch`를 먼저 고려한다.

## ref를 기본으로 — reactive 구조분해는 반응성을 끊는다

```ts
// ❌ reactive 구조분해 — count는 그냥 숫자가 되어 더 이상 갱신되지 않는다
const state = reactive({ count: 0 })
const { count } = state

// ✅ ref가 기본. 묶어야 하면 toRefs로 푼다
const count = ref(0)
const { total, tax } = toRefs(reactive({ total: 0, tax: 0 }))
```

## props는 읽기 전용 — 부모에게 알린다

```ts
// ❌ props 직접 변이 — 단방향 데이터 흐름이 깨지고 부모가 모른다
props.modelValue = next

// ✅ v-model이면 defineModel (3.4+)
const model = defineModel<string>()
model.value = next

// ✅ 그 외에는 emit
const emit = defineEmits<{ change: [value: string] }>()
emit('change', next)
```

## 컴포저블은 반응성을 받아야 한다

```ts
// ❌ 값으로 받으면 호출 시점에 고정 — 이후 id가 바뀌어도 따라가지 않는다
function useUser(id: string) {
  return useQuery({ queryKey: ['user', id], queryFn: () => fetchUser(id) })
}
useUser(props.id)

// ✅ ref·getter를 받고 toValue로 읽는다
function useUser(id: MaybeRefOrGetter<string>) {
  watchEffect(() => fetchUser(toValue(id)))
}
useUser(() => props.id)
```

컴포저블은 `useXxx`, `setup` 최상위에서만 호출. 반환은 `ref`/`computed`(구조분해해도 반응성이 살아 있게).

## 템플릿에는 표현만

```vue
<!-- ❌ 템플릿에 로직 — 매 렌더 재계산되고 테스트도 안 된다 -->
<li v-for="user in users.filter(u => u.active).sort((a, b) => a.age - b.age)" :key="user.id">

<!-- ✅ computed로 이름을 붙인다 -->
<li v-for="user in activeUsersByAge" :key="user.id">
```

- `v-for`엔 안정된 `:key`(index 금지). **`v-if`와 `v-for`를 같은 요소에** 두지 않는다 — `v-if`를 바깥 `<template>`으로 빼거나 `computed`로 걸러낸다.

## 상태 전략

- 서버/비동기는 vue-query 또는 컴포저블로 캡슐화 — 컴포넌트에서 직접 패칭하지 않는다.
- 전역은 꼭 필요할 때만 Pinia(setup 문법). 부모-자식 두 단계를 피하려고 스토어로 올리지 않는다.
