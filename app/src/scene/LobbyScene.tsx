import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { CanvasTexture, Group, MeshLambertMaterial, NearestFilter, Object3D, OrthographicCamera, RepeatWrapping, SRGBColorSpace, Vector3 } from 'three'
import { Prop, hash, type Part } from './lowpoly'
import { Character, useMyLook, type Look } from './Player'
import { voxelPlant } from './ElevatorScene'
import { player } from '../store'
import { makeNav, type Rect } from './nav'

/**
 * 빌딩 1층 로비 (아이소메트릭 단면 디오라마).
 * 앞벽을 걷어 낸 방: 왼쪽 안벽 = 창문·안내 데스크, 오른쪽 안벽 = 엘리베이터 두 대, 앞쪽 = 유리 정문.
 * 바닥을 눌러 걷고, 엘리베이터 앞에 가면 탈 수 있다.
 */

/** 방 크기 (월드 단위). 안벽은 x = x0, z = z0 */
const ROOM = { x0: -13, x1: 13, z0: -10, z1: 10, h: 5.2 }
const H = ROOM.h
/** 엘리베이터 두 대의 x 위치 */
const ELEVATORS = [2, 6.6]
/** 정문 유리문 구간 */
const ENTRY = { x0: -9, x1: -3 }
/** 로비 안 캐릭터 크기 (방에 맞춰 마을보다 조금 작게) */
export const PEOPLE_SCALE = 0.8

export type LobbyNear = 'elevator' | 'exit' | null
export type LobbyAction = 'board' | 'exit'

/** 내 캐릭터 상태 (매 프레임 바뀌므로 store 밖) */
const me = {
  pos: new Vector3(),
  yaw: Math.PI,
  target: null as Vector3 | null,
  /** 목표까지 거쳐 갈 지점들 (장애물을 돌아간다) */
  path: [] as Vector3[],
  /** 목표에 닿으면 할 일 */
  then: null as LobbyAction | null,
}
/** 걸어 다니는 직원 위치 (엘리베이터 문 열림 판정용) */
const walker = new Vector3(3.4, 0, 6.6)

/** 정문으로 들어왔는지, 엘리베이터에서 내렸는지에 따라 시작 위치를 정한다 */
export function spawnLobby(from: 'entrance' | 'elevator') {
  if (from === 'elevator') {
    me.pos.set(ELEVATORS[0], 0, -7.7)
    me.yaw = 0
  } else {
    me.pos.set(-4.9, 0, 6.6)
    me.yaw = Math.PI
  }
  me.target = null
  me.path = []
  me.then = null
}

/** 가까운 엘리베이터 앞까지 걸어가서 탄다 */
export function walkToElevator() {
  const ex = ELEVATORS.reduce((a, b) => (Math.abs(b - me.pos.x) < Math.abs(a - me.pos.x) ? b : a))
  goTo(new Vector3(ex, 0, -8.3), 'board')
}

// ---------------------------------------------------------------- 색

const CREAM = '#f3e9da'
const TRIM = '#c2ab91'
const SKIRT = '#d9c6ad'
const STONE = '#e2d5c2'
const WOOD = '#cf955c'
const WOOD_D = '#b17a48'
const STEEL = '#cdd1d6'
const STEEL_D = '#a2a8b0'
const SOFA = '#f4ede1'
const DARK = '#34373e'

/** 소품 묶음을 위로 올린다 (탁자 위 화분 등) */
export const lift = (parts: Part[], dy: number): Part[] => parts.map((p) => ({ ...p, p: [p.p[0], p.p[1] + dy, p.p[2]] }))

// ---------------------------------------------------------------- 바닥·받침

const BASE: Part[] = (() => {
  const parts: Part[] = [
    // 바닥판과 흙 받침
    { k: 'box', p: [0.3, -0.75, 0.1], s: [27.6, 1.5, 21], c: '#dccab1' },
    { k: 'box', p: [0.3, -2.0, 0.9], s: [27.8, 1.0, 22.8], c: '#b98d64' },
    // 정문 앞 계단참 (한 단 낮음)
    { k: 'box', p: [-4.5, -0.85, 11.1], s: [18.6, 1.3, 1.9], c: '#e8dcc9' },
    { k: 'box', p: [-6, -0.18, 11.05], s: [4.6, 0.04, 1.4], c: '#4f6fb0' }, // 웰컴 매트
    { k: 'box', p: [-6, -0.17, 11.05], s: [4.2, 0.04, 1.0], c: '#5d7ec0' },
    // 오른쪽 가장자리 띠
    { k: 'box', p: [13.55, 0.02, 0.1], s: [0.5, 0.04, 20.4], c: '#ebe0ce' },
  ]
  // 계단처럼 깎인 흙 블록 (앞쪽·오른쪽)
  const soil = ['#c49a70', '#b58b62', '#a97f58', '#bb9168']
  for (let i = 0; i < 22; i++) {
    const x = -13 + i * 1.3
    const top = x > 5 ? -0.2 - hash(i, 3) * 0.6 : -1.0 - hash(i, 3) * 0.5
    parts.push({ k: 'box', p: [x, (top - 2.5) / 2, 12.35 + hash(i, 4) * 0.3], s: [1.3, top + 2.5, 0.9], c: soil[i % 4] })
  }
  for (let i = 0; i < 18; i++) {
    const z = -10 + i * 1.3
    const top = -0.3 - hash(i, 5) * 0.9
    parts.push({ k: 'box', p: [14.1 + hash(i, 6) * 0.25, (top - 2.5) / 2, z], s: [0.9, top + 2.5, 1.3], c: soil[(i + 1) % 4] })
  }
  // 바닥 띠 장식 (입구 → 엘리베이터로 이어지는 테두리)
  const band = '#dcc6a5'
  const r = { x0: -11, x1: 11.6, z0: -8.3, z1: 9 }
  parts.push(
    { k: 'box', p: [(r.x0 + r.x1) / 2, 0.012, r.z0], s: [r.x1 - r.x0, 0.02, 0.22], c: band },
    { k: 'box', p: [(r.x0 + r.x1) / 2, 0.012, r.z1], s: [r.x1 - r.x0, 0.02, 0.22], c: band },
    { k: 'box', p: [r.x0, 0.012, (r.z0 + r.z1) / 2], s: [0.22, 0.02, r.z1 - r.z0], c: band },
    { k: 'box', p: [r.x1, 0.012, (r.z0 + r.z1) / 2], s: [0.22, 0.02, r.z1 - r.z0], c: band },
  )
  return parts
})()

