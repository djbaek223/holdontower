import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { CanvasTexture, Group, Object3D, OrthographicCamera, SRGBColorSpace, Vector3 } from 'three'
import { Prop, hash, type Part } from './lowpoly'
import { Character, lookOf, useMyLook, type Look } from './Player'
import { pixelTexture, voxelPlant } from './ElevatorScene'
import { PEOPLE_SCALE, Person, floorTexture, glassMaterial, lift, swingLimbs } from './LobbyScene'
import { repeated } from './patterns'
import { makeNav, type Rect } from './nav'
import { player } from '../store'
import type { LoungeSession } from '../lib/lounge'

/**
 * 층 라운지 (아이소메트릭 단면 디오라마, 30명 이상이 돌아다닐 수 있게 가운데를 비웠다).
 *  왼쪽 안벽 : 층 소식 게시판 + 디지털 안내판, 엘리베이터
 *  오른쪽 안벽: 독서 코너, 시장 뉴스 TV, 커피 코너
 *  앞·오른쪽 가장자리: 유리 난간, 화단, 벤치. 작은 소파 자리는 오른쪽 앞 구석에 모았다.
 */

const ROOM = { x0: -16, x1: 16, z0: -12, z1: 12, h: 5.4 }
const H = ROOM.h
/** 엘리베이터 문 (왼쪽 벽) */
const LIFT_Z = 7.2
/** 소식 게시판 (왼쪽 벽) */
const BOARD = { z0: -10, z1: -1.4 }

export type LoungeNear = 'elevator' | 'board' | null

const CREAM = '#f3e9da'
const TRIM = '#c2ab91'
const SKIRT = '#d9c6ad'
const STONE = '#e2d5c2'
const WOOD = '#cf955c'
const WOOD_D = '#b17a48'
const STEEL = '#cdd1d6'
const SOFA = '#f4ede1'
const SAGE = '#9cbf86'
const DARK = '#34373e'

/** 내 캐릭터 상태 (매 프레임 바뀌므로 store 밖) */
const me = { pos: new Vector3(), yaw: Math.PI / 2, target: null as Vector3 | null, path: [] as Vector3[] }

export function spawnLounge() {
  // 엘리베이터 앞, 다른 사람과 겹치지 않게 조금씩 흩어서
  me.pos.set(-13.2 + Math.random() * 1.2, 0, LIFT_Z - 0.9 + Math.random() * 1.8)
  me.yaw = Math.PI / 2
  me.target = null
  me.path = []
}

// ---------------------------------------------------------------- 바닥·받침

const BASE: Part[] = (() => {
  const parts: Part[] = [
    { k: 'box', p: [0.2, -0.75, 0.2], s: [32.6, 1.5, 24.6], c: '#dccab1' },
    { k: 'box', p: [0.2, -2.0, 0.6], s: [32.8, 1.0, 25.6], c: '#b98d64' },
  ]
  const soil = ['#c49a70', '#b58b62', '#a97f58', '#bb9168']
  for (let i = 0; i < 26; i++) {
    const x = -16 + i * 1.3
    const top = -0.4 - hash(i, 21) * 0.9
    parts.push({ k: 'box', p: [x, (top - 2.5) / 2, 12.9 + hash(i, 22) * 0.3], s: [1.3, top + 2.5, 0.9], c: soil[i % 4] })
  }
  for (let i = 0; i < 20; i++) {
    const z = -12 + i * 1.3
    const top = -0.3 - hash(i, 23) * 0.9
    parts.push({ k: 'box', p: [16.9 + hash(i, 24) * 0.25, (top - 2.5) / 2, z], s: [0.9, top + 2.5, 1.3], c: soil[(i + 2) % 4] })
  }
  // 가운데 모임 자리 바닥 띠 (가구 없이 넓게)
  const band = '#dcc6a5'
  const r = { x0: -9, x1: 8, z0: -6, z1: 6.5 }
  parts.push(
    { k: 'box', p: [(r.x0 + r.x1) / 2, 0.012, r.z0], s: [r.x1 - r.x0, 0.02, 0.22], c: band },
    { k: 'box', p: [(r.x0 + r.x1) / 2, 0.012, r.z1], s: [r.x1 - r.x0, 0.02, 0.22], c: band },
    { k: 'box', p: [r.x0, 0.012, (r.z0 + r.z1) / 2], s: [0.22, 0.02, r.z1 - r.z0], c: band },
    { k: 'box', p: [r.x1, 0.012, (r.z0 + r.z1) / 2], s: [0.22, 0.02, r.z1 - r.z0], c: band },
  )
  return parts
})()

// ---------------------------------------------------------------- 벽

const WALLS: Part[] = (() => {
  const parts: Part[] = [
    { k: 'box', p: [-16.3, H / 2, 0.1], s: [0.6, H, 24.6], c: CREAM },
    { p: [-16.25, H + 0.18, 0.1], s: [0.95, 0.36, 25], c: TRIM, rad: 0.08 },
    { k: 'box', p: [-15.97, 0.16, 0.1], s: [0.08, 0.32, 24], c: SKIRT },
    { k: 'box', p: [0.15, H / 2, -12.3], s: [32.9, H, 0.6], c: CREAM },
    { p: [0.1, H + 0.18, -12.25], s: [33.4, 0.36, 0.95], c: TRIM, rad: 0.08 },
    { k: 'box', p: [0.15, 0.16, -11.97], s: [32, 0.32, 0.08], c: SKIRT },
    { p: [-16.2, H / 2 + 0.12, -12.2], s: [1.1, H + 0.6, 1.1], c: STONE, rad: 0.12 },
    { p: [-16.25, H / 2 + 0.12, 12.25], s: [0.95, H + 0.6, 0.95], c: STONE, rad: 0.12 },
    { p: [16.4, H / 2 + 0.12, -12.25], s: [0.95, H + 0.6, 0.95], c: STONE, rad: 0.12 },
    { k: 'box', p: [-15.9, H - 0.25, 0.1], s: [0.18, 0.12, 23.6], c: TRIM },
    { k: 'box', p: [0.15, H - 0.25, -11.9], s: [31.4, 0.12, 0.18], c: TRIM },
  ]
  // 벽 조명 (작은 원통)
  for (let z = -10.5; z <= 10; z += 3.5) parts.push({ k: 'cyl', p: [-15.6, H - 0.45, z], s: [0.24, 0.18, 0.24], c: '#5b5249' })
  for (let x = -13.5; x <= 14; x += 3.5) parts.push({ k: 'cyl', p: [x, H - 0.45, -11.6], s: [0.24, 0.18, 0.24], c: '#5b5249' })
  // 나무 기둥 장식 (참고 이미지의 세로 나무판)
  for (const x of [-7.6, 6.6]) parts.push({ k: 'box', p: [x, H / 2, -11.93], s: [1.2, H - 0.1, 0.12], c: WOOD })
  return parts
})()

