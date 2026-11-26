import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { CanvasTexture, NearestFilter, SRGBColorSpace, type Group, type PerspectiveCamera } from 'three'
import { Prop, type Part } from './lowpoly'
import { textTexture } from './textTexture'

/**
 * 엘리베이터 안: 문 옆 스테인리스 조작반을 가까이서 비스듬히 본 장면.
 *  - 가운데: 조작반 (검은 표시등에 주황 픽셀 ▲·층수, 둥근 사각 버튼, 문 열기·닫기)
 *  - 왼쪽: 유리문. 열리면 밝은 로비, 이동 중에는 승강로가 지나간다
 *  - 오른쪽: 따뜻한 나무 벽과 금속 손잡이
 * 마을과 같은 로우폴리 도형(lowpoly.tsx)과 따뜻한 조명을 쓴다.
 */

export type KeyState = { floor: number; label: string; current: boolean; base: boolean; aria: string }

// ---------- 치수 (z = 0 이 앞벽 면) ----------
const PANEL = { x: 0.45, y: 2.05, w: 1.45, h: 2.6 }
const DISPLAY = { y: 2.95, w: 0.72, h: 0.62 }
const KEYS_TOP = 2.38
const GAP_X = 0.38
const GAP_Y = 0.32
const DOOR = { x0: -2.35, x1: -0.45, h: 2.75 }
const DOOR_W = DOOR.x1 - DOOR.x0
const WALL_H = 3.6

// ---------- 색 ----------
const STEEL = '#cfd0d1'
const STEEL_DARK = '#9fa3a8'
const STEEL_LIGHT = '#e4e4e2'
const WOOD = '#d79a5e'
const WOOD_DARK = '#c2864d'
const WHITE = '#f7f3ea'

/** 앞벽(문 주변 스테인리스 기둥), 조작반 판, 오른쪽 나무 벽, 손잡이, 바닥·천장 */
const CABIN: Part[] = (() => {
  const p: Part[] = []
  // 문 왼쪽 벽 (열린 문짝이 숨는 곳)
  p.push({ p: [-3.6, WALL_H / 2, 0], s: [2.5, WALL_H, 0.2], c: STEEL_DARK, rad: 0.03 })
  // 문 위 벽
  p.push({ p: [(DOOR.x0 + DOOR.x1) / 2, (DOOR.h + WALL_H) / 2, 0], s: [DOOR_W, WALL_H - DOOR.h, 0.2], c: STEEL_DARK, rad: 0.03 })
  // 문과 조작반 사이 스테인리스 기둥 (조작반 배경)
  p.push({ p: [(DOOR.x1 + 1.3) / 2, WALL_H / 2, 0], s: [1.3 - DOOR.x1, WALL_H, 0.2], c: STEEL, rad: 0.03 })
  // 문틀
  p.push({ p: [DOOR.x1 + 0.06, DOOR.h / 2, 0.11], s: [0.12, DOOR.h, 0.08], c: STEEL_LIGHT, rad: 0.03 })
  p.push({ p: [DOOR.x0 - 0.06, DOOR.h / 2, 0.11], s: [0.12, DOOR.h, 0.08], c: STEEL_LIGHT, rad: 0.03 })
  p.push({ p: [(DOOR.x0 + DOOR.x1) / 2, DOOR.h + 0.06, 0.11], s: [DOOR_W + 0.24, 0.12, 0.08], c: STEEL_LIGHT, rad: 0.03 })
  p.push({ p: [(DOOR.x0 + DOOR.x1) / 2, 0.015, 0.1], s: [DOOR_W, 0.03, 0.3], c: STEEL_DARK, rad: 0.01 })
  // 조작반: 바깥 테 + 판 + 표시등 테두리
  p.push({ p: [PANEL.x, PANEL.y, 0.12], s: [PANEL.w + 0.1, PANEL.h + 0.1, 0.06], c: STEEL_DARK, rad: 0.05 })
  p.push({ p: [PANEL.x, PANEL.y, 0.15], s: [PANEL.w, PANEL.h, 0.06], c: STEEL_LIGHT, rad: 0.05 })
  p.push({ p: [PANEL.x, DISPLAY.y, 0.185], s: [DISPLAY.w + 0.08, DISPLAY.h + 0.08, 0.02], c: STEEL_DARK, rad: 0.04 })
  // 오른쪽 나무 벽 (앞벽 + 옆벽), 판자 줄눈
  p.push({ p: [2.0, WALL_H / 2, 0], s: [1.4, WALL_H, 0.2], c: WOOD, rad: 0.03 })
  p.push({ p: [2.7, WALL_H / 2, 1.8], s: [0.2, WALL_H, 3.6], c: WOOD, rad: 0.03 })
  for (const z of [0.6, 1.4, 2.2, 3.0]) p.push({ p: [2.59, WALL_H / 2, z], s: [0.02, WALL_H, 0.03], c: WOOD_DARK })
  p.push({ p: [2.0, 1.2, 0.11], s: [1.4, 0.03, 0.02], c: WOOD_DARK })
  p.push({ p: [2.59, 1.2, 1.8], s: [0.02, 0.03, 3.6], c: WOOD_DARK })
  // 금속 손잡이 (옆벽을 따라 앞으로)
  p.push({ k: 'cyl', p: [2.42, 1.05, 1.8], s: [0.12, 3.2, 0.12], c: '#c9b9a6', r: [Math.PI / 2, 0, 0], seg: 16 })
  for (const z of [0.4, 3.2]) p.push({ k: 'cyl', p: [2.52, 1.05, z], s: [0.08, 0.2, 0.08], c: '#b3a491', r: [0, 0, Math.PI / 2], seg: 10 })
  // 바닥·천장
  p.push({ p: [0, -0.05, 1.8], s: [6, 0.1, 3.6], c: '#d8c6a8', rad: 0.02 })
  p.push({ p: [0, WALL_H + 0.05, 1.8], s: [6, 0.1, 3.6], c: '#efe6d6', rad: 0.02 })
  return p
})()

