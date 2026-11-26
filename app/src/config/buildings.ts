/**
 * 빌딩(종목) 설정. PRD 9장 buildings 테이블과 같은 모양.
 * - floorUnit: 1층 = 몇 원 (PRD 3장: 두 종목 모두 1만 원)
 * - mergedFloorMax: 통합 저층 상한 (이 층 이하는 모두 표시 층 1층)
 * - maxFloor: 빌딩 최고층. 넘으면 옥상(펜트하우스).
 *   PRD에 값이 없어 프로토타입용 임시값을 둔다 (오픈 이슈로 확정 필요).
 */
export interface BuildingConfig {
  id: 'samsung' | 'skhynix'
  name: string
  floorUnit: number
  mergedFloorMax: number
  maxFloor: number
  /** 마을 내 위치 (빌딩 중심 x, z) */
  position: [number, number]
  /** 외관 */
  style: {
    /** 외벽 패턴 */
    wall: 'concrete' | 'brick'
    /** 층 사이 띠, 처마 */
    trim: string
    /** 창틀 */
    frame: string
    /** 로비 캐노피 모양 */
    canopy: 'dark' | 'stripe'
    roof: string
  }
}

export const BUILDINGS: BuildingConfig[] = [
  {
    id: 'samsung',
    name: '삼성전자',
    floorUnit: 10_000,
    mergedFloorMax: 5,
    maxFloor: 30, // 평단 31만 원 이상은 옥상 (2단계 확정)
    position: [-26, -29],
    // 밝은 콘크리트 + 검은 창틀 유리
    style: { wall: 'concrete', trim: '#a9adb3', frame: '#22252a', canopy: 'dark', roof: '#6b7078' },
  },
  {
    id: 'skhynix',
    name: 'SK하이닉스',
    floorUnit: 10_000,
    mergedFloorMax: 100,
    maxFloor: 150, // 평단 151만 원 이상은 옥상 (2단계 확정)
    position: [26, -29],
    // 붉은 벽돌 + 줄무늬 차양
    style: { wall: 'brick', trim: '#e2d6cb', frame: '#22252a', canopy: 'stripe', roof: '#5a5f66' },
  },
]

export function getBuilding(id: BuildingConfig['id']): BuildingConfig {
  const b = BUILDINGS.find((x) => x.id === id)
  if (!b) throw new Error(`unknown building: ${id}`)
  return b
}
