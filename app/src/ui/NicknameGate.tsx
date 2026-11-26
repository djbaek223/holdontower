import { useState } from 'react'
import { api } from '../lib/api'
import { useApp } from '../store'
import { NICK_RE, suggestNickname } from '../lib/nickname'

/** 로그인 후 처음 한 번 닉네임 정하기. 중복은 서버가 막는다 (PRD F3) */
export function NicknameGate() {
  const setNickname = useApp((s) => s.setNickname)
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const valid = NICK_RE.test(value)

  return (
    <div className="overlay">
      <form
        className="card"
        onSubmit={async (e) => {
          e.preventDefault()
          if (!valid || busy) return
          setBusy(true)
          setError(null)
          try {
            await api.claimNickname(value)
            setNickname(value)
          } catch (err) {
            setError((err as Error).message)
            setBusy(false)
          }
        }}
      >
        <h1>닉네임 정하기</h1>
        <p className="sub">마을과 같은 층 이웃에게 보이는 이름이에요. 실명이나 연락처는 쓰지 말아 주세요.</p>
        <label htmlFor="nick">닉네임</label>
        <div className="nick-row">
          <input
            id="nick"
            autoFocus
            maxLength={12}
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
          {busy ? '확인하는 중…' : '마을로 들어가기'}
        </button>
        <button type="button" className="link" onClick={() => api.signOut()}>
          다른 계정으로 로그인
        </button>
      </form>
    </div>
  )
}