/** 천장 사각 조명 (밝게) */
const CABIN_LIGHTS: Part[] = [
  { p: [-0.6, WALL_H - 0.01, 1.4], s: [0.6, 0.03, 0.6], c: '#fff7e0', rad: 0.02 },
  { p: [1.4, WALL_H - 0.01, 1.4], s: [0.6, 0.03, 0.6], c: '#fff7e0', rad: 0.02 },
]

// ---------- 로비 (문 너머, 블록 화분이 있는 밝은 층) ----------
const LOBBY_CX = (DOOR.x0 + DOOR.x1) / 2

/** 블록으로 쌓은 화분 나무 (원점 = 화분 바닥) */
export function voxelPlant(x: number, z: number, seed: number, scale = 1): Part[] {
  const s = scale
  const parts: Part[] = [
    { p: [x, 0.35 * s, z], s: [0.62 * s, 0.7 * s, 0.62 * s], c: '#fbfaf6', rad: 0.06 },
    { p: [x, 0.95 * s, z], s: [0.09 * s, 0.6 * s, 0.09 * s], c: '#7a5233', rad: 0.02 },
  ]
  const greens = ['#7cc35a', '#8fd06a', '#68b24c', '#a2da7c']
  const cubes: [number, number, number][] = [
    [0, 1.35, 0], [0.22, 1.5, 0.05], [-0.2, 1.45, -0.08], [0.05, 1.7, 0.12], [-0.12, 1.75, 0.1],
    [0.18, 1.85, -0.1], [-0.25, 1.65, 0.18], [0.3, 1.3, -0.15], [-0.3, 1.25, 0.05], [0, 1.95, -0.02],
    [0.12, 1.6, -0.25], [-0.08, 1.55, 0.28],
  ]
  cubes.forEach(([dx, dy, dz], i) => {
    const size = (0.24 + ((i * 7 + seed) % 3) * 0.04) * s
    parts.push({ p: [x + dx * s, dy * s, z + dz * s], s: [size, size, size], c: greens[(i + seed) % greens.length], rad: 0.015 })
  })
  return parts
}