const WALL_GLOW: Part[] = [
  ...Array.from({ length: 7 }, (_, i): Part => ({ k: 'cyl', p: [-15.6, H - 0.56, -10.5 + i * 3.5], s: [0.18, 0.03, 0.18], c: '#fff3d6' })),
  ...Array.from({ length: 9 }, (_, i): Part => ({ k: 'cyl', p: [-13.5 + i * 3.5, H - 0.56, -11.6], s: [0.18, 0.03, 0.18], c: '#fff3d6' })),
  { k: 'box', p: [-15.8, H - 0.34, 0.1], s: [0.04, 0.06, 23.4], c: '#ffeccb' },
  { k: 'box', p: [0.15, H - 0.34, -11.8], s: [31.2, 0.06, 0.04], c: '#ffeccb' },
]

// ---------------------------------------------------------------- 왼쪽 벽: 소식 게시판, 안내판, 엘리베이터

const LEFT: Part[] = (() => {
  const parts: Part[] = []
  const zc = (BOARD.z0 + BOARD.z1) / 2
  const w = BOARD.z1 - BOARD.z0
  // 코르크 게시판 + 나무 테
  parts.push(
    { p: [-15.88, 2.65, zc], s: [0.2, 2.9, w + 0.3], c: WOOD_D, rad: 0.06 },
    { k: 'box', p: [-15.77, 2.65, zc], s: [0.04, 2.6, w], c: '#d8b98e' },
    { p: [-15.72, 1.08, zc], s: [0.32, 0.1, w + 0.2], c: WOOD, rad: 0.03 }, // 아래 받침
    // 위쪽 검은 이름판 (막대 그래프 아이콘)
    { p: [-15.85, 4.42, zc], s: [0.14, 0.62, 2.4], c: '#2b2e35', rad: 0.06 },
  )
  // 포스터와 공지 (색 종이)
  const papers = ['#fbf8f0', '#bfe0ef', '#f6d9a8', '#d7ecc9', '#f4c6c0', '#fbf8f0', '#e6dcf3']
  let i = 0
  for (let z = BOARD.z0 + 0.6; z < BOARD.z1 - 0.6; z += 1.45) {
    for (const [y, h] of [[3.3, 1.2], [1.95, 1.0]] as const) {
      const ww = 0.95 + hash(i, 3) * 0.3
      parts.push({ k: 'box', p: [-15.74, y + (hash(i, 4) - 0.5) * 0.15, z + (hash(i, 5) - 0.5) * 0.2], s: [0.03, h, ww], c: papers[i % papers.length], r: [(hash(i, 6) - 0.5) * 0.08, 0, 0] })
      // 종이 위 글줄·그림
      parts.push({ k: 'box', p: [-15.72, y + h * 0.25, z], s: [0.02, 0.12, ww * 0.7], c: ['#5d7ec0', '#c06a5d', '#5fa86a'][i % 3] })
      for (let l = 0; l < 3; l++) parts.push({ k: 'box', p: [-15.72, y - l * 0.16, z], s: [0.02, 0.05, ww * 0.65], c: '#a9a39a' })
      parts.push({ k: 'sphere', p: [-15.7, y + h / 2 - 0.08, z], s: [0.09, 0.09, 0.05], c: ['#d9534a', '#3f7fc4', '#f2c230'][i % 3] }) // 압정
      i++
    }
  }
  // 디지털 안내판 테
  parts.push({ p: [-15.9, 2.7, 0.2], s: [0.14, 2.1, 2.2], c: '#2c2f36', rad: 0.05 })
  // 정수기 + 책자 거치대
  parts.push(
    { p: [-15.4, 0.72, 2.3], s: [0.62, 1.44, 0.62], c: '#eef1f3', rad: 0.08 },
    { k: 'cyl', p: [-15.4, 1.8, 2.3], s: [0.48, 0.72, 0.48], c: '#8fc6ee' },
    { p: [-15.4, 0.75, 3.6], s: [0.3, 1.5, 1.0], c: WOOD, rad: 0.04, r: [0, 0, 0.1] },
    ...['#8fc6ee', '#f2c230', '#7cc26a', '#f4efe2'].map((c, k): Part => ({ k: 'box', p: [-15.22, 0.5 + Math.floor(k / 2) * 0.55, 3.38 + (k % 2) * 0.44], s: [0.04, 0.44, 0.36], c, r: [0, 0, 0.1] })),
  )
  // 엘리베이터 (문 + 스테인리스 테 + 층 표시판)
  parts.push(
    { p: [-15.85, 1.86, LIFT_Z - 1.42], s: [0.42, 3.72, 0.46], c: STEEL, rad: 0.05 },
    { p: [-15.85, 1.86, LIFT_Z + 1.42], s: [0.42, 3.72, 0.46], c: STEEL, rad: 0.05 },
    { p: [-15.85, 3.86, LIFT_Z], s: [0.42, 0.5, 3.3], c: STEEL, rad: 0.05 },
    { k: 'box', p: [-15.93, 1.72, LIFT_Z - 0.61], s: [0.08, 3.44, 1.2], c: '#cfd3d8' },
    { k: 'box', p: [-15.93, 1.72, LIFT_Z + 0.61], s: [0.08, 3.44, 1.2], c: '#cfd3d8' },
    { p: [-15.92, 4.55, LIFT_Z], s: [0.14, 0.8, 1.2], c: '#24262b', rad: 0.06 },
    { p: [-15.95, 1.6, LIFT_Z + 1.98], s: [0.08, 0.7, 0.34], c: STEEL, rad: 0.04 },
  )
  // 큰 화분들
  parts.push(...voxelPlant(-15.2, -11.2, 2, 1.5), ...voxelPlant(-15.1, 0.9 + 4.6, 5, 1.2), ...voxelPlant(-15.2, 10.8, 3, 1.3))
  return parts
})()

