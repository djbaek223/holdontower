import { describe, expect, it } from 'vitest'
import { GHOST_MS, TouchGesture } from './touchGesture'

describe('TouchGesture', () => {
  it('10px 안에서 떼면 탭', () => {
    const g = new TouchGesture()
    g.down(1, 100, 100)
    expect(g.move(1, 106, 104)).toBeNull()
    g.up(1, 1000)
    expect(g.tapBlocked(1010)).toBe(false)
  })

  it('10px 넘게 끌면 팬, 누른 지점부터 따라오고 탭은 막힌다', () => {
    const g = new TouchGesture()
    g.down(1, 100, 100)
    expect(g.tapBlocked(0)).toBe(false)
    expect(g.move(1, 112, 100)).toEqual({ type: 'pan', from: { x: 100, y: 100 }, to: { x: 112, y: 100 } })
    expect(g.move(1, 120, 90)).toEqual({ type: 'pan', from: { x: 112, y: 100 }, to: { x: 120, y: 90 } })
    expect(g.tapBlocked(0)).toBe(true)
    g.up(1, 1000)
    expect(g.tapBlocked(1000 + 50)).toBe(true) // 유령 클릭
    expect(g.tapBlocked(1000 + GHOST_MS + 1)).toBe(false)
  })

  /** 한 프레임: 두 손가락을 옮기고 판정 */
  const frame = (g: TouchGesture, a: [number, number], b: [number, number]) => {
    g.move(1, ...a)
    g.move(2, ...b)
    return g.flush()
  }
  type Step = [[number, number], [number, number]]
  /** 여러 프레임의 회전량·배율 합 */
  const run = (g: TouchGesture, steps: Step[]) => {
    let dx = 0
    let scale = 1
    for (const [a, b] of steps) {
      const r = frame(g, a, b)
      if (r?.type === 'multi') {
        dx += r.dx
        scale *= r.scale
      }
    }
    return { dx, scale }
  }
  const twoFingers = () => {
    const g = new TouchGesture()
    g.down(1, 100, 200)
    g.down(2, 200, 200)
    return g
  }

  it('두 손가락을 벌리면 확대만, 배율은 손가락 간격을 그대로 따른다', () => {
    const g = twoFingers()
    expect(frame(g, [97, 200], [203, 200])).toBeNull() // 간격 6px 변화: 아직 시작 전
    const { dx, scale } = run(g, [
      [[90, 200], [210, 200]],
      [[80, 200], [220, 200]],
    ])
    expect(dx).toBe(0)
    expect(scale).toBeCloseTo(140 / 100) // 손가락 간격 100 → 140 그대로
  })

  it('확대가 켜지는 프레임에 문턱까지 벌린 만큼도 반영한다', () => {
    const g = twoFingers()
    const { scale } = run(g, [[[90, 200], [210, 200]]])
    expect(scale).toBeCloseTo(120 / 100)
    expect(frame(g, [90, 200], [210, 200])).toBeNull() // 그대로 있으면 아무 일 없음
  })

  it('한 손가락만 움직이는 핀치도 회전 없이 확대', () => {
    const g = twoFingers()
    const { dx, scale } = run(g, Array.from({ length: 8 }, (_, i): Step => [[100, 200], [200 + (i + 1) * 6, 200]]))
    expect(dx).toBe(0)
    expect(scale).toBeCloseTo(148 / 100)
  })

  it('두 손가락을 나란히 좌우로 끌면 회전, 끈 거리만큼 돈다', () => {
    const g = twoFingers()
    const { dx, scale } = run(g, Array.from({ length: 10 }, (_, i): Step => [[100 + (i + 1) * 6, 200], [200 + (i + 1) * 6, 200]]))
    expect(dx).toBe(60)
    expect(scale).toBe(1)
  })

  it('닿는 순간 간격이 흔들려 확대가 먼저 켜져도, 이후 나란히 끌면 회전한다', () => {
    const g = twoFingers()
    run(g, [[[106, 201], [193, 199]]]) // 손가락이 자리를 잡으며 간격 13px 줄어듦
    const { dx, scale } = run(g, Array.from({ length: 12 }, (_, i): Step => [[106 + (i + 1) * 8, 201], [193 + (i + 1) * 8, 199]]))
    expect(dx).toBe(96)
    expect(scale).toBe(1) // 간격은 그대로라 추가 확대 없음
  })

  it('회전 중 손가락 간격이 20px 바뀌어도 확대되지 않는다', () => {
    const g = twoFingers()
    const { dx, scale } = run(g, Array.from({ length: 10 }, (_, i): Step => [[100 + (i + 1) * 10, 200], [200 + (i + 1) * 12, 200]]))
    expect(dx).toBe(100)
    expect(scale).toBe(1)
  })

  it('회전 중에도 크게 벌리면 확대가 함께 된다', () => {
    const g = twoFingers()
    run(g, Array.from({ length: 3 }, (_, i): Step => [[100 + (i + 1) * 6, 200], [200 + (i + 1) * 6, 200]]))
    const { scale } = run(g, [[[100, 200], [260, 200]]])
    expect(scale).toBeGreaterThan(1.4)
  })

  it('세로로 나란히 끌면 아무것도 하지 않는다 (기울기 유지)', () => {
    const g = twoFingers()
    const { dx, scale } = run(g, Array.from({ length: 10 }, (_, i): Step => [[100, 200 + (i + 1) * 8], [200, 200 + (i + 1) * 8]]))
    expect(dx).toBe(0)
    expect(scale).toBe(1)
  })

  it('두 손가락 중 하나를 떼도 남은 손가락으로 팬·탭이 되지 않는다', () => {
    const g = new TouchGesture()
    g.down(1, 100, 200)
    g.down(2, 200, 200)
    g.up(2, 500)
    expect(g.move(1, 160, 260)).toBeNull()
    expect(g.flush()).toBeNull()
    expect(g.tapBlocked(510)).toBe(true)
    g.up(1, 600)
    expect(g.tapBlocked(650)).toBe(true) // 핀치 뒤 유령 탭
    expect(g.tapBlocked(600 + GHOST_MS + 1)).toBe(false)
  })

  it('팬 중에 두 번째 손가락이 닿으면 두 손가락 제스처로 바뀐다', () => {
    const g = new TouchGesture()
    g.down(1, 100, 100)
    g.move(1, 130, 100)
    g.down(2, 230, 100)
    expect(g.currentMode).toBe('multi')
    expect(g.move(1, 131, 100)).toBeNull()
    expect(g.flush()).toBeNull()
  })
})