const LOBBY: Part[] = (() => {
  const p: Part[] = []
  // 바닥 타일 (밝은 크림 체크) + 파란 러그
  for (let i = 0; i < 7; i++) {
    for (let j = 0; j < 6; j++) {
      p.push({ p: [LOBBY_CX - 2.1 + i * 0.7, -0.02, -0.5 - j * 0.7], s: [0.69, 0.04, 0.69], c: (i + j) % 2 ? '#f3e7d2' : '#eadabd', rad: 0.01 })
    }
  }
  p.push({ p: [LOBBY_CX + 0.2, 0.01, -1.6], s: [2.2, 0.02, 1.2], c: '#5a8fd0', rad: 0.01 })
  // 벽 (흰 벽 + 나무 기둥), 천장
  p.push({ p: [LOBBY_CX, 1.8, -4.4], s: [5.2, 3.6, 0.2], c: WHITE, rad: 0.03 })
  p.push({ p: [LOBBY_CX - 2.5, 1.8, -2.2], s: [0.2, 3.6, 4.4], c: '#f1ebde', rad: 0.03 })
  p.push({ p: [LOBBY_CX + 0.9, 1.8, -4.25], s: [0.5, 3.6, 0.15], c: WOOD, rad: 0.03 })
  p.push({ p: [LOBBY_CX, 3.45, -2.2], s: [5.2, 0.3, 4.4], c: '#f4eee2', rad: 0.02 })
  p.push({ p: [LOBBY_CX, 3.1, -2.2], s: [5.2, 0.12, 0.25], c: '#e6dcc8', rad: 0.02 })
  // 액자 (하늘과 블록 나무 그림)
  p.push({ p: [LOBBY_CX - 0.8, 1.9, -4.28], s: [1.3, 1.0, 0.06], c: '#4a4f58', rad: 0.03 })
  p.push({ p: [LOBBY_CX - 0.8, 1.98, -4.24], s: [1.16, 0.7, 0.04], c: '#a9d8f5', rad: 0.01 })
  p.push({ p: [LOBBY_CX - 0.8, 1.68, -4.23], s: [1.16, 0.16, 0.04], c: '#8fd06a', rad: 0.01 })
  p.push({ p: [LOBBY_CX - 0.95, 1.85, -4.22], s: [0.22, 0.22, 0.04], c: '#5fae45', rad: 0.01 })
  p.push({ p: [LOBBY_CX - 0.55, 1.82, -4.22], s: [0.18, 0.18, 0.04], c: '#5fae45', rad: 0.01 })
  p.push({ p: [LOBBY_CX - 1.15, 2.15, -4.22], s: [0.2, 0.1, 0.04], c: '#ffffff', rad: 0.01 })
  p.push({ p: [LOBBY_CX - 0.8, 1.4, -4.28], s: [0.9, 0.2, 0.08], c: '#e9e4da', rad: 0.02 })
  // 블록 화분 두 개
  p.push(...voxelPlant(LOBBY_CX + 0.5, -2.6, 1, 1.05))
  p.push(...voxelPlant(LOBBY_CX - 2.0, -3.6, 2, 0.95))
  return p
})()

const LOBBY_LIGHTS: Part[] = [
  { p: [LOBBY_CX - 0.6, 3.29, -1.4], s: [0.5, 0.02, 0.5], c: '#fff6d8', rad: 0.01 },
  { p: [LOBBY_CX + 0.9, 3.29, -2.8], s: [0.5, 0.02, 0.5], c: '#fff6d8', rad: 0.01 },
  { p: [LOBBY_CX - 1.8, 3.29, -3.4], s: [0.5, 0.02, 0.5], c: '#fff6d8', rad: 0.01 },
]

/** 승강로 철골 한 칸 (이동 중 유리문 너머로 지나간다) */
const SHAFT_BEAM: Part[] = [
  { p: [LOBBY_CX, 0, -0.9], s: [DOOR_W + 1, 0.16, 0.2], c: '#5a5e64', rad: 0.02 },
  { p: [LOBBY_CX - 0.7, 0, -0.95], s: [0.12, 0.5, 0.12], c: '#4a4e54', rad: 0.02 },
]

