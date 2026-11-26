/**
 * 코드로 3D 모델(GLB)을 만들어 public/models/ 에 저장한다.
 *   npm run models
 *
 * 나중에 Blender·AI 3D 도구로 만든 모델로 바꿀 때도 같은 파일 이름과 아래 규칙만 지키면 앱이 그대로 쓴다.
 * (규칙은 public/models/README.md 참고)
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  BufferAttribute,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Scene,
  SphereGeometry,
  TorusGeometry,
} from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'

// GLTFExporter가 브라우저의 FileReader를 쓰므로 Node용으로 최소 구현
globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buf) => {
      this.result = buf
      this.onloadend?.()
    })
  }
  readAsDataURL(blob) {
    blob.arrayBuffer().then((buf) => {
      this.result = `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(buf).toString('base64')}`
      this.onloadend?.()
    })
  }
}

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'models')
mkdirSync(OUT, { recursive: true })

// ---------- 도우미 ----------

/** 색을 정점 색으로 칠하고, 위치·회전·크기를 지오메트리에 굽는다 (병합용) */
function piece(geo, color, { p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1] } = {}) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone()
  const m = new Mesh(g)
  m.position.set(...p)
  m.rotation.set(...r)
  m.scale.set(...s)
  m.updateMatrix()
  g.applyMatrix4(m.matrix)
  const c = new Color(color) // three가 sRGB 색을 선형 작업 공간으로 바꿔 준다
  const n = g.attributes.position.count
  const arr = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3)
  g.setAttribute('color', new BufferAttribute(arr, 3))
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k)
  return g
}

// 모서리가 작으면 분할을 줄여 정점 수를 아낀다
const rbox = (w, h, d, r = 0.06, seg) =>
  new RoundedBoxGeometry(w, h, d, Math.min(seg ?? 2, r < 0.05 ? 1 : 2), Math.min(r, w / 2, h / 2, d / 2) - 1e-4)
const sphere = (rad, ws = 12, hs = 8) => new SphereGeometry(rad, ws, hs)

/** 정점 색 기반 메시 하나 (드로우콜 1개) */
function colored(name, parts, opts = {}) {
  // 병합 후 같은 정점을 공유하도록 인덱싱 → 파일 크기 크게 감소
  const geo = mergeVertices(mergeGeometries(parts), 1e-4)
  const mesh = new Mesh(
    geo,
    new MeshStandardMaterial({ name: opts.material ?? 'Base', vertexColors: true, roughness: 0.8, metalness: 0 }),
  )
  mesh.name = name
  return mesh
}

async function save(name, root) {
  const scene = new Scene()
  scene.add(root)
  const glb = await new GLTFExporter().parseAsync(scene, { binary: true })
  writeFileSync(join(OUT, name), Buffer.from(glb))
  console.log(`✓ ${name} (${(glb.byteLength / 1024).toFixed(1)} KB)`)
}

// ---------- 캐릭터 ----------
// 블록형 꼬마 캐릭터 (약 2.3등신): 큰 정육면체 머리, 짧은 몸과 팔다리.
// 원점: 발바닥 중앙, 정면 +Z, 키 약 2.2 (앱에서 1.5배)
// 노드: LegL, LegR (엉덩이 피벗), ArmL, ArmR (어깨 피벗), Head, Cap(모자, 앱이 켜고 끔)
// 재질 이름으로 앱이 색을 바꿔 칠한다: "Jacket"(셔츠), "Hair"(머리카락), "Cap"(모자)

const SKIN = '#f3c9a0'
const SHIRT = '#f2c230' // 기본 노란 티셔츠 (앱이 닉네임별로 바꿈)
const NAVY = '#2f3f6e'
const SHOE = '#4a3426'
const HAIR = '#22201f'
const CAP = '#4f9a4a'
const EYE = '#1e1b1a'

// 모서리만 살짝 둥근 블록
const blk = (w, h, d, r = 0.035) => rbox(w, h, d, r, 1)

