import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import { BUILDINGS } from '../config/buildings'
import { Building } from './Building'
import { Island } from './Island'
import { Npcs } from './Npcs'
import { PropInstances, Prop, glowMaterial, partsGeometry, type Placement } from './lowpoly'
import {
  BENCH,
  BUSH,
  FLOWER_BED,
  FOUNTAIN as FOUNTAIN_PARTS,
  FOUNTAIN_WATER,
  LAMP,
  LAMP_GLOW,
  NEWS_BOARD as NEWS_BOARD_PARTS,
  SIGNBOARD as SIGNBOARD_PARTS,
  WINDMILL_HUB_Y,
  cafeParts,
  gardenParts,
  houseParts,
  stallParts,
  townHallParts,
  treeParts,
  windmillBladeParts,
  windmillParts,
} from './props'
import { textTexture } from './textTexture'
import {
  BENCHES,
  BUSHES,
  CAFE,
  FLOWER_BEDS,
  FOUNTAIN,
  GARDEN,
  HOUSES,
  LAMPS,
  NEWS_BOARD,
  SIGNBOARD,
  STALLS,
  TOWN_HALL,
  TREES,
  WINDMILL,
  type TreeKind,
} from './townPlan'

function TextPlane({
  text,
  w,
  h,
  p,
  opts,
}: {
  text: string
  w: number
  h: number
  p: [number, number, number]
  opts: Parameters<typeof textTexture>[1]
}) {
  return (
    <mesh position={p}>
      <planeGeometry args={[w, h]} />
      <meshBasicMaterial map={textTexture(text, opts)} transparent />
    </mesh>
  )
}

/** 천천히 도는 풍차 */
function Windmill() {
  const blades = useRef<Group>(null)
  useFrame((_, dt) => {
    if (blades.current) blades.current.rotation.z -= dt * 0.5
  })
  return (
    <group position={WINDMILL.p} rotation={[0, 0.5, 0]}>
      <Prop id="windmill" parts={windmillParts()} />
      <group ref={blades} position={[0, WINDMILL_HUB_Y, 3.7]}>
        <Prop id="windmill-blades" parts={windmillBladeParts()} />
      </group>
    </group>
  )
}

const TREE_KINDS: TreeKind[] = ['round', 'tall', 'pine']

export function Town() {
  const geos = useMemo(
    () => ({
      trees: Object.fromEntries(TREE_KINDS.map((k) => [k, partsGeometry(`tree-${k}`, treeParts(k))])) as Record<TreeKind, ReturnType<typeof partsGeometry>>,
      bush: partsGeometry('bush', BUSH),
      lamp: partsGeometry('lamp', LAMP),
      lampGlow: partsGeometry('lamp-glow', LAMP_GLOW, { ao: false }),
      bench: partsGeometry('bench', BENCH),
      flowerBed: partsGeometry('flower-bed', FLOWER_BED),
    }),
    [],
  )
  const treesByKind = useMemo(() => {
    const m: Record<TreeKind, Placement[]> = { round: [], tall: [], pine: [] }
    TREES.forEach((t) => m[t.kind].push(t))
    return m
  }, [])

  return (
    <group>
      <Island />

      {/* 자연: 종류별 인스턴싱 */}
      {TREE_KINDS.map((k) => (
        <PropInstances key={k} geometry={geos.trees[k]} items={treesByKind[k]} />
      ))}
      <PropInstances geometry={geos.bush} items={BUSHES} />
      <PropInstances geometry={geos.flowerBed} items={FLOWER_BEDS} />

      {/* 거리 소품 */}
      <PropInstances geometry={geos.lamp} items={LAMPS} />
      <PropInstances geometry={geos.lampGlow} items={LAMPS} material={glowMaterial} shadow={false} />
      <PropInstances geometry={geos.bench} items={BENCHES} />

      {/* 광장 분수 */}
      <Prop id="fountain" parts={FOUNTAIN_PARTS} glow={FOUNTAIN_WATER} position={FOUNTAIN.p} />

      {/* 랜드마크 */}
      <Prop id="town-hall" parts={townHallParts()} position={TOWN_HALL.p} />
      <Windmill />

      {/* 집, 카페, 노점, 텃밭 */}
      {HOUSES.map((h) => (
        <Prop key={h.p.join()} id={`house-${h.roof}`} parts={houseParts(h.roof)} position={h.p} />
      ))}
      <Prop id="cafe" parts={cafeParts()} position={CAFE.p} />
      {STALLS.map((s) => (
        <Prop key={s.p.join()} id={`stall-${s.color}`} parts={stallParts(s.color)} position={s.p} />
      ))}
      <Prop id="garden" parts={gardenParts(GARDEN.w, GARDEN.d)} position={GARDEN.p} />

      {/* 마을 간판과 층 소식 게시판 */}
      <group position={SIGNBOARD.p}>
        <Prop id="signboard" parts={SIGNBOARD_PARTS} />
        <TextPlane text="주식 빌딩 시티" w={6} h={1.25} p={[0, 3.95, 0.3]} opts={{ size: 110, width: 800, height: 166, color: '#6e4628' }} />
        <TextPlane text="같은 층 이웃과 소식을 나눠요" w={5.6} h={0.6} p={[0, 3, 0.3]} opts={{ size: 50, width: 860, height: 92, color: '#8a6a4a' }} />
      </group>
      <group position={NEWS_BOARD.p}>
        <Prop id="news-board" parts={NEWS_BOARD_PARTS} />
        <TextPlane text="오늘의 층 소식" w={3.6} h={0.5} p={[0, 3.2, 0.25]} opts={{ size: 64, width: 700, height: 96, color: '#ffffff', bg: '#3d7a5b' }} />
      </group>

      {BUILDINGS.map((b) => (
        <Building key={b.id} b={b} />
      ))}

      <Npcs />
    </group>
  )
}