/** 유리문 한 짝의 스테인리스 테 (원점 = 문짝 가운데 아래) */
const LEAF_W = DOOR_W / 2
const DOOR_FRAME: Part[] = [
  { p: [-LEAF_W / 2 + 0.05, DOOR.h / 2, 0], s: [0.1, DOOR.h, 0.08], c: STEEL_LIGHT, rad: 0.02 },
  { p: [LEAF_W / 2 - 0.05, DOOR.h / 2, 0], s: [0.1, DOOR.h, 0.08], c: STEEL_LIGHT, rad: 0.02 },
  { p: [0, DOOR.h - 0.05, 0], s: [LEAF_W, 0.1, 0.08], c: STEEL_LIGHT, rad: 0.02 },
  { p: [0, 0.08, 0], s: [LEAF_W, 0.16, 0.08], c: STEEL_LIGHT, rad: 0.02 },
]

// ---------- 표시등: 주황 픽셀 글씨 ----------

export type Arrow = '▲' | '▼' | ''

const pixelCache = new Map<string, CanvasTexture>()
/** 작은 캔버스에 글씨를 그리고 알파를 0/1로 잘라 픽셀 글꼴처럼 만든다 */
export function pixelTexture(arrow: Arrow, label: string) {
  const key = `${arrow}|${label}`
  const hit = pixelCache.get(key)
  if (hit) return hit
  const W = 40
  const H = 36
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#ff9d1c'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  // 화살표: 픽셀 삼각형
  if (arrow) {
    for (let r = 0; r < 5; r++) {
      const y = arrow === '▲' ? 3 + r : 7 - r
      ctx.fillRect(W / 2 - r - 1, y, (r + 1) * 2, 1)
    }
  }
  ctx.font = `bold ${label.length > 2 ? 15 : 19}px "Courier New", monospace`
  ctx.fillText(label, W / 2, 23)
  // 알파 이진화 → 또렷한 픽셀
  const img = ctx.getImageData(0, 0, W, H)
  for (let i = 3; i < img.data.length; i += 4) img.data[i] = img.data[i] > 110 ? 255 : 0
  ctx.putImageData(img, 0, 0)
  const tex = new CanvasTexture(c)
  tex.magFilter = NearestFilter
  tex.minFilter = NearestFilter
  tex.colorSpace = SRGBColorSpace
  pixelCache.set(key, tex)
  return tex
}

function Display({ arrow, label }: { arrow: Arrow; label: string }) {
  const tex = pixelTexture(arrow, label)
  return (
    <group position={[PANEL.x, DISPLAY.y, 0.2]}>
      <mesh>
        <planeGeometry args={[DISPLAY.w, DISPLAY.h]} />
        <meshBasicMaterial color="#14120f" />
      </mesh>
      {/* 은은한 빛 번짐 */}
      <mesh position={[0, 0, 0.002]} scale={[1.04, 1.04, 1]}>
        <planeGeometry args={[DISPLAY.w * 0.9, DISPLAY.h * 0.9]} />
        <meshBasicMaterial map={tex} transparent opacity={0.3} color="#ff7a00" />
      </mesh>
      <mesh position={[0, 0, 0.004]}>
        <planeGeometry args={[DISPLAY.w * 0.9, DISPLAY.h * 0.9]} />
        <meshBasicMaterial map={tex} transparent />
      </mesh>
    </group>
  )
}

// ---------- 문 ----------

function Doors({ open }: { open: boolean }) {
  const a = useRef<Group>(null)
  const b = useRef<Group>(null)
  const t = useRef(open ? 1 : 0)
  useFrame((_, dt) => {
    t.current += ((open ? 1 : 0) - t.current) * Math.min(1, dt * 4)
    // 두 짝이 모두 왼쪽으로 겹쳐 열리는 미닫이
    if (a.current) a.current.position.x = DOOR.x0 + LEAF_W * 0.5 - LEAF_W * 0.98 * t.current
    if (b.current) b.current.position.x = DOOR.x0 + LEAF_W * 1.5 - LEAF_W * 1.96 * t.current
  })
  const leaf = (
    <>
      <Prop id="elevator-glass-frame" parts={DOOR_FRAME} shadow={false} />
      <mesh position={[0, DOOR.h / 2, 0]}>
        <planeGeometry args={[LEAF_W - 0.2, DOOR.h - 0.26]} />
        <meshBasicMaterial color="#cfe7f5" transparent opacity={0.16} depthWrite={false} />
      </mesh>
    </>
  )
  return (
    <>
      <group ref={a} position={[DOOR.x0 + LEAF_W * 0.5, 0, -0.32]}>
        {leaf}
      </group>
      <group ref={b} position={[DOOR.x0 + LEAF_W * 1.5, 0, -0.2]}>
        {leaf}
      </group>
    </>
  )
}