/** 크림색 대리석 타일 (4×4장 = 8m) */
let floorTex: CanvasTexture | null = null
export function floorTexture() {
  if (floorTex) return floorTex
  const c = document.createElement('canvas')
  c.width = c.height = 512
  const ctx = c.getContext('2d')!
  const tones = ['#f4e8d6', '#f0e2cd', '#f6ecdc', '#eedfc9', '#f2e5d1']
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++) {
      ctx.fillStyle = tones[Math.floor(hash(i, j, 9) * tones.length)]
      ctx.fillRect(i * 128, j * 128, 128, 128)
      // 은은한 광택
      const g = ctx.createLinearGradient(i * 128, j * 128, i * 128 + 128, j * 128 + 128)
      g.addColorStop(0, '#ffffff30')
      g.addColorStop(1, '#ffffff00')
      ctx.fillStyle = g
      ctx.fillRect(i * 128, j * 128, 128, 128)
    }
  ctx.strokeStyle = '#ddc9ae'
  ctx.lineWidth = 3
  for (let k = 0; k <= 4; k++) {
    ctx.beginPath()
    ctx.moveTo(k * 128, 0)
    ctx.lineTo(k * 128, 512)
    ctx.moveTo(0, k * 128)
    ctx.lineTo(512, k * 128)
    ctx.stroke()
  }
  floorTex = new CanvasTexture(c)
  floorTex.colorSpace = SRGBColorSpace
  floorTex.wrapS = floorTex.wrapT = RepeatWrapping
  floorTex.repeat.set((ROOM.x1 - ROOM.x0 + 0.6) / 8, (ROOM.z1 - ROOM.z0) / 8)
  floorTex.anisotropy = 4
  return floorTex
}

/** 엘리베이터 위 층 표시등: 검은 판에 주황 픽셀 '▲ 1' */
let indicatorTex: CanvasTexture | null = null
function indicatorTexture() {
  if (indicatorTex) return indicatorTex
  const c = document.createElement('canvas')
  c.width = 24
  c.height = 14
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#16171a'
  ctx.fillRect(0, 0, 24, 14)
  ctx.fillStyle = '#ffa224'
  for (let r = 0; r < 4; r++) ctx.fillRect(7 - r, 4 + r, r * 2 + 1, 1) // ▲
  ctx.fillRect(15, 3, 2, 8) // 1
  ctx.fillRect(14, 4, 1, 1)
  ctx.fillRect(14, 10, 4, 1)
  indicatorTex = new CanvasTexture(c)
  indicatorTex.magFilter = indicatorTex.minFilter = NearestFilter
  indicatorTex.colorSpace = SRGBColorSpace
  return indicatorTex
}

/** 창밖 풍경 (하늘, 언덕, 블록 나무) */
let outsideTex: CanvasTexture | null = null
function outsideTexture() {
  if (outsideTex) return outsideTex
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 160
  const ctx = c.getContext('2d')!
  const sky = ctx.createLinearGradient(0, 0, 0, 160)
  sky.addColorStop(0, '#8fc8f0')
  sky.addColorStop(1, '#d6eefb')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, 256, 160)
  ctx.fillStyle = '#ffffff'
  ;[[40, 30], [150, 22], [210, 45]].forEach(([x, y]) => {
    ctx.fillRect(x, y, 34, 9)
    ctx.fillRect(x + 8, y - 6, 18, 8)
  })
  ctx.fillStyle = '#86c76a'
  ctx.fillRect(0, 108, 256, 52)
  ctx.fillStyle = '#6fb456'
  for (let i = 0; i < 9; i++) {
    const x = i * 30 + hash(i, 1) * 10
    const h = 16 + hash(i, 2) * 18
    ctx.fillRect(x, 108 - h, 18, h)
    ctx.fillStyle = i % 2 ? '#6fb456' : '#5fa64a'
  }
  outsideTex = new CanvasTexture(c)
  outsideTex.colorSpace = SRGBColorSpace
  return outsideTex
}

// ---------------------------------------------------------------- 벽

const WALLS: Part[] = (() => {
  const parts: Part[] = [
    // 왼쪽 안벽 (x = -13)
    { k: 'box', p: [-13.3, H / 2, 0.1], s: [0.6, H, 20.6], c: CREAM },
    { p: [-13.25, H + 0.18, 0.1], s: [0.95, 0.36, 21], c: TRIM, rad: 0.08 },
    { k: 'box', p: [-12.97, 0.16, 0.1], s: [0.08, 0.32, 20], c: SKIRT },
    // 오른쪽 안벽 (z = -10)
    { k: 'box', p: [0.15, H / 2, -10.3], s: [26.9, H, 0.6], c: CREAM },
    { p: [0.1, H + 0.18, -10.25], s: [27.4, 0.36, 0.95], c: TRIM, rad: 0.08 },
    { k: 'box', p: [0.15, 0.16, -9.97], s: [26, 0.32, 0.08], c: SKIRT },
    // 모서리·벽 끝 기둥
    { p: [-13.2, H / 2 + 0.12, -10.2], s: [1.1, H + 0.6, 1.1], c: STONE, rad: 0.12 },
    { p: [-13.25, H / 2 + 0.12, 10.25], s: [0.95, H + 0.6, 0.95], c: STONE, rad: 0.12 },
    { p: [13.4, H / 2 + 0.12, -10.25], s: [0.95, H + 0.6, 0.95], c: STONE, rad: 0.12 },
    // 벽 위 간접 조명 받침
    { k: 'box', p: [-12.9, H - 0.25, 0.1], s: [0.18, 0.12, 19.6], c: TRIM },
    { k: 'box', p: [0.15, H - 0.25, -9.9], s: [25.4, 0.12, 0.18], c: TRIM },
  ]
  // 창문 (왼쪽 벽 앞쪽)
  const w = { z0: 3, z1: 9.4, y0: 0.75, y1: 4.35 }
  parts.push(
    { p: [-12.88, w.y0 - 0.08, (w.z0 + w.z1) / 2], s: [0.4, 0.18, w.z1 - w.z0 + 0.3], c: '#ece7df', rad: 0.05 },
    { p: [-12.9, w.y1 + 0.08, (w.z0 + w.z1) / 2], s: [0.32, 0.18, w.z1 - w.z0 + 0.3], c: '#dfe2e6', rad: 0.05 },
  )
  for (let i = 0; i <= 3; i++) {
    const z = w.z0 + ((w.z1 - w.z0) * i) / 3
    parts.push({ k: 'box', p: [-12.9, (w.y0 + w.y1) / 2, z], s: [0.2, w.y1 - w.y0, 0.16], c: '#dfe2e6' })
  }
  parts.push({ k: 'box', p: [-12.9, 2.55, (w.z0 + w.z1) / 2], s: [0.16, 0.1, w.z1 - w.z0], c: '#dfe2e6' })
  // 창 아래 화단
  parts.push({ p: [-12.25, 0.38, 6.2], s: [1.1, 0.76, 6], c: STONE, rad: 0.1 })
  for (let i = 0; i < 9; i++) {
    const z = 3.6 + i * 0.66
    const s = 0.7 + hash(i, 7) * 0.35
    parts.push({ k: 'ico', p: [-12.2 + (hash(i, 8) - 0.5) * 0.3, 0.85 + s * 0.3, z], s: [s, s * 0.9, s], c: i % 3 ? '#79bf58' : '#8fd06a' })
  }

  // 안내 데스크 뒤 나무 벽 (세로 판)
  const r = { z0: -8.9, z1: -3.1 }
  for (let z = r.z0; z < r.z1 - 0.1; z += 0.44) {
    parts.push({ k: 'box', p: [-12.94, (H - 0.3) / 2, z + 0.2], s: [0.12, H - 0.3, 0.38], c: hash(z * 10, 3) > 0.5 ? WOOD : '#c88d55' })
  }
  parts.push(
    { p: [-12.82, 3.1, -6], s: [0.22, 2.6, 3.7], c: WOOD_D, rad: 0.06 }, // 로고판 테
    // 조명 3개
    ...[-7.2, -6, -4.8].map((z): Part => ({ k: 'cyl', p: [-12.55, H - 0.45, z], s: [0.26, 0.2, 0.26], c: '#5b5249' })),
  )
  // 로고: 높이가 다른 금색 막대 (빌딩·차트 모양)
  ;[0.7, 1.05, 1.5, 1.15, 0.85].forEach((h, i) => {
    parts.push({ k: 'box', p: [-12.62, 2.35 + h / 2, -6.96 + i * 0.48], s: [0.1, h, 0.36], c: '#d39b45' })
  })
  parts.push({ k: 'box', p: [-12.62, 2.28, -6], s: [0.1, 0.08, 2.6], c: '#d39b45' })

  // 액자 + 커피 수납장 + 정수기 + 큰 화분
  parts.push(
    { p: [-12.92, 3.0, 0.1], s: [0.1, 1.15, 1.5], c: WOOD_D, rad: 0.03 },
    { k: 'box', p: [-12.86, 3.06, 0.1], s: [0.04, 0.85, 1.2], c: '#bfe0ef' },
    { k: 'box', p: [-12.84, 2.78, 0.1], s: [0.04, 0.3, 1.2], c: '#8cc56a' },
    { k: 'box', p: [-12.84, 2.98, 0.35], s: [0.04, 0.3, 0.3], c: '#6fb456' },
    { p: [-12.45, 0.55, 0.1], s: [0.95, 1.1, 2.4], c: WOOD, rad: 0.08 },
    { k: 'box', p: [-11.97, 0.55, -0.5], s: [0.02, 0.9, 1.0], c: WOOD_D },
    { k: 'box', p: [-11.97, 0.55, 0.7], s: [0.02, 0.9, 1.0], c: WOOD_D },
    { p: [-12.45, 1.15, 0.1], s: [1.05, 0.1, 2.5], c: '#9a6a3e', rad: 0.04 },
    { p: [-12.5, 1.48, -0.55], s: [0.5, 0.56, 0.5], c: '#4b5058', rad: 0.06 },
    { k: 'cyl', p: [-12.3, 1.27, -0.55], s: [0.16, 0.14, 0.16], c: '#fbfaf6' },
    { p: [-12.4, 0.72, 2.0], s: [0.62, 1.44, 0.62], c: '#eef1f3', rad: 0.08 },
    { k: 'cyl', p: [-12.4, 1.8, 2.0], s: [0.48, 0.72, 0.48], c: '#8fc6ee' },
    { k: 'box', p: [-12.08, 1.0, 2.0], s: [0.04, 0.12, 0.2], c: '#3d7fd0' },
  )
  parts.push(...lift(voxelPlant(-12.45, 0.6, 2, 0.45), 1.2))
  parts.push(...voxelPlant(-12.05, -2.2, 4, 1.55))
  return parts
})()

