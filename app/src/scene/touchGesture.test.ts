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

  it('두 손가락을 벌리면 핀치, 배율과 가운데 점을 준다', () => {
    const g = new TouchGesture()
    g.down(1, 100, 200)
    g.down(2, 200, 200)
    g.move(2, 205, 200)
    expect(g.flush()).toBeNull() // 아직 판정 전
    g.move(2, 230, 200)
    const a = g.flush()
    expect(a?.type).toBe('pinch')
    if (a?.type === 'pinch') {
      expect(a.scale).toBeCloseTo(130 / 100)
      expect(a.toMid).toEqual({ x: 165, y: 200 })
    }
  })

  it('두 손가락을 나란히 좌우로 끌면 회전', () => {
    const g = new TouchGesture()
    g.down(1, 100, 200)
    g.down(2, 200, 200)
    // 한 프레임에 두 손가락이 12px 씩 따로 이벤트를 보내도 회전으로 판정
    g.move(1, 112, 200)
    g.move(2, 212, 200)
    expect(g.flush()).toEqual({ type: 'rotate', dx: 12 })
    g.move(1, 118, 201)
    expect(g.flush()).toEqual({ type: 'rotate', dx: 3 })
    expect(g.currentMode).toBe('rotate')
    expect(g.flush()).toEqual({ type: 'rotate', dx: 0 })
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
    expect(g.currentMode).toBe('multi-pending')
    expect(g.move(1, 131, 100)).toBeNull()
    expect(g.flush()).toBeNull()
  })
})
