import { describe, expect, it } from 'vitest'
import { SpamGuard, checkChat, checkComment, checkNews, checkSourceUrl } from './moderation'

describe('글 검사', () => {
  it('보통 대화는 통과', () => {
    expect(checkChat('오늘 반도체 분위기 어때요?')).toEqual({ ok: true, text: '오늘 반도체 분위기 어때요?' })
  })
  it('빈 글과 너무 긴 글은 막는다', () => {
    expect(checkChat('   ').ok).toBe(false)
    expect(checkChat('가'.repeat(81)).ok).toBe(false)
    expect(checkNews('가'.repeat(300)).ok).toBe(true)
    expect(checkNews('가'.repeat(301)).ok).toBe(false)
    expect(checkComment('가'.repeat(101)).ok).toBe(false)
  })
  it('전화번호·계좌번호는 막는다', () => {
    expect(checkChat('연락주세요 010-1234-5678').ok).toBe(false)
    expect(checkChat('01012345678').ok).toBe(false)
    expect(checkChat('계좌 110-234-567890').ok).toBe(false)
  })
  it('정확한 평단가는 막는다', () => {
    expect(checkChat('제 평단 172300원이에요').ok).toBe(false)
    expect(checkNews('평단가: 17만').ok).toBe(false)
    expect(checkChat('평단 물타기 고민중').ok).toBe(true)
  })
  it('투자 권유·리딩방 유도는 막는다', () => {
    expect(checkNews('수익 보장 리딩방 들어오세요').ok).toBe(false)
    expect(checkChat('텔레그램으로 오세요').ok).toBe(false)
  })
  it('욕설과 극단적 선택 밈은 가린다', () => {
    const r = checkChat('한강가즈아 ㅠ')
    expect(r).toEqual({ ok: true, text: '***** ㅠ' })
  })
  it('채팅 링크는 막고, 소식 본문 링크 숫자는 개인정보로 보지 않는다', () => {
    expect(checkChat('https://news.example.com').ok).toBe(false)
    expect(checkNews('기사 https://news.example.com/article/20261126123456 참고').ok).toBe(true)
  })
  it('출처 링크 형식', () => {
    expect(checkSourceUrl('').ok).toBe(true)
    expect(checkSourceUrl('https://news.example.com/a').ok).toBe(true)
    expect(checkSourceUrl('javascript:alert(1)').ok).toBe(false)
  })
})

describe('도배 방지', () => {
  it('연달아, 같은 말, 10초 5번 초과를 막는다', () => {
    let t = 0
    const g = new SpamGuard(() => t)
    expect(g.check('안녕').ok).toBe(true)
    t = 500
    expect(g.check('반가워요').ok).toBe(false) // 1.2초 안
    t = 2000
    expect(g.check('안녕').ok).toBe(false) // 같은 말
    for (const [i, s] of ['a1', 'a2', 'a3', 'a4'].entries()) {
      t = 2000 + i * 1300
      expect(g.check(s).ok).toBe(true)
    }
    t = 8000
    expect(g.check('a5').ok).toBe(false) // 10초에 5번
    t = 20000
    expect(g.check('a5').ok).toBe(true)
  })
})