/** 조명·화면처럼 스스로 빛나는 부분 */
const WALL_GLOW: Part[] = [
  { k: 'box', p: [-12.69, 3.1, -6], s: [0.04, 2.3, 3.4], c: '#fff1d2' }, // 로고판 뒤 조명
  ...[-7.2, -6, -4.8].map((z): Part => ({ k: 'cyl', p: [-12.55, H - 0.56, z], s: [0.2, 0.03, 0.2], c: '#fff3d6' })),
  { k: 'box', p: [-12.8, H - 0.34, 0.1], s: [0.04, 0.06, 19.4], c: '#ffeccb' },
  { k: 'box', p: [0.15, H - 0.34, -9.8], s: [25.2, 0.06, 0.04], c: '#ffeccb' },
]

// ---------------------------------------------------------------- 안내 데스크

const TOP = '#f8f1e5'
const DESK: Part[] = [
  // 앞면 (방 쪽) + 양쪽 날개 = ㄷ자 데스크
  { p: [-8.95, 0.56, -6], s: [1.0, 1.12, 4.7], c: WOOD, rad: 0.14 },
  { k: 'box', p: [-8.42, 0.62, -6], s: [0.08, 0.86, 4.3], c: TOP },
  { p: [-8.8, 1.2, -6], s: [1.35, 0.14, 5.0], c: TOP, rad: 0.06 },
  { p: [-10.1, 0.56, -3.62], s: [1.6, 1.12, 0.9], c: WOOD, rad: 0.14 },
  { p: [-10.1, 1.2, -3.62], s: [1.8, 0.14, 1.1], c: TOP, rad: 0.06 },
  { p: [-10.1, 0.56, -8.38], s: [1.6, 1.12, 0.9], c: WOOD, rad: 0.14 },
  { p: [-10.1, 1.2, -8.38], s: [1.8, 0.14, 1.1], c: TOP, rad: 0.06 },
  { k: 'box', p: [-9.95, 0.85, -6], s: [0.9, 0.06, 3.9], c: '#e9dfcf' }, // 안쪽 작업대
  // 모니터·키보드·전화
  { p: [-9.55, 1.62, -6.5], s: [0.1, 0.62, 0.95], c: '#2b2e35', rad: 0.04 },
  { k: 'box', p: [-9.45, 1.3, -6.5], s: [0.12, 0.2, 0.12], c: '#2b2e35' },
  { k: 'box', p: [-9.95, 0.9, -6.5], s: [0.32, 0.04, 0.75], c: '#e1e4e8' },
  { p: [-8.75, 1.35, -4.4], s: [0.34, 0.16, 0.3], c: '#3a3d44', rad: 0.05 },
  // 꽃병
  { k: 'cyl', p: [-8.75, 1.45, -7.7], s: [0.3, 0.42, 0.3], c: '#78b9cb' },
  ...[[0, 0], [0.13, 0.08], [-0.12, 0.05], [0.04, -0.13], [-0.06, 0.14]].map(
    ([dx, dz], i): Part => ({ k: 'sphere', p: [-8.75 + dx, 1.82 + (i % 2) * 0.08, -7.7 + dz], s: [0.2, 0.18, 0.2], c: '#fbf8f0' }),
  ),
  { k: 'ico', p: [-8.75, 1.7, -7.7], s: [0.45, 0.25, 0.45], c: '#79bf58' },
  // 작은 화분
  ...lift(voxelPlant(-8.75, -5.0, 1, 0.3), 1.27),
]
const DESK_GLOW: Part[] = [{ k: 'box', p: [-9.61, 1.64, -6.5], s: [0.02, 0.5, 0.82], c: '#a7dcff' }]

