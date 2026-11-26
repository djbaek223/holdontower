import { useLayoutEffect, useMemo, useRef } from 'react'
import {
  BufferGeometry,
  Color,
  ExtrudeGeometry,
  IcosahedronGeometry,
  InstancedMesh,
  MeshLambertMaterial,
  Object3D,
  Shape,
  Vector2,
} from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type { ThreeEvent } from '@react-three/fiber'
import { player } from '../store'
import { Prop, hash, type Part } from './lowpoly'
import { ISLAND, OBSTACLES, PATHS, PLOTS, inRect, isPath, onIsland, resolveCollisions, type Plot } from './townPlan'

// ---------- 섬 윤곽 ----------

/** 부드럽게 출렁이는 1차원 노이즈 */
function wobble(t: number, seed: number) {
  return Math.sin(t * 5 + seed) * 0.5 + Math.sin(t * 11 + seed * 2.3) * 0.3 + Math.sin(t * 23 + seed * 4.1) * 0.2
}

/** 둥근 사각형 윤곽을 안쪽으로 inset만큼 줄이고 amp만큼 출렁이게 한다 */
function outline(inset: number, amp: number, seed: number): Vector2[] {
  const hx = ISLAND.halfX - inset
  const hz = ISLAND.halfZ - inset
  const r = Math.max(ISLAND.corner - inset * 0.6, 3)
  const pts: Vector2[] = []
  // 네 모서리 원호 중심
  const corners: [number, number, number][] = [
    [hx - r, hz - r, 0],
    [-(hx - r), hz - r, Math.PI / 2],
    [-(hx - r), -(hz - r), Math.PI],
    [hx - r, -(hz - r), (Math.PI * 3) / 2],
  ]
  const STEP = 1.6
  corners.forEach(([cx, cz, a0], i) => {
    for (let k = 0; k <= 8; k++) {
      const a = a0 + (k / 8) * (Math.PI / 2)
      pts.push(new Vector2(cx + Math.cos(a) * r, cz + Math.sin(a) * r))
    }
    // 다음 모서리까지 직선
    const [nx, nz, na] = corners[(i + 1) % 4]
    const from = pts[pts.length - 1]
    const to = new Vector2(nx + Math.cos(na) * r, nz + Math.sin(na) * r)
    const n = Math.max(1, Math.floor(from.distanceTo(to) / STEP))
    for (let k = 1; k < n; k++) pts.push(from.clone().lerp(to, k / n))
  })
  // 바깥 방향으로 출렁임
  return pts.map((p, i) => {
    const t = i / pts.length
    const d = wobble(t * Math.PI * 2, seed) * amp
    const len = p.length() || 1
    return p.clone().addScaledVector(p.clone().divideScalar(len), d)
  })
}

/** 윤곽을 아래로 두께만큼 밀어낸 덩어리 (윗면 높이 top) */
function slab(pts: Vector2[], top: number, depth: number, bevel: number): BufferGeometry {
  // Shape의 y가 월드 -z가 되도록 뒤집어 넣는다 (아래 회전에서 다시 맞춰짐)
  const shape = new Shape(pts.map((p) => new Vector2(p.x, p.y)))
  const g = new ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 4,
  })
  g.rotateX(Math.PI / 2) // 밀어낸 방향이 아래(-y), Shape y → 월드 z
  g.translate(0, top - bevel, 0)
  g.computeVertexNormals()
  return g
}

const STRATA = [
  { inset: 0.3, top: -1.2, depth: 4.6, amp: 0.7, c: '#c99868' },
  { inset: 1.1, top: -5.8, depth: 4.2, amp: 1.1, c: '#b5865a' },
  { inset: 2.4, top: -10, depth: 3.8, amp: 1.6, c: '#a0744c' },
  { inset: 4.8, top: -13.8, depth: 3.2, amp: 2.2, c: '#8a6342' },
  { inset: 9, top: -17, depth: 3, amp: 2.8, c: '#765237' },
  { inset: 15, top: -20, depth: 2.6, amp: 3, c: '#63452e' },
]

const grassMat = new MeshLambertMaterial({ color: '#8fd062' })
const strataMats = STRATA.map((s) => new MeshLambertMaterial({ color: s.c, flatShading: true }))

// ---------- 인스턴스 도우미 ----------