const LEFT_GLOW: Part[] = [
  { k: 'box', p: [-15.82, 2.7, 0.2], s: [0.02, 1.9, 2.0], c: '#9fd3f5' },
  ...[0.5, 0.8, 0.65, 1.1, 1.35].map((h, i): Part => ({ k: 'box', p: [-15.8, 2.0 + h / 2, -0.5 + i * 0.35], s: [0.01, h, 0.2], c: '#ffffff' })),
  ...[0.18, 0.28, 0.38, 0.5].map((h, i): Part => ({ k: 'box', p: [-15.77, 4.3 + h / 2 - 0.2, -6.1 + i * 0.2], s: [0.01, h, 0.12], c: '#f6f1e7' })),
  { k: 'sphere', p: [-15.9, 1.72, LIFT_Z + 1.98], s: [0.05, 0.14, 0.14], c: '#ffb02e' },
]

// ---------------------------------------------------------------- 오른쪽 벽: 독서 코너, 뉴스 TV, 커피 코너

function armchair(x: number, z: number, yaw: number, c: string): Part[] {
  // yaw 0 = 앞(+z)을 본다
  const rot = (dx: number, dz: number): [number, number] => [x + dx * Math.cos(yaw) + dz * Math.sin(yaw), z - dx * Math.sin(yaw) + dz * Math.cos(yaw)]
  const P = (dx: number, y: number, dz: number, s: [number, number, number], col: string): Part => {
    const [px, pz] = rot(dx, dz)
    return { p: [px, y, pz], s, c: col, r: [0, yaw, 0], rad: 0.14 }
  }
  return [
    P(0, 0.4, 0, [1.2, 0.42, 1.1], c),
    P(0, 0.85, -0.45, [1.2, 0.95, 0.3], c),
    P(-0.55, 0.62, 0, [0.22, 0.6, 1.1], c),
    P(0.55, 0.62, 0, [0.22, 0.6, 1.1], c),
    { ...P(0, 0.1, 0, [1.0, 0.2, 0.9], WOOD_D), k: 'box' },
  ]
}
function roundTable(x: number, z: number, r = 0.5, h = 0.7): Part[] {
  return [
    { k: 'cyl', p: [x, h, z], s: [r * 2, 0.08, r * 2], c: WOOD },
    { k: 'cyl', p: [x, h / 2, z], s: [0.12, h, 0.12], c: WOOD_D },
    { k: 'cyl', p: [x, 0.03, z], s: [0.6, 0.06, 0.6], c: WOOD_D },
  ]
}
function floorLamp(x: number, z: number): Part[] {
  return [
    { k: 'cyl', p: [x, 0.04, z], s: [0.4, 0.08, 0.4], c: '#6c737c' },
    { k: 'cyl', p: [x, 0.8, z], s: [0.06, 1.6, 0.06], c: '#6c737c' },
  ]
}
const lampShade = (x: number, z: number): Part => ({ k: 'cone', p: [x, 1.75, z], s: [0.55, 0.45, 0.55], c: '#fff1cf', seg: 10 })

