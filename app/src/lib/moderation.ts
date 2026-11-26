/**
 * 채팅·소식 글 검사 (PRD 7장). 서버(0002 마이그레이션)도 같은 규칙으로 소식을 다시 검사한다.
 *  - 개인정보(전화번호, 계좌번호처럼 보이는 긴 숫자)와 정확한 평단가는 막는다.
 *  - 투자 권유·리딩방 유도 표현은 막는다.
 *  - 욕설과 극단적 선택을 밈처럼 쓰는 표현은 *** 로 가린다 (운영자가 목록을 갱신한다).
 */

export type Check = { ok: true; text: string } | { ok: false; reason: string }

export const CHAT_MAX = 80
export const NEWS_MAX = 300
export const COMMENT_MAX = 100

/** 가리는 낱말 (욕설, 극단적 선택 밈) */
const MASK_WORDS = ['씨발', '시발', 'ㅅㅂ', '병신', 'ㅂㅅ', '좆', '개새끼', '한강가즈아', '한강물온도', '한강물 온도', '한강 가즈아', '자살각', '뛰어내릴']

/** 투자 권유·유료 리딩방 유도 */
const SOLICIT = /(리딩방|수익\s*보장|무조건\s*(오른|상승|수익)|원금\s*보장|텔레그램|카톡방|오픈채팅|단톡방\s*초대|급등주\s*추천|매수\s*추천|종목\s*추천해\s*드)/

/** 전화번호 */
const PHONE = /01[016789][\s.-]?\d{3,4}[\s.-]?\d{4}/
/** 계좌번호처럼 보이는 숫자 (하이픈 묶음 또는 10자리 이상 연속) */
const ACCOUNT = /(\d{2,6}-\d{2,6}-\d{2,8})|(\d{10,})/
/** 정확한 평단가 ("평단 172,300원", "평단가 17만3천") */
const EXACT_PRICE = /평단가?\s*[:은는이]?\s*\d/

function mask(text: string) {
  let out = text
  for (const w of MASK_WORDS) out = out.split(w).join('*'.repeat(w.length))
  return out
}

function check(raw: string, max: number, { allowUrl }: { allowUrl: boolean }): Check {
  const text = raw.replace(/\s+/g, ' ').trim()
  if (!text) return { ok: false, reason: '내용을 입력해 주세요.' }
  if (text.length > max) return { ok: false, reason: `${max}자까지 쓸 수 있어요.` }
  // 링크 안의 숫자는 개인정보 검사에서 뺀다
  const plain = allowUrl ? text.replace(/https?:\/\/\S+/g, '') : text
  if (PHONE.test(plain) || ACCOUNT.test(plain)) return { ok: false, reason: '전화번호·계좌번호 같은 개인정보는 올릴 수 없어요.' }
  if (EXACT_PRICE.test(plain)) return { ok: false, reason: '정확한 평단가는 올릴 수 없어요. 층수로 이야기해 주세요.' }
  if (SOLICIT.test(plain)) return { ok: false, reason: '매수·매도 권유, 수익 보장, 리딩방 유도는 금지예요.' }
  if (!allowUrl && /https?:\/\//.test(text)) return { ok: false, reason: '채팅에는 링크를 올릴 수 없어요. 층 소식에 출처로 달아 주세요.' }
  return { ok: true, text: mask(text) }
}

export const checkChat = (t: string) => check(t, CHAT_MAX, { allowUrl: false })
export const checkNews = (t: string) => check(t, NEWS_MAX, { allowUrl: true })
export const checkComment = (t: string) => check(t, COMMENT_MAX, { allowUrl: false })

/** 출처 링크: 비우거나 http(s) 주소 */
export function checkSourceUrl(raw: string): Check {
  const url = raw.trim()
  if (!url) return { ok: true, text: '' }
  if (!/^https?:\/\/[^\s]+\.[^\s]+$/.test(url) || url.length > 300) return { ok: false, reason: '출처는 http(s)로 시작하는 주소로 넣어 주세요.' }
  return { ok: true, text: url }
}

/**
 * 도배 방지: 1.2초 안에 연달아, 10초 안에 같은 말, 10초에 5번 넘게 보내면 막는다.
 */
export class SpamGuard {
  private sent: { t: number; text: string }[] = []
  constructor(private now: () => number = Date.now) {}
  check(text: string): Check {
    const t = this.now()
    this.sent = this.sent.filter((s) => t - s.t < 10_000)
    const last = this.sent[this.sent.length - 1]
    if (last && t - last.t < 1200) return { ok: false, reason: '조금 천천히 보내 주세요.' }
    if (this.sent.some((s) => s.text === text)) return { ok: false, reason: '같은 말을 반복해서 보낼 수 없어요.' }
    if (this.sent.length >= 5) return { ok: false, reason: '잠시 뒤에 다시 보내 주세요.' }
    this.sent.push({ t, text })
    return { ok: true, text }
  }
}
