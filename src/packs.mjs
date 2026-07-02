export const PACKS = [
  {
    id: 'safety',
    kind: 'rule',
    aliases: ['security', 'guard'],
    file: 'safety.md',
    title: '안전장치',
    description: '최우선·항상 로드 — 비밀 노출·외부 입력·XSS·토큰·의존성 가드레일',
  },
  {
    id: 'typescript',
    kind: 'rule',
    aliases: ['ts'],
    file: 'typescript.md',
    title: 'TypeScript',
    description: '타입 전략(any 금지·unknown 좁히기), 배럴 패턴, 네이밍, import 순서',
  },
  {
    id: 'react',
    kind: 'rule',
    aliases: [],
    file: 'react.md',
    title: 'React',
    description: '함수 컴포넌트, 상태 전략(React Query·Jotai/Zustand), Hooks, 안티패턴',
  },
  {
    id: 'vue',
    kind: 'rule',
    aliases: [],
    file: 'vue.md',
    title: 'Vue 3',
    description: 'script setup, 반응성(ref·computed), Pinia, 템플릿·컴포저블 규칙',
  },
  {
    id: 'frontend',
    kind: 'rule',
    aliases: ['front', 'fe'],
    file: 'frontend.md',
    title: '프론트엔드 공통',
    description: '데이터·비동기 상태, SEO·메타, 성능, 반응형, 국제화, 에러·로딩 설계',
  },
  {
    id: 'a11y',
    kind: 'rule',
    aliases: ['accessibility'],
    file: 'a11y.md',
    title: '웹 접근성',
    description: '시맨틱·키보드·포커스·폼·ARIA·대비 (컴포넌트 파일 편집 시 로드) — WCAG AA',
  },
  {
    id: 'styling',
    kind: 'rule',
    aliases: ['style', 'design', 'tokens'],
    file: 'styling.md',
    title: '스타일·디자인 시스템',
    description: '디자인 토큰·테마·다크모드·반응형·모션 (컴포넌트·스타일 파일 편집 시 로드)',
  },
  {
    id: 'forms',
    kind: 'rule',
    aliases: ['form'],
    file: 'forms.md',
    title: '폼',
    description: '스키마 검증·상태·제출 라이프사이클·라이브러리 선택 (컴포넌트 파일 편집 시 로드)',
  },
  {
    id: 'patterns',
    kind: 'rule',
    aliases: ['pattern', 'clean'],
    file: 'patterns.md',
    title: '좋은 패턴',
    description: '선언형·early return·조건 네이밍·컴포지션 — 좋은 예/안티패턴 코드 예시',
  },
  {
    id: 'testing',
    kind: 'rule',
    aliases: ['test', 'tests'],
    file: 'testing.md',
    title: '테스트',
    description: '동작 중심·Testing Library·격리·flaky 방지·상태 커버리지 (테스트 파일 편집 시 로드)',
  },
  {
    id: 'commit',
    kind: 'rule',
    aliases: ['git'],
    file: 'commit.md',
    title: '커밋',
    description: 'Conventional Commits, 원자적 커밋, 금지 패턴',
  },
  {
    id: 'monorepo',
    kind: 'rule',
    aliases: ['mono'],
    file: 'monorepo.md',
    title: '모노레포',
    description: 'pnpm workspace 구조, 의존 방향, 공용 설정, 태스크·버전 관리',
  },
  {
    id: 'fsd',
    kind: 'structure',
    aliases: [],
    file: 'fsd.md',
    title: 'FSD 아키텍처',
    description: '중·대규모 — app→pages→widgets→features→entities→shared 레이어 규칙',
  },
  {
    id: 'feature-based',
    kind: 'structure',
    aliases: ['feature', 'features'],
    file: 'feature-based.md',
    title: '기능 중심 구조',
    description: '중규모 — app→pages→features→shared, 기능 단위 응집',
  },
  {
    id: 'layered',
    kind: 'structure',
    aliases: ['layers', 'classic'],
    file: 'layered.md',
    title: '계층형 구조',
    description: '소규모·프로토타입 — pages/components/hooks/api 기술 계층 분리',
  },
]

export const SAFETY_ID = 'safety'

// 린 기본 — AI가 깔끔한 스타일로 짜게 하는 최소 코어(safety는 항상 자동 포함).
// 프레임워크(react·vue)는 프로젝트마다 다르므로 사용자가 함께 지정한다: add core react
export const CORE_IDS = ['typescript', 'patterns']

export function rulePacks() {
  return PACKS.filter((pack) => pack.kind === 'rule')
}

export function corePacks() {
  return CORE_IDS.map((id) => PACKS.find((pack) => pack.id === id))
}

export function safetyPack() {
  return PACKS.find((pack) => pack.id === SAFETY_ID)
}

// 안전장치는 항상 포함한다 — 이미 있으면 그대로.
export function withSafety(packs) {
  if (packs.some((pack) => pack.id === SAFETY_ID)) return packs
  return [safetyPack(), ...packs]
}

export function structurePacks() {
  return PACKS.filter((pack) => pack.kind === 'structure')
}

export function resolvePacks(tokens) {
  const seen = new Set()
  const resolved = []
  const add = (pack) => {
    if (seen.has(pack.id)) return
    seen.add(pack.id)
    resolved.push(pack)
  }

  for (const token of tokens) {
    const name = token.toLowerCase()
    if (name === 'all') {
      rulePacks().forEach(add)
      continue
    }
    if (name === 'core') {
      corePacks().forEach(add)
      continue
    }
    const pack = findPack(token)
    if (!pack) {
      const valid = PACKS.map((p) => p.id).join(', ')
      throw new Error(`알 수 없는 팩: "${token}" (사용 가능: core, all, ${valid})`)
    }
    add(pack)
  }
  return resolved
}

function findPack(token) {
  const name = token.toLowerCase()
  return PACKS.find((pack) => pack.id === name || pack.aliases.includes(name)) ?? null
}
