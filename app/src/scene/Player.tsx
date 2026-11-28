import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { Group, Material, Mesh, MeshLambertMaterial, Object3D, OrthographicCamera, Vector3 } from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { BUILDINGS } from '../config/buildings'
import { cameraRig, player, useApp } from '../store'
import { ENTER_RADIUS, entrancePoint } from './layout'
import { resolveCollisions } from './townPlan'
import { blobTexture } from './patterns'
import { MODELS, WithModel, useModel, vertexColorMaterial } from './models'

const SPEED = 5.2
const tmpDir = new Vector3()
const prev = new Vector3()
const fwd = new Vector3()
const right = new Vector3()
const desired = new Vector3()

/** 캐릭터 겉모습: 셔츠색, 머리색, 모자 (없으면 null) */
export type Look = { shirt: string; hair: string; cap: string | null }

/** 참고 이미지 주인공: 노란 티셔츠, 검은 머리, 모자 없음 */
export const PLAYER_LOOK: Look = { shirt: '#f2c230', hair: '#22201f', cap: null }

const SHIRTS = ['#f2c230', '#e8854a', '#5fa8d8', '#7cc26a', '#e66a6a', '#f4efe2', '#b08ad8']
const HAIRS = ['#22201f', '#22201f', '#4a2e1e', '#7a4a2a', '#d9a441']
const CAPS = ['#4f9a4a', '#4f9a4a', '#3f7fc4', '#d9534a']

/** 이름으로 겉모습을 정한다 (같은 이름은 항상 같은 모습). 마을 주민(NPC)처럼 계정이 없는 사람용 */
export function lookFor(name: string): Look {
  let h = 0
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return {
    shirt: SHIRTS[h % SHIRTS.length],
    hair: HAIRS[(h >>> 4) % HAIRS.length],
    cap: (h >>> 8) % 10 < 4 ? CAPS[(h >>> 12) % CAPS.length] : null,
  }
}

/**
 * 입주민 한 사람의 겉모습. 계정 번호(userId)로 정하므로 어느 기기, 어느 화면(마을·로비·라운지)에서
 * 보든, 내가 보든 남이 보든 같은 모습이다. 별명을 바꿔도 모습은 그대로다.
 * (캐릭터 꾸미기 F13 을 만들면 고른 모습을 서버 프로필에 저장해 이 값 대신 쓴다)
 */
export const lookOf = (userId: string): Look => lookFor(`user:${userId}`)

/** 내 캐릭터 겉모습 */
export function useMyLook(): Look {
  const id = useApp((s) => s.session?.userId)
  return useMemo(() => (id ? lookOf(id) : PLAYER_LOOK), [id])
}

/** 캐릭터 크기 배율 */
export const CHARACTER_SCALE = 1.5
/** 모델 키 (배율 적용 전) */
const MODEL_HEIGHT = 2.2

const SKIN = '#f3c9a0'
const NAVY = '#2f3f6e'
const SHOE = '#4a3426'
const EYE = '#1e1b1a'

function Part({ p, s, color }: { p: [number, number, number]; s: [number, number, number]; color: string }) {
  return (
    <mesh position={p} castShadow>
      <boxGeometry args={s} />
      <meshLambertMaterial color={color} />
    </mesh>
  )
}

type Limbs = React.MutableRefObject<Object3D[]>

/**
 * 박스 조각으로 만든 같은 모양의 캐릭터. GLB 모델을 불러오는 동안이나 실패했을 때 대신 보여 준다.
 */