function buildCharacter() {
  const root = new Group()
  root.name = 'Character'

  // 다리: 남색 반바지 + 살색 정강이 + 짙은 신발
  for (const [name, x] of [
    ['LegL', -0.15],
    ['LegR', 0.15],
  ]) {
    const leg = new Group()
    leg.name = name
    leg.position.set(x, 0.56, 0)
    leg.add(
      colored(`${name}Mesh`, [
        piece(blk(0.27, 0.24, 0.3), NAVY, { p: [0, -0.1, 0] }),
        piece(blk(0.21, 0.2, 0.23), SKIN, { p: [0, -0.31, 0] }),
        piece(blk(0.26, 0.14, 0.34), SHOE, { p: [0, -0.48, 0.03] }),
      ]),
    )
    root.add(leg)
  }

  // 몸통: 셔츠 + 가운데 남색 앞판 + 목둘레
  const body = new Group()
  body.name = 'Body'
  body.add(
    colored('BodyShirt', [piece(blk(0.62, 0.56, 0.38, 0.05), SHIRT, { p: [0, 0.84, 0] })], { material: 'Jacket' }),
    colored('BodyDetail', [
      piece(blk(0.62, 0.12, 0.39, 0.03), NAVY, { p: [0, 0.61, 0] }), // 허리띠 겸 바지 윗단
      piece(blk(0.26, 0.34, 0.04, 0.015), NAVY, { p: [0, 0.83, 0.19] }), // 앞판
      piece(blk(0.3, 0.06, 0.4, 0.02), '#e9e2d4', { p: [0, 1.1, 0] }), // 목둘레
    ]),
  )
  root.add(body)

  // 팔: 짧은 소매 + 살색 팔 + 손
  for (const [name, x] of [
    ['ArmL', -0.4],
    ['ArmR', 0.4],
  ]) {
    const arm = new Group()
    arm.name = name
    arm.position.set(x, 1.06, 0)
    arm.add(
      colored(`${name}Sleeve`, [piece(blk(0.2, 0.24, 0.24), SHIRT, { p: [0, -0.1, 0] })], { material: 'Jacket' }),
      colored(`${name}Hand`, [
        piece(blk(0.17, 0.22, 0.2), SKIN, { p: [0, -0.32, 0] }),
        piece(blk(0.19, 0.13, 0.22, 0.05), SKIN, { p: [0, -0.48, 0] }),
      ]),
    )
    root.add(arm)
  }

  // 머리: 큰 정육면체 + 점 눈 + 작은 입 + 귀
  const head = new Group()
  head.name = 'Head'
  head.position.set(0, 1.12, 0)
  const hy = 0.45 // 머리 중심 (Head 기준)
  const fz = 0.4 // 얼굴 앞면
  head.add(
    colored('HeadMesh', [
      piece(blk(0.84, 0.82, 0.8, 0.06), SKIN, { p: [0, hy, 0] }),
      piece(blk(0.08, 0.16, 0.14, 0.02), SKIN, { p: [-0.44, hy - 0.04, 0] }),
      piece(blk(0.08, 0.16, 0.14, 0.02), SKIN, { p: [0.44, hy - 0.04, 0] }),
      piece(blk(0.09, 0.15, 0.03, 0.01), EYE, { p: [-0.17, hy - 0.01, fz + 0.005] }),
      piece(blk(0.09, 0.15, 0.03, 0.01), EYE, { p: [0.17, hy - 0.01, fz + 0.005] }),
      piece(blk(0.035, 0.035, 0.02, 0.005), '#ffffff', { p: [-0.15, hy + 0.035, fz + 0.022] }),
      piece(blk(0.035, 0.035, 0.02, 0.005), '#ffffff', { p: [0.19, hy + 0.035, fz + 0.022] }),
      piece(blk(0.14, 0.035, 0.02, 0.008), '#9a4a3a', { p: [0, hy - 0.2, fz + 0.005] }),
      piece(blk(0.1, 0.05, 0.02, 0.01), '#f2a08c', { p: [-0.28, hy - 0.13, fz + 0.002] }),
      piece(blk(0.1, 0.05, 0.02, 0.01), '#f2a08c', { p: [0.28, hy - 0.13, fz + 0.002] }),
    ]),
    // 머리카락: 정수리, 뒷머리, 옆머리, 들쭉날쭉한 앞머리
    colored(
      'HairMesh',
      [
        piece(blk(0.9, 0.2, 0.86, 0.05), HAIR, { p: [0, hy + 0.44, -0.01] }),
        piece(blk(0.9, 0.6, 0.16, 0.04), HAIR, { p: [0, hy + 0.16, -0.36] }),
        piece(blk(0.08, 0.36, 0.76, 0.03), HAIR, { p: [-0.44, hy + 0.24, -0.03] }),
        piece(blk(0.08, 0.36, 0.76, 0.03), HAIR, { p: [0.44, hy + 0.24, -0.03] }),
        piece(blk(0.9, 0.14, 0.1, 0.03), HAIR, { p: [0, hy + 0.31, fz + 0.01] }),
        piece(blk(0.2, 0.12, 0.09, 0.02), HAIR, { p: [-0.3, hy + 0.2, fz + 0.01] }),
        piece(blk(0.16, 0.1, 0.09, 0.02), HAIR, { p: [-0.07, hy + 0.21, fz + 0.01] }),
        piece(blk(0.22, 0.13, 0.09, 0.02), HAIR, { p: [0.26, hy + 0.19, fz + 0.01] }),
      ],
      { material: 'Hair' },
    ),
  )
  // 모자 (기본은 앱에서 숨김): 둥근 정수리 + 앞챙
  const cap = new Group()
  cap.name = 'Cap'
  cap.add(
    colored(
      'CapMesh',
      [
        piece(blk(0.96, 0.26, 0.92, 0.09), CAP, { p: [0, hy + 0.5, -0.01] }),
        piece(blk(0.72, 0.06, 0.32, 0.03), CAP, { p: [0, hy + 0.39, fz + 0.15] }),
        piece(blk(0.16, 0.08, 0.16, 0.03), CAP, { p: [0, hy + 0.66, -0.01] }),
      ],
      { material: 'Cap' },
    ),
  )
  head.add(cap)
  root.add(head)
  return root
}

