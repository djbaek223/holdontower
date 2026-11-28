import { useLayoutEffect, useMemo, useRef } from 'react'
import { Color, InstancedMesh, MeshBasicMaterial, Object3D } from 'three'
import type { ThreeEvent } from '@react-three/fiber'
import type { BuildingConfig } from '../config/buildings'
import { player, useApp } from '../store'
import { clickBlocked } from './touchGesture'
import { BUILDING_SIZE, FLOOR_H, LOBBY_H, ROOF_H, buildingHeight, entrancePoint, stackedFloorCount } from './layout'
import { interiorTexture, repeated } from './patterns'
import { textTexture } from './textTexture'
import { Prop, hash, type Part } from './lowpoly'

const tmp = new Object3D()
const tmpColor = new Color()
const windowMaterial = new MeshBasicMaterial()

const PALETTE = {
  // 파스텔 톤: 삼성전자는 밝은 블루그레이 유리 타워, SK하이닉스는 따뜻한 벽돌 타워
  concrete: { wall: '#dde3ea', wallDark: '#c6cfd9', base: '#7d8794' },
  brick: { wall: '#d0735a', wallDark: '#bb634c', base: '#6e4637' },
}
const GLASS = ['#9fd3ef', '#8cc6e6', '#b0dcf3']
const LIT = ['#ffe29a', '#ffd27a']

/**
 * 층마다 네 면에 창문 블록을 놓는다. 몇몇 창은 불이 켜진 색 (결정적 무작위).
 * 창문 전체가 인스턴스 메시 하나 = 드로우콜 하나.
 */