function BoxBody({ look, limbs }: { look: Look; limbs: Limbs }) {
  const setLimb = (i: number) => (g: Group | null) => {
    if (g) limbs.current[i] = g
  }
  return (
    <group>
      {[-0.15, 0.15].map((x, i) => (
        <group key={x} ref={setLimb(i)} position={[x, 0.56, 0]}>
          <Part p={[0, -0.1, 0]} s={[0.27, 0.24, 0.3]} color={NAVY} />
          <Part p={[0, -0.31, 0]} s={[0.21, 0.2, 0.23]} color={SKIN} />
          <Part p={[0, -0.48, 0.03]} s={[0.26, 0.14, 0.34]} color={SHOE} />
        </group>
      ))}
      <Part p={[0, 0.84, 0]} s={[0.62, 0.56, 0.38]} color={look.shirt} />
      <Part p={[0, 0.61, 0]} s={[0.62, 0.12, 0.39]} color={NAVY} />
      <Part p={[0, 0.83, 0.19]} s={[0.26, 0.34, 0.04]} color={NAVY} />
      {[-0.4, 0.4].map((x, i) => (
        <group key={x} ref={setLimb(i + 2)} position={[x, 1.06, 0]}>
          <Part p={[0, -0.1, 0]} s={[0.2, 0.24, 0.24]} color={look.shirt} />
          <Part p={[0, -0.36, 0]} s={[0.18, 0.3, 0.21]} color={SKIN} />
        </group>
      ))}
      <Part p={[0, 1.57, 0]} s={[0.84, 0.82, 0.8]} color={SKIN} />
      {[-0.17, 0.17].map((x) => (
        <Part key={x} p={[x, 1.56, 0.405]} s={[0.09, 0.15, 0.03]} color={EYE} />
      ))}
      <Part p={[0, 2.01, -0.01]} s={[0.9, 0.2, 0.86]} color={look.cap ?? look.hair} />
      <Part p={[0, 1.73, -0.36]} s={[0.9, 0.6, 0.16]} color={look.hair} />
      <Part p={[0, 1.88, 0.41]} s={[0.9, 0.14, 0.1]} color={look.cap ?? look.hair} />
    </group>
  )
}

/** 색별 재질은 공유 */
const materials = new Map<string, MeshLambertMaterial>()
function colorMaterial(color: string) {
  let m = materials.get(color)
  if (!m) materials.set(color, (m = new MeshLambertMaterial({ color })))
  return m
}

/**
 * GLB 캐릭터 (public/models/character.glb).
 * 노드 LegL·LegR·ArmL·ArmR는 걷기 동작에, 재질 "Jacket"·"Hair"·"Cap"은 겉모습 색에, 노드 "Cap"은 모자 표시에 쓴다.
 */
function GlbBody({ look, limbs }: { look: Look; limbs: Limbs }) {
  const { scene } = useModel(MODELS.character)
  const model = useMemo(() => {
    const m = scene.clone(true) // 지오메트리는 공유, 노드만 복제
    m.traverse((o) => {
      const mesh = o as Mesh
      if (!mesh.isMesh) return
      const name = (mesh.material as Material).name
      mesh.material =
        name === 'Jacket'
          ? colorMaterial(look.shirt)
          : name === 'Hair'
            ? colorMaterial(look.hair)
            : name === 'Cap'
              ? colorMaterial(look.cap ?? look.hair)
              : vertexColorMaterial
      mesh.castShadow = true
    })
    const cap = m.getObjectByName('Cap')
    if (cap) cap.visible = !!look.cap
    return m
  }, [scene, look.shirt, look.hair, look.cap])
  useLayoutEffect(() => {
    const nodes = LIMB_NODES.map((n) => model.getObjectByName(n))
    if (nodes.every(Boolean)) limbs.current = nodes as Object3D[]
  }, [model, limbs])
  return <primitive object={model} />
}

const LIMB_NODES = ['LegL', 'LegR', 'ArmL', 'ArmR']

/** 캐릭터 = 모델(GLB, 없으면 박스) + 발밑 그림자 + 닉네임 */
export function Character({
  nickname,
  limbs,
  hideName,
  look,
}: {
  nickname: string
  limbs: Limbs
  hideName?: boolean
  /** 생략하면 이름으로 정해진다 */
  look?: Look
}) {
  const l = useMemo(() => look ?? lookFor(nickname), [look, nickname])
  return (
    <group>
      <group scale={CHARACTER_SCALE}>
        <WithModel fallback={<BoxBody look={l} limbs={limbs} />}>
          <GlbBody look={l} limbs={limbs} />
        </WithModel>
      </group>
      {/* 발밑 그림자 */}
      <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1.7, 1.7]} />
        <meshBasicMaterial map={blobTexture()} transparent depthWrite={false} />
      </mesh>
      {!hideName && (
        <Html position={[0, (MODEL_HEIGHT + 0.35) * CHARACTER_SCALE, 0]} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
          <div className="nametag">{nickname}</div>
        </Html>
      )}
    </group>
  )
}

