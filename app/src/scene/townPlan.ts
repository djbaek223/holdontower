import type { Vector3 } from 'three'
import { BUILDINGS } from '../config/buildings'
import { BUILDING_SIZE } from './layout'
import { hash, type Placement, type V3 } from './lowpoly'

/**
 * 떠 있는 섬 마을 배치도.
 * 정면(+Z)이 카메라 쪽. 가운데 광장을 중심으로 건물을 두르고,
 * 앞으로 건물을 더 지을 빈 부지(PLOTS)를 길과 이어서 남겨 둔다.
 * 좌표 단위 1 ≈ 1m, 지면 높이 y = 0.
 */

/** 섬 윤곽 (둥근 사각형) */
export const ISLAND = { halfX: 58, halfZ: 46, corner: 16 }

export type Rect = { x0: number; x1: number; z0: number; z1: number }
const rect = (x0: number, x1: number, z0: number, z1: number): Rect => ({ x0, x1, z0, z1 })
export const inRect = (x: number, z: number, r: Rect, pad = 0) =>
  x >= r.x0 - pad && x <= r.x1 + pad && z >= r.z0 - pad && z <= r.z1 + pad

// ---------- 길 (돌 포장) ----------

export const PLAZA = rect(-16, 16, -12, 12)
export const PATHS: Rect[] = [
  PLAZA,
  rect(-3.5, 3.5, -20, -12), // 시청 앞길
  rect(-48, -16, -2.5, 2.5), // 서쪽 거리
  rect(16, 48, -2.5, 2.5), // 동쪽 거리
  rect(-3, 3, 12, 42), // 남쪽 큰길
  rect(-44, 48, 22, 27), // 남쪽 거리
  rect(-34, -16, -22, -12), // 삼성전자 앞마당
  rect(16, 34, -22, -12), // SK하이닉스 앞마당
  rect(-44.5, -39.5, -9, -2.5), // 풍차 가는 길
  rect(-43, -34, -26, -22), // 뒤편 왼쪽 부지 진입로
  rect(34, 43, -26, -22), // 뒤편 오른쪽 부지 진입로
]
export const isPath = (x: number, z: number, pad = 0) => PATHS.some((r) => inRect(x, z, r, pad))

// ---------- 랜드마크와 건물 ----------

export const TOWN_HALL = { p: [0, 0, -28] as V3, w: 18, d: 13 }
export const WINDMILL: Placement = { p: [-42, 0, -13] }
export const FOUNTAIN: Placement = { p: [0, 0, 0] }

export type HouseKind = 'blue' | 'orange' | 'green'
export const HOUSES: (Placement & { roof: HouseKind })[] = [
  { p: [-30, 0, -7.5], roof: 'blue' },
  { p: [30, 0, -7.5], roof: 'orange' },
]
export const CAFE: Placement = { p: [30, 0, 15.5] }
export type StallColor = 'red' | 'blue' | 'purple' | 'green'
export const STALLS: (Placement & { color: StallColor })[] = [
  { p: [-35, 0, 17.5], color: 'red' },
  { p: [-28.5, 0, 17.5], color: 'blue' },
  { p: [-22, 0, 17.5], color: 'purple' },
  { p: [-15.5, 0, 17.5], color: 'green' },
]
export const GARDEN = { p: [-38, 0, 35] as V3, w: 14, d: 8 }
export const SIGNBOARD: Placement = { p: [-11, 0, -17] }
export const NEWS_BOARD: Placement = { p: [11, 0, -17] }

// ---------- 빈 부지 (앞으로 건물을 지을 자리) ----------

export type Plot = Rect & { id: string; size: 'M' | 'L'; /** 길과 맞닿은 쪽 (입구) */ open: 'n' | 's' | 'e' | 'w' }
export const PLOTS: Plot[] = [
  { id: 'south-west', size: 'L', open: 'n', ...rect(-30, -6, 28.5, 41) },
  { id: 'south-east', size: 'M', open: 'n', ...rect(7, 21, 28.5, 40) },
  { id: 'east', size: 'M', open: 'n', ...rect(39, 52, 8, 21.5) },
  { id: 'east-street', size: 'M', open: 's', ...rect(39, 52, -15, -3.5) },
  { id: 'back-east', size: 'L', open: 'w', ...rect(43, 54, -38, -20) },
  { id: 'back-west', size: 'L', open: 'e', ...rect(-54, -43, -38, -20) },
]

// ---------- 소품 배치 ----------

export const BENCHES: Placement[] = [
  { p: [-9, 0, 9], r: 0 },
  { p: [9, 0, 9], r: 0 },
  { p: [-12.5, 0, -2], r: Math.PI / 2 },
  { p: [12.5, 0, -2], r: -Math.PI / 2 },
]

export const LAMPS: Placement[] = [
  [-15, -11],
  [15, -11],
  [-15, 11],
  [15, 11],
  [-4.4, 18],
  [4.4, 18],
  [-4.4, 33],
  [4.4, 33],
  [-28, 3.6],
  [28, 3.6],
  [-42, 3.6],
  [42, 3.6],
  [-10, 20.5],
  [24, 28],
  [-4.6, -18],
  [4.6, -18],
].map(([x, z]) => ({ p: [x, 0, z] as V3 }))

/** 꽃밭 (집 앞, 광장 모서리) */
export const FLOWER_BEDS: Placement[] = [
  [-37, -5],
  [-23, -5],
  [23, -5],
  [37, -5],
  [-13.5, -14.5],
  [13.5, -14.5],
  [-19, 13.5],
  [24, 21],
  [36, 21],
  [-7, -19.5],
  [7, -19.5],
].map(([x, z], i) => ({ p: [x, 0, z] as V3, r: (i % 2) * Math.PI }))