function Windows({ b }: { b: BuildingConfig }) {
  const { w, d } = BUILDING_SIZE
  const floors = stackedFloorCount(b)
  const ref = useRef<InstancedMesh>(null)
  const PER_SIDE = 4
  const count = floors * PER_SIDE * 4
  useLayoutEffect(() => {
    const mesh = ref.current!
    const span = w * 0.8
    const ww = span / PER_SIDE - 0.35
    const wh = FLOOR_H * 0.58
    let k = 0
    for (let f = 0; f < floors; f++) {
      const y = LOBBY_H + f * FLOOR_H + FLOOR_H * 0.52
      for (let i = 0; i < PER_SIDE; i++) {
        const t = -span / 2 + (span / PER_SIDE) * (i + 0.5)
        const faces: [number, number, number, number, number][] = [
          [t, d / 2 + 0.06, ww, 0.14, 0],
          [t, -d / 2 - 0.06, ww, 0.14, 1],
          [w / 2 + 0.06, t, 0.14, ww, 2],
          [-w / 2 - 0.06, t, 0.14, ww, 3],
        ]
        for (const [x, z, sx, sz, side] of faces) {
          tmp.position.set(x, y, z)
          tmp.scale.set(sx, wh, sz)
          tmp.updateMatrix()
          mesh.setMatrixAt(k, tmp.matrix)
          const h = hash(f * 16 + i, side, b.id.length)
          mesh.setColorAt(k, tmpColor.set(h < 0.28 ? LIT[Math.floor(h * 7) % 2] : GLASS[Math.floor(h * 3) % 3]))
          k++
        }
      }
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [b, floors, w, d])
  return (
    <instancedMesh ref={ref} args={[undefined, windowMaterial, count]}>
      <boxGeometry args={[1, 1, 1]} />
    </instancedMesh>
  )
}

/** 타워의 고정 블록 (외벽, 층 띠, 기둥, 로비, 옥상)을 하나의 메시로 */
function towerBlocks(b: BuildingConfig): Part[] {
  const { w, d } = BUILDING_SIZE
  const pal = PALETTE[b.style.wall]
  const floors = stackedFloorCount(b)
  const stackH = floors * FLOOR_H
  const top = buildingHeight(b)
  const z = d / 2
  const blocks: Part[] = [
    // 로비 + 받침
    { p: [0, LOBBY_H / 2, 0], s: [w, LOBBY_H, d], c: pal.wallDark },
    { p: [0, 0.3, 0], s: [w + 0.3, 0.6, d + 0.3], c: pal.base },
    { p: [0, LOBBY_H + 0.15, 0], s: [w + 0.5, 0.3, d + 0.5], c: b.style.trim },
    // 층 모듈 몸체
    { p: [0, LOBBY_H + stackH / 2, 0], s: [w * 0.96, stackH, d * 0.96], c: pal.wall },
    // 로비 창틀·문
    { p: [0, 2.25, z + 0.04], s: [w - 1, 3.5, 0.1], c: b.style.frame },
    { p: [0, 1.4, z + 0.12], s: [2.4, 2.8, 0.1], c: '#2a2d33' },
    // 캐노피·간판 받침
    { p: [0, 4.55, z + 0.08], s: [w * 0.66, 0.75, 0.2], c: '#1b1e23' },
  ]
  // 층 사이 띠 (5층마다 굵게)
  for (let f = 0; f <= floors; f += 5) {
    blocks.push({ p: [0, LOBBY_H + f * FLOOR_H, 0], s: [w + 0.2, 0.12, d + 0.2], c: b.style.trim })
  }
  // 모서리 기둥
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    blocks.push({ p: [sx * (w / 2 - 0.2), LOBBY_H + stackH / 2, sz * (d / 2 - 0.2)], s: [0.6, stackH, 0.6], c: b.style.trim })
  }
  // 캐노피
  if (b.style.canopy === 'dark') {
    blocks.push({ p: [0, 3.9, z + 0.9], s: [w * 0.7, 0.35, 1.8], c: '#2e3136' })
  } else {
    for (let k = 0; k < 10; k++) {
      for (let r = 0; r < 3; r++) {
        blocks.push({ p: [-w * 0.33 + k * (w * 0.066) + w * 0.033, 4.05 - r * 0.22, z + 0.35 + r * 0.6], s: [w * 0.066, 0.22, 0.62], c: k % 2 ? '#f6f1e9' : '#2f4f9e' })
      }
    }
  }
  // 옥상: 난간, 펜트하우스, 안테나
  blocks.push({ p: [0, top + 0.25, 0], s: [w + 0.5, 0.5, d + 0.5], c: b.style.roof })
  blocks.push({ p: [0, top + 0.5 + ROOF_H / 2, -1.2], s: [w * 0.55, ROOF_H, d * 0.4], c: pal.wall })
  blocks.push({ p: [0, top + 0.5 + ROOF_H + 0.15, -1.2], s: [w * 0.6, 0.3, d * 0.45], c: b.style.roof })
  blocks.push({ p: [w * 0.3, top + 3.6, -1.2], s: [0.25, 3.6, 0.25], c: '#d1d5db' })
  blocks.push({ p: [w * 0.3, top + 5.5, -1.2], s: [0.45, 0.45, 0.45], c: '#e2463f' })
  return blocks
}

/** 층 번호 표지 (10층마다 + 통합 저층 바로 위 층) */
function FloorMarkers({ b }: { b: BuildingConfig }) {
  const floors = useMemo(() => {
    const first = b.mergedFloorMax + 1
    const list = [first]
    for (let f = Math.ceil(first / 10) * 10; f <= b.maxFloor; f += 10) if (f !== first) list.push(f)
    return list
  }, [b])
  const { w, d } = BUILDING_SIZE
  return (
    <>
      {floors.map((f) => (
        <mesh key={f} position={[w / 2 + 0.16, LOBBY_H + (f - b.mergedFloorMax - 1) * FLOOR_H + FLOOR_H * 0.5, d / 2 - 1.2]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[1.6, 0.42]} />
          <meshBasicMaterial map={textTexture(`${f}F`, { size: 80, bg: '#111827dd' })} transparent />
        </mesh>
      ))}
    </>
  )
}

export function Building({ b }: { b: BuildingConfig }) {
  const { w, d } = BUILDING_SIZE
  const top = buildingHeight(b)
  const entrance = useMemo(() => entrancePoint(b), [b])
  const blocks = useMemo(() => towerBlocks(b), [b])
  const lobbyGlass = useMemo(() => repeated(interiorTexture(), 2, 1), [])

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (clickBlocked(e.delta)) return // 카메라 조작은 무시
    e.stopPropagation()
    useApp.getState().select({ kind: 'building', id: b.id })
    player.target = entrance.clone()
  }

  return (
    <group position={[b.position[0], 0, b.position[1]]} onClick={onClick}>
      <Prop id={`tower-${b.id}`} parts={blocks} />
      <Windows b={b} />

      {/* 로비 통유리 (실내가 보이는 창) */}
      {[-2.6, 2.6].map((x) => (
        <mesh key={x} position={[x, 2.25, d / 2 + 0.1]}>
          <planeGeometry args={[3, 3.2]} />
          <meshBasicMaterial map={lobbyGlass} color="#e6e8ea" />
        </mesh>
      ))}
      <mesh position={[0, 1.5, d / 2 + 0.18]}>
        <planeGeometry args={[2.1, 2.5]} />
        <meshBasicMaterial color="#ffe7a6" />
      </mesh>

      {/* 간판 */}
      <mesh position={[0, 4.55, d / 2 + 0.19]}>
        <planeGeometry args={[w * 0.62, 0.6]} />
        <meshBasicMaterial map={textTexture(b.name, { size: 70, width: 880, height: 84, bg: '#1b1e23' })} />
      </mesh>
      {b.mergedFloorMax > 1 && (
        <mesh position={[w / 2 + 0.02, LOBBY_H * 0.5, 0]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[4, 0.55]} />
          <meshBasicMaterial map={textTexture(`1층 (1~${b.mergedFloorMax}층 통합)`, { size: 52, width: 720, height: 100, bg: '#111827dd' })} transparent />
        </mesh>
      )}
      <FloorMarkers b={b} />

      {/* 옥상 간판 */}
      <mesh position={[0, top + ROOF_H + 1.6, d / 2 - 0.6]}>
        <planeGeometry args={[6, 1.2]} />
        <meshBasicMaterial map={textTexture(b.name, { size: 90, width: 640, height: 128, color: '#fde68a', bg: '#1b1e23cc' })} transparent />
      </mesh>
    </group>
  )
}