// ---------------------------------------------------------------- 엘리베이터 벽 (z = -10)

const BACK: Part[] = (() => {
  const parts: Part[] = []
  // 책장
  parts.push({ p: [-7.7, 1.3, -9.6], s: [1.9, 2.6, 0.8], c: WOOD, rad: 0.06 })
  parts.push({ k: 'box', p: [-7.7, 1.3, -9.2], s: [1.6, 2.3, 0.04], c: WOOD_D })
  const books = ['#d9534a', '#3f7fc4', '#f2c230', '#5fa86a', '#e8854a', '#8a6ad0', '#f4efe2']
  ;[0.55, 1.2, 1.85].forEach((y, row) => {
    parts.push({ k: 'box', p: [-7.7, y - 0.05, -9.3], s: [1.6, 0.06, 0.5], c: WOOD })
    let x = -8.4
    for (let i = 0; i < 6; i++) {
      const w = 0.16 + hash(i, row, 2) * 0.08
      const h = 0.38 + hash(i, row, 3) * 0.14
      parts.push({ k: 'box', p: [x + w / 2, y + h / 2, -9.35], s: [w, h, 0.36], c: books[(i + row * 3) % books.length] })
      x += w + 0.04
    }
  })
  parts.push(...lift(voxelPlant(-8.1, -9.55, 3, 0.4), 2.6), ...lift(voxelPlant(-7.3, -9.55, 5, 0.35), 2.6))
  // 안내 책자 거치대
  parts.push({ p: [-5.3, 1.1, -9.45], s: [1.0, 2.2, 0.22], c: '#3e4047', r: [-0.12, 0, 0], rad: 0.04 })
  const covers = ['#8fc6ee', '#f2c230', '#7cc26a', '#f4efe2', '#e8854a', '#8fc6ee']
  covers.forEach((c, i) => {
    parts.push({ k: 'box', p: [-5.52 + (i % 2) * 0.44, 0.7 + Math.floor(i / 2) * 0.55, -9.31], s: [0.36, 0.44, 0.04], c, r: [-0.12, 0, 0] })
  })
  // 정보 화면 테 + 벽시계
  parts.push({ p: [-2.6, 2.55, -9.95], s: [2.0, 1.2, 0.1], c: '#2c2f36', rad: 0.04 })
  parts.push({ k: 'cyl', p: [-2.6, 4.25, -9.97], s: [0.86, 0.08, 0.86], c: WOOD_D, r: [Math.PI / 2, 0, 0] })
  parts.push({ k: 'cyl', p: [-2.6, 4.25, -9.92], s: [0.72, 0.06, 0.72], c: '#fbfaf6', r: [Math.PI / 2, 0, 0] })
  parts.push({ k: 'box', p: [-2.6, 4.4, -9.88], s: [0.05, 0.3, 0.02], c: DARK })
  parts.push({ k: 'box', p: [-2.5, 4.25, -9.88], s: [0.22, 0.05, 0.02], c: DARK })
  // 엘리베이터 사이 큰 화분, 휴지통
  parts.push(...voxelPlant(-0.6, -9.3, 6, 1.3))
  parts.push({ k: 'cyl', p: [9.0, 0.38, -9.5], s: [0.5, 0.76, 0.5], c: '#9aa1aa' }, { k: 'cyl', p: [9.0, 0.78, -9.5], s: [0.54, 0.06, 0.54], c: '#7d848d' })

  // 엘리베이터 두 대
  for (const ex of ELEVATORS) {
    parts.push(
      { p: [ex - 1.42, 1.86, -9.85], s: [0.46, 3.72, 0.42], c: STEEL, rad: 0.05 },
      { p: [ex + 1.42, 1.86, -9.85], s: [0.46, 3.72, 0.42], c: STEEL, rad: 0.05 },
      { p: [ex, 3.86, -9.85], s: [3.3, 0.5, 0.42], c: STEEL, rad: 0.05 },
      { k: 'box', p: [ex, 0.02, -9.55], s: [2.5, 0.04, 0.5], c: STEEL_D },
      // 층 표시등 판
      { p: [ex, 4.55, -9.92], s: [1.2, 0.82, 0.14], c: '#24262b', rad: 0.06 },
      // 호출 버튼 판
      { p: [ex + 1.98, 1.6, -9.95], s: [0.34, 0.7, 0.08], c: STEEL, rad: 0.04 },
    )
  }
  // 층 안내판
  parts.push({ p: [10.15, 2.75, -9.94], s: [1.3, 2.0, 0.1], c: '#474b53', rad: 0.05 })
  for (let i = 0; i < 6; i++) {
    parts.push(
      { k: 'box', p: [10.3, 3.45 - i * 0.28, -9.88], s: [0.75, 0.08, 0.02], c: '#d8dde3' },
      { k: 'box', p: [9.75, 3.45 - i * 0.28, -9.88], s: [0.12, 0.12, 0.02], c: '#f2c230' },
    )
  }
  // 소화기
  parts.push(
    { k: 'cyl', p: [11.05, 0.5, -9.7], s: [0.34, 0.8, 0.34], c: '#d8443a' },
    { k: 'box', p: [11.05, 1.0, -9.7], s: [0.14, 0.2, 0.14], c: DARK },
  )
  // 비상계단 나무문
  parts.push(
    { p: [12.15, 1.72, -9.96], s: [1.45, 3.44, 0.14], c: WOOD, rad: 0.04 },
    { k: 'box', p: [12.15, 1.72, -9.88], s: [1.2, 3.2, 0.02], c: '#c98a52' },
    { k: 'box', p: [11.6, 1.6, -9.84], s: [0.08, 0.3, 0.06], c: STEEL_D },
    { p: [12.15, 3.75, -9.93], s: [0.86, 0.34, 0.12], c: '#e8ece9', rad: 0.03 },
  )
  // 벤치 옆 작은 탁자 (오른쪽 끝)
  parts.push(
    { p: [12.3, 0.95, -3.5], s: [0.9, 0.1, 1.6], c: WOOD, rad: 0.04 },
    { k: 'box', p: [12.3, 0.46, -2.8], s: [0.7, 0.9, 0.1], c: WOOD_D },
    { k: 'box', p: [12.3, 0.46, -4.2], s: [0.7, 0.9, 0.1], c: WOOD_D },
    ...lift(voxelPlant(12.3, -3.9, 2, 0.35), 1.0),
    { k: 'box', p: [12.3, 1.15, -3.0], s: [0.3, 0.3, 0.06], c: '#f4efe2' },
  )
  return parts
})()