/** 문 너머: 멈춰 있으면 로비, 문이 닫혀 움직이면 승강로 철골이 지나간다 */
function Beyond({ open, moving, lobbyLabel }: { open: boolean; moving: -1 | 0 | 1; lobbyLabel: string }) {
  const shaft = useRef<Group>(null)
  const offset = useRef(0)
  useFrame((_, dt) => {
    offset.current = (((offset.current - moving * dt * 6) % 1.2) + 1.2) % 1.2
    if (shaft.current) shaft.current.position.y = offset.current
  })
  const showShaft = !open && moving !== 0
  return (
    <>
      <group visible={!showShaft}>
        <Prop id="elevator-lobby-v2" parts={LOBBY} glow={LOBBY_LIGHTS} shadow={false} />
        <group position={[LOBBY_CX + 1.7, 2.6, -4.28]}>
          <mesh position={[0, 0, -0.01]}>
            <planeGeometry args={[1.2, 0.48]} />
            <meshLambertMaterial color={WOOD_DARK} />
          </mesh>
          <mesh>
            <planeGeometry args={[1.1, 0.38]} />
            <meshBasicMaterial map={textTexture(lobbyLabel, { size: 84, width: 512, height: 178, color: '#5b3f24', bg: '#fff6e2' })} />
          </mesh>
        </group>
      </group>
      <group visible={showShaft}>
        <mesh position={[LOBBY_CX, 1.8, -1.2]}>
          <planeGeometry args={[DOOR_W + 2, 4]} />
          <meshBasicMaterial color="#2b2a28" />
        </mesh>
        <group ref={shaft}>
          {[-1, 0, 1, 2, 3].map((i) => (
            <group key={i} position={[0, i * 1.2, 0]}>
              <Prop id="elevator-shaft-beam" parts={SHAFT_BEAM} shadow={false} />
            </group>
          ))}
        </group>
      </group>
    </>
  )
}

// ---------- 키패드 ----------

function Keypad({
  keys,
  disabled,
  doorsDisabled,
  onPress,
  onOpenDoors,
  onCloseDoors,
}: {
  keys: KeyState[]
  disabled: boolean
  doorsDisabled: boolean
  onPress: (floor: number) => void
  onOpenDoors: () => void
  onCloseDoors: () => void
}) {
  // 참고 이미지처럼 낮은 층이 아래, 왼쪽부터 (버튼이 8개를 넘으면 3열)
  const cols = keys.length > 8 ? 3 : 2
  const sorted = useMemo(() => [...keys].sort((a, b) => a.floor - b.floor), [keys])
  const rows = Math.max(1, Math.ceil(sorted.length / cols))
  const place = (i: number): [number, number, number] => {
    const row = Math.floor(i / cols) // 0 = 맨 아래 줄
    const col = i % cols
    return [PANEL.x + (col - (cols - 1) / 2) * GAP_X, KEYS_TOP - (rows - 1 - row) * GAP_Y, 0.2]
  }
  const ctrlY = KEYS_TOP - rows * GAP_Y - 0.1
  const sockets = useMemo<Part[]>(() => {
    const ps: Part[] = sorted.map((_, i) => ({ p: place(i), s: [0.31, 0.29, 0.03], c: STEEL_DARK, rad: 0.06 }) as Part)
    ps.push({ p: [PANEL.x - GAP_X / 2, ctrlY, 0.2], s: [0.31, 0.29, 0.03], c: STEEL_DARK, rad: 0.06 })
    ps.push({ p: [PANEL.x + GAP_X / 2, ctrlY, 0.2], s: [0.31, 0.29, 0.03], c: STEEL_DARK, rad: 0.06 })
    return ps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sorted.length, cols])

  if (!keys.length) return null
  return (
    <>
      <Prop id={`keypad-v2-${sorted.length}`} parts={sockets} shadow={false} />
      {sorted.map((k, i) => (
        <Html key={k.floor} position={place(i)} center zIndexRange={[5, 0]}>
          <button
            className={`lift-key ${k.current ? 'current' : ''} ${k.base ? 'base' : ''}`}
            disabled={disabled}
            onClick={() => onPress(k.floor)}
            aria-label={k.aria}
            aria-pressed={k.current}
          >
            {k.label}
          </button>
        </Html>
      ))}
      <Html position={[PANEL.x - GAP_X / 2, ctrlY, 0.2]} center zIndexRange={[5, 0]}>
        <button className="lift-key door" onClick={onOpenDoors} disabled={doorsDisabled} aria-label="문 열기">
          ◀|▶
        </button>
      </Html>
      <Html position={[PANEL.x + GAP_X / 2, ctrlY, 0.2]} center zIndexRange={[5, 0]}>
        <button className="lift-key door" onClick={onCloseDoors} disabled={doorsDisabled} aria-label="문 닫기">
          ▶|◀
        </button>
      </Html>
    </>
  )
}

