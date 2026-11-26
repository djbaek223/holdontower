import { useEffect, useRef } from 'react'
import { useApp } from '../store'

/**
 * 위기 표현이 감지되면 글을 보내지 않고, 쓴 사람에게만 이 안내를 보여 준다 (PRD F9).
 * 상담 번호는 출시 전 최신인지 다시 확인한다 (2026년 기준: 자살예방상담전화 109).
 */
export function CrisisCard() {
  const open = useApp((s) => s.crisis)
  const close = useApp((s) => s.setCrisis)
  const first = useRef<HTMLAnchorElement>(null)
  useEffect(() => {
    if (!open) return
    first.current?.focus()
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && close(false)
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [open, close])
  if (!open) return null
  return (
    <div className="confirm crisis" role="alertdialog" aria-labelledby="crisis-title" aria-describedby="crisis-body">
      <div className="card warm">
        <h2 id="crisis-title">많이 힘드셨죠</h2>
        <p id="crisis-body" className="sub">
          방금 글은 다른 이웃에게 보내지 않았어요. 지금 마음이 많이 무겁다면 혼자 견디지 마세요. 아래 번호로 언제든, 무료로 이야기할 수 있어요.
        </p>
        <ul className="hotlines">
          <li>
            <a ref={first} href="tel:109">
              <strong>109</strong> 자살예방상담전화 · 24시간
            </a>
          </li>
          <li>
            <a href="tel:15770199">
              <strong>1577-0199</strong> 정신건강 위기상담 · 24시간
            </a>
          </li>
          <li>
            <a href="tel:1388">
              <strong>1388</strong> 청소년 상담
            </a>
          </li>
        </ul>
        <p className="notice">위급한 상황이라면 112 또는 119에 바로 연락해 주세요.</p>
        <button className="primary" onClick={() => close(false)}>
          알겠어요
        </button>
      </div>
    </div>
  )
}