/** 내 캐릭터: 클릭/터치 목표 이동 + 키보드 이동, 카메라 추적, 입구 근접 감지 */
export function Player({ nickname }: { nickname: string }) {
  const look = useMyLook()
  const root = useRef<Group>(null)
  const limbs = useRef<Object3D[]>([])
  const walkT = useRef(0)
  const marker = useRef<Group>(null)
  const controls = useThree((s) => s.controls) as unknown as OrbitControlsImpl | null
  const camera = useThree((s) => s.camera)
  const entrances = useMemo(() => BUILDINGS.map((b) => ({ id: b.id, p: entrancePoint(b) })), [])

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const g = root.current
    if (!g) return
    const pos = player.position
    prev.copy(pos)

    // 키보드 이동은 카메라 기준 방향
    const { x: kx, z: kz } = player.keys
    let moving = false
    if (kx || kz) {
      player.target = null
      // 키보드로 걸으면 다시 캐릭터를 따라간다
      if (cameraRig.free) {
        cameraRig.free = false
        useApp.getState().setCameraFree(false)
      }
      camera.getWorldDirection(fwd)
      fwd.y = 0
      fwd.normalize()
      right.crossVectors(fwd, camera.up).normalize()
      tmpDir.set(0, 0, 0).addScaledVector(fwd, -kz).addScaledVector(right, kx).normalize()
      pos.addScaledVector(tmpDir, SPEED * dt)
      moving = true
    } else if (player.target) {
      tmpDir.subVectors(player.target, pos)
      tmpDir.y = 0
      const dist = tmpDir.length()
      if (dist < 0.08) {
        player.target = null
      } else {
        tmpDir.divideScalar(dist)
        pos.addScaledVector(tmpDir, Math.min(dist, SPEED * dt))
        moving = true
      }
    }
    resolveCollisions(pos)
    // 벽에 막혀 거의 못 움직이면 목표 취소
    if (moving && player.target && pos.distanceToSquared(prev) < 1e-6) player.target = null
    player.moving = moving

    g.position.copy(pos)
    if (moving) {
      const yaw = Math.atan2(tmpDir.x, tmpDir.z)
      let d = yaw - g.rotation.y
      d = Math.atan2(Math.sin(d), Math.cos(d))
      g.rotation.y += d * Math.min(1, dt * 12)
    }

    // 걷기: 팔다리 각도 회전
    walkT.current += dt * (moving ? 10 : 0)
    const swing = moving ? Math.sin(walkT.current) * 0.7 : 0
    const L = limbs.current
    if (L.length === 4) {
      const k = Math.min(1, dt * 14)
      L[0].rotation.x += (swing - L[0].rotation.x) * k
      L[1].rotation.x += (-swing - L[1].rotation.x) * k
      L[2].rotation.x += (-swing * 0.8 - L[2].rotation.x) * k
      L[3].rotation.x += (swing * 0.8 - L[3].rotation.x) * k
    }
    g.position.y = moving ? Math.abs(Math.sin(walkT.current)) * 0.08 : 0

    // 목표 마커
    if (marker.current) {
      marker.current.visible = !!player.target
      if (player.target) {
        marker.current.position.copy(player.target)
        marker.current.rotation.y += dt * 3
      }
    }

    // 카메라: 섬 전체가 보이는 배율에서는 섬 중심을, 확대할수록 캐릭터를 따라간다
    // (손가락으로 화면을 옮겼거나 캐릭터 보기로 돌아가는 중이면 따라가지 않는다)
    if (controls && !cameraRig.free && !cameraRig.focusing) {
      const zoom = (state.camera as OrthographicCamera).zoom ?? 1
      const follow = Math.min(1, Math.max(0, (zoom / cameraRig.baseZoom - 1) / 0.8))
      desired.set(
        cameraRig.center.x + (pos.x - cameraRig.center.x) * follow,
        cameraRig.center.y,
        cameraRig.center.z + (pos.z - cameraRig.center.z) * follow,
      )
      tmpDir.subVectors(desired, controls.target).multiplyScalar(Math.min(1, dt * 5))
      state.camera.position.add(tmpDir)
      controls.target.add(tmpDir)
      controls.update()
    }

    // 입구 근접 감지
    let near: (typeof entrances)[number]['id'] | null = null
    for (const e of entrances) {
      if (e.p.distanceTo(pos) < ENTER_RADIUS) near = e.id
    }
    useApp.getState().setNearBuilding(near)
  })

  return (
    <>
      <group ref={root} position={player.position.toArray()}>
        <Character nickname={nickname} limbs={limbs} look={look} />
      </group>
      <group ref={marker} visible={false}>
        <mesh position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.3, 0.45, 4]} />
          <meshBasicMaterial color="#fbbf24" />
        </mesh>
      </group>
    </>
  )
}