// ---------- 소품 (각각 메시 1개 → 앱에서 인스턴싱) ----------

/** 나무: 원점 = 밑동, 키 약 4 */
function buildTree() {
  const dark = '#3f8e3a'
  const mid = '#4c9c43'
  const light = '#5cae4a'
  const leaves = [
    [0, 2.9, 0, 1.25, dark],
    [0.75, 2.7, 0.3, 1.0, mid],
    [-0.7, 2.8, -0.35, 1.05, dark],
    [0.2, 2.65, -0.8, 0.95, mid],
    [-0.3, 2.6, 0.75, 0.95, dark],
    [0.1, 3.65, 0.1, 1.0, light],
    [0.55, 3.35, -0.4, 0.85, light],
    [-0.5, 3.4, 0.35, 0.85, light],
    [-0.15, 4.15, -0.1, 0.7, light],
  ]
  return colored('Tree', [
    piece(rbox(0.38, 2.4, 0.38, 0.06), '#7a4b2c', { p: [0, 1.2, 0] }),
    piece(rbox(0.2, 0.7, 0.2, 0.04), '#7a4b2c', { p: [0.25, 2.1, 0], r: [0, 0, -0.6] }),
    ...leaves.map(([x, y, z, s, c]) => piece(rbox(s, s * 0.88, s, s * 0.18, 2), c, { p: [x, y, z], r: [0, (x + z) * 0.6, 0] })),
  ])
}

/** ㄱ자 가로등: 원점 = 기둥 밑, 팔은 +Z 방향 */
function buildLamp() {
  const metal = '#2b2e33'
  return colored('Lamp', [
    piece(rbox(0.5, 0.25, 0.5, 0.05), metal, { p: [0, 0.125, 0] }),
    piece(rbox(0.26, 4.6, 0.26, 0.05), metal, { p: [0, 2.4, 0] }),
    piece(rbox(0.22, 0.22, 1.4, 0.05), metal, { p: [0, 4.6, 0.6] }),
    piece(rbox(0.74, 0.28, 0.94, 0.06), metal, { p: [0, 4.55, 1.15] }),
    piece(rbox(0.58, 0.04, 0.78, 0.015), '#fff1c4', { p: [0, 4.4, 1.15] }),
  ])
}

/** 로비 화분: 원점 = 바닥 중앙, 폭 1.8 */
function buildPlanter() {
  const bush = (x, y, z, w, h, d, c) => piece(rbox(w, h, d, Math.min(w, h, d) * 0.3, 2), c, { p: [x, y, z] })
  return colored('Planter', [
    piece(rbox(1.8, 0.8, 0.9, 0.06), '#8b9097', { p: [0, 0.4, 0] }),
    piece(rbox(1.66, 0.06, 0.76, 0.02), '#5b4a3a', { p: [0, 0.8, 0] }),
    bush(0, 1.02, 0, 1.6, 0.5, 0.72, '#3f8a3a'),
    bush(-0.42, 1.3, 0.04, 0.66, 0.44, 0.52, '#56a84a'),
    bush(0.36, 1.28, -0.05, 0.72, 0.4, 0.52, '#4c9c43'),
    bush(0.0, 1.42, 0.0, 0.46, 0.32, 0.4, '#62b452'),
  ])
}

await save('character.glb', buildCharacter())
await save('tree.glb', buildTree())
await save('lamp.glb', buildLamp())
await save('planter.glb', buildPlanter())
