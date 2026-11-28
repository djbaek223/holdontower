import { useEffect, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import type { OrthographicCamera, TOUCH } from 'three'
import { cameraRig, useApp } from '../store'
import { Town } from './Town'
import { skyTexture } from './patterns'
import { Player } from './Player'
import { Clouds } from './Clouds'
import { CameraGestures } from './CameraGestures'

/** 0.5초마다 평균 FPS를 store에 기록 (게이트: 모바일 30fps 이상 확인용) */
function FpsProbe() {
  const acc = useRef({ t: 0, n: 0 })
  useFrame((_, dt) => {
    const a = acc.current
    a.t += dt
    a.n++
    if (a.t >= 0.5) {
      useApp.getState().setFps(Math.round(a.n / a.t))
      a.t = 0
      a.n = 0
    }
  })
  return null
}

/** 아이소메트릭 시점 방향 (오른쪽 앞 위에서 내려다봄) */
const VIEW_DIR: [number, number, number] = [1, 0.95, 1.15]
const ISLAND_SPAN = 150 // 화면에 담을 섬 폭 (대각선 기준)

/** OrbitControls 의 터치 조작 끄기 (TOUCH 값이 아니면 아무것도 하지 않는다) */
const NO_TOUCH = { ONE: -1 as TOUCH, TWO: -1 as TOUCH }

/** 모바일·저사양은 그림자 해상도를 낮춘다 */
const LOW_POWER = typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches || window.innerWidth < 768)

/** 화면 크기에 맞춰 섬 전체가 들어오는 배율을 정한다 */
function FitCamera() {
  const camera = useThree((s) => s.camera) as OrthographicCamera
  const size = useThree((s) => s.size)
  const controls = useThree((s) => s.controls) as unknown as { minZoom: number } | null
  useEffect(() => {
    // 세로 화면(모바일)은 섬 좌우를 조금 잘라 더 크게 보여 준다
    const span = size.width < size.height ? ISLAND_SPAN * 0.62 : ISLAND_SPAN
    const zoom = Math.min(size.width / span, size.height / (ISLAND_SPAN * 0.62))
    cameraRig.baseZoom = zoom
    camera.zoom = zoom
    camera.updateProjectionMatrix()
    // 축소는 섬 전체가 보이는 배율보다 조금만 더, 확대는 기존 상한까지
    if (controls) controls.minZoom = Math.max(2.5, zoom * 0.7)
    // 처음 한 번만 (이후 확대·축소는 사용자 조작). controls 는 처음 그린 뒤에 생긴다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controls])
  return null
}

export function World({ nickname }: { nickname: string }) {
  // 건물 안(엘리베이터·층 화면)에 있는 동안은 마을을 다시 그리지 않는다 (배터리 절약)
  const inside = useApp((st) => st.insideBuilding !== null)
  const [vx, vy, vz] = VIEW_DIR
  const c = cameraRig.center
  return (
    <Canvas
      // 부드러운 그림자(PCF soft), 픽셀비 상한, 단색 Lambert 머티리얼
      shadows
      dpr={[1, 1.75]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      orthographic
      frameloop={inside ? 'never' : 'always'}
      camera={{ position: [c.x + vx * 100, c.y + vy * 100, c.z + vz * 100], zoom: 10, near: 1, far: 600 }}
    >
      <primitive attach="background" object={skyTexture()} />
      {/* 따뜻한 오후 햇빛 + 하늘빛 환경광 */}
      <hemisphereLight args={['#e6f2ff', '#a8906a', 1.35]} />
      <directionalLight
        position={[-45, 95, 55]}
        intensity={2.1}
        color="#fff1d8"
        castShadow
        shadow-mapSize={LOW_POWER ? [1024, 1024] : [2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.06}
        shadow-radius={4}
        shadow-camera-left={-80}
        shadow-camera-right={80}
        shadow-camera-top={80}
        shadow-camera-bottom={-80}
        shadow-camera-near={1}
        shadow-camera-far={260}
      />
      <Clouds />
      <OrbitControls
        makeDefault
        target={[c.x, c.y, c.z]}
        enablePan={false}
        // 터치는 CameraGestures 가 맡는다 (한 손가락 팬, 두 손가락 회전, 핀치). 마우스·휠은 그대로
        touches={NO_TOUCH}
        enableDamping
        dampingFactor={0.12}
        zoomSpeed={1.8}
        minZoom={2.5}
        maxZoom={60}
        minPolarAngle={0.45}
        maxPolarAngle={1.2}
      />
      <Town />
      <Player nickname={nickname} />
      <CameraGestures />
      <FpsProbe />
      <FitCamera />
    </Canvas>
  )
}