const BACK: Part[] = (() => {
  const parts: Part[] = []
  // 독서 코너: 책장 + 초록 안락의자 2 + 둥근 탁자 + 스탠드
  parts.push({ p: [-11.6, 1.45, -11.6], s: [3.4, 2.9, 0.8], c: WOOD, rad: 0.06 })
  parts.push({ k: 'box', p: [-11.6, 1.45, -11.2], s: [3.1, 2.6, 0.04], c: WOOD_D })
  const books = ['#d9534a', '#3f7fc4', '#f2c230', '#5fa86a', '#e8854a', '#8a6ad0', '#f4efe2']
  ;[0.5, 1.2, 1.9].forEach((y, row) => {
    parts.push({ k: 'box', p: [-11.6, y - 0.05, -11.3], s: [3.1, 0.06, 0.5], c: WOOD })
    let x = -12.95
    for (let k = 0; k < 11; k++) {
      const w = 0.16 + hash(k, row, 7) * 0.08
      const h = 0.38 + hash(k, row, 8) * 0.16
      if (k === 5 + row) {
        x += 0.35 // 빈칸 (작은 장식)
        continue
      }
      parts.push({ k: 'box', p: [x + w / 2, y + h / 2, -11.35], s: [w, h, 0.36], c: books[(k + row * 3) % books.length] })
      x += w + 0.04
    }
  })
  parts.push(...lift(voxelPlant(-12.6, -11.6, 3, 0.38), 2.9), ...lift(voxelPlant(-10.6, -11.6, 5, 0.38), 2.9))
  parts.push(...armchair(-12.4, -8.9, 0.5, SAGE), ...armchair(-9.6, -9.1, -0.4, SAGE), ...roundTable(-11.0, -8.4, 0.55, 0.62))
  parts.push({ k: 'cyl', p: [-11.0, 0.78, -8.4], s: [0.26, 0.26, 0.26], c: '#78b9cb' }, { k: 'ico', p: [-11.0, 1.02, -8.4], s: [0.4, 0.26, 0.4], c: '#fbf8f0' })
  parts.push(...floorLamp(-8.4, -10.9))
  // 액자 + 화분
  parts.push(
    { p: [-5.6, 3.1, -11.94], s: [1.4, 1.6, 0.1], c: WOOD_D, rad: 0.03 },
    { k: 'box', p: [-5.6, 3.1, -11.87], s: [1.15, 1.3, 0.02], c: '#bfe0ef' },
    { k: 'box', p: [-5.6, 2.75, -11.86], s: [1.15, 0.5, 0.02], c: '#7cc26a' },
    { k: 'box', p: [-5.6, 3.15, -11.85], s: [0.5, 0.5, 0.02], c: '#e8a85a', r: [0, 0, Math.PI / 4] },
  )
  parts.push(...voxelPlant(-4.4, -11.2, 1, 1.45))
  // 시장 뉴스 TV 테 + 미디어 장
  parts.push({ p: [1, 2.95, -11.92], s: [7.4, 4.1, 0.16], c: '#26282d', rad: 0.08 })
  parts.push(
    { p: [1, 0.42, -11.4], s: [6.4, 0.84, 1.0], c: WOOD, rad: 0.08 },
    { k: 'box', p: [1, 0.42, -10.89], s: [6.2, 0.04, 0.02], c: WOOD_D },
    { p: [1.8, 0.95, -11.4], s: [1.4, 0.22, 0.6], c: DARK, rad: 0.04 },
    { k: 'box', p: [-1.2, 1.05, -11.4], s: [0.5, 0.4, 0.4], c: '#f4efe2' },
    { k: 'box', p: [-0.6, 1.0, -11.4], s: [0.3, 0.3, 0.4], c: '#8fc6ee' },
  )
  parts.push(...voxelPlant(-3.1, -11.3, 4, 1.0), ...voxelPlant(5.4, -11.2, 6, 1.4))
  // 커피 코너: 조리대 + 머신 + 컵 + 선반
  parts.push(
    { p: [10.8, 0.55, -11.5], s: [5.6, 1.1, 1.0], c: WOOD, rad: 0.08 },
    { p: [10.8, 1.14, -11.45], s: [5.8, 0.1, 1.15], c: '#f8f1e5', rad: 0.04 },
    ...[8.6, 10.8, 13].map((x): Part => ({ k: 'box', p: [x, 0.55, -10.98], s: [1.6, 0.85, 0.02], c: WOOD_D })),
    { p: [9.0, 1.62, -11.6], s: [0.8, 0.86, 0.6], c: '#4b5058', rad: 0.08 },
    { p: [10.3, 1.55, -11.6], s: [0.7, 0.72, 0.6], c: '#c9ccd0', rad: 0.08 },
    { k: 'box', p: [9.0, 1.42, -11.28], s: [0.3, 0.3, 0.04], c: '#24262b' },
  )
  for (let k = 0; k < 6; k++) parts.push({ k: 'cyl', p: [11.4 + (k % 3) * 0.32, 1.27 + Math.floor(k / 3) * 0.2, -11.5 + Math.floor(k / 3) * 0.1], s: [0.22, 0.2, 0.22], c: k % 2 ? '#fbfaf6' : '#e8d3b5' })
  parts.push({ p: [12.9, 1.45, -11.55], s: [0.9, 0.5, 0.45], c: '#f2c98a', rad: 0.08 }) // 간식 바구니
  for (const y of [2.6, 3.5]) {
    parts.push({ p: [11.2, y, -11.75], s: [3.4, 0.1, 0.5], c: WOOD, rad: 0.03 })
    for (let k = 0; k < 6; k++) parts.push({ k: 'cyl', p: [9.8 + k * 0.55, y + 0.22, -11.75], s: [0.26, 0.34, 0.26], c: ['#c98a52', '#7cc26a', '#e8d3b5', '#d9534a'][(k + (y > 3 ? 1 : 0)) % 4] })
  }
  parts.push(...lift(voxelPlant(12.9, -11.75, 2, 0.32), 3.58))
  parts.push({ p: [14.9, 0.72, -11.2], s: [0.62, 1.44, 0.62], c: '#eef1f3', rad: 0.08 }, { k: 'cyl', p: [14.9, 1.8, -11.2], s: [0.48, 0.72, 0.48], c: '#8fc6ee' })
  parts.push(...voxelPlant(7.4, -11.2, 7, 1.2))
  // 액자 (커피 코너 위)
  parts.push({ p: [14.5, 3.2, -11.94], s: [1.1, 1.3, 0.1], c: WOOD_D, rad: 0.03 }, { k: 'box', p: [14.5, 3.25, -11.87], s: [0.85, 1.0, 0.02], c: '#f6d9a8' })
  // 소화기
  parts.push({ k: 'cyl', p: [15.7, 0.5, -9.6], s: [0.34, 0.8, 0.34], c: '#d8443a' })
  return parts
})()

const BACK_GLOW: Part[] = [lampShade(-8.4, -10.9), { k: 'box', p: [9.0, 1.85, -11.28], s: [0.3, 0.08, 0.02], c: '#7fd6a0' }]

// ---------------------------------------------------------------- 앞·오른쪽 가장자리, 소파 자리

