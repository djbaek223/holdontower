import { useState } from 'react'
import { api } from '../lib/api'

/** 첫 화면: 구글로 시작하기 (PRD F3) */
export function LoginScreen() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const start = async () => {
    setBusy(true)
    setError(null)
    try {
      await api.signInWithGoogle() // 구글 로그인 페이지로 이동했다가 돌아온다
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <div className="overlay">
      <div className="card">
        <h1>주식 빌딩 시티</h1>
        <p className="sub">종목은 빌딩, 내 평단가는 층수. 같은 층 이웃과 소식을 나눠요.</p>
        <button className="google" onClick={start} disabled={busy}>
          <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
          </svg>
          {busy ? '구글로 이동하는 중…' : '구글로 시작하기'}
        </button>
        {error && <p className="error">{error}</p>}
        {api.mode === 'local' && <p className="todo">로컬 테스트 모드: 구글 대신 테스트 계정으로 들어가고, 데이터는 이 브라우저에만 저장돼요.</p>}
        <p className="notice">평단가는 자기 신고이며, 이 서비스는 투자 조언이 아닌 커뮤니티입니다.</p>
      </div>
    </div>
  )
}