// ---------- 충돌 영역 ----------

const around = (x: number, z: number, hw: number, hd: number): Rect => rect(x - hw, x + hw, z - hd, z + hd)

export const OBSTACLES: Rect[] = [
  ...BUILDINGS.map((b) => around(b.position[0], b.position[1], BUILDING_SIZE.w / 2, BUILDING_SIZE.d / 2)),
  around(TOWN_HALL.p[0], TOWN_HALL.p[2], TOWN_HALL.w / 2, TOWN_HALL.d / 2),
  around(WINDMILL.p[0], WINDMILL.p[2], 4, 4),
  around(FOUNTAIN.p[0], FOUNTAIN.p[2], 4.6, 4.6),
  ...HOUSES.map((h) => around(h.p[0], h.p[2], 5.2, 4.2)),
  around(CAFE.p[0], CAFE.p[2], 5.2, 4.2),
  ...STALLS.map((s) => around(s.p[0], s.p[2], 2.6, 1.6)),
  around(GARDEN.p[0], GARDEN.p[2], GARDEN.w / 2, GARDEN.d / 2),
  around(SIGNBOARD.p[0], SIGNBOARD.p[2], 3.6, 0.6),
  around(NEWS_BOARD.p[0], NEWS_BOARD.p[2], 3.2, 0.6),
]

/** 섬 위 걸을 수 있는 범위 */
export function onIsland(x: number, z: number, margin = 5) {
  const hx = ISLAND.halfX - margin
  const hz = ISLAND.halfZ - margin
  const r = Math.max(ISLAND.corner - margin, 1)
  const dx = Math.max(Math.abs(x) - (hx - r), 0)
  const dz = Math.max(Math.abs(z) - (hz - r), 0)
  return Math.abs(x) <= hx && Math.abs(z) <= hz && Math.hypot(dx, dz) <= r
}

/** 캐릭터를 건물 밖·섬 안으로 밀어낸다 */
export function resolveCollisions(p: Vector3, radius = 0.6) {
  for (const o of OBSTACLES) {
    const x0 = o.x0 - radius
    const x1 = o.x1 + radius
    const z0 = o.z0 - radius
    const z1 = o.z1 + radius
    if (p.x > x0 && p.x < x1 && p.z > z0 && p.z < z1) {
      const d = [p.x - x0, x1 - p.x, p.z - z0, z1 - p.z]
      const m = Math.min(...d)
      if (m === d[0]) p.x = x0
      else if (m === d[1]) p.x = x1
      else if (m === d[2]) p.z = z0
      else p.z = z1
    }
  }
  // 섬 가장자리 밖이면 중심 쪽으로 당긴다
  for (let i = 0; i < 20 && !onIsland(p.x, p.z); i++) {
    p.x *= 0.98
    p.z *= 0.98
  }
}

// ---------- 나무·덤불 (빈 곳에 자연스럽게) ----------

const occupied = (x: number, z: number, pad: number) =>
  isPath(x, z, pad) ||
  OBSTACLES.some((o) => inRect(x, z, o, pad)) ||
  PLOTS.some((o) => inRect(x, z, o, pad)) ||
  LAMPS.some((l) => Math.hypot(l.p[0] - x, l.p[2] - z) < pad + 1) ||
  FLOWER_BEDS.some((l) => Math.hypot(l.p[0] - x, l.p[2] - z) < pad + 1.5)

export type TreeKind = 'round' | 'tall' | 'pine'
export const TREES: (Placement & { kind: TreeKind })[] = []
export const BUSHES: Placement[] = []
;(() => {
  for (let x = -ISLAND.halfX; x <= ISLAND.halfX; x += 4.5) {
    for (let z = -ISLAND.halfZ; z <= ISLAND.halfZ; z += 4.5) {
      const jx = x + (hash(x, z, 4) - 0.5) * 3
      const jz = z + (hash(x, z, 5) - 0.5) * 3
      if (!onIsland(jx, jz, 3.5)) continue
      const h = hash(x, z, 3)
      // 가장자리와 뒤편은 숲, 안쪽은 듬성듬성 (빈 공간을 남긴다)
      const edgeDist = Math.min(ISLAND.halfX - Math.abs(jx), ISLAND.halfZ - Math.abs(jz))
      const density = edgeDist < 9 ? 0.55 : jz < -30 ? 0.5 : 0.12
      if (h > density) continue
      if (occupied(jx, jz, 2.6)) {
        if (!occupied(jx, jz, 1) && h < density * 0.5) BUSHES.push({ p: [jx, 0, jz], r: h * 6, s: 0.8 + h })
        continue
      }
      const kind: TreeKind = jz < -30 || h < density * 0.25 ? 'pine' : h < density * 0.6 ? 'round' : 'tall'
      TREES.push({ p: [jx, 0, jz], r: hash(x, z, 6) * Math.PI * 2, s: 0.85 + hash(x, z, 7) * 0.4, kind })
    }
  }
})()

/** NPC가 걸어 다닐 목적지 후보 (길 위) */
export function randomPathPoint(seed: number): [number, number] {
  for (let i = 0; i < 40; i++) {
    const r = PATHS[Math.floor(hash(seed, i, 21) * PATHS.length)]
    const x = r.x0 + 1 + hash(seed, i, 22) * Math.max(0, r.x1 - r.x0 - 2)
    const z = r.z0 + 1 + hash(seed, i, 23) * Math.max(0, r.z1 - r.z0 - 2)
    if (!OBSTACLES.some((o) => inRect(x, z, o, 1))) return [x, z]
  }
  return [0, 8]
}