const BACK_GLOW: Part[] = [
  // 정보 화면: 파란 화면 + 흰 막대 그래프
  { k: 'box', p: [-2.6, 2.55, -9.89], s: [1.8, 1.0, 0.02], c: '#7fc4f2' },
  ...[0.3, 0.5, 0.4, 0.65, 0.8].map((h, i): Part => ({ k: 'box', p: [-3.2 + i * 0.3, 2.15 + h / 2, -9.87], s: [0.16, h, 0.01], c: '#ffffff' })),
  // 비상구 표시등
  { k: 'box', p: [12.15, 3.75, -9.86], s: [0.72, 0.24, 0.02], c: '#2fae5f' },
  // 엘리베이터 위 조명·호출 버튼
  ...ELEVATORS.flatMap((ex): Part[] => [
    { k: 'cyl', p: [ex, H - 0.55, -9.7], s: [0.34, 0.06, 0.34], c: '#fff3d6' },
    { k: 'sphere', p: [ex + 1.98, 1.74, -9.9], s: [0.14, 0.14, 0.05], c: '#ffb02e' },
    { k: 'sphere', p: [ex + 1.98, 1.46, -9.9], s: [0.14, 0.14, 0.05], c: '#ffe2a8' },
    // 문 너머 밝은 엘리베이터 안
    { k: 'box', p: [ex, 1.72, -9.99], s: [2.5, 3.44, 0.02], c: '#f1d6ae' },
  ]),
]

// ---------------------------------------------------------------- 대기 공간·입구

const LOUNGE: Part[] = (() => {
  const parts: Part[] = [
    // 러그
    { k: 'box', p: [1.2, 0.02, 2.1], s: [9.2, 0.04, 7], c: '#7d89ad' },
    { k: 'box', p: [1.2, 0.03, 2.1], s: [8.6, 0.04, 6.4], c: '#909dc2' },
    // 소파 A (등받이 왼쪽)
    { k: 'box', p: [-2.05, 0.09, 1.6], s: [1.25, 0.18, 3.3], c: WOOD_D },
    { p: [-2.0, 0.43, 1.6], s: [1.35, 0.5, 3.4], c: SOFA, rad: 0.18 },
    { p: [-2.62, 0.88, 1.6], s: [0.46, 1.0, 3.4], c: '#ede4d5', rad: 0.18 },
    { p: [-2.05, 0.68, -0.1], s: [1.45, 0.78, 0.42], c: '#ede4d5', rad: 0.16 },
    { p: [-2.05, 0.68, 3.3], s: [1.45, 0.78, 0.42], c: '#ede4d5', rad: 0.16 },
    // 소파 B (등받이 앞쪽)
    { k: 'box', p: [2.0, 0.09, 4.45], s: [3.3, 0.18, 1.25], c: WOOD_D },
    { p: [2.0, 0.43, 4.4], s: [3.4, 0.5, 1.35], c: SOFA, rad: 0.18 },
    { p: [2.0, 0.88, 5.02], s: [3.4, 1.0, 0.46], c: '#ede4d5', rad: 0.18 },
    { p: [0.1, 0.68, 4.45], s: [0.42, 0.78, 1.45], c: '#ede4d5', rad: 0.16 },
    { p: [3.9, 0.68, 4.45], s: [0.42, 0.78, 1.45], c: '#ede4d5', rad: 0.16 },
    // 1인 소파 (등받이 오른쪽)
    { k: 'box', p: [5.05, 0.09, 1.3], s: [1.2, 0.18, 1.2], c: WOOD_D },
    { p: [5.0, 0.43, 1.3], s: [1.3, 0.5, 1.35], c: SOFA, rad: 0.18 },
    { p: [5.6, 0.88, 1.3], s: [0.45, 1.0, 1.35], c: '#ede4d5', rad: 0.18 },
    { p: [5.05, 0.68, 0.5], s: [1.4, 0.78, 0.36], c: '#ede4d5', rad: 0.16 },
    { p: [5.05, 0.68, 2.1], s: [1.4, 0.78, 0.36], c: '#ede4d5', rad: 0.16 },
    // 커피 테이블
    { p: [1.3, 0.62, 1.7], s: [2.3, 0.14, 1.5], c: WOOD, rad: 0.05 },
    { k: 'box', p: [1.3, 0.25, 1.7], s: [2.0, 0.06, 1.2], c: WOOD_D },
    ...[[-1, -0.6], [1, -0.6], [-1, 0.6], [1, 0.6]].map(([dx, dz]): Part => ({ k: 'box', p: [1.3 + dx, 0.3, 1.7 + dz], s: [0.12, 0.6, 0.12], c: WOOD_D })),
    { k: 'box', p: [0.8, 0.71, 1.9], s: [0.6, 0.04, 0.45], c: '#f4efe2', r: [0, 0.3, 0] },
    { k: 'box', p: [0.85, 0.74, 1.85], s: [0.55, 0.03, 0.4], c: '#8fc6ee', r: [0, 0.1, 0] },
    { k: 'cyl', p: [1.85, 0.76, 1.4], s: [0.2, 0.14, 0.2], c: '#fbfaf6' },
    ...lift(voxelPlant(1.4, 1.8, 7, 0.32), 0.69),
    // 소파 사이 협탁 + 스탠드
    { p: [-2.0, 0.6, 4.4], s: [0.9, 0.1, 0.9], c: WOOD, rad: 0.04 },
    { k: 'box', p: [-2.0, 0.3, 4.4], s: [0.14, 0.6, 0.14], c: WOOD_D },
    { k: 'cyl', p: [-2.15, 0.9, 4.25], s: [0.06, 0.5, 0.06], c: '#7d848d' },
    ...lift(voxelPlant(-1.8, 4.55, 3, 0.3), 0.65),
  ]
  // 앞쪽 오른편 긴 화단
  parts.push({ p: [9.2, 0.45, 6.6], s: [5.2, 0.9, 1.7], c: '#b98f68', rad: 0.12 })
  parts.push({ k: 'box', p: [9.2, 0.91, 6.6], s: [4.8, 0.04, 1.3], c: '#6b4a32' })
  for (let i = 0; i < 10; i++) {
    const x = 7 + i * 0.48
    const s = 0.55 + hash(i, 11) * 0.45
    parts.push({ k: 'ico', p: [x, 1.0 + s * 0.35, 6.6 + (hash(i, 12) - 0.5) * 0.6], s: [s, s * 1.1, s], c: ['#79bf58', '#8fd06a', '#68b24c'][i % 3] })
    if (i % 3 === 1) parts.push({ k: 'sphere', p: [x + 0.1, 1.55 + s * 0.2, 6.3], s: [0.16, 0.16, 0.16], c: '#f4a6c8' })
  }
  // 벤치
  parts.push(
    { p: [5.0, 0.62, 8.45], s: [2.8, 0.12, 0.85], c: WOOD, rad: 0.04 },
    { k: 'box', p: [5.0, 0.69, 8.45], s: [2.7, 0.02, 0.03], c: WOOD_D },
    { k: 'box', p: [3.85, 0.3, 8.45], s: [0.12, 0.6, 0.75], c: '#6c737c' },
    { k: 'box', p: [6.15, 0.3, 8.45], s: [0.12, 0.6, 0.75], c: '#6c737c' },
    { k: 'cyl', p: [7.15, 0.4, 8.6], s: [0.5, 0.8, 0.5], c: '#9aa1aa' },
  )
  return parts
})()

