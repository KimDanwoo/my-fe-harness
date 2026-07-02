---
paths:
  - "**/*.{tsx,jsx}"
---

# React — 핵심

- 함수 컴포넌트만, `React.FC` 지양. props 타입은 파일 안에서 `type Props`. 한 파일 = 한 공개 컴포넌트.
- 서버/비동기 상태는 React Query — `useEffect` 패칭 금지. 로컬은 `useState`/`useReducer`, 전역은 꼭 필요할 때만 Jotai/Zustand.
- 파생 값은 상태로 두지 말고 렌더 중 계산(필요시 `useMemo`).
- Hooks는 최상위에서만(조건부 금지), 의존성 배열 정직하게. `useEffect`는 외부 시스템 동기화에만.
- `memo`/`useMemo`/`useCallback`은 측정된 병목에만. 리스트 key는 안정된 식별자.

```tsx
// ❌ useEffect 패칭 + 파생 값을 상태로 복사
const [items, setItems] = useState([])
const [total, setTotal] = useState(0)
useEffect(() => { fetchItems().then(setItems) }, [])
useEffect(() => { setTotal(items.reduce((s, i) => s + i.price, 0)) }, [items])

// ✅ React Query + 렌더 중 계산
const { data: items = [] } = useQuery({ queryKey: ['items'], queryFn: fetchItems })
const total = items.reduce((sum, item) => sum + item.price, 0)
```
