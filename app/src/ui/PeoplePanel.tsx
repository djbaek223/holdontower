import { useEffect, useState } from 'react'
import { api, type ReportReason } from '../lib/api'
import type { LoungeSession } from '../lib/lounge'
import { useApp } from '../store'

const REASONS: { id: ReportReason; label: string }[] = [
  { id: 'abuse', label: '욕설·비하' },
  { id: 'solicit', label: '투자 권유·리딩방' },
  { id: 'privacy', label: '개인정보' },
  { id: 'false_info', label: '허위 정보' },
  { id: 'other', label: '기타' },
]

/** 같은 방 이웃 목록: 신고(PRD F8, 최근 채팅을 함께 보냄)와 차단 */
export function PeoplePanel({ session, onClose }: { session: LoungeSession; onClose: () => void }) {
  const status = useApp((s) => s.status)
  const setStatus = useApp((s) => s.setStatus)
  const [, force] = useState(0)
  const [reporting, setReporting] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  useEffect(() => session.subscribe(() => force((n) => n + 1)), [session])
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])

  const people = [...session.peers.values()]
  const toggleBlock = async (id: string, nickname: string) => {
    const blocked = status.blocked.includes(id)
    try {
      if (blocked) await api.unblock(id)
      else await api.block(id)
      const next = blocked ? status.blocked.filter((x) => x !== id) : [...status.blocked, id]
      setStatus({ ...status, blocked: next })
      setNotice(blocked ? `${nickname} 님 차단을 풀었어요.` : `${nickname} 님을 차단했어요. 이 사람의 말과 소식이 보이지 않아요.`)
    } catch (e) {
      setNotice((e as Error).message)
    }
  }
  const report = async (id: string, nickname: string, reason: ReportReason) => {
    setReporting(null)
    try {
      const line = session.lastLineOf(id)
      await api.report(line ? 'chat' : 'user', id, reason, line ?? undefined)
      setNotice(`${nickname} 님을 신고했어요. 운영자가 확인할게요.`)
    } catch (e) {
      setNotice((e as Error).message)
    }
  }

  return (
    <aside className="news-panel people-panel" role="dialog" aria-label="이 방 이웃">
      <header>
        <h2>이 방 이웃 {people.length}명</h2>
        <button className="ghost small" onClick={onClose}>
          닫기
        </button>
      </header>
      {notice && (
        <p className="sub" role="status">
          {notice}
        </p>
      )}
      {people.length === 0 ? (
        <p className="sub center">아직 이 방에 다른 이웃이 없어요.</p>
      ) : (
        <ul className="posts">
          {people.map((p) => {
            const blocked = status.blocked.includes(p.id)
            return (
              <li key={p.id} className="post">
                <div className="post-head">
                  <strong>{p.nickname}</strong>
                  {blocked && <span className="badge">차단함</span>}
                </div>
                <div className="post-actions">
                  <button className="ghost small" onClick={() => toggleBlock(p.id, p.nickname)}>
                    {blocked ? '차단 해제' : '차단'}
                  </button>
                  {reporting === p.id ? (
                    <span className="report-menu" role="group" aria-label="신고 사유">
                      {REASONS.map((r) => (
                        <button key={r.id} className="chip-btn" onClick={() => report(p.id, p.nickname, r.id)}>
                          {r.label}
                        </button>
                      ))}
                    </span>
                  ) : (
                    <button className="ghost small" onClick={() => setReporting(p.id)}>
                      신고
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
      <p className="notice">차단하면 그 이웃의 채팅·말풍선과 소식·댓글이 나에게 보이지 않아요. 상대에게는 알리지 않아요.</p>
    </aside>
  )
}
