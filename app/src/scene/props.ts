import { hash, type Part } from './lowpoly'
import type { HouseKind, StallColor, TreeKind } from './townPlan'

/**
 * 로우폴리 소품·건물 정의. 모두 원점 = 바닥 중앙, 정면 = +Z.
 * 캐릭터 키 ≈ 3.7 기준으로 크기를 맞췄다.
 */

const WOOD = '#a8784a'
const WOOD_DARK = '#7e5636'
const STONE = '#d9d2c4'
const STONE_DARK = '#b5ad9e'
const GLASS = '#a6d8f0'
const CREAM = '#f4e8d0'

// ---------- 자연 ----------

export function treeParts(kind: TreeKind): Part[] {
  if (kind === 'pine') {
    return [
      { k: 'cyl', p: [0, 1, 0], s: [0.6, 2, 0.6], c: '#7a5233', seg: 6 },
      { k: 'cone', p: [0, 3.4, 0], s: [4.4, 4, 4.4], c: '#3f8f55', seg: 7 },
      { k: 'cone', p: [0, 5.5, 0], s: [3.4, 3.4, 3.4], c: '#4a9c5f', seg: 7 },
      { k: 'cone', p: [0, 7.3, 0], s: [2.2, 2.6, 2.2], c: '#58aa69', seg: 7 },
    ]
  }
  if (kind === 'tall') {
    return [
      { k: 'cyl', p: [0, 2, 0], s: [0.6, 4, 0.6], c: '#7a5233', seg: 6 },
      { k: 'ico', p: [0, 5, 0], s: [4.2, 3.6, 4.2], c: '#62b34a' },
      { k: 'ico', p: [0.2, 7.1, 0.1], s: [3.2, 3, 3.2], c: '#74c158' },
      { k: 'ico', p: [0, 8.7, 0], s: [2, 2, 2], c: '#86cc66' },
    ]
  }
  return [
    { k: 'cyl', p: [0, 1.6, 0], s: [0.75, 3.2, 0.75], c: '#7a5233', seg: 6 },
    { k: 'ico', p: [0, 4.9, 0], s: [5.2, 4.4, 5.2], c: '#68b84c' },
    { k: 'ico', p: [1.4, 6.1, 0.7], s: [3.4, 3, 3.4], c: '#80ca5e' },
    { k: 'ico', p: [-1.5, 5.6, -0.8], s: [3, 2.6, 3], c: '#5aa944' },
  ]
}

export const BUSH: Part[] = [
  { k: 'ico', p: [0, 0.7, 0], s: [2.2, 1.6, 2.2], c: '#5fae45' },
  { k: 'ico', p: [0.7, 1.1, 0.3], s: [1.4, 1.2, 1.4], c: '#76c257' },
]

export const FLOWER_BED: Part[] = (() => {
  const parts: Part[] = [
    { p: [0, 0.25, 0], s: [3, 0.5, 1.3], c: WOOD, rad: 0.12 },
    { p: [0, 0.48, 0], s: [2.7, 0.1, 1.05], c: '#6e4a2f', rad: 0.04 },
  ]
  const colors = ['#ffffff', '#ffd84a', '#ff8fb0', '#b796ff', '#ff7a6b']
  for (let i = 0; i < 9; i++) {
    const x = -1.1 + (i % 5) * 0.55
    const z = i < 5 ? -0.25 : 0.25
    parts.push({ k: 'ico', p: [x, 0.75, z], s: [0.5, 0.45, 0.5], c: '#6db24c' })
    parts.push({ k: 'ico', p: [x + 0.08, 1.02, z], s: [0.34, 0.3, 0.34], c: colors[Math.floor(hash(i, 3) * colors.length)] })
  }
  return parts
})()

// ---------- 거리 소품 ----------

export const LAMP: Part[] = [
  { p: [0, 0.2, 0], s: [0.8, 0.4, 0.8], c: '#3b4a44', rad: 0.12 },
  { k: 'cyl', p: [0, 2.6, 0], s: [0.28, 4.6, 0.28], c: '#3b4a44', seg: 8 },
  { k: 'cyl', p: [0, 4.3, 0], s: [0.9, 0.18, 0.9], c: '#3b4a44', seg: 8 },
  { k: 'cone', p: [0, 5.75, 0], s: [1.3, 0.7, 1.3], c: '#3b4a44', seg: 4, r: [0, Math.PI / 4, 0] },
]
export const LAMP_GLOW: Part[] = [{ p: [0, 4.95, 0], s: [0.75, 1.05, 0.75], c: '#ffd27a', rad: 0.12 }]

