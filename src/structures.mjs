export const STRUCTURES = [
  {
    id: 'fsd',
    aliases: [],
    ruleFile: 'fsd.md',
    title: 'FSD (Feature-Sliced Design)',
    description: '중·대규모. 레이어 단방향: app→pages→widgets→features→entities→shared',
    dirs: [
      { name: 'app', purpose: '진입점 — 프로바이더, 라우팅 설정, 전역 스타일', note: 'import 가능: pages 이하 전부' },
      { name: 'pages', purpose: '라우트 단위 조립 (Next.js 사용 시 views로 개명 권장)', note: 'import 가능: widgets 이하' },
      { name: 'widgets', purpose: '페이지를 구성하는 독립 UI 블록', note: 'import 가능: features 이하' },
      { name: 'features', purpose: '사용자 행동 단위 (검색, 좋아요, 로그인)', note: 'import 가능: entities 이하' },
      { name: 'entities', purpose: '도메인 모델 (user, product 등)', note: 'import 가능: shared만' },
      { name: 'shared', purpose: '프레임워크 무관 공용 코드 (ui-kit, lib, config)', note: 'import 가능: 없음 (최하위)' },
    ],
  },
  {
    id: 'feature-based',
    aliases: ['feature', 'features'],
    ruleFile: 'feature-based.md',
    title: '기능 중심 (Feature-based)',
    description: '중규모. 기능 단위 응집: app→pages→features→shared',
    dirs: [
      { name: 'app', purpose: '진입점 — 라우팅, 프로바이더, 전역 스타일', note: 'import 가능: pages 이하 전부' },
      { name: 'pages', purpose: '라우트 화면 — features를 조립만 한다 (비즈니스 로직 금지)', note: 'import 가능: features·shared' },
      { name: 'features', purpose: '기능 단위 폴더 (auth, cart …) — components/hooks/api/model + index.ts 배럴', note: 'feature 간 직접 import 금지, shared만 참조' },
      { name: 'shared', purpose: '도메인 무관 공용 코드 — ui/hooks/lib/api/config', note: 'import 가능: 없음 (최하위)' },
    ],
  },
  {
    id: 'layered',
    aliases: ['layers', 'classic'],
    ruleFile: 'layered.md',
    title: '계층형 (Layered)',
    description: '소규모·프로토타입. 기술 계층 분리: pages/components/hooks/api…',
    dirs: [
      { name: 'pages', purpose: '라우트 화면 — 화면 전용 컴포넌트는 여기 co-locate', note: 'import 가능: 아래 전부' },
      { name: 'components', purpose: '두 페이지 이상에서 쓰는 재사용 UI (도메인 무관)', note: 'pages import 금지' },
      { name: 'hooks', purpose: '커스텀 훅 (useXxx)', note: 'components·pages import 금지' },
      { name: 'api', purpose: '서버 통신 — 클라이언트·엔드포인트 함수, 응답→도메인 타입 변환', note: 'UI 계층 import 금지' },
      { name: 'stores', purpose: '전역 상태 (꼭 필요할 때만)', note: 'UI 계층 import 금지' },
      { name: 'utils', purpose: '순수 함수 유틸 — React·API 의존 금지', note: 'types·constants만 참조' },
      { name: 'types', purpose: '공용 타입', note: '다른 계층 import 금지' },
      { name: 'constants', purpose: '공용 상수 (매직넘버의 집)', note: '다른 계층 import 금지' },
    ],
  },
]

export function resolveStructure(token) {
  const name = token.toLowerCase()
  const structure = STRUCTURES.find(
    (candidate) => candidate.id === name || candidate.aliases.includes(name),
  )
  if (!structure) {
    const valid = STRUCTURES.map((candidate) => candidate.id).join(', ')
    throw new Error(`알 수 없는 구조: "${token}" (사용 가능: ${valid})`)
  }
  return structure
}
