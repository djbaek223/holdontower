import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useApp } from '../store'

/** 내 정보: 차단한 이웃 관리, 탈퇴 (PRD 6장: 탈퇴 시 삭제) */
export function MyInfo({ onClose }: { onClose: () => void }) {
  const nickname = useApp((s) => s.nickname)
  const status = useApp((s) => s.status)
  const setStatus = useApp((s) => s.setStatus)
  const [blocks, setBlocks] = useState<{ id: string; nickname: string }[] | null>(null)
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.myBlocks().then(setBlocks).catch((e) => setError((e as Error).message))
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])

  const unblock = async (id: string) => {
    try {
      await api.unblock(id)
      setBlocks((b) => (b ?? []).filter((x) => x.id !== id))
      setStatus({ ...status, blocked: status.blocked.filter((x) => x !== id) })
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const leave = async () => {
    setBusy(true)
    setError(null)
    try {
      await api.deleteAccount()
      try {
        for (const k of Object.keys(localStorage)) if (k.startsWith('sbc.')) localStorage.removeItem(k)
      } catch {
        /* 브라우저 기록을 못 지워도 서버 기록은 지워졌다 */
      }
      location.reload()
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <div className="confirm" role="dialog" aria-label="내 정보">
      <div className="card warm my-info">
        <h2>{nickname}</h2>
        {status.restricted_until && (
          <p className="error">신고 처리로 {new Date(status.restricted_until).toLocaleString('ko-KR')}까지 글쓰기와 라운지 입장이 제한돼요.</p>
        )}
        <h3>차단한 이웃</h3>
        {blocks === null ? (
          <p className="sub">불러오는 중…</p>
        ) : blocks.length === 0 ? (
          <p className="sub">차단한 이웃이 없어요. 라운지의 ‘이웃’ 목록에서 차단할 수 있어요.</p>
        ) : (
          <ul className="block-list">
            {blocks.map((b) => (
              <li key={b.id}>
                {b.nickname}
                <button className="link tiny" onClick={() => unblock(b.id)}>
                  차단 해제
                </button>
              </li>
            ))}
          </ul>
        )}
        <h3>탈퇴</h3>
        {!confirm ? (
          <button className="ghost" onClick={() => setConfirm(true)}>
            탈퇴하기
          </button>
        ) : (
          <div className="leave-confirm">
            <p className="sub">
              별명, 입주 정보(평단가·층), 올린 소식·댓글·반응, 신고·차단 기록이 모두 지워지고 되돌릴 수 없어요.
            </p>
            <button className="primary danger" onClick={leave} disabled={busy}>
              {busy ? '지우는 중…' : '모두 지우고 탈퇴'}
            </button>
            <button className="ghost" onClick={() => setConfirm(false)} disabled={busy}>
              취소
            </button>
          </div>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="link" onClick={onClose}>
          닫기
        </button>
      </div>
    </div>
  )
}