const ENTRANCE: Part[] = (() => {
  const parts: Part[] = []
  // 유리문 틀 (정문 + 옆 유리벽)
  ;[-12.6, -9, -6, -3].forEach((x) => parts.push({ k: 'box', p: [x, 1.75, 10.05], s: [0.18, 3.5, 0.24], c: STEEL }))
  parts.push({ k: 'box', p: [-7.8, 3.55, 10.05], s: [9.7, 0.26, 0.28], c: STEEL })
  parts.push({ k: 'box', p: [-7.8, 0.04, 10.05], s: [9.7, 0.08, 0.28], c: STEEL_D })
  ;[-7.5, -4.5].forEach((x) => parts.push({ k: 'box', p: [x, 1.6, 10.12], s: [0.05, 0.7, 0.08], c: STEEL_D }))
  ;[-7.5, -4.5].forEach((x) => parts.push({ k: 'box', p: [x, 1.75, 10.05], s: [0.06, 3.4, 0.1], c: STEEL_D }))
  // 정문 옆 돌기둥 + 화분
  parts.push({ p: [-2.4, 1.95, 10.1], s: [0.9, 3.9, 0.9], c: STONE, rad: 0.1 })
  parts.push(...lift(voxelPlant(-2.4, 10.1, 4, 0.5), 3.9))
  parts.push(...voxelPlant(-10.3, 9.0, 1, 0.9))
  // 출입 게이트 (보안 개찰구)
  ;[-8.3, -6, -3.7].forEach((x) => {
    parts.push({ p: [x, 0.55, 7.9], s: [0.42, 1.1, 1.35], c: '#e1e4e8', rad: 0.08 })
    parts.push({ k: 'box', p: [x, 1.12, 7.9], s: [0.44, 0.04, 1.37], c: '#8f969f' })
  })
  // 보안 데스크 + 방문객 키오스크
  parts.push(
    { p: [0.4, 0.58, 8.4], s: [1.7, 1.16, 0.9], c: STONE, rad: 0.1 },
    { p: [0.4, 1.2, 8.4], s: [1.85, 0.1, 1.0], c: TOP, rad: 0.04 },
    { p: [0.4, 1.48, 8.25], s: [0.6, 0.42, 0.06], c: '#2b2e35', rad: 0.03 },
    { p: [-1.25, 0.65, 8.75], s: [0.5, 1.3, 0.4], c: '#4b5058', rad: 0.06 },
    { p: [-1.25, 1.45, 8.65], s: [0.62, 0.48, 0.12], c: '#4b5058', r: [-0.35, 0, 0], rad: 0.04 },
  )
  return parts
})()

const ENTRANCE_GLOW: Part[] = [
  ...[-8.3, -6, -3.7].map((x): Part => ({ k: 'box', p: [x, 1.15, 7.9], s: [0.2, 0.02, 0.6], c: '#7fd6a0' })),
  { k: 'box', p: [-1.25, 1.47, 8.58], s: [0.5, 0.36, 0.01], c: '#9fd8ff', r: [-0.35, 0, 0] },
]

// ---------------------------------------------------------------- 충돌

const BLOCKS: Rect[] = [
  [-13, -7.7, -9.4, -2.9], // 안내 데스크
  [-13, -11.4, -3.2, 2.6], // 큰 화분, 수납장, 정수기
  [-13, -11.5, 3, 10], // 창가 화단
  [-9, -6.6, -10, -9.0], // 책장
  [-5.9, -4.7, -10, -9.1], // 책자 거치대
  [-1.4, 0.2, -10, -8.6], // 화분
  [-2.8, 5.8, -0.5, 5.3], // 소파·테이블
  [6.5, 11.9, 5.7, 7.5], // 화단
  [3.6, 7.5, 7.9, 9.0], // 벤치·휴지통
  [11.7, 13, -4.5, -2.5], // 탁자
  [10.7, 11.4, -10, -9.3], // 소화기
  [8.6, 9.4, -10, -9.1], // 휴지통
  [-0.6, 1.4, 7.8, 9.0], // 보안 데스크
  [-1.6, -0.9, 8.4, 9.1], // 키오스크
  ...[-8.3, -6, -3.7].map((x): Rect => [x - 0.22, x + 0.22, 7.2, 8.6]), // 게이트
]
const RADIUS = 0.42
const BOUNDS = { x0: ROOM.x0 + 0.5, x1: ROOM.x1 - 0.2, z0: ROOM.z0 + 0.65, z1: ROOM.z1 - 0.4 }

const nav = makeNav(BLOCKS, BOUNDS, RADIUS)
const resolve = nav.resolve

function nearOf(p: Vector3): LobbyNear {
  if (p.z < -7.6 && ELEVATORS.some((ex) => Math.abs(p.x - ex) < 1.5)) return 'elevator'
  if (p.z > 8.7 && p.x > ENTRY.x0 && p.x < ENTRY.x1) return 'exit'
  return null
}

function goTo(to: Vector3, then: LobbyAction | null) {
  resolve(to)
  me.path = nav.findPath(me.pos, to)
  me.target = me.path.shift() ?? null
  me.then = then
}

// ---------------------------------------------------------------- 움직이는 것들

type Limbs = React.MutableRefObject<Object3D[]>

export function swingLimbs(L: Object3D[], swing: number, k: number) {
  if (L.length !== 4) return
  L[0].rotation.x += (swing - L[0].rotation.x) * k
  L[1].rotation.x += (-swing - L[1].rotation.x) * k
  L[2].rotation.x += (-swing * 0.8 - L[2].rotation.x) * k
  L[3].rotation.x += (swing * 0.8 - L[3].rotation.x) * k
}

export const glassMaterial = new MeshLambertMaterial({ color: '#cfeaf7', transparent: true, opacity: 0.3, depthWrite: false })

/** 엘리베이터 문: 사람이 앞에 오면 양쪽으로 열린다 */
function ElevatorDoors({ ex, onClick }: { ex: number; onClick: (e: ThreeEvent<MouseEvent>) => void }) {
  const left = useRef<Group>(null)
  const right = useRef<Group>(null)
  const open = useRef(0)
  const leaf = useMemo<Part[]>(
    () => [
      { k: 'box', p: [0, 1.72, 0], s: [1.2, 3.44, 0.08], c: '#cfd3d8' },
      { k: 'box', p: [0, 1.72, 0.045], s: [1.0, 3.2, 0.01], c: '#c3c8ce' },
    ],
    [],
  )
  useFrame((_, dt) => {
    const near = (p: Vector3) => Math.abs(p.x - ex) < 1.8 && p.z < -6.6
    const want = near(me.pos) || near(walker) ? 1 : 0
    open.current += (want - open.current) * Math.min(1, dt * 4)
    const o = open.current * 1.12
    if (left.current) left.current.position.x = ex - 0.61 - o
    if (right.current) right.current.position.x = ex + 0.61 + o
  })
  return (
    <group onClick={onClick}>
      <group ref={left} position={[ex - 0.61, 0, -9.93]}>
        <Prop id="lobby:leaf" parts={leaf} shadow={false} />
      </group>
      <group ref={right} position={[ex + 0.61, 0, -9.93]}>
        <Prop id="lobby:leaf" parts={leaf} shadow={false} />
      </group>
      {/* 층 표시등: 주황 픽셀 글씨 */}
      <mesh position={[ex, 4.55, -9.84]}>
        <planeGeometry args={[1.0, 0.58]} />
        <meshBasicMaterial map={indicatorTexture()} />
      </mesh>
    </group>
  )
}

