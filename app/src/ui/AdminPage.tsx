import { useCallback, useEffect, useState } from 'react'
import { api, type AdminReport } from '../lib/api'
import { useApp } from '../store'

const REASON: Record<string, string> = {
  solicit: '투자 권유·리딩방',
  false_info: '허위 소식',
  abuse: '욕설·비하',
  privacy: '개인정보',
  other: '기타',
}
const TYPE: Record<string, string> = { post: '소식', comment: '댓글', chat: '채팅', user: '사용자' }

/**
 * 운영자 검토 화면 (주소 끝에 ?admin). 신고된 소식·댓글·채팅·사용자를 대상별로 묶어 보여 준다.
 * 운영자는 Supabase 에서 public.admins 표에 계정 id 를 넣어 지정한다.
 */
export function AdminPage() {
  const isAdmin = useApp((s) => s.status.is_admin)
  const [items, setItems] = useState<AdminReport[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(() => {
    api
      .adminReports()
      .then((r) => {
        setItems(r)
        setError(null)
      })
      .catch((e) => setError((e as Error).message))
  }, [])
  useEffect(() => {
    if (isAdmin) load()
  }, [isAdmin, load])

  const act = async (r: AdminReport, action: 'dismiss' | 'hide' | 'restrict') => {
    const key = `${r.target_type}:${r.target_id}`
    setBusy(key)
    try {
      await api.adminResolve(r.target_type, r.target_id, action)
      load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <main className="admin">
      <header>
        <h1>신고 검토</h1>
        <a className="ghost small button-link" href={location.pathname}>
          마을로 돌아가기
        </a>
      </header>
      {!isAdmin ? (
        <p className="sub">운영자 계정만 볼 수 있어요. Supabase 의 public.admins 표에 계정 id 를 넣어 운영자로 지정해요.</p>
      ) : (
        <>
          <p className="sub">
            처리 안 된 신고 {items?.length ?? 0}건 · 24시간 안에 검토하는 것이 목표예요.{' '}
            <button className="link tiny" onClick={load}>
              새로 고침
            </button>
          </p>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {items === null ? (
            <p className="sub">불러오는 중…</p>
          ) : items.length === 0 ? (
            <p className="sub">처리할 신고가 없어요.</p>
          ) : (
            <ul className="admin-list">
              {items.map((r) => {
                const key = `${r.target_type}:${r.target_id}`
                return (
                  <li key={key} className="post">
                    <div className="post-head">
                      <span className="badge">{TYPE[r.target_type]}</span>
                      <strong>{r.target?.author ?? '(알 수 없음)'}</strong>
                      {r.target?.where && <span className="muted">{r.target.where}</span>}
                      <span className="muted">신고 {r.count}건</span>
                      {r.target?.status === 'hidden' && <span className="badge warn">임시 숨김</span>}
                      {r.restricted_until && <span className="badge warn">이용 제한 중</span>}
                    </div>
                    {(r.target?.body ?? r.detail) && <p className="post-body">{r.target?.body ?? r.detail}</p>}
                    <p className="muted">사유: {r.reasons.map((x) => REASON[x] ?? x).join(', ')}</p>
                    <div className="post-actions">
                      <button className="ghost small" disabled={busy === key} onClick={() => act(r, 'dismiss')}>
                        문제없음
                      </button>
                      {(r.target_type === 'post' || r.target_type === 'comment') && (
                        <button className="ghost small" disabled={busy === key} onClick={() => act(r, 'hide')}>
                          숨기기
                        </button>
                      )}
                      <button className="primary small" disabled={busy === key} onClick={() => act(r, 'restrict')}>
                        숨기고 7일 이용 제한
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}
    </main>
  )
}