const EDGE: Part[] = (() => {
  const parts: Part[] = []
  // 유리 난간 기둥 (앞 z = 12, 오른쪽 x = 16)
  for (let x = -15; x <= 15; x += 2.5) {
    if (x > -4.5 && x < -1) continue // 화단 자리
    parts.push({ p: [x, 0.62, 12], s: [0.16, 1.24, 0.16], c: '#e6e8eb', rad: 0.04 })
  }
  parts.push({ p: [0, 1.27, 12], s: [32, 0.1, 0.2], c: '#e6e8eb', rad: 0.04 })
  for (let z = -10; z <= 12; z += 2.5) parts.push({ p: [16, 0.62, z], s: [0.16, 1.24, 0.16], c: '#e6e8eb', rad: 0.04 })
  parts.push({ p: [16, 1.27, 0], s: [0.2, 0.1, 24], c: '#e6e8eb', rad: 0.04 })
  // 화단 (앞 가운데, 앞 왼쪽 구석, 오른쪽 앞 구석)
  const planter = (x: number, z: number, w: number, d: number, seed: number) => {
    parts.push({ p: [x, 0.45, z], s: [w, 0.9, d], c: '#efe7da', rad: 0.12 }, { k: 'box', p: [x, 0.91, z], s: [w - 0.3, 0.04, d - 0.3], c: '#6b4a32' })
    const n = Math.round(w / 0.55)
    for (let k = 0; k < n; k++) {
      const s = 0.55 + hash(k, seed) * 0.5
      parts.push({ k: 'ico', p: [x - w / 2 + 0.35 + k * ((w - 0.7) / Math.max(1, n - 1)), 1.0 + s * 0.35, z + (hash(k, seed + 1) - 0.5) * (d - 0.8)], s: [s, s * 1.1, s], c: ['#79bf58', '#8fd06a', '#68b24c'][k % 3] })
      if (k % 2) parts.push({ k: 'sphere', p: [x - w / 2 + 0.5 + k * ((w - 0.7) / Math.max(1, n - 1)), 1.55, z + 0.2], s: [0.16, 0.16, 0.16], c: k % 4 === 1 ? '#fbf8f0' : '#f4a6c8' })
    }
  }
  planter(-2.7, 11.6, 3.2, 1.4, 31)
  planter(-14.4, 11.4, 2.4, 1.6, 33)
  planter(15.1, 11.0, 1.6, 2.2, 35)
  // 난간 앞 벤치 2개
  for (const x of [-9, 4.5]) {
    parts.push(
      { p: [x, 0.62, 11.1], s: [3.2, 0.12, 0.85], c: WOOD, rad: 0.04 },
      { k: 'box', p: [x - 1.35, 0.3, 11.1], s: [0.12, 0.6, 0.75], c: '#6c737c' },
      { k: 'box', p: [x + 1.35, 0.3, 11.1], s: [0.12, 0.6, 0.75], c: '#6c737c' },
    )
  }
  // 오른쪽 앞 구석 작은 소파 자리 (러그 + 소파 2 + 의자 2 + 탁자 3)
  parts.push({ k: 'box', p: [11.6, 0.02, 5.6], s: [6.2, 0.04, 6.0], c: '#7d89ad' }, { k: 'box', p: [11.6, 0.03, 5.6], s: [5.6, 0.04, 5.4], c: '#909dc2' })
  const sofa = (x: number, z: number, along: 'x' | 'z', back: 1 | -1, c: string) => {
    const L = 2.6
    const [sx, sz] = along === 'z' ? [1.2, L] : [L, 1.2]
    const bx = along === 'z' ? x + back * 0.52 : x
    const bz = along === 'z' ? z : z + back * 0.52
    parts.push(
      { k: 'box', p: [x, 0.09, z], s: [sx - 0.1, 0.18, sz - 0.1], c: WOOD_D },
      { p: [x, 0.43, z], s: [sx, 0.48, sz], c, rad: 0.18 },
      { p: [bx, 0.88, bz], s: along === 'z' ? [0.42, 0.95, sz] : [sx, 0.95, 0.42], c, rad: 0.18 },
    )
    // 쿠션
    for (const o of [-0.6, 0.6]) {
      const cx = along === 'z' ? bx - back * 0.25 : x + o
      const cz = along === 'z' ? z + o : bz - back * 0.25
      parts.push({ p: [cx, 0.85, cz], s: along === 'z' ? [0.2, 0.5, 0.5] : [0.5, 0.5, 0.2], c: o < 0 ? '#5d7ec0' : '#f2c230', rad: 0.12 })
    }
  }
  sofa(14.2, 5.6, 'z', 1, SOFA)
  sofa(11.4, 8.0, 'x', 1, SOFA)
  parts.push(...armchair(9.0, 3.4, Math.PI / 2 + 0.4, '#a9c4e6'), ...armchair(12.0, 2.9, Math.PI - 0.1, '#a9c4e6'))
  parts.push(...roundTable(11.6, 5.4, 0.7, 0.5), ...roundTable(9.2, 6.6, 0.4, 0.55), ...roundTable(14.4, 8.4, 0.4, 0.55))
  parts.push(...lift(voxelPlant(11.6, 5.4, 2, 0.32), 0.54), { k: 'box', p: [11.3, 0.56, 5.7], s: [0.5, 0.04, 0.4], c: '#f4efe2', r: [0, 0.3, 0] })
  parts.push(...floorLamp(15.2, 3.2), ...floorLamp(8.0, 8.6))
  // 왼쪽 앞: 작업 탁자 (노트북)
  parts.push(...roundTable(-12.6, 6.0, 0.7, 0.72), ...armchair(-12.6, 4.6, 0, SAGE), ...armchair(-11.2, 7.0, -Math.PI / 2 - 0.3, SAGE))
  parts.push({ p: [-12.6, 0.82, 6.0], s: [0.6, 0.04, 0.42], c: '#4b5058', rad: 0.02 }, { k: 'box', p: [-12.6, 0.98, 6.2], s: [0.6, 0.36, 0.03], c: '#4b5058', r: [-0.2, 0, 0] })
  parts.push(...floorLamp(-14.2, 7.2))
  return parts
})()

const EDGE_GLOW: Part[] = [lampShade(15.2, 3.2), lampShade(8.0, 8.6), lampShade(-14.2, 7.2), { k: 'box', p: [-12.6, 0.985, 6.18], s: [0.52, 0.3, 0.01], c: '#8fd3ff', r: [-0.2, 0, 0] }]

// ---------------------------------------------------------------- 충돌·길찾기

