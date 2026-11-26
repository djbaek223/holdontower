import { useState } from 'react'
import { api, ApiError, fallBackToLocal } from '../lib/api'
import { useApp } from '../store'
import { NICK_RE, suggestNickname } from '../lib/nickname'

/**
 * 로그인을 끈 동안의 첫 화면: 별명만 넣고 바로 마을로 (VITE_LOGIN=google 이면 쓰지 않는다).
 * 같은 브라우저로 다시 오면 별명을 묻지 않고 그대로 들어온다.
 */
export function GuestEntry() {
  const setAuth = useApp((s) => s.setAuth)
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const valid = NICK_RE.test(value)

  const enter = async () => {
    setBusy(true)
    setError(null)
    try {
      let session
      try {
        session = await api.signInAsGuest()
      } catch (e) {
        // 서버에서 익명 로그인이 꺼져 있으면 이 브라우저에만 저장
        if (!(e instanceof ApiError) || e.code !== 'guest_unavailable' || api.mode !== 'supabase') throw e
        fallBackToLocal()
        session = await api.signInAsGuest()
      }
      await api.claimNickname(value)
      setAuth({ session, nickname: value })
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <div className="overlay">
      <form
        className="card"
        onSubmit={(e) => {
          e.preventDefault()
          if (valid && !busy) enter()
        }}
      >
        <h1>주식 빌딩 시티</h1>
        <p className="sub">종목은 빌딩, 내 평단가는 층수. 같은 층 이웃과 소식을 나눠요.</p>
        <label htmlFor="nick">별명</label>
        <div className="nick-row">
          <input
            id="nick"
            autoFocus
            maxLength={12}
            autoComplete="off"
            placeholder="2~12자, 한글·영문·숫자"
            value={value}
            onChange={(e) => {
              setValue(e.target.value.trim())
              setError(null)
            }}
          />
          <button
            type="button"
            className="ghost suggest"
            onClick={() => {
              setValue(suggestNickname())
              setError(null)
            }}
          >
            추천
          </button>
        </div>
        {value && !valid && <p className="error">2~12자의 한글, 영문, 숫자, _만 쓸 수 있어요.</p>}
        {error && <p className="error">{error}</p>}
        <button type="submit" className="primary" disabled={!valid || busy}>
          {busy ? '들어가는 중…' : '마을로 들어가기'}
        </button>
        <p className="notice">마을과 같은 층 이웃에게 보이는 이름이에요. 실명이나 연락처는 쓰지 말아 주세요. 평단가는 자기 신고이며, 이 서비스는 투자 조언이 아닌 커뮤니티입니다.</p>
      </form>
    </div>
  )
}
