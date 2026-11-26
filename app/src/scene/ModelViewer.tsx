import { useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import type { Object3D } from 'three'
import { Character, PLAYER_LOOK, type Look } from './Player'

/** 미리보기 캐릭터: 제자리 걷기 */
function WalkingCharacter({ look, x, phase = 0 }: { look: Look; x: number; phase?: number }) {
  const limbs = useRef<Object3D[]>([])
  useFrame(({ clock }) => {
    const s = Math.sin(clock.elapsedTime * 6 + phase) * 0.7
    const L = limbs.current
    if (L.length === 4) {
      L[0].rotation.x = s
      L[1].rotation.x = -s
      L[2].rotation.x = -s * 0.8
      L[3].rotation.x = s * 0.8
    }
  })
  return (
    <group position={[x, 0, 0]}>
      <Character nickname="미리보기" limbs={limbs} look={look} hideName />
    </group>
  )
}

/**
 * 모델 확인용 화면: http://localhost:5173/?viewer
 * public/models/ 의 GLB를 바꿔 끼운 뒤 크기·방향·색을 여기서 확인한다.
 */
export function ModelViewer() {
  return (
    <Canvas camera={{ position: [0, 3.2, 7.5], fov: 45 }} dpr={[1, 2]}>
      <color attach="background" args={['#cfe6f7']} />
      <hemisphereLight args={['#dcecff', '#8a7a5c', 1.5]} />
      <directionalLight position={[-6, 10, 8]} intensity={1.6} color="#fff3df" />
      <OrbitControls target={[0, 1.6, 0]} />
      <WalkingCharacter look={PLAYER_LOOK} x={0} />
      <WalkingCharacter look={{ shirt: '#e8854a', hair: '#22201f', cap: '#4f9a4a' }} x={-2.6} phase={1} />
      <WalkingCharacter look={{ shirt: '#7cc26a', hair: '#7a4a2a', cap: null }} x={2.6} phase={2} />
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[7, 48]} />
        <meshLambertMaterial color="#c8cbd0" />
      </mesh>
    </Canvas>
  )
}
