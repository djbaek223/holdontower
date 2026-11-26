import { describe, expect, it } from 'vitest'
import { getBuilding } from '../config/buildings'
import { calcFloor, floorButtons, floorNumber, floorText, movesLeft, parsePrice, reachableFloors } from './floor'

const samsung = getBuilding('samsung')
const hynix = getBuilding('skhynix')

describe('calcFloor (PRD 3장)', () => {
  it('삼성전자 평단 17만 원 → 17층', () => {
    expect(calcFloor(170_000, samsung)).toEqual({ kind: 'floor', floor: 17, merged: false })
  })
  it('소수점 내림: 179,999원 → 17층', () => {
    expect(calcFloor(179_999, samsung)).toMatchObject({ floor: 17 })
  })
  it('1층 단위 미만 → 1층', () => {
    expect(calcFloor(5_000, samsung)).toMatchObject({ kind: 'floor', floor: 1 })
  })
  it('삼성전자 통합 저층: 6만 원 미만은 1층, 6만 원부터 6층', () => {
    expect(calcFloor(59_999, samsung)).toMatchObject({ floor: 1, merged: true })
    expect(calcFloor(60_000, samsung)).toMatchObject({ floor: 6, merged: false })
  })
  it('SK하이닉스 통합 저층: 101만 원 미만은 1층, 101만 원부터 101층', () => {
    expect(calcFloor(1_009_999, hynix)).toMatchObject({ floor: 1, merged: true })
    expect(calcFloor(1_010_000, hynix)).toMatchObject({ floor: 101 })
  })
  it('최고층 초과 → 옥상', () => {
    expect(calcFloor((samsung.maxFloor + 1) * 10_000, samsung)).toEqual({ kind: 'penthouse' })
    expect(calcFloor(samsung.maxFloor * 10_000, samsung)).toMatchObject({ floor: samsung.maxFloor })
  })
  it('0 이하·숫자 아님은 거부', () => {
    expect(() => calcFloor(0, samsung)).toThrow()
    expect(() => calcFloor(NaN, samsung)).toThrow()
  })
})

describe('parsePrice', () => {
  it.each([
    ['170000', 170_000],
    ['170,000원', 170_000],
    ['17만', 170_000],
    ['17만 5천', 175_000],
    ['17만5000', 175_000],
    ['abc', null],
    ['', null],
  ])('%s → %s', (input, expected) => {
    expect(parsePrice(input)).toBe(expected)
  })
})


describe('엘리베이터 규칙', () => {
  it('버튼: 통합 1층, 6~30층, 옥상(31)', () => {
    const b = floorButtons(samsung)
    expect(b[0]).toBe(1)
    expect(b[1]).toBe(6)
    expect(b.at(-1)).toBe(31)
    expect(b).toHaveLength(1 + 25 + 1)
  })
  it('SK하이닉스 버튼: 1, 101~150, 옥상', () => {
    const b = floorButtons(hynix)
    expect(b.slice(0, 3)).toEqual([1, 101, 102])
    expect(b.at(-1)).toBe(151)
  })
  it('옥상 층 번호와 표시', () => {
    expect(floorNumber(calcFloor(500_000, samsung), samsung)).toBe(31)
    expect(floorText(31, samsung)).toBe('옥상')
    expect(floorText(1, samsung)).toBe('1층 (1~5층 통합)')
  })
  it('이동 범위: 기준 층에서 버튼 ±5칸', () => {
    expect(reachableFloors(17, samsung)).toEqual([12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22])
    expect(reachableFloors(1, hynix)).toEqual([1, 101, 102, 103, 104, 105])
    expect(reachableFloors(31, samsung)).toEqual([26, 27, 28, 29, 30, 31])
  })
  it('하루 1회: 한국 시간 자정 기준', () => {
    const now = new Date('2026-11-25T03:00:00Z') // 한국 12:00
    expect(movesLeft(null, now)).toBe(1)
    expect(movesLeft(new Date('2026-11-25T00:30:00Z'), now)).toBe(0) // 오늘 09:30
    expect(movesLeft(new Date('2026-11-24T14:59:00Z'), now)).toBe(1) // 어제 23:59
  })
})