const BLOCKS: Rect[] = [
  [-16, -14.6, BOARD.z0 - 0.2, BOARD.z1], // 게시판 앞 받침
  [-16, -14.6, 1.6, 4.3], // 정수기·책자
  [-16, -14.2, -12, -10.2], // 구석 화분
  [-16, -14.3, 4.7, 5.9], // 엘리베이터 옆 화분
  [-13.6, -8.2, -12, -7.8], // 독서 코너
  [-5.2, -3.6, -12, -10.4], // 화분
  [-3.6, 5.9, -12, -10.8], // TV 장
  [6.8, 16, -12, -10.6], // 커피 코너
  [7.9, 16, 2.2, 9.0], // 소파 자리
  [-13.8, -10.4, 3.9, 7.9], // 작업 탁자
  [-15.8, -12.8, 10.4, 12], // 앞 왼쪽 화단
  [-4.5, -0.9, 10.8, 12], // 앞 화단
  [14.2, 16, 9.8, 12], // 오른쪽 앞 화단
  [-10.8, -7.2, 10.6, 12], // 벤치
  [2.7, 6.3, 10.6, 12], // 벤치
]
const BOUNDS = { x0: ROOM.x0 + 0.5, x1: ROOM.x1 - 0.45, z0: ROOM.z0 + 0.6, z1: ROOM.z1 - 0.45 }
const nav = makeNav(BLOCKS, BOUNDS)

function nearOf(p: Vector3): LoungeNear {
  if (p.x < -13.6 && Math.abs(p.z - LIFT_Z) < 1.6) return 'elevator'
  if (p.x < -12.8 && p.z > BOARD.z0 - 0.5 && p.z < BOARD.z1 + 0.5) return 'board'
  return null
}

export function walkTo(x: number, z: number) {
  const to = new Vector3(x, 0, z)
  nav.resolve(to)
  me.path = nav.findPath(me.pos, to)
  me.target = me.path.shift() ?? null
}
export const walkToBoard = () => walkTo(-13.6, (BOARD.z0 + BOARD.z1) / 2)
export const walkToElevator = () => walkTo(-14.2, LIFT_Z)

// ---------------------------------------------------------------- 시장 뉴스 TV 화면

/** 진행자와 차트가 있는 뉴스 화면 (장식용, 실제 시세가 아니다) */
function useTvTexture() {
  const tex = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = 512
    c.height = 288
    const t = new CanvasTexture(c)
    t.colorSpace = SRGBColorSpace
    return t
  }, [])
  const series = useRef<number[]>(Array.from({ length: 40 }, (_, i) => 50 + Math.sin(i / 4) * 12 + i * 0.6))
  useEffect(() => {
    const draw = () => {
      const c = tex.image as HTMLCanvasElement
      const ctx = c.getContext('2d')!
      const g = ctx.createLinearGradient(0, 0, 0, 288)
      g.addColorStop(0, '#1f4fa3')
      g.addColorStop(1, '#173a7a')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, 512, 288)
      // 진행자 (블록 캐릭터)
      ctx.fillStyle = '#2a3550'
      ctx.fillRect(40, 150, 140, 110)
      ctx.fillStyle = '#f3c9a0'
      ctx.fillRect(70, 70, 80, 80)
      ctx.fillStyle = '#22201f'
      ctx.fillRect(66, 60, 88, 26)
      ctx.fillStyle = '#1e1b1a'
      ctx.fillRect(90, 105, 8, 12)
      ctx.fillRect(122, 105, 8, 12)
      ctx.fillStyle = '#f4efe2'
      ctx.fillRect(100, 150, 20, 50)
      ctx.fillStyle = '#d9534a'
      ctx.fillRect(105, 155, 10, 40)
      // 차트 패널
      ctx.fillStyle = '#0f2a5c'
      ctx.fillRect(220, 40, 270, 170)
      ctx.strokeStyle = '#2f4f8a'
      ctx.lineWidth = 1
      for (let k = 1; k < 4; k++) {
        ctx.beginPath()
        ctx.moveTo(220, 40 + k * 42)
        ctx.lineTo(490, 40 + k * 42)
        ctx.stroke()
      }
      const s = series.current
      const min = Math.min(...s)
      const max = Math.max(...s)
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 4
      ctx.beginPath()
      s.forEach((v, k) => {
        const x = 230 + (k / (s.length - 1)) * 250
        const y = 195 - ((v - min) / Math.max(1, max - min)) * 140
        if (k) ctx.lineTo(x, y)
        else ctx.moveTo(x, y)
      })
      ctx.stroke()
      // 막대 (거래량 느낌)
      s.slice(-20).forEach((v, k) => {
        ctx.fillStyle = k % 3 ? '#4fbf7a' : '#e0645a'
        ctx.fillRect(232 + k * 12.5, 205 - (v % 9) * 2, 8, (v % 9) * 2)
      })
      // 아래 자막 띠
      ctx.fillStyle = '#d9534a'
      ctx.fillRect(0, 238, 120, 50)
      ctx.fillStyle = '#f6f1e7'
      ctx.fillRect(120, 238, 392, 50)
      ctx.fillStyle = '#ffffff'
      ctx.font = 'bold 22px sans-serif'
      ctx.fillText('LIVE', 30, 271)
      ctx.fillStyle = '#26282d'
      ctx.font = 'bold 22px sans-serif'
      ctx.fillText('시장 뉴스 · 오늘의 흐름', 140, 271)
      tex.needsUpdate = true
    }
    draw()
    const id = window.setInterval(() => {
      const s = series.current
      s.push(s[s.length - 1] + (Math.random() - 0.48) * 4)
      s.shift()
      draw()
    }, 1500)
    return () => window.clearInterval(id)
  }, [tex])
  return tex
}

function Tv() {
  const tex = useTvTexture()
  return (
    <mesh position={[1, 2.95, -11.83]}>
      <planeGeometry args={[7.0, 3.75]} />
      <meshBasicMaterial map={tex} toneMapped={false} />
    </mesh>
  )
}

// ---------------------------------------------------------------- 사람들