export const BENCH: Part[] = [
  { p: [0, 0.95, 0], s: [3, 0.25, 1.05], c: WOOD, rad: 0.1 },
  { p: [0, 1.65, -0.46], s: [3, 0.9, 0.2], c: WOOD, rad: 0.08 },
  { p: [-1.25, 0.42, 0], s: [0.22, 0.85, 0.9], c: '#3b4a44', rad: 0.06 },
  { p: [1.25, 0.42, 0], s: [0.22, 0.85, 0.9], c: '#3b4a44', rad: 0.06 },
]

export const FOUNTAIN: Part[] = [
  { k: 'cyl', p: [0, 0.45, 0], s: [9, 0.9, 9], c: STONE, seg: 18 },
  { k: 'cyl', p: [0, 0.95, 0], s: [9.2, 0.18, 9.2], c: STONE_DARK, seg: 18 },
  { k: 'cyl', p: [0, 2, 0], s: [1.4, 2.4, 1.4], c: STONE, seg: 10 },
  { k: 'cyl', p: [0, 3.25, 0], s: [3.4, 0.55, 3.4], c: STONE, seg: 14 },
]
export const FOUNTAIN_WATER: Part[] = [
  { k: 'cyl', p: [0, 0.92, 0], s: [8, 0.1, 8], c: '#4fb6e6', seg: 18 },
  { k: 'cyl', p: [0, 3.5, 0], s: [2.9, 0.1, 2.9], c: '#6cc6ee', seg: 14 },
  { k: 'ico', p: [0, 4.1, 0], s: [0.7, 1.2, 0.7], c: '#a6e2f8' },
]

/** 마을 간판 (글씨는 따로): 판 중심 y = 3.6 */
export const SIGNBOARD: Part[] = [
  { k: 'cyl', p: [-3.1, 2, 0], s: [0.45, 4, 0.45], c: WOOD_DARK, seg: 6 },
  { k: 'cyl', p: [3.1, 2, 0], s: [0.45, 4, 0.45], c: WOOD_DARK, seg: 6 },
  { p: [0, 3.6, 0], s: [7.2, 3, 0.4], c: WOOD_DARK, rad: 0.18 },
  { p: [0, 3.6, 0.12], s: [6.6, 2.4, 0.3], c: '#f6ecd6', rad: 0.12 },
]

/** 층 소식 게시판 (글씨는 따로): 판 중심 y = 2.6 */
export const NEWS_BOARD: Part[] = [
  { k: 'cyl', p: [-2.7, 1.9, 0], s: [0.4, 3.8, 0.4], c: '#3d7a5b', seg: 6 },
  { k: 'cyl', p: [2.7, 1.9, 0], s: [0.4, 3.8, 0.4], c: '#3d7a5b', seg: 6 },
  { p: [0, 2.45, 0], s: [5.2, 2.8, 0.3], c: '#3d7a5b', rad: 0.12 },
  { p: [0, 2.3, 0.1], s: [4.7, 2.1, 0.2], c: '#d7b48a', rad: 0.06 },
  { k: 'gable', p: [0, 4.3, 0], s: [6.2, 0.9, 1.4], c: '#4a8e6b' },
  { p: [-1.5, 2.2, 0.22], s: [0.9, 0.75, 0.05], c: '#fff6b0', rad: 0.02 },
  { p: [-0.3, 1.9, 0.22], s: [0.8, 0.85, 0.05], c: '#ffd1dc', rad: 0.02 },
  { p: [0.9, 2.1, 0.22], s: [0.9, 0.75, 0.05], c: '#cfe9ff', rad: 0.02 },
  { p: [1.8, 1.8, 0.22], s: [0.7, 0.6, 0.05], c: '#e3f7c8', rad: 0.02 },
]

// ---------- 집 ----------

const ROOF: Record<HouseKind, [string, string]> = {
  blue: ['#7f8fe0', '#6c7cd2'],
  orange: ['#ec8a5f', '#d9754d'],
  green: ['#6fb77a', '#5ea468'],
}