type Inst = { p: [number, number, number]; s: [number, number, number]; r?: number; c: string }
const tmp = new Object3D()
const tmpColor = new Color()
const instMat = new MeshLambertMaterial()
const instMatFlat = new MeshLambertMaterial({ flatShading: true })

function Instances({
  geometry,
  items,
  flat,
  cast,
}: {
  geometry: BufferGeometry
  items: Inst[]
  flat?: boolean
  cast?: boolean
}) {
  const ref = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    const mesh = ref.current!
    items.forEach((it, i) => {
      tmp.position.set(...it.p)
      tmp.rotation.set(0, it.r ?? 0, 0)
      tmp.scale.set(...it.s)
      tmp.updateMatrix()
      mesh.setMatrixAt(i, tmp.matrix)
      mesh.setColorAt(i, tmpColor.set(it.c))
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [items])
  return <instancedMesh ref={ref} args={[geometry, flat ? instMatFlat : instMat, items.length]} castShadow={cast} receiveShadow />
}

const stoneGeo = new RoundedBoxGeometry(1, 1, 1, 1, 0.12)
const icoGeo = new IcosahedronGeometry(0.5, 0)
const coneGeo = new IcosahedronGeometry(0.5, 0)

const PAVING = ['#ddd5c4', '#d2c9b6', '#e6dfcf', '#c9bfa9', '#d8cbb0']
const GRASS_PATCH = ['#84c757', '#9ad86c', '#7fbf54', '#a2dc78']

// ---------- 빈 부지 ----------

/** 앞으로 건물을 지을 자리: 잘 깎인 잔디 + 낮은 돌 경계석 + 모서리 측량 깃발 */
function plotParts(plot: Plot): Part[] {
  const w = plot.x1 - plot.x0
  const d = plot.z1 - plot.z0
  const parts: Part[] = [{ p: [0, 0.05, 0], s: [w, 0.1, d], c: '#a8da7a', rad: 0.05 }]
  const curb = '#cfc7b6'
  const GAP = 5 // 입구 쪽 가운데는 비워 둔다
  const edge = (side: 'n' | 's' | 'e' | 'w') => {
    const horiz = side === 'n' || side === 's'
    const len = horiz ? w : d
    const fixed = side === 'n' ? -d / 2 : side === 's' ? d / 2 : side === 'w' ? -w / 2 : w / 2
    for (let t = -len / 2 + 0.6; t <= len / 2 - 0.6; t += 1.2) {
      if (side === plot.open && Math.abs(t) < GAP / 2) continue
      parts.push({ p: horiz ? [t, 0.2, fixed] : [fixed, 0.2, t], s: horiz ? [1.05, 0.35, 0.45] : [0.45, 0.35, 1.05], c: curb, rad: 0.1 })
    }
  }
  ;(['n', 's', 'e', 'w'] as const).forEach(edge)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = (sx * w) / 2
    const z = (sz * d) / 2
    parts.push({ k: 'cyl', p: [x, 0.9, z], s: [0.16, 1.8, 0.16], c: '#9a6a3f', seg: 6 })
    parts.push({ k: 'box', p: [x + 0.35, 1.55, z], s: [0.6, 0.4, 0.04], c: '#f2873a' })
  }
  return parts
}

function Plots() {
  return (
    <>
      {PLOTS.map((plot) => (
        <Prop
          key={plot.id}
          id={`plot-${plot.id}`}
          parts={plotParts(plot)}
          position={[(plot.x0 + plot.x1) / 2, 0, (plot.z0 + plot.z1) / 2]}
          shadow={false}
        />
      ))}
    </>
  )
}

// ---------- 섬 ----------

