import { describe, expect, it } from 'vitest'
import { NICK_RE, suggestNickname } from './nickname'

describe('suggestNickname', () => {
  it('항상 별명 규칙을 지킨다', () => {
    for (let i = 0; i < 2000; i++) expect(suggestNickname()).toMatch(NICK_RE)
  })
  it('극단 난수에서도 규칙을 지킨다', () => {
    expect(suggestNickname(() => 0)).toMatch(NICK_RE)
    expect(suggestNickname(() => 0.999999)).toMatch(NICK_RE)
  })
  it('여러 번 누르면 다른 별명이 나온다', () => {
    const names = new Set(Array.from({ length: 50 }, () => suggestNickname()))
    expect(names.size).toBeGreaterThan(40)
  })
})