/** 창문 하나 (정면 z에 붙임) */
function windowParts(x: number, y: number, z: number, shutter: string, w = 1.9, h = 1.7): Part[] {
  return [
    { p: [x, y, z], s: [w + 0.3, h + 0.3, 0.16], c: '#ffffff', rad: 0.06 },
    { p: [x, y, z + 0.05], s: [w, h, 0.12], c: GLASS, rad: 0.04 },
    { p: [x, y, z + 0.1], s: [0.1, h, 0.06], c: '#ffffff', rad: 0.02 },
    { p: [x - w / 2 - 0.45, y, z], s: [0.55, h + 0.2, 0.12], c: shutter, rad: 0.04 },
    { p: [x + w / 2 + 0.45, y, z], s: [0.55, h + 0.2, 0.12], c: shutter, rad: 0.04 },
    { p: [x, y - h / 2 - 0.35, z + 0.25], s: [w + 0.3, 0.4, 0.5], c: WOOD, rad: 0.08 },
    { k: 'ico', p: [x - 0.5, y - h / 2 - 0.05, z + 0.25], s: [0.5, 0.4, 0.4], c: '#ff8fb0' },
    { k: 'ico', p: [x + 0.4, y - h / 2 - 0.05, z + 0.25], s: [0.5, 0.4, 0.4], c: '#ffd84a' },
  ]
}

export function houseParts(kind: HouseKind): Part[] {
  const [roof, roofDark] = ROOF[kind]
  const z = 4
  return [
    { p: [0, 0.3, 0], s: [10.4, 0.6, 8.4], c: STONE_DARK, rad: 0.2 },
    { p: [0, 3.3, 0], s: [10, 5.4, 8], c: CREAM, rad: 0.25 },
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz): Part => ({ p: [sx * 4.85, 3.3, sz * 3.85], s: [0.5, 5.4, 0.5], c: WOOD, rad: 0.1 }))),
    { p: [0, 5.9, 0], s: [10.3, 0.3, 8.3], c: WOOD, rad: 0.1 },
    // 박공 (벽 색 삼각 면) + 지붕
    { k: 'gable', p: [0, 7.5, 0], s: [9.6, 3, 7.8], c: CREAM },
    { k: 'gable', p: [0, 7.75, 0], s: [11.2, 3.6, 9.6], c: roof },
    { p: [0, 9.5, 0], s: [11.4, 0.3, 0.5], c: roofDark, rad: 0.1 },
    { p: [3, 9, -1.8], s: [1.1, 2.8, 1.1], c: '#c97a5a', rad: 0.12 },
    { p: [3, 10.45, -1.8], s: [1.4, 0.3, 1.4], c: '#9c5e46', rad: 0.08 },
    // 문 + 작은 차양
    { p: [0, 2.3, z + 0.05], s: [2.3, 3.8, 0.2], c: '#ffffff', rad: 0.08 },
    { p: [0, 2.2, z + 0.15], s: [1.9, 3.4, 0.2], c: '#8a5a36', rad: 0.08 },
    { k: 'sphere', p: [0.6, 2.2, z + 0.3], s: [0.22, 0.22, 0.22], c: '#e0b85a' },
    { k: 'gable', p: [0, 4.55, z + 0.75], s: [3.2, 0.9, 1.6], c: roof },
    { p: [0, 0.75, z + 0.9], s: [2.8, 0.3, 1.3], c: STONE, rad: 0.1 },
    ...windowParts(-3.1, 3.3, z, roofDark),
    ...windowParts(3.1, 3.3, z, roofDark),
    // 옆창
    { p: [5.02, 3.4, 0], s: [0.14, 1.7, 1.9], c: GLASS, rad: 0.04 },
    { p: [4.98, 3.4, 0], s: [0.14, 2, 2.2], c: '#ffffff', rad: 0.05 },
  ]
}

