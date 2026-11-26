import { useLayoutEffect, useMemo, useRef } from 'react'
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Euler,
  ExtrudeGeometry,
  IcosahedronGeometry,
  InstancedMesh,
  Material,
  Matrix4,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  Quaternion,
  Shape,
  SphereGeometry,
  Vector3,
} from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

export type V3 = [number, number, number]

/**
 * 로우폴리 소품을 이루는 도형 하나.
 *  round  : 모서리가 둥근 상자 (기본)
 *  box    : 각진 상자
 *  ico    : 각진 공 (나뭇잎, 덤불, 바위)
 *  sphere : 매끈한 공
 *  cone   : 원뿔 (침엽수, 뾰족 지붕)
 *  cyl    : 원기둥
 *  gable  : 박공지붕 (용마루가 X축 방향인 삼각 기둥)
 */
export type Part = {
  k?: 'round' | 'box' | 'ico' | 'sphere' | 'cone' | 'cyl' | 'gable'
  p: V3
  s: V3
  c: string
  r?: V3
  /** round 모서리 반경 */
  rad?: number
  /** cyl/cone 둘레 분할 */
  seg?: number
}

export type Placement = { p: V3; r?: number; s?: number }

const FLAT = new Set(['ico', 'cone', 'gable'])

function unitGeometry(part: Part): BufferGeometry {
  const [sx, sy, sz] = part.s
  switch (part.k ?? 'round') {
    case 'round': {
      const rad = Math.min(part.rad ?? 0.14, sx / 2, sy / 2, sz / 2) - 1e-3
      return new RoundedBoxGeometry(sx, sy, sz, 2, Math.max(rad, 0.001))
    }
    case 'box':
      return new BoxGeometry(sx, sy, sz)
    case 'ico':
      return new IcosahedronGeometry(0.5, 1).scale(sx, sy, sz)
    case 'sphere':
      return new SphereGeometry(0.5, 12, 9).scale(sx, sy, sz)
    case 'cone':
      return new ConeGeometry(0.5, 1, part.seg ?? 8).scale(sx, sy, sz)
    case 'cyl':
      return new CylinderGeometry(0.5, 0.5, 1, part.seg ?? 14).scale(sx, sy, sz)
    case 'gable': {
      const sh = new Shape()
      sh.moveTo(-0.5, 0)
      sh.lineTo(0.5, 0)
      sh.lineTo(0, 1)
      sh.closePath()
      const g = new ExtrudeGeometry(sh, { depth: 1, bevelEnabled: false })
      g.rotateY(Math.PI / 2) // 삼각형이 ZY 평면, 길이 방향이 X
      g.center()
      return g.scale(sx, sy, sz)
    }
  }
}

const cache = new Map<string, BufferGeometry>()
const m4 = new Matrix4()
const q = new Quaternion()
const one = new Vector3(1, 1, 1)
const pos = new Vector3()
const col = new Color()

/**
 * 도형 목록을 정점 색이 들어간 지오메트리 하나로 합친다 (소품 1종 = 드로우콜 1개).
 * 바닥 가까운 정점은 살짝 어둡게 칠해 앰비언트 오클루전처럼 보이게 한다.
 */
export function partsGeometry(key: string, parts: Part[], { ao = true } = {}): BufferGeometry {
  const hit = cache.get(key)
  if (hit) return hit
  if (!parts.length) return new BufferGeometry() // 빈 목록은 빈 지오메트리
  const geos = parts.map((part) => {
    let g = unitGeometry(part)
    g = g.index ? g.toNonIndexed() : g
    if (FLAT.has(part.k ?? 'round')) g.computeVertexNormals()
    m4.compose(pos.set(...part.p), q.setFromEuler(new Euler(...(part.r ?? [0, 0, 0]))), one)
    g.applyMatrix4(m4)
    const n = g.attributes.position.count
    const arr = new Float32Array(n * 3)
    const base = new Color(part.c)
    for (let i = 0; i < n; i++) {
      const y = g.attributes.position.getY(i)
      const shade = ao ? 0.68 + 0.32 * Math.min(1, Math.max(0, y / 1.4)) : 1
      col.copy(base).multiplyScalar(shade)
      arr[i * 3] = col.r
      arr[i * 3 + 1] = col.g
      arr[i * 3 + 2] = col.b
    }
    g.setAttribute('color', new BufferAttribute(arr, 3))
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(name)) g.deleteAttribute(name)
    return g
  })
  const merged = mergeGeometries(geos)
  geos.forEach((g) => g.dispose())
  merged.computeBoundingSphere()
  cache.set(key, merged)
  return merged
}

/** 정점 색 + 조명 (그림자 받음) */
export const propMaterial = new MeshLambertMaterial({ vertexColors: true })
/** 불빛·물처럼 조명과 무관하게 밝은 부분 */
export const glowMaterial = new MeshBasicMaterial({ vertexColors: true })

const tmp = new Object3D()

/** 같은 소품을 여러 곳에 배치 (인스턴싱) */
export function PropInstances({
  geometry,
  items,
  material = propMaterial,
  shadow = true,
}: {
  geometry: BufferGeometry
  items: Placement[]
  material?: Material
  shadow?: boolean
}) {
  const ref = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    items.forEach((it, i) => {
      tmp.position.set(...it.p)
      tmp.rotation.set(0, it.r ?? 0, 0)
      tmp.scale.setScalar(it.s ?? 1)
      tmp.updateMatrix()
      mesh.setMatrixAt(i, tmp.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [items, geometry])
  if (!items.length) return null
  return <instancedMesh ref={ref} args={[geometry, material, items.length]} castShadow={shadow} receiveShadow />
}

/** 소품 하나 */
export function Prop({
  id,
  parts,
  glow,
  shadow = true,
  ...props
}: { id: string; parts: Part[]; glow?: Part[]; shadow?: boolean } & Omit<JSX.IntrinsicElements['group'], 'id'>) {
  const geometry = useMemo(() => partsGeometry(id, parts), [id, parts])
  const glowGeo = useMemo(() => (glow?.length ? partsGeometry(`${id}:glow`, glow, { ao: false }) : null), [id, glow])
  return (
    <group {...props}>
      <mesh geometry={geometry} material={propMaterial} castShadow={shadow} receiveShadow />
      {glowGeo && <mesh geometry={glowGeo} material={glowMaterial} />}
    </group>
  )
}

/** 결정적 의사난수 0~1 (같은 입력은 항상 같은 값) */
export function hash(x: number, y: number, seed = 0) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed, 2147483647)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295
}