/** 사람 한 명 (서 있기 / 앉기) */
export function Person({ look, p, yaw, sit }: { look: Look; p: [number, number, number]; yaw: number; sit?: boolean }) {
  const limbs = useRef<Object3D[]>([]) as Limbs
  const g = useRef<Group>(null)
  const seed = useMemo(() => Math.random() * 6, [])
  useFrame(({ clock }) => {
    const L = limbs.current
    if (sit && L.length === 4) {
      L[0].rotation.x = L[1].rotation.x = -Math.PI / 2
      L[2].rotation.x = L[3].rotation.x = -0.35
    }
    // 숨쉬듯 아주 살짝 움직인다
    if (g.current && !sit) g.current.rotation.y = yaw + Math.sin(clock.elapsedTime * 0.7 + seed) * 0.12
  })
  return (
    <group ref={g} position={p} rotation={[0, yaw, 0]} scale={PEOPLE_SCALE}>
      <Character nickname="" limbs={limbs} hideName look={look} />
    </group>
  )
}

/** 정문 → 엘리베이터 → 창가를 오가는 직원 */
const ROUTE: [number, number, number][] = [
  [-4.9, 6.2, 0],
  [-4.4, -1.8, 0],
  [ELEVATORS[1], -8.2, 2.4],
  [9.6, -1.5, 0],
  [9.2, 3.6, 1.2],
  [3.4, 6.6, 0],
]
function Walker() {
  const g = useRef<Group>(null)
  const limbs = useRef<Object3D[]>([]) as Limbs
  const st = useRef({ i: 0, wait: 1, t: 0 })
  const dir = useMemo(() => new Vector3(), [])
  useFrame((_, raw) => {
    const dt = Math.min(raw, 0.05)
    const s = st.current
    const node = g.current
    if (!node) return
    let moving = false
    if (s.wait > 0) s.wait -= dt
    else {
      const [tx, tz, pause] = ROUTE[s.i]
      dir.set(tx - walker.x, 0, tz - walker.z)
      const d = dir.length()
      if (d < 0.1) {
        s.wait = pause
        s.i = (s.i + 1) % ROUTE.length
      } else {
        dir.divideScalar(d)
        walker.addScaledVector(dir, Math.min(d, 2.4 * dt))
        moving = true
        const yaw = Math.atan2(dir.x, dir.z)
        let a = yaw - node.rotation.y
        a = Math.atan2(Math.sin(a), Math.cos(a))
        node.rotation.y += a * Math.min(1, dt * 8)
      }
    }
    node.position.copy(walker)
    s.t += moving ? dt * 8 : 0
    swingLimbs(limbs.current, moving ? Math.sin(s.t) * 0.6 : 0, Math.min(1, dt * 12))
  })
  return (
    <group ref={g} scale={PEOPLE_SCALE}>
      <Character nickname="" limbs={limbs} hideName look={{ shirt: '#5f8fd0', hair: '#22201f', cap: null }} />
      {/* 서류 가방 */}
      <mesh position={[0.5, 0.45, 0.05]} castShadow>
        <boxGeometry args={[0.18, 0.4, 0.5]} />
        <meshLambertMaterial color="#6b4a32" />
      </mesh>
    </group>
  )
}

const tmp = new Vector3()
const fwd = new Vector3()
const side = new Vector3()
const before = new Vector3()

/** 내 캐릭터: 바닥 클릭·키보드로 이동, 엘리베이터·정문 근처 감지 */
function Me({ nickname, onNear, onAction }: { nickname: string; onNear: (n: LobbyNear) => void; onAction: (a: LobbyAction) => void }) {
  const look = useMyLook()
  const g = useRef<Group>(null)
  const limbs = useRef<Object3D[]>([]) as Limbs
  const walkT = useRef(0)
  const lastNear = useRef<LobbyNear | undefined>(undefined)
  const marker = useRef<Group>(null)
  const camera = useThree((s) => s.camera)

  useFrame((_, raw) => {
    const dt = Math.min(raw, 0.05)
    const node = g.current
    if (!node) return
    const pos = me.pos
    before.copy(pos)
    let moving = false
    const { x: kx, z: kz } = player.keys
    if (kx || kz) {
      me.target = null
      me.path = []
      me.then = null
      camera.getWorldDirection(fwd)
      fwd.y = 0
      fwd.normalize()
      side.crossVectors(fwd, camera.up).normalize()
      tmp.set(0, 0, 0).addScaledVector(fwd, -kz).addScaledVector(side, kx).normalize()
      pos.addScaledVector(tmp, 4.6 * dt)
      moving = true
    } else if (me.target) {
      tmp.subVectors(me.target, pos)
      tmp.y = 0
      const d = tmp.length()
      if (d < 0.08) me.target = me.path.shift() ?? null
      else {
        tmp.divideScalar(d)
        pos.addScaledVector(tmp, Math.min(d, 4.6 * dt))
        moving = true
      }
    }
    resolve(pos)
    if (moving && me.target && pos.distanceToSquared(before) < 1e-6) {
      me.target = null // 막히면 멈춤
      me.path = []
    }
    if (moving) me.yaw += Math.atan2(Math.sin(Math.atan2(tmp.x, tmp.z) - me.yaw), Math.cos(Math.atan2(tmp.x, tmp.z) - me.yaw)) * Math.min(1, dt * 12)

    node.position.copy(pos)
    node.rotation.y = me.yaw
    walkT.current += moving ? dt * 10 : 0
    node.position.y = moving ? Math.abs(Math.sin(walkT.current)) * 0.06 : 0
    swingLimbs(limbs.current, moving ? Math.sin(walkT.current) * 0.7 : 0, Math.min(1, dt * 14))

    if (marker.current) {
      marker.current.visible = !!me.target
      if (me.target) marker.current.position.copy(me.path.length ? me.path[me.path.length - 1] : me.target)
    }

    const near = nearOf(pos)
    if (near !== lastNear.current) {
      lastNear.current = near
      onNear(near)
    }
    // 엘리베이터로 가기를 눌렀으면 도착하는 대로 탄다
    if (me.then && !me.target) {
      const a = me.then
      me.then = null
      if ((a === 'board' && near === 'elevator') || (a === 'exit' && near === 'exit')) onAction(a)
    }
  })

  return (
    <>
      <group ref={g} scale={PEOPLE_SCALE}>
        <Character nickname={nickname} limbs={limbs} look={look} />
      </group>
      <group ref={marker} visible={false}>
        <mesh position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.28, 0.42, 4]} />
          <meshBasicMaterial color="#e0902a" />
        </mesh>
      </group>
    </>
  )
}

