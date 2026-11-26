import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Group, MeshLambertMaterial } from 'three'
import { hash, partsGeometry, type Part } from './lowpoly'

const cloudMaterial = new MeshLambertMaterial({ vertexColors: true, flatShading: true })

/** 몽글몽글한 로우폴리 구름 하나 */
function cloudParts(seed: number): Part[] {
  const parts: Part[] = []
  const n = 4 + Math.floor(hash(seed, 1) * 3)
  for (let i = 0; i < n; i++) {
    const s = 5 + hash(seed, i, 2) * 6
    parts.push({ k: 'ico', p: [(i - n / 2) * 4 + hash(seed, i, 3) * 2, hash(seed, i, 4) * 2.5, hash(seed, i, 5) * 3], s: [s, s * 0.7, s * 0.8], c: '#ffffff' })
  }
  return parts
}

/** 섬 주변과 아래에 떠 있는 구름 (천천히 흘러감) */
const CLOUDS: { p: [number, number, number]; s: number; speed: number }[] = [
  { p: [-95, -14, 20], s: 1.4, speed: 0.6 },
  { p: [-80, -26, 60], s: 1.1, speed: 0.4 },
  { p: [90, -18, 40], s: 1.3, speed: 0.5 },
  { p: [70, -30, -40], s: 1, speed: 0.35 },
  { p: [-60, 6, -90], s: 1.2, speed: 0.45 },
  { p: [40, 14, -100], s: 1, speed: 0.3 },
  { p: [10, -34, 80], s: 1.5, speed: 0.5 },
]

export function Clouds() {
  const geos = useMemo(() => CLOUDS.map((_, i) => partsGeometry(`cloud-${i}`, cloudParts(i + 1), { ao: false })), [])
  const refs = useRef<(Group | null)[]>([])
  useFrame(({ clock }) => {
    refs.current.forEach((g, i) => {
      if (!g) return
      const c = CLOUDS[i]
      g.position.x = c.p[0] + Math.sin(clock.elapsedTime * 0.05 * c.speed + i) * 8
      g.position.y = c.p[1] + Math.sin(clock.elapsedTime * 0.2 + i) * 0.6
    })
  })
  return (
    <>
      {CLOUDS.map((c, i) => (
        <group key={i} ref={(g) => (refs.current[i] = g)} position={c.p} scale={c.s}>
          <mesh geometry={geos[i]} material={cloudMaterial} />
        </group>
      ))}
    </>
  )
}