/** 말풍선 / 이모트 (Html) */
function Bubble({ session, id }: { session: LoungeSession; id: string }) {
  const [, force] = useState(0)
  useEffect(() => session.subscribe(() => force((n) => n + 1)), [session])
  // 시간이 지나면 사라지도록 가끔 다시 그린다
  useEffect(() => {
    const t = window.setInterval(() => force((n) => n + 1), 1000)
    return () => window.clearInterval(t)
  }, [])
  const b = session.bubbleOf(id)
  if (!b) return null
  return (
    <Html position={[0, 4.2, 0]} center zIndexRange={[12, 0]} style={{ pointerEvents: 'none' }}>
      <div className={b.kind === 'emote' ? 'bubble emote' : 'bubble'}>{b.text}</div>
    </Html>
  )
}

/** 같은 방의 다른 입주민: 받은 위치로 부드럽게 걸어간다 */
function RemotePeer({ session, id }: { session: LoungeSession; id: string }) {
  const g = useRef<Group>(null)
  const limbs = useRef<Object3D[]>([])
  const walk = useRef(0)
  const p0 = session.peers.get(id)
  const nickname = p0?.nickname ?? ''
  const look = useMemo(() => lookOf(id), [id]) // 계정 번호로 정한 모습 (상대 기기에서 보는 것과 같다)
  useFrame((_, raw) => {
    const dt = Math.min(raw, 0.05)
    const p = session.peers.get(id)
    const node = g.current
    if (!p || !node) return
    const dx = p.tx - p.x
    const dz = p.tz - p.z
    const d = Math.hypot(dx, dz)
    const moving = d > 0.05
    if (d > 6) {
      p.x = p.tx
      p.z = p.tz
    } else if (moving) {
      const step = Math.min(d, Math.max(4.6, d * 4) * dt)
      p.x += (dx / d) * step
      p.z += (dz / d) * step
      p.yaw = Math.atan2(dx, dz)
    } else p.yaw += Math.atan2(Math.sin(p.tyaw - p.yaw), Math.cos(p.tyaw - p.yaw)) * Math.min(1, dt * 8)
    node.position.set(p.x, 0, p.z)
    node.rotation.y += Math.atan2(Math.sin(p.yaw - node.rotation.y), Math.cos(p.yaw - node.rotation.y)) * Math.min(1, dt * 12)
    walk.current += moving ? dt * 10 : 0
    swingLimbs(limbs.current, moving ? Math.sin(walk.current) * 0.7 : 0, Math.min(1, dt * 14))
  })
  return (
    <group ref={g}>
      <group scale={PEOPLE_SCALE}>
        <Character nickname={nickname} limbs={limbs} look={look} />
      </group>
      <Bubble session={session} id={id} />
    </group>
  )
}

/** 방 사람 목록이 바뀔 때만 다시 그린다 */
function Peers({ session }: { session: LoungeSession }) {
  const [ids, setIds] = useState<string[]>([])
  useEffect(() => {
    const sync = () => setIds((prev) => {
      const next = [...session.peers.keys()]
      return prev.length === next.length && prev.every((x, i) => x === next[i]) ? prev : next
    })
    sync()
    return session.subscribe(sync)
  }, [session])
  return (
    <>
      {ids.map((id) => (
        <RemotePeer key={id} session={session} id={id} />
      ))}
    </>
  )
}

const tmp = new Vector3()
const fwd = new Vector3()
const side = new Vector3()
const before = new Vector3()

function Me({ nickname, myId, session, onNear }: { nickname: string; myId: string; session: LoungeSession; onNear: (n: LoungeNear) => void }) {
  const look = useMyLook()
  const g = useRef<Group>(null)
  const limbs = useRef<Object3D[]>([])
  const walkT = useRef(0)
  const lastNear = useRef<LoungeNear | undefined>(undefined)
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
    nav.resolve(pos)
    if (moving && me.target && pos.distanceToSquared(before) < 1e-6) {
      me.target = null
      me.path = []
    }
    if (moving) {
      const yaw = Math.atan2(tmp.x, tmp.z)
      me.yaw += Math.atan2(Math.sin(yaw - me.yaw), Math.cos(yaw - me.yaw)) * Math.min(1, dt * 12)
    }
    node.position.copy(pos)
    node.rotation.y = me.yaw
    walkT.current += moving ? dt * 10 : 0
    swingLimbs(limbs.current, moving ? Math.sin(walkT.current) * 0.7 : 0, Math.min(1, dt * 14))
    if (marker.current) {
      marker.current.visible = !!me.target
      if (me.target) marker.current.position.copy(me.path.length ? me.path[me.path.length - 1] : me.target)
    }
    session.updateMe(pos.x, pos.z, me.yaw)
    const near = nearOf(pos)
    if (near !== lastNear.current) {
      lastNear.current = near
      onNear(near)
    }
  })

  return (
    <>
      <group ref={g}>
        <group scale={PEOPLE_SCALE}>
          <Character nickname={nickname} limbs={limbs} look={look} />
        </group>
        <Bubble session={session} id={myId} />
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

// ---------------------------------------------------------------- 카메라 (휠·핀치 줌)

const VIEW = new Vector3(1, 0.92, 1.12).normalize()
const CENTER = new Vector3(0, 1.4, 0.6)
const view = { zoom: 1 }
const clampZoom = (z: number) => Math.min(3, Math.max(0.75, z))

function LoungeCamera() {
  const camera = useThree((s) => s.camera) as OrthographicCamera
  const size = useThree((s) => s.size)
  const el = useThree((s) => s.gl.domElement)
  const look = useRef<Vector3 | null>(null)
  const zoomNow = useRef(view.zoom)
  useEffect(() => {
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      view.zoom = clampZoom(view.zoom * Math.exp(-e.deltaY * 0.0015))
    }
    let pinch: { d: number; z: number } | null = null
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)
    const start = (e: TouchEvent) => {
      if (e.touches.length === 2) pinch = { d: dist(e.touches), z: view.zoom }
    }
    const move = (e: TouchEvent) => {
      if (!pinch || e.touches.length !== 2) return
      e.preventDefault()
      view.zoom = clampZoom((pinch.z * dist(e.touches)) / pinch.d)
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
    const base = portrait ? Math.min(size.width / 18, size.height / 26) : Math.min(size.width / 44, size.height / 30)
    zoomNow.current += (view.zoom - zoomNow.current) * Math.min(1, dt * 10)
    const zoom = base * zoomNow.current
    const follow = Math.max(portrait ? 0.75 : 0, Math.min(1, (zoomNow.current - 1) / 0.8))
    const want = tmp.copy(CENTER).lerp(me.pos, follow * (portrait ? 1 : 0.9))
    if (portrait) want.setY(1.2)
    if (!look.current) look.current = want.clone()
    else look.current.lerp(want, Math.min(1, dt * 4))
    camera.position.copy(look.current).addScaledVector(VIEW, 90)
    camera.lookAt(look.current)
    if (Math.abs(camera.zoom - zoom) > 1e-3) {
      camera.zoom = zoom
      camera.updateProjectionMatrix()
    }
  })
  return null
}