/** 카페: 큰 통창, 줄무늬 차양, 바깥 테이블 */
export function cafeParts(): Part[] {
  const z = 4
  const parts: Part[] = [
    { p: [0, 0.3, 0], s: [10.4, 0.6, 8.4], c: STONE_DARK, rad: 0.2 },
    { p: [0, 3.1, 0], s: [10, 5, 8], c: '#fbe0cf', rad: 0.25 },
    { p: [0, 5.75, 0], s: [10.4, 0.4, 8.4], c: '#c9876b', rad: 0.12 },
    { k: 'gable', p: [0, 7.1, 0], s: [9.6, 2.6, 7.8], c: '#fbe0cf' },
    { k: 'gable', p: [0, 7.35, 0], s: [11, 3.2, 9.4], c: '#d9614c' },
    { p: [0, 8.9, 0], s: [11.2, 0.3, 0.5], c: '#b64e3c', rad: 0.1 },
    // 통창 + 문
    { p: [-2.4, 2.6, z + 0.05], s: [4.6, 3, 0.2], c: '#ffffff', rad: 0.08 },
    { p: [-2.4, 2.6, z + 0.12], s: [4.2, 2.6, 0.16], c: '#ffe3a8', rad: 0.06 },
    { p: [-2.4, 2.6, z + 0.2], s: [0.12, 2.6, 0.08], c: '#ffffff' },
    { p: [3, 2.2, z + 0.05], s: [2.3, 3.8, 0.2], c: '#ffffff', rad: 0.08 },
    { p: [3, 2.1, z + 0.15], s: [1.9, 3.4, 0.2], c: '#5b8f6e', rad: 0.08 },
    { p: [0, 0.75, z + 0.9], s: [9, 0.3, 1.3], c: STONE, rad: 0.1 },
    // 걸린 간판: 커피잔 모양
    { p: [0, 4.6, z + 0.3], s: [1.8, 1.2, 0.2], c: '#fff6e8', rad: 0.1 },
    { k: 'cyl', p: [0, 4.55, z + 0.45], s: [0.6, 0.55, 0.2], c: '#8a5a36', seg: 10, r: [Math.PI / 2, 0, 0] },
  ]
  // 줄무늬 차양 (앞으로 비스듬히)
  for (let k = 0; k < 10; k++) {
    parts.push({ p: [-4.5 + k + 0.5, 4.1, z + 1], s: [1, 0.16, 2.2], c: k % 2 ? '#ffffff' : '#e2574a', r: [0.38, 0, 0], rad: 0.05 })
  }
  // 바깥 테이블 2개 + 파라솔
  for (const x of [-6.8, 6.8]) {
    parts.push({ k: 'cyl', p: [x, 1.1, 2], s: [1.8, 0.15, 1.8], c: '#ffffff', seg: 12 })
    parts.push({ k: 'cyl', p: [x, 0.55, 2], s: [0.2, 1.1, 0.2], c: '#5b5f66', seg: 6 })
    parts.push({ k: 'cyl', p: [x, 2.4, 2], s: [0.12, 2.6, 0.12], c: '#5b5f66', seg: 6 })
    parts.push({ k: 'cone', p: [x, 3.8, 2], s: [3.2, 1, 3.2], c: x < 0 ? '#f2b84b' : '#7cc4e8', seg: 8 })
  }
  return parts
}

// ---------- 시장 노점 ----------

const AWNING: Record<StallColor, string> = { red: '#e2574a', blue: '#4766c2', purple: '#8a6ad6', green: '#4ea86a' }

export function stallParts(color: StallColor): Part[] {
  const parts: Part[] = [
    { p: [0, 0.65, 0.4], s: [4.4, 1.3, 1.8], c: WOOD, rad: 0.12 },
    { p: [0, 1.36, 0.4], s: [4.6, 0.14, 2], c: WOOD_DARK, rad: 0.05 },
    { p: [0, 1.9, -1], s: [4.4, 3.8, 0.25], c: WOOD_DARK, rad: 0.08 },
  ]
  for (const x of [-2.1, 2.1]) for (const z of [-1, 1.2]) parts.push({ k: 'cyl', p: [x, 1.9, z], s: [0.22, 3.8, 0.22], c: WOOD_DARK, seg: 6 })
  for (let k = 0; k < 8; k++) {
    parts.push({ p: [-2.2 + k * 0.55 + 0.275, 3.95, 0.25], s: [0.56, 0.14, 3.1], c: k % 2 ? '#ffffff' : AWNING[color], r: [0.32, 0, 0], rad: 0.05 })
  }
  // 매대 위 과일·채소
  const goods = ['#ff7a5c', '#ffd24d', '#7cc95a', '#ff9fc2', '#b48cff']
  for (let k = 0; k < 7; k++) {
    parts.push({ k: 'ico', p: [-1.8 + k * 0.6, 1.68, 0.2 + (k % 2) * 0.5], s: [0.55, 0.5, 0.55], c: goods[Math.floor(hash(k, color.length, 5) * goods.length)] })
  }
  parts.push({ p: [2.7, 0.45, 1.2], s: [0.9, 0.9, 0.9], c: WOOD, rad: 0.08 })
  parts.push({ k: 'ico', p: [2.7, 1.05, 1.2], s: [0.6, 0.45, 0.6], c: '#7cc95a' })
  return parts
}

// ---------- 시청 ----------

