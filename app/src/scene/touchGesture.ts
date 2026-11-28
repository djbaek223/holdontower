/**
 * 마을 화면 터치 제스처 판정 (순수 로직, 화면·three 와 무관해 단위 테스트한다).
 *
 * - 한 손가락: 10px 안에서 떼면 탭(이동·선택), 넘으면 화면 이동(팬)
 * - 두 손가락: 처음 10px 동안 움직임을 보고 한 가지로 고정한다
 *     좌우로 나란히 끌기 → 회전 / 벌리고 오므리기 → 확대·축소(두 손가락 가운데를 향해)
 * - 끌기나 두 손가락이 시작되면 그 제스처는 탭이 아니다. 손가락을 모두 뗄 때까지 탭·이동을 막고,
 *   뗀 직후 잠깐 동안 오는 클릭(유령 탭)도 막는다.
 */

export const TAP_SLOP = 10 // px: 이보다 덜 움직이면 탭
export const MULTI_LOCK = 10 // px: 두 손가락 제스처 종류를 정하는 움직임
export const GHOST_MS = 400 // 제스처가 끝난 뒤 클릭을 막는 시간

type Pt = { x: number; y: number }

export type GestureAction =
  | { type: 'pan'; from: Pt; to: Pt }
  | { type: 'rotate'; dx: number }
  | { type: 'pinch'; fromMid: Pt; toMid: Pt; scale: number }

type Mode = 'idle' | 'pending' | 'pan' | 'multi-pending' | 'rotate' | 'pinch' | 'done'

export class TouchGesture {
  private pts = new Map<number, Pt>()
  private order: number[] = []
  private mode: Mode = 'idle'
  private start: Pt = { x: 0, y: 0 }
  private last: Pt = { x: 0, y: 0 }
  private multiStart = { mid: { x: 0, y: 0 }, dist: 0 }
  private multiLast = { mid: { x: 0, y: 0 }, dist: 0 }
  /** 이번 제스처가 탭이 아니게 됐는지 (끌기·여러 손가락) */
  private cancelled = false
  private endedAt = -Infinity
  private endedCancelled = false

  get active() {
    return this.pts.size > 0
  }
  get currentMode() {
    return this.mode
  }

  down(id: number, x: number, y: number) {
    this.pts.set(id, { x, y })
    this.order.push(id)
    if (this.pts.size === 1) {
      this.mode = 'pending'
      this.cancelled = false
      this.start = { x, y }
      this.last = { x, y }
    } else if (this.pts.size === 2 && this.mode !== 'done') {
      // 두 번째 손가락: 탭·팬 취소, 두 손가락 제스처 시작
      this.cancelled = true
      this.mode = 'multi-pending'
      const m = this.pair()
      this.multiStart = m
      this.multiLast = m
    } else {
      // 세 손가락 이상은 무시하되 탭은 취소
      this.cancelled = true
    }
  }

  move(id: number, x: number, y: number): GestureAction | null {
    const p = this.pts.get(id)
    if (!p) return null
    p.x = x
    p.y = y
    if (this.mode === 'pending' || this.mode === 'pan') {
      if (this.pts.size !== 1) return null
      if (this.mode === 'pending') {
        if (Math.hypot(x - this.start.x, y - this.start.y) < TAP_SLOP) return null
        this.mode = 'pan'
        this.cancelled = true
        this.last = this.start // 누른 지점부터 끌어 손가락 밑 땅이 그대로 따라오게
      }
      const from = this.last
      this.last = { x, y }
      return { type: 'pan', from, to: { x, y } }
    }
    if (this.mode === 'multi-pending' || this.mode === 'rotate' || this.mode === 'pinch') {
      if (!this.order.slice(0, 2).includes(id)) return null
      const cur = this.pair()
      if (this.mode === 'multi-pending') {
        const dDist = Math.abs(cur.dist - this.multiStart.dist)
        const dMidX = Math.abs(cur.mid.x - this.multiStart.mid.x)
        const dMidY = Math.abs(cur.mid.y - this.multiStart.mid.y)
        if (Math.max(dDist, dMidX, dMidY) < MULTI_LOCK) return null
        // 손가락 간격이 바뀐 만큼보다 좌우로 나란히 움직인 게 크면 회전
        this.mode = dMidX > dDist && dMidX >= dMidY ? 'rotate' : 'pinch'
        this.multiLast = this.multiStart
      }
      const prev = this.multiLast
      this.multiLast = cur
      if (this.mode === 'rotate') return { type: 'rotate', dx: cur.mid.x - prev.mid.x }
      return { type: 'pinch', fromMid: prev.mid, toMid: cur.mid, scale: prev.dist > 0 ? cur.dist / prev.dist : 1 }
    }
    return null
  }

  up(id: number, now: number) {
    if (!this.pts.delete(id)) return
    this.order = this.order.filter((o) => o !== id)
    if (this.pts.size === 0) {
      this.endedAt = now
      this.endedCancelled = this.cancelled
      this.mode = 'idle'
    } else if (this.mode !== 'pending' && this.mode !== 'pan') {
      // 두 손가락 중 하나만 뗐다: 남은 손가락으로 팬·탭을 시작하지 않는다
      this.mode = 'done'
    }
  }

  /** 지금 오는 클릭(탭)을 무시해야 하는지 */
  tapBlocked(now: number) {
    if (this.pts.size > 0) return this.cancelled
    return this.endedCancelled && now - this.endedAt < GHOST_MS
  }

  reset() {
    this.pts.clear()
    this.order = []
    this.mode = 'idle'
  }

  private pair() {
    const [a, b] = this.order.slice(0, 2).map((i) => this.pts.get(i)!)
    return { mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, dist: Math.hypot(a.x - b.x, a.y - b.y) }
  }
}

/** 마을 화면의 터치 제스처 (CameraGestures 가 채우고, 땅·빌딩·주민 클릭이 확인한다) */
export const townGesture = new TouchGesture()
/** 마지막으로 누른 입력 종류 (마우스 클릭은 기존 delta 기준을 그대로 쓴다) */
export const lastPointer = { type: 'mouse' as string }

/** r3f onClick 에서: 이 클릭을 이동·선택으로 처리하면 안 되는지 */
export function clickBlocked(delta: number) {
  if (lastPointer.type === 'touch') return townGesture.tapBlocked(performance.now())
  return delta > 6 // 마우스 드래그(카메라 회전)는 이동 아님
}