// ---------- 카메라 ----------

/** 조작반을 가까이서 오른쪽에서 비스듬히. 세로 화면은 조작반 위주로 */
function CameraFit({ riding }: { riding: boolean }) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const size = useThree((s) => s.size)
  const base = useRef({ x: 0, y: 2, z: 4 })
  useEffect(() => {
    const aspect = size.width / size.height
    const tan = Math.tan((camera.fov * Math.PI) / 360)
    const portrait = aspect < 0.95
    const x0 = portrait ? PANEL.x - PANEL.w / 2 - 0.25 : DOOR.x0 + 0.4
    const x1 = portrait ? PANEL.x + PANEL.w / 2 + 0.25 : 2.3
    const halfW = (x1 - x0) / 2
    const halfH = 1.45
    const d = Math.max(halfH / tan, halfW / (tan * aspect))
    const cx = (x0 + x1) / 2
    base.current = { x: cx + 0.45, y: 2.0, z: d }
    camera.position.set(base.current.x, base.current.y, d)
    camera.lookAt(cx - 0.1, 1.95, 0)
  }, [camera, size])
  useFrame(({ clock }) => {
    camera.position.y = base.current.y + (riding ? Math.sin(clock.elapsedTime * 38) * 0.005 : 0)
  })
  return null
}

export function ElevatorScene({
  arrow,
  label,
  lobbyLabel,
  doorsOpen,
  moving,
  keys,
  keysDisabled,
  doorsDisabled,
  onPress,
  onOpenDoors,
  onCloseDoors,
}: {
  /** 표시등 화살표 */
  arrow: Arrow
  /** 표시등 층 (짧은 표기: 17, PH) */
  label: string
  /** 문 너머 로비 표지판 (예: 17층) */
  lobbyLabel: string
  doorsOpen: boolean
  /** 이동 방향 (0 = 멈춤) */
  moving: -1 | 0 | 1
  keys: KeyState[]
  keysDisabled: boolean
  doorsDisabled: boolean
  onPress: (floor: number) => void
  onOpenDoors: () => void
  onCloseDoors: () => void
}) {
  return (
    <Canvas dpr={[1, 1.75]} camera={{ fov: 42, near: 0.05, far: 40, position: [0, 2, 4] }} gl={{ antialias: true }}>
      <color attach="background" args={['#2b2a28']} />
      <hemisphereLight args={['#fff4e0', '#9a7a58', 1.25]} />
      <directionalLight position={[3, 5, 5]} intensity={1.1} color="#fff1d8" />
      <pointLight position={[0.8, 3.2, 1.6]} intensity={5} distance={7} color="#ffe2b0" />
      <pointLight position={[LOBBY_CX, 3, -2.2]} intensity={4} distance={6} color="#fff4dc" />
      <CameraFit riding={moving !== 0} />
      <Prop id="elevator-cabin-v2" parts={CABIN} glow={CABIN_LIGHTS} shadow={false} />
      <Beyond open={doorsOpen} moving={moving} lobbyLabel={lobbyLabel} />
      <Doors open={doorsOpen} />
      <Display arrow={arrow} label={label} />
      <Keypad
        keys={keys}
        disabled={keysDisabled}
        doorsDisabled={doorsDisabled}
        onPress={onPress}
        onOpenDoors={onOpenDoors}
        onCloseDoors={onCloseDoors}
      />
    </Canvas>
  )
}