export function townHallParts(): Part[] {
  const parts: Part[] = [
    // 기단과 계단
    { p: [0, 0.4, 0], s: [18, 0.8, 13], c: STONE_DARK, rad: 0.2 },
    { p: [0, 0.3, 7.1], s: [9, 0.6, 1.4], c: STONE, rad: 0.12 },
    { p: [0, 0.75, 6.4], s: [9, 0.3, 1.2], c: STONE, rad: 0.1 },
    // 본관
    { p: [0, 4.5, -0.8], s: [16, 7.4, 10], c: '#efe7d7', rad: 0.25 },
    { p: [0, 8.4, -0.8], s: [16.6, 0.6, 10.6], c: STONE_DARK, rad: 0.15 },
    { p: [0, 9, -0.8], s: [15.6, 0.6, 9.6], c: '#e3dac8', rad: 0.15 },
    // 현관 기둥과 박공
    { p: [0, 7.6, 5.2], s: [9.4, 0.6, 2.4], c: STONE_DARK, rad: 0.12 },
    { k: 'gable', p: [0, 8.8, 5.2], s: [2.6, 1.8, 10], c: '#e9dfcc', r: [0, Math.PI / 2, 0] },
    { p: [0, 2.9, 4.25], s: [2.6, 4.2, 0.25], c: '#6b4a32', rad: 0.08 },
    { p: [0, 5.4, 4.25], s: [2.6, 0.9, 0.2], c: GLASS, rad: 0.06 },
  ]
  for (const x of [-4, -2.2, 2.2, 4]) parts.push({ k: 'cyl', p: [x, 4.2, 5.6], s: [0.75, 6.8, 0.75], c: '#f7f2e8', seg: 10 })
  // 창문 두 줄
  for (const x of [-6.4, -4.2, 4.2, 6.4]) {
    for (const y of [3.2, 6.2]) {
      parts.push({ p: [x, y, 4.25], s: [1.4, 2, 0.15], c: '#ffffff', rad: 0.05 })
      parts.push({ p: [x, y, 4.32], s: [1.1, 1.7, 0.1], c: GLASS, rad: 0.04 })
    }
  }
  // 시계탑
  parts.push({ p: [0, 11.6, -1.5], s: [5, 4.6, 5], c: '#efe7d7', rad: 0.2 })
  parts.push({ p: [0, 14.1, -1.5], s: [5.6, 0.5, 5.6], c: STONE_DARK, rad: 0.12 })
  parts.push({ k: 'cone', p: [0, 16.4, -1.5], s: [5.6, 4.2, 5.6], c: '#4f9c95', seg: 4, r: [0, Math.PI / 4, 0] })
  parts.push({ k: 'sphere', p: [0, 18.8, -1.5], s: [0.6, 0.6, 0.6], c: '#e7c15a' })
  parts.push({ k: 'cyl', p: [0, 11.8, 1.05], s: [3, 0.25, 3], c: '#ffffff', seg: 20, r: [Math.PI / 2, 0, 0] })
  parts.push({ k: 'cyl', p: [0, 11.8, 0.85], s: [3.4, 0.25, 3.4], c: '#b59a5c', seg: 20, r: [Math.PI / 2, 0, 0] })
  parts.push({ p: [0, 12.3, 1.22], s: [0.18, 1.1, 0.08], c: '#333842', rad: 0.03 })
  parts.push({ p: [0.35, 11.8, 1.22], s: [0.8, 0.16, 0.08], c: '#333842', rad: 0.03 })
  // 깃대
  for (const [x, c] of [
    [-7.6, '#4f9c95'],
    [7.6, '#f2b84b'],
  ] as const) {
    parts.push({ k: 'cyl', p: [x, 6, 6.4], s: [0.16, 11, 0.16], c: '#d6d9de', seg: 6 })
    parts.push({ p: [x + 1, 10.4, 6.4], s: [1.9, 1.2, 0.08], c, rad: 0.04 })
  }
  return parts
}

// ---------- 풍차 ----------

