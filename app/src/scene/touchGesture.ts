/**
 * 마을 화면 터치 제스처 판정 (순수 로직, 화면·three 와 무관해 단위 테스트한다).
 *
 * - 한 손가락: 10px 안에서 떼면 탭(이동·선택), 넘으면 화면 이동(팬)
 * - 두 손가락: 회전과 확대·축소를 따로 알아본다 (처음 판정에 묶이지 않는다)
 *     두 손가락이 같은 쪽으로 좌우로 움직인 만큼 → 회전
 *     손가락 간격이 바뀐 만큼 → 확대·축소 (두 손가락 가운데를 향해)
 *   먼저 시작된 쪽이 있으면 다른 쪽은 더 크게 움직여야 켜져서, 회전 중 손가락 간격이 조금 흔들려도 확대되지 않는다.
 * - 끌기나 두 손가락이 시작되면 그 제스처는 탭이 아니다. 손가락을 모두 뗄 때까지 탭·이동을 막고,
 *   뗀 직후 잠깐 동안 오는 클릭(유령 탭)도 막는다.
 */

export const TAP_SLOP = 10 // px: 이보다 덜 움직이면 탭
export const ROTATE_START = 10 // px: 두 손가락을 같은 쪽으로 이만큼 끌면 회전 시작
export const ZOOM_START = 12 // px: 손가락 간격이 이만큼 바뀌면 확대·축소 시작
/** 다른 쪽 제스처가 이미 진행 중일 때 문턱을 몇 배로 할지 */
export const SECOND_GESTURE_FACTOR = 3
export const GHOST_MS = 400 // 제스처가 끝난 뒤 클릭을 막는 시간

type Pt = { x: number; y: number }

export type GestureAction =
  | { type: 'pan'; from: Pt; to: Pt }
  /** 두 손가락: dx 만큼 회전(px), mid 를 향해 scale 배 확대 */
  | { type: 'multi'; dx: number; scale: number; mid: Pt }

type Mode = 'idle' | 'pending' | 'pan' | 'multi' | 'done'

export class TouchGesture {
  private pts = new Map<number, Pt>()
  private order: number[] = []
  private mode: Mode = 'idle'
  private start: Pt = { x: 0, y: 0 }
  private last: Pt = { x: 0, y: 0 }
  /** 두 손가락: 지난 프레임 위치, 처음 간격, 누적한 나란한 좌우 이동, 켜진 제스처 */
  private multiLast: [Pt, Pt] = [{ x: 0, y: 0 }, { x: 0, y: 0 }]
  private startDist = 0
  private lastDist = 0
  private sideways = 0
  private rotating = false
  private zooming = false
  /** 회전이 켜질 때 쌓인 이동을 이미 반영했는지 */
  private sidewaysApplied = false
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
      this.mode = 'multi'
      this.multiLast = this.two()
      this.startDist = this.lastDist = this.pair().dist
      this.sideways = 0
      this.rotating = this.zooming = this.sidewaysApplied = false
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
    return null
  }

  /**
   * 두 손가락 제스처는 한 화면(프레임)에 한 번 판정한다. 브라우저는 손가락마다 따로 이동 이벤트를 보내서,
   * 한 손가락만 반영된 순간에 판정하면 나란히 끌기(회전)를 간격 변화(핀치)로 잘못 읽는다.
   */
  flush(): GestureAction | null {
    if (this.mode !== 'multi' || this.pts.size < 2) return null
    const [a, b] = this.two()
    const [pa, pb] = this.multiLast
    this.multiLast = [a, b]
    const dxa = a.x - pa.x
    const dxb = b.x - pb.x
    // 두 손가락이 같은 쪽으로 움직였을 때만, 덜 움직인 손가락만큼을 회전으로 본다 (벌리기·오므리기는 반대쪽이라 0)
    const parallel = Math.sign(dxa) === Math.sign(dxb) ? Math.sign(dxa) * Math.min(Math.abs(dxa), Math.abs(dxb)) : 0
    this.sideways += parallel
    const { mid, dist } = this.pair()

    if (!this.rotating) {
      const need = this.zooming ? ROTATE_START * SECOND_GESTURE_FACTOR : ROTATE_START
      if (Math.abs(this.sideways) >= need) this.rotating = true
    }
    if (!this.zooming) {
      const need = this.rotating ? ZOOM_START * SECOND_GESTURE_FACTOR : ZOOM_START
      if (Math.abs(dist - this.startDist) >= need) {
        this.zooming = true
        this.lastDist = this.startDist // 문턱까지 벌린 만큼도 반영해 손가락과 어긋나지 않게
      }
    }
    if (!this.rotating && !this.zooming) return null

    const scale = this.zooming && this.lastDist > 0 ? dist / this.lastDist : 1
    if (this.zooming) this.lastDist = dist
    // 회전이 막 켜진 프레임에는 문턱까지 끈 만큼을 한 번에 돌린다
    const dx = this.rotating ? (this.sidewaysApplied ? parallel : this.sideways) : 0
    if (this.rotating) this.sidewaysApplied = true
    if (dx === 0 && scale === 1) return null
    return { type: 'multi', dx, scale, mid }
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

  private two(): [Pt, Pt] {
    const [a, b] = this.order.slice(0, 2).map((i) => this.pts.get(i)!)
    return [{ ...a }, { ...b }]
  }

  private pair() {
    const [a, b] = this.two()
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