// ---------------------------------------------------------------- 분위기용 사람들 (실제 입주민 아님, 이름표 없음)

const EXTRAS: { look: Look; p: [number, number, number]; yaw: number; sit?: boolean }[] = [
  { look: { shirt: '#f4efe2', hair: '#4a2e1e', cap: null }, p: [-12.4, 0.1, -8.75], yaw: 0.5 + Math.PI, sit: true },
  { look: { shirt: '#e8854a', hair: '#7a4a2a', cap: null }, p: [9.9, 0, -10.0], yaw: Math.PI },
  { look: { shirt: '#7cc26a', hair: '#22201f', cap: null }, p: [14.0, 0.1, 5.6], yaw: -Math.PI / 2, sit: true },
]

const LOW_POWER = typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches || window.innerWidth < 768)

export function LoungeScene({
  nickname,
  myId,
  floorLabel,
  newCount,
  session,
  onNear,
  onOpenBoard,
  onElevator,
}: {
  nickname: string
  myId: string
  floorLabel: string
  newCount: number
  session: LoungeSession
  onNear: (n: LoungeNear) => void
  onOpenBoard: () => void
  onElevator: () => void
}) {
  const floorTex = useMemo(() => repeated(floorTexture(), (ROOM.x1 - ROOM.x0 + 0.6) / 8, (ROOM.z1 - ROOM.z0) / 8), [])
  const onFloor = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    walkTo(e.point.x, e.point.z)
  }
  const board = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    walkToBoard()
    onOpenBoard()
  }
  const toLift = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    onElevator()
  }
  const zc = (BOARD.z0 + BOARD.z1) / 2
  return (
    <Canvas shadows orthographic dpr={[1, 1.75]} gl={{ antialias: true, powerPreference: 'high-performance' }} camera={{ position: [90, 90, 90], zoom: 20, near: 1, far: 400 }}>
      <color attach="background" args={['#f6eddf']} />
      <hemisphereLight args={['#fff6ea', '#c8a985', 1.45]} />
      <directionalLight
        position={[14, 26, 20]}
        intensity={1.6}
        color="#fff0dc"
        castShadow
        shadow-mapSize={LOW_POWER ? [1024, 1024] : [2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
        shadow-radius={4}
        shadow-camera-left={-26}
        shadow-camera-right={26}
        shadow-camera-top={26}
        shadow-camera-bottom={-26}
        shadow-camera-near={1}
        shadow-camera-far={90}
      />
      <pointLight position={[-13, 4.4, -5]} color="#ffd59a" intensity={45} distance={12} decay={2} />
      <pointLight position={[1, 4.6, -9]} color="#ffdcae" intensity={45} distance={12} decay={2} />
      <pointLight position={[11, 4.2, -9.5]} color="#ffd59a" intensity={35} distance={10} decay={2} />

      <Prop id="lounge:base" parts={BASE} />
      <mesh position={[0.2, 0.005, 0.1]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow onClick={onFloor}>
        <planeGeometry args={[ROOM.x1 - ROOM.x0 + 0.6, ROOM.z1 - ROOM.z0 + 0.2]} />
        <meshLambertMaterial map={floorTex} />
      </mesh>
      <Prop id="lounge:walls" parts={WALLS} glow={WALL_GLOW} />
      <group onClick={board}>
        <Prop id="lounge:left" parts={LEFT} glow={LEFT_GLOW} />
      </group>
      <Prop id="lounge:back" parts={BACK} glow={BACK_GLOW} />
      <Prop id="lounge:edge" parts={EDGE} glow={EDGE_GLOW} />
      <Tv />
      {/* 유리 난간 */}
      <mesh position={[0, 0.66, 12]} material={glassMaterial}>
        <boxGeometry args={[32, 1.1, 0.04]} />
      </mesh>
      <mesh position={[16, 0.66, 0]} material={glassMaterial}>
        <boxGeometry args={[0.04, 1.1, 24]} />
      </mesh>
      {/* 엘리베이터 층 표시 + 누르면 엘리베이터로 */}
      <mesh position={[-15.84, 4.55, LIFT_Z]} rotation={[0, Math.PI / 2, 0]} onClick={toLift}>
        <planeGeometry args={[1.0, 0.66]} />
        <meshBasicMaterial map={pixelTexture('', floorLabel)} transparent />
      </mesh>
      <mesh position={[-15.8, 1.72, LIFT_Z]} rotation={[0, Math.PI / 2, 0]} onClick={toLift} visible={false}>
        <planeGeometry args={[2.4, 3.4]} />
      </mesh>
      {/* 게시판 새 소식 표시 */}
      <Html position={[-15.6, 4.95, zc]} center zIndexRange={[11, 0]}>
        <button className={`board-tag ${newCount ? 'new' : ''}`} onClick={onOpenBoard}>
          층 소식{newCount ? ` · 새 글 ${newCount}` : ''}
        </button>
      </Html>

      {EXTRAS.map((x, i) => (
        <Person key={i} look={x.look} p={x.p} yaw={x.yaw} sit={x.sit} />
      ))}
      <Peers session={session} />
      <Me nickname={nickname} myId={myId} session={session} onNear={onNear} />
      <LoungeCamera />
    </Canvas>
  )
}
