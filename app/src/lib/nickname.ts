/** 별명 규칙: 2~12자의 한글, 영문, 숫자, _ (서버 claim_nickname 과 같은 규칙) */
export const NICK_RE = /^[가-힣a-zA-Z0-9_]{2,12}$/

/** 앞말: 투자 분위기 + 동네 느낌 */
const ADJECTIVES = [
  '존버하는', '물타는', '불타는', '느긋한', '용감한', '침착한', '부지런한', '배부른', '꿈꾸는', '행복한',
  '든든한', '반짝이는', '씩씩한', '신중한', '여유로운', '빨간', '파란', '졸린', '웃는', '단단한',
]
/** 뒷말: 시장 동물, 동네 사람 */
const NOUNS = [
  '개미', '황소', '곰돌이', '거북이', '고래', '다람쥐', '부엉이', '여우', '토끼', '판다',
  '펭귄', '수달', '고양이', '강아지', '참새', '주주', '이웃', '산책러', '농부', '선장',
]

/**
 * '존버하는개미27' 같은 별명을 만든다. 겹칠 확률을 줄이려고 끝에 두 자리 숫자를 붙인다.
 * rand 는 테스트에서 고정값을 넣기 위한 인자.
 */
export function suggestNickname(rand: () => number = Math.random): string {
  const pick = <T,>(list: T[]) => list[Math.floor(rand() * list.length) % list.length]
  const num = String(10 + Math.floor(rand() * 90) % 90)
  for (let i = 0; i < 10; i++) {
    const name = `${pick(ADJECTIVES)}${pick(NOUNS)}${num}`
    if (NICK_RE.test(name)) return name
  }
  return `${pick(NOUNS)}${num}`
}
