import { CanvasTexture, RepeatWrapping, SRGBColorSpace, Texture } from 'three'

/**
 * 외부 이미지 없이 캔버스로 그리는 작은 패턴 텍스처들.
 * 같은 원본은 캐시하고, 반복 횟수가 다른 곳에서는 clone 해서 쓴다.
 */
const cache = new Map<string, CanvasTexture>()

function make(key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const hit = cache.get(key)
  if (hit) return hit
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d')!)
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.wrapS = t.wrapT = RepeatWrapping
  t.anisotropy = 4
  cache.set(key, t)
  return t
}

export function repeated(base: Texture, x: number, y: number) {
  const t = base.clone()
  t.repeat.set(x, y)
  t.needsUpdate = true
  return t
}

/** 붉은 벽돌 (1장 = 가로 4장 × 세로 8줄) */
export function brickTexture() {
  return make('brick', 256, 256, (ctx) => {
    ctx.fillStyle = '#c9a493' // 줄눈
    ctx.fillRect(0, 0, 256, 256)
    const rows = 8
    const bh = 256 / rows
    const bw = 64
    const tones = ['#b5533c', '#a84a35', '#bf5c44', '#ad5039', '#b85840']
    for (let r = 0; r < rows; r++) {
      const off = r % 2 ? bw / 2 : 0
      for (let x = -bw; x < 256 + bw; x += bw) {
        ctx.fillStyle = tones[(r * 3 + Math.floor((x + off) / bw) * 7 + 50) % tones.length]
        ctx.fillRect(x + off + 2, r * bh + 2, bw - 4, bh - 4)
      }
    }
  })
}

/** 밝은 콘크리트 외벽 패널 */
export function concreteTexture() {
  return make('concrete', 256, 256, (ctx) => {
    ctx.fillStyle = '#d9dadc'
    ctx.fillRect(0, 0, 256, 256)
    ctx.fillStyle = '#d2d3d6'
    ctx.fillRect(0, 0, 128, 128)
    ctx.fillRect(128, 128, 128, 128)
    ctx.strokeStyle = '#b9bbbf'
    ctx.lineWidth = 3
    ctx.strokeRect(1.5, 1.5, 253, 253)
    ctx.beginPath()
    ctx.moveTo(0, 128)
    ctx.lineTo(256, 128)
    ctx.moveTo(128, 0)
    ctx.lineTo(128, 256)
    ctx.stroke()
  })
}

/** 인도 보도블록 (1장 = 2 × 2 타일) */
export function tileTexture() {
  return make('tile', 128, 128, (ctx) => {
    ctx.fillStyle = '#b9bcc0'
    ctx.fillRect(0, 0, 128, 128)
    const tones = ['#cfd1d4', '#c8cace', '#d4d6d9', '#cbcdd1']
    tones.forEach((c, i) => {
      ctx.fillStyle = c
      ctx.fillRect((i % 2) * 64 + 2, Math.floor(i / 2) * 64 + 2, 60, 60)
    })
  })
}

/** 파랑·흰색 줄무늬 차양 */
export function stripeTexture() {
  return make('stripe', 128, 16, (ctx) => {
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = i % 2 ? '#f4f6fb' : '#2f4f9e'
      ctx.fillRect(i * 16, 0, 16, 16)
    }
  })
}

/** 하늘 그라데이션 배경 */
export function skyTexture() {
  return make('sky', 4, 256, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 256)
    g.addColorStop(0, '#7dbdf0')
    g.addColorStop(0.55, '#b5dbf6')
    g.addColorStop(1, '#eef7fc')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 4, 256)
  })
}

/** 캐릭터 얼굴 (눈 + 미소). 오리지널 디자인 */
export function faceTexture() {
  return make('face', 128, 128, (ctx) => {
    ctx.fillStyle = '#f2c49b'
    ctx.fillRect(0, 0, 128, 128)
    // 눈썹
    ctx.fillStyle = '#5a3420'
    ctx.fillRect(30, 40, 22, 5)
    ctx.fillRect(76, 40, 22, 5)
    // 눈
    ctx.fillStyle = '#1f2430'
    for (const x of [41, 87]) {
      ctx.beginPath()
      ctx.ellipse(x, 60, 7, 10, 0, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.fillStyle = '#ffffff'
    for (const x of [43, 89]) {
      ctx.beginPath()
      ctx.arc(x, 56, 2.5, 0, Math.PI * 2)
      ctx.fill()
    }
    // 볼
    ctx.fillStyle = 'rgba(240,120,110,0.35)'
    for (const x of [26, 102]) {
      ctx.beginPath()
      ctx.ellipse(x, 80, 9, 5, 0, 0, Math.PI * 2)
      ctx.fill()
    }
    // 미소
    ctx.strokeStyle = '#3a2418'
    ctx.lineWidth = 5
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.arc(64, 78, 14, 0.2 * Math.PI, 0.8 * Math.PI)
    ctx.stroke()
  })
}

/** 캐릭터 발밑 둥근 그림자 (실시간 그림자 대신) */
export function blobTexture() {
  return make('blob', 64, 64, (ctx) => {
    const g = ctx.createRadialGradient(32, 32, 4, 32, 32, 32)
    g.addColorStop(0, 'rgba(0,0,0,0.45)')
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 64, 64)
  })
}

/** 창 너머로 보이는 실내 (조명, 책상, 모니터). 창 유리에 씌워 따뜻한 실내 느낌을 낸다 */
export function interiorTexture() {
  return make('interior', 256, 128, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 128)
    g.addColorStop(0, '#eadbbd')
    g.addColorStop(1, '#b49c74')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 256, 128)
    // 천장과 조명
    ctx.fillStyle = '#efe7d6'
    ctx.fillRect(0, 0, 256, 18)
    ctx.fillStyle = '#fffbe6'
    for (let x = 14; x < 256; x += 64) ctx.fillRect(x, 6, 36, 6)
    // 뒷벽 액자
    ctx.fillStyle = '#9aa7b4'
    ctx.fillRect(150, 34, 34, 22)
    // 바닥
    ctx.fillStyle = '#9b8a72'
    ctx.fillRect(0, 108, 256, 20)
    // 책상, 모니터, 의자
    for (const x of [18, 140]) {
      ctx.fillStyle = '#4a3f35'
      ctx.fillRect(x, 84, 96, 6)
      ctx.fillRect(x + 4, 90, 5, 20)
      ctx.fillRect(x + 87, 90, 5, 20)
      ctx.fillStyle = '#262a30'
      ctx.fillRect(x + 14, 62, 26, 20)
      ctx.fillRect(x + 56, 62, 26, 20)
      ctx.fillStyle = '#2f343b'
      ctx.fillRect(x + 22, 92, 18, 6)
      ctx.fillRect(x + 22, 74, 5, 20)
    }
    // 화분
    ctx.fillStyle = '#7b5a3c'
    ctx.fillRect(122, 96, 12, 12)
    ctx.fillStyle = '#4f9a4f'
    ctx.beginPath()
    ctx.arc(128, 88, 11, 0, Math.PI * 2)
    ctx.fill()
    // 유리 반사
    ctx.fillStyle = 'rgba(170,205,230,0.22)'
    ctx.fillRect(0, 0, 256, 128)
    ctx.fillStyle = 'rgba(255,255,255,0.18)'
    ctx.beginPath()
    ctx.moveTo(30, 0)
    ctx.lineTo(70, 0)
    ctx.lineTo(20, 128)
    ctx.lineTo(-20, 128)
    ctx.fill()
  })
}