/**
 * 아이소메트릭 카메라: 가로 화면은 로비 전체, 세로 화면은 확대해서 내 캐릭터를 따라간다.
 * 휠·핀치로 확대·축소하고, 확대할수록 내 캐릭터 쪽으로 따라간다.
 */
const VIEW = new Vector3(1, 0.92, 1.12).normalize()
const CENTER = new Vector3(0.2, 1.4, 0.8)
const ZOOM_MIN = 0.75
const ZOOM_MAX = 3
/** 기본 배율 대비 확대 배수 (로비를 다시 들어와도 유지) */
const view = { zoom: 1 }
const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z))

function LobbyCamera() {
  const camera = useThree((s) => s.camera) as OrthographicCamera
  const size = useThree((s) => s.size)
  const el = useThree((s) => s.gl.domElement)
  const look = useRef<Vector3 | null>(null)
  const zoomNow = useRef(view.zoom)

  // 휠 줌 + 두 손가락 핀치 줌
  useEffect(() => {
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      view.zoom = clampZoom(view.zoom * Math.exp(-e.deltaY * 0.0015))
    }
    let pinch: { dist: number; zoom: number } | null = null
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)
    const start = (e: TouchEvent) => {
      if (e.touches.length === 2) pinch = { dist: dist(e.touches), zoom: view.zoom }
    }
    const move = (e: TouchEvent) => {
      if (!pinch || e.touches.length !== 2) return
      e.preventDefault()
      view.zoom = clampZoom((pinch.zoom * dist(e.touches)) / pinch.dist)
    }
    const end = (e: TouchEvent) => {
      if (e.touches.length < 2) pinch = null
    }
    el.addEventListener('wheel', wheel, { passive: false })
    el.addEventListener('touchstart', start, { passive: true })
    el.addEventListener('touchmove', move, { passive: false })
    el.addEventListener('touchend', end)
    el.style.touchAction = 'none'
    return () => {
      el.removeEventListener('wheel', wheel)
      el.removeEventListener('touchstart', start)
      el.removeEventListener('touchmove', move)
      el.removeEventListener('touchend', end)
    }
  }, [el])

  useFrame((_, dt) => {
    const portrait = size.width < size.height * 0.9
    const base = portrait ? Math.min(size.width / 17, size.height / 24) : Math.min(size.width / 37, size.height / 25)
    zoomNow.current += (view.zoom - zoomNow.current) * Math.min(1, dt * 10)
    const zoom = base * zoomNow.current
    // 확대할수록 내 캐릭터를 따라간다 (세로 화면은 처음부터 따라감)
    const follow = Math.max(portrait ? 0.75 : 0, Math.min(1, (zoomNow.current - 1) / 0.8))
    const want = tmp.copy(CENTER).lerp(me.pos, follow * (portrait ? 1 : 0.9))
    if (portrait) want.setY(1.2)
    if (!look.current) look.current = want.clone()
    else look.current.lerp(want, Math.min(1, dt * 4))
    camera.position.copy(look.current).addScaledVector(VIEW, 80)
    camera.lookAt(look.current)
    if (Math.abs(camera.zoom - zoom) > 1e-3) {
      camera.zoom = zoom
      camera.updateProjectionMatrix()
    }
  })
  return null
}

const LOW_POWER = typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches || window.innerWidth < 768)

export function LobbyScene({
  nickname,
  onNear,
  onAction,
}: {
  nickname: string
  onNear: (n: LobbyNear) => void
  onAction: (a: LobbyAction) => void
}) {
  const walkTo = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    const to = new Vector3(e.point.x, 0, e.point.z)
    resolve(to)
    goTo(to, nearOf(to) === 'exit' ? 'exit' : null)
  }
  const toElevator = (ex: number) => (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    goTo(new Vector3(ex, 0, -8.3), 'board')
  }
  return (
    <Canvas
      shadows
      orthographic
      dpr={[1, 1.75]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      camera={{ position: [80, 80, 80], zoom: 20, near: 1, far: 400 }}
    >
      <color attach="background" args={['#f6eddf']} />
      <hemisphereLight args={['#fff6ea', '#c8a985', 1.45]} />
      <directionalLight
        position={[12, 24, 18]}
        intensity={1.7}
        color="#fff0dc"
        castShadow
        shadow-mapSize={LOW_POWER ? [1024, 1024] : [2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
        shadow-radius={4}
        shadow-camera-left={-22}
        shadow-camera-right={22}
        shadow-camera-top={22}
        shadow-camera-bottom={-22}
        shadow-camera-near={1}
        shadow-camera-far={80}
      />
      {/* 안내 데스크·엘리베이터 앞 따뜻한 조명 */}
      <pointLight position={[-11, 4.2, -6]} color="#ffd59a" intensity={40} distance={10} decay={2} />
      <pointLight position={[4.3, 4.4, -8]} color="#ffdcae" intensity={40} distance={11} decay={2} />

      <Prop id="lobby:base" parts={BASE} />
      <mesh position={[0.3, 0.005, 0.1]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow onClick={walkTo}>
        <planeGeometry args={[ROOM.x1 - ROOM.x0 + 0.6, ROOM.z1 - ROOM.z0 + 0.2]} />
        <meshLambertMaterial map={floorTexture()} />
      </mesh>
      <Prop id="lobby:walls" parts={WALLS} glow={WALL_GLOW} />
      <mesh position={[-12.95, 2.55, 6.2]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[6.4, 3.6]} />
        <meshBasicMaterial map={outsideTexture()} />
      </mesh>
      <Prop id="lobby:desk" parts={DESK} glow={DESK_GLOW} />
      <Prop id="lobby:back" parts={BACK} glow={BACK_GLOW} />
      <Prop id="lobby:lounge" parts={LOUNGE} />
      <Prop id="lobby:entrance" parts={ENTRANCE} glow={ENTRANCE_GLOW} />
      {/* 유리 (정문·옆 유리벽) */}
      <mesh position={[-7.8, 1.75, 10.05]} material={glassMaterial}>
        <boxGeometry args={[9.6, 3.4, 0.05]} />
      </mesh>
      {ELEVATORS.map((ex) => (
        <ElevatorDoors key={ex} ex={ex} onClick={toElevator(ex)} />
      ))}

      <Person look={{ shirt: '#2f3f6e', hair: '#3a2418', cap: null }} p={[-11.0, 0, -6]} yaw={Math.PI / 2} />
      <Person look={{ shirt: '#5fae5a', hair: '#4a2e1e', cap: null }} p={[-7.25, 0, -5.3]} yaw={-Math.PI / 2} />
      <Person look={{ shirt: '#e8854a', hair: '#d9a441', cap: null }} p={[-1.95, 0.1, 1.1]} yaw={Math.PI / 2} sit />
      <Walker />
      <Me nickname={nickname} onNear={onNear} onAction={onAction} />
      <LobbyCamera />
    </Canvas>
  )
}