export function Island() {
  const terrain = useMemo(() => {
    const top = slab(outline(0, 0.6, 1), 0, 1.2, 0.5)
    const strata = STRATA.map((s, i) => slab(outline(s.inset, s.amp, i + 2), s.top, s.depth, 0.6))
    return { top, strata }
  }, [])

  const details = useMemo(() => {
    const stones: Inst[] = []
    const sand: Inst[] = []
    const patches: Inst[] = []
    const tufts: Inst[] = []
    const flowers: Inst[] = []
    const rocks: Inst[] = []

    // 돌 포장: 모래 바닥 + 살짝 엇갈린 판석
    for (const r of PATHS) {
      sand.push({ p: [(r.x0 + r.x1) / 2, 0.04, (r.z0 + r.z1) / 2], s: [r.x1 - r.x0 + 0.6, 0.08, r.z1 - r.z0 + 0.6], c: '#e4d3ac' })
    }
    const seen = new Set<string>()
    for (const r of PATHS) {
      for (let x = r.x0 + 0.65; x < r.x1; x += 1.3) {
        for (let z = r.z0 + 0.65; z < r.z1; z += 1.3) {
          const key = `${Math.round(x / 1.3)},${Math.round(z / 1.3)}`
          if (seen.has(key)) continue
          seen.add(key)
          if (OBSTACLES.some((o) => inRect(x, z, o, -0.3))) continue
          const h = hash(Math.round(x * 10), Math.round(z * 10), 31)
          if (h < 0.05) continue // 군데군데 빠진 판석
          stones.push({
            p: [x + (h - 0.5) * 0.15, 0.1, z + (hash(Math.round(x * 10), Math.round(z * 10), 32) - 0.5) * 0.15],
            s: [1.12 + h * 0.08, 0.14, 1.1],
            r: (h - 0.5) * 0.12,
            c: PAVING[Math.floor(h * PAVING.length)],
          })
        }
      }
    }

    // 풀밭 무늬, 풀포기, 들꽃 (길·부지·건물은 피한다)
    for (let x = -ISLAND.halfX; x <= ISLAND.halfX; x += 2.2) {
      for (let z = -ISLAND.halfZ; z <= ISLAND.halfZ; z += 2.2) {
        const jx = x + (hash(x * 10, z * 10, 41) - 0.5) * 2
        const jz = z + (hash(x * 10, z * 10, 42) - 0.5) * 2
        if (!onIsland(jx, jz, 1.5) || isPath(jx, jz, 0.6)) continue
        if (OBSTACLES.some((o) => inRect(jx, jz, o, 0.3)) || PLOTS.some((o) => inRect(jx, jz, o, 0.4))) continue
        const h = hash(x * 10, z * 10, 43)
        if (h < 0.22) patches.push({ p: [jx, 0.01, jz], s: [2.6 + h * 5, 0.08, 2 + h * 4], r: h * 9, c: GRASS_PATCH[Math.floor(h * 18) % 4] })
        else if (h < 0.42) tufts.push({ p: [jx, 0.15, jz], s: [0.35, 0.4, 0.35], r: h * 7, c: '#6fb447' })
        else if (h < 0.47) {
          const fc = ['#ffffff', '#ffd84a', '#ff9fb8', '#c7a6ff'][Math.floor(h * 80) % 4]
          for (let k = 0; k < 3; k++) {
            flowers.push({ p: [jx + (k - 1) * 0.35, 0.3, jz + ((k % 2) - 0.5) * 0.35], s: [0.26, 0.22, 0.26], c: fc })
          }
        }
      }
    }

    // 절벽에 박힌 바위
    const edge = outline(1.5, 0.8, 1)
    edge.forEach((p, i) => {
      const h = hash(i, 7, 51)
      if (h > 0.18) return
      const sz = 1.2 + h * 8
      rocks.push({ p: [p.x * 1.005, -2.5 - h * 30, p.y * 1.005], s: [sz, sz * 0.8, sz], r: h * 20, c: h > 0.09 ? '#a39586' : '#8e7d6b' })
    })
    return { stones, sand, patches, tufts, flowers, rocks }
  }, [])

  const onGroundClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 6) return // 드래그(카메라 회전)는 이동 아님
    e.stopPropagation()
    const p = e.point.clone()
    p.y = 0
    resolveCollisions(p)
    player.target = p
  }

  return (
    <group>
      <mesh geometry={terrain.top} material={grassMat} receiveShadow onClick={onGroundClick} />
      {terrain.strata.map((g, i) => (
        <mesh key={i} geometry={g} material={strataMats[i]} />
      ))}
      <Instances geometry={icoGeo} items={details.rocks} flat />
      <Instances geometry={stoneGeo} items={details.sand} />
      <Instances geometry={stoneGeo} items={details.stones} />
      <Instances geometry={icoGeo} items={details.patches} />
      <Instances geometry={coneGeo} items={details.tufts} flat />
      <Instances geometry={icoGeo} items={details.flowers} flat />
      <Plots />
    </group>
  )
}
