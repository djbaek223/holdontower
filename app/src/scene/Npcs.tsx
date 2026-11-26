import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Group, Object3D, Vector3 } from 'three'
import { Character } from './Player'
import { hash } from './lowpoly'
import { randomPathPoint, resolveCollisions } from './townPlan'

/**
 * 마을을 걸어 다니는 주민(NPC). 실제 입주민이 아니라 분위기용이라 이름표를 달지 않는다.
 * 길 위의 임의 지점으로 걷다가 잠깐 쉬고, 다시 다른 곳으로 간다.
 */
const NPC_SEEDS = ['산책하는 이웃', '꽃집 주인', '빵집 손님', '시장 상인', '출근길 직장인', '동네 학생']
const SPEED = 2.6

type NpcState = {
  pos: Vector3
  target: Vector3
  wait: number
  trip: number
  walk: number
}

function Npc({ name, index }: { name: string; index: number }) {
  const root = useRef<Group>(null)
  const limbs = useRef<Object3D[]>([])
  const st = useMemo<NpcState>(() => {
    const [x, z] = randomPathPoint(index * 97 + 5)
    const [tx, tz] = randomPathPoint(index * 97 + 6)
    return { pos: new Vector3(x, 0, z), target: new Vector3(tx, 0, tz), wait: hash(index, 1) * 3, trip: 0, walk: 0 }
  }, [index])
  const dir = useMemo(() => new Vector3(), [])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const g = root.current
    if (!g) return
    let moving = false
    if (st.wait > 0) {
      st.wait -= dt
    } else {
      dir.subVectors(st.target, st.pos)
      const dist = dir.length()
      if (dist < 0.3) {
        // 도착: 잠깐 쉬었다가 다음 목적지로
        st.wait = 1.5 + hash(index, st.trip, 3) * 4
        st.trip++
        const [x, z] = randomPathPoint(index * 97 + st.trip * 13 + 7)
        st.target.set(x, 0, z)
      } else {
        dir.divideScalar(dist)
        const before = st.pos.clone()
        st.pos.addScaledVector(dir, Math.min(dist, SPEED * dt))
        resolveCollisions(st.pos)
        // 막혀서 못 가면 다른 목적지로
        if (st.pos.distanceToSquared(before) < 1e-6) {
          st.trip++
          const [x, z] = randomPathPoint(index * 97 + st.trip * 13 + 7)
          st.target.set(x, 0, z)
        }
        moving = true
        const yaw = Math.atan2(dir.x, dir.z)
        let d = yaw - g.rotation.y
        d = Math.atan2(Math.sin(d), Math.cos(d))
        g.rotation.y += d * Math.min(1, dt * 8)
      }
    }
    g.position.copy(st.pos)
    st.walk += moving ? dt * 8 : 0
    const swing = moving ? Math.sin(st.walk) * 0.6 : 0
    const L = limbs.current
    if (L.length === 4) {
      const k = Math.min(1, dt * 12)
      L[0].rotation.x += (swing - L[0].rotation.x) * k
      L[1].rotation.x += (-swing - L[1].rotation.x) * k
      L[2].rotation.x += (-swing * 0.8 - L[2].rotation.x) * k
      L[3].rotation.x += (swing * 0.8 - L[3].rotation.x) * k
    }
  })

  return (
    <group ref={root}>
      <Character nickname={name} limbs={limbs} hideName />
    </group>
  )
}

export function Npcs() {
  return (
    <>
      {NPC_SEEDS.map((name, i) => (
        <Npc key={name} name={name} index={i} />
      ))}
    </>
  )
}
