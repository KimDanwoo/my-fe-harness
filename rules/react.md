---
paths:
  - "**/*.{tsx,jsx}"
---

# React — 핵심

> 적용 조건: **React 프로젝트에만.** Vue/기타 스택이면 이 규칙을 무시한다.

함수 컴포넌트만, `React.FC` 지양. props 타입은 파일 안에서 `type Props`. 한 파일 = 한 공개 컴포넌트.

## 서버 상태를 이펙트로 가져오지 않는다

```tsx
// ❌ useEffect 패칭 + 파생 값을 상태로 복사 — 경쟁 상태·중복 요청·동기화 버그
const [items, setItems] = useState([])
const [total, setTotal] = useState(0)
useEffect(() => { fetchItems().then(setItems) }, [])
useEffect(() => { setTotal(items.reduce((s, i) => s + i.price, 0)) }, [items])

// ✅ React Query + 렌더 중 계산
const { data: items = [] } = useQuery({ queryKey: ['items'], queryFn: fetchItems })
const total = items.reduce((sum, item) => sum + item.price, 0)
```

**렌더 중 계산할 수 있으면 상태로 두지 않는다.** `useMemo`는 그다음 문제다.

## 이벤트로 벌어진 일은 이벤트 핸들러에서

```tsx
// ❌ 사용자 행동을 상태로 옮긴 뒤 이펙트로 처리 — 왜 실행됐는지 추적이 안 된다
const [submitted, setSubmitted] = useState(false)
useEffect(() => {
  if (submitted) postOrder(cart)
}, [submitted, cart])

// ✅ 이벤트에서 일어난 일은 이벤트에서 끝낸다
const handleSubmit = () => postOrder(cart)
```

`useEffect`는 **외부 시스템 동기화**(구독·타이머·DOM 측정)에만. 그 외에는 대부분 이펙트가 답이 아니다.

## Hooks는 항상 최상위에서

```tsx
// ❌ early return 뒤의 훅 — 렌더마다 훅 개수가 달라져 터진다
function Profile({ userId }: Props) {
  if (!userId) return null
  const { data } = useQuery({ queryKey: ['user', userId], queryFn: fetchUser })
}

// ✅ 훅을 먼저, 분기는 그 뒤. 실행 여부는 훅의 옵션으로 제어
function Profile({ userId }: Props) {
  const { data } = useQuery({
    queryKey: ['user', userId],
    queryFn: fetchUser,
    enabled: Boolean(userId),
  })
  if (!userId) return null
}
```

조건·루프·콜백 안에서 훅 호출 금지. 의존성 배열은 정직하게(린트 무시 주석으로 덮지 않는다).

## 상태 초기화는 이펙트가 아니라 key

```tsx
// ❌ props가 바뀔 때마다 이펙트로 상태를 되돌린다
useEffect(() => { setDraft('') }, [postId])

// ✅ key가 바뀌면 React가 새로 마운트한다 — 초기화 코드 자체가 사라진다
<Editor key={postId} postId={postId} />
```

## 상태 전략

- **비동기·서버**: React Query. **로컬**: `useState`/`useReducer`(관련 상태가 3개 넘게 얽히면 reducer).
- **전역**: 꼭 필요할 때만 Jotai/Zustand. props 두 단계 내려가는 걸 피하려고 전역으로 올리지 않는다.
- 여러 `useState`가 항상 같이 바뀌면 하나의 객체이거나 reducer다.

## 성능

- `memo`/`useMemo`/`useCallback`은 **측정된 병목에만**. 기본값은 안 쓰는 것.
- 리스트 `key`는 안정된 식별자 — 배열 index는 순서가 바뀌는 리스트에서 상태를 뒤섞는다.

## React 19+ (설치된 버전이 19 미만이면 이 절 무시)

- 폼·변이는 **Actions**: `<form action={fn}>` + `useActionState`로 대기·에러·결과를 일원화. 수동 `isSubmitting` 금지. 진행 상태는 `useFormStatus`(폼의 **자식**에서만 읽힌다).
- 낙관적 UI는 `useOptimistic`. `use()`는 다른 훅과 달리 **조건·루프 안에서도 호출 가능**.
- `ref`는 일반 prop — 새 컴포넌트에 `forwardRef` 불필요. `<Context.Provider>` 대신 `<Context>` 직접 사용.
- `<title>`/`<meta>`/`<link>`는 컴포넌트에서 렌더하면 `<head>`로 호이스팅 — 별도 헬퍼 불필요.