export function windmillParts(): Part[] {
  const parts: Part[] = [{ k: 'cyl', p: [0, 0.4, 0], s: [8, 0.8, 8], c: STONE_DARK, seg: 12 }]
  // 아래로 갈수록 넓은 돌탑 (원기둥을 쌓아 만듦)
  const rings = 6
  for (let i = 0; i < rings; i++) {
    const r = 6.6 - i * 0.45
    parts.push({ k: 'cyl', p: [0, 0.8 + i * 1.6 + 0.8, 0], s: [r, 1.6, r], c: i % 2 ? '#e9dcc3' : '#e2d3b6', seg: 12 })
  }
  const top = 0.8 + rings * 1.6
  parts.push({ k: 'cyl', p: [0, top + 0.2, 0], s: [5.4, 0.4, 5.4], c: WOOD, seg: 12 })
  parts.push({ k: 'cone', p: [0, top + 2.2, 0], s: [5.6, 3.8, 5.6], c: '#d9614c', seg: 10 })
  // 문과 창
  parts.push({ p: [0, 1.95, 3.2], s: [1.8, 2.9, 0.4], c: '#8a5a36', rad: 0.1 })
  parts.push({ p: [0, 6, 2.65], s: [1.1, 1.3, 0.3], c: GLASS, rad: 0.06 })
  parts.push({ p: [0, 6, 2.6], s: [1.4, 1.6, 0.3], c: '#ffffff', rad: 0.06 })
  // 날개 축
  parts.push({ k: 'cyl', p: [0, top - 0.6, 2.8], s: [0.7, 1.6, 0.7], c: WOOD_DARK, seg: 8, r: [Math.PI / 2, 0, 0] })
  return parts
}
/** 풍차 날개 (원점 = 축 중심, Z축으로 회전) */
export const WINDMILL_HUB_Y = 0.8 + 6 * 1.6 - 0.6
export function windmillBladeParts(): Part[] {
  const parts: Part[] = [{ k: 'cyl', p: [0, 0, 0.2], s: [1, 0.6, 1], c: '#7e5636', seg: 8, r: [Math.PI / 2, 0, 0] }]
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2
    const dx = Math.cos(a)
    const dy = Math.sin(a)
    parts.push({ p: [dx * 3.2, dy * 3.2, 0.3], s: [i % 2 ? 0.25 : 6.4, i % 2 ? 6.4 : 0.25, 0.25], c: WOOD_DARK, rad: 0.06 })
    // 날개 천
    const ox = -dy * 0.75
    const oy = dx * 0.75
    parts.push({ p: [dx * 3.6 + ox, dy * 3.6 + oy, 0.32], s: [i % 2 ? 1.3 : 5, i % 2 ? 5 : 1.3, 0.1], c: '#f6efe2', rad: 0.04 })
  }
  return parts
}

// ---------- 텃밭 ----------

export function gardenParts(w: number, d: number): Part[] {
  const parts: Part[] = [{ p: [0, 0.12, 0], s: [w - 0.6, 0.24, d - 0.6], c: '#8a5d3b', rad: 0.08 }]
  let n = 0
  for (let x = -w / 2 + 1.4; x <= w / 2 - 1.2; x += 1.3) {
    for (let z = -d / 2 + 1.4; z <= d / 2 - 1.2; z += 1.7) {
      const h = hash(n++, 9)
      parts.push({ k: 'ico', p: [x, 0.6, z], s: [0.95, 0.75 + h * 0.4, 0.95], c: h > 0.5 ? '#6fbf4f' : '#5eaa45' })
      if (h > 0.7) parts.push({ k: 'sphere', p: [x + 0.25, 0.75, z + 0.2], s: [0.32, 0.32, 0.32], c: '#ff6b55' })
    }
  }
  const post = (x: number, z: number) => parts.push({ p: [x, 0.7, z], s: [0.3, 1.4, 0.3], c: WOOD, rad: 0.06 })
  for (let x = -w / 2; x <= w / 2 + 0.01; x += 1.75) {
    post(x, -d / 2)
    if (Math.abs(x) > 1) post(x, d / 2) // 앞쪽 가운데는 출입구
  }
  for (let z = -d / 2 + 1.6; z < d / 2; z += 1.6) {
    post(-w / 2, z)
    post(w / 2, z)
  }
  for (const y of [0.55, 1.05]) {
    parts.push({ p: [0, y, -d / 2], s: [w, 0.16, 0.14], c: WOOD_DARK, rad: 0.04 })
    parts.push({ p: [-w / 4 - 0.5, y, d / 2], s: [w / 2 - 1, 0.16, 0.14], c: WOOD_DARK, rad: 0.04 })
    parts.push({ p: [w / 4 + 0.5, y, d / 2], s: [w / 2 - 1, 0.16, 0.14], c: WOOD_DARK, rad: 0.04 })
    parts.push({ p: [-w / 2, y, 0], s: [0.14, 0.16, d], c: WOOD_DARK, rad: 0.04 })
    parts.push({ p: [w / 2, y, 0], s: [0.14, 0.16, d], c: WOOD_DARK, rad: 0.04 })
  }
  return parts
}
