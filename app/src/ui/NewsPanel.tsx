import { useEffect, useState } from 'react'
import { api, REACTIONS, type NewsComment, type NewsPost, type ReportReason } from '../lib/api'
import { COMMENT_MAX, NEWS_MAX, checkComment, checkNews, checkSourceUrl } from '../lib/moderation'

const REASONS: { id: ReportReason; label: string }[] = [
  { id: 'solicit', label: '투자 권유·리딩방' },
  { id: 'false_info', label: '허위 소식' },
  { id: 'abuse', label: '욕설·비하' },
  { id: 'privacy', label: '개인정보' },
  { id: 'other', label: '기타' },
]

function ago(iso: string) {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000)
  if (s < 60) return '방금'
  if (s < 3600) return `${Math.floor(s / 60)}분 전`
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`
  return `${Math.floor(s / 86400)}일 전`
}

/** 신고 사유 고르기 (소식·댓글 공통) */
function ReportButton({ type, id, onDone }: { type: 'post' | 'comment'; id: number; onDone: (msg: string) => void }) {
  const [open, setOpen] = useState(false)
  if (!open)
    return (
      <button className="link tiny" onClick={() => setOpen(true)}>
        신고
      </button>
    )
  return (
    <span className="report-menu" role="group" aria-label="신고 사유">
      {REASONS.map((r) => (
        <button
          key={r.id}
          className="chip-btn"
          onClick={async () => {
            setOpen(false)
            try {
              await api.report(type, String(id), r.id)
              onDone('신고했어요. 운영자가 확인할게요.')
            } catch (e) {
              onDone((e as Error).message)
            }
          }}
        >
          {r.label}
        </button>
      ))}
      <button className="link tiny" onClick={() => setOpen(false)}>
        취소
      </button>
    </span>
  )
}

function Comments({ post, onChanged, notify }: { post: NewsPost; onChanged: () => void; notify: (m: string) => void }) {
  const [list, setList] = useState<NewsComment[] | null>(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const load = () => api.listComments(post.id).then(setList).catch((e) => notify((e as Error).message))
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post.id])
  return (
    <div className="comments">
      {list === null ? (
        <p className="sub">불러오는 중…</p>
      ) : list.length === 0 ? (
        <p className="sub">첫 댓글을 남겨 보세요.</p>
      ) : (
        <ul>
          {list.map((c) => (
            <li key={c.id}>
              <strong>{c.author}</strong> {c.body} <span className="muted">· {ago(c.created_at)}</span>
              {!c.mine && <ReportButton type="comment" id={c.id} onDone={notify} />}
            </li>
          ))}
        </ul>
      )}
      <form
        className="comment-form"
        onSubmit={async (e) => {
          e.preventDefault()
          const c = checkComment(text)
          if (!c.ok) return notify(c.reason)
          setBusy(true)
          try {
            await api.addComment(post.id, c.text)
            setText('')
            await load()
            onChanged()
          } catch (err) {
            notify((err as Error).message)
          } finally {
            setBusy(false)
          }
        }}
      >
        <input aria-label="댓글" maxLength={COMMENT_MAX} placeholder="짧은 댓글" value={text} onChange={(e) => setText(e.target.value)} />
        <button className="primary small" disabled={busy || !text.trim()}>
          달기
        </button>
      </form>
    </div>
  )
}

function PostCard({ post, onChanged, notify }: { post: NewsPost; onChanged: () => void; notify: (m: string) => void }) {
  const [open, setOpen] = useState(false)
  const host = post.source_url ? (() => {
    try {
      return new URL(post.source_url).hostname
    } catch {
      return '출처'
    }
  })() : null
  return (
    <li className="post">
      <div className="post-head">
        <strong>{post.author}</strong>
        <span className="muted">{ago(post.created_at)}</span>
        {post.mine && <span className="badge">내 글</span>}
      </div>
      <p className="post-body">{post.body}</p>
      {post.source_url && (
        <a className="source" href={post.source_url} target="_blank" rel="noopener noreferrer nofollow">
          출처 · {host}
        </a>
      )}
      <div className="post-actions">
        {REACTIONS.map((r) => {
          const on = post.my_reactions.includes(r)
          const n = post.reactions[r] ?? 0
          return (
            <button
              key={r}
              className={`react ${on ? 'on' : ''}`}
              aria-pressed={on}
              aria-label={`${r} 반응 ${n}개`}
              onClick={async () => {
                try {
                  await api.toggleReaction(post.id, r)
                  onChanged()
                } catch (e) {
                  notify((e as Error).message)
                }
              }}
            >
              {r}
              {n > 0 && <span>{n}</span>}
            </button>
          )
        })}
        <button className="link tiny" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          댓글 {post.comments}
        </button>
        {!post.mine && <ReportButton type="post" id={post.id} onDone={notify} />}
      </div>
      {open && <Comments post={post} onChanged={onChanged} notify={notify} />}
    </li>
  )
}

/** 층 소식 게시판 (같은 층 입주민만) */
export function NewsPanel({
  title,
  posts,
  error,
  onRefresh,
  onPost,
  onPosted,
  onClose,
}: {
  title: string
  posts: NewsPost[] | null
  error: string | null
  onRefresh: () => void
  onPost: (body: string, sourceUrl: string) => Promise<void>
  onPosted: () => void
  onClose: () => void
}) {
  const [body, setBody] = useState('')
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    const t = window.setInterval(onRefresh, 20_000) // 열려 있는 동안 가끔 새로 불러온다
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', esc)
    return () => {
      window.clearInterval(t)
      window.removeEventListener('keydown', esc)
    }
  }, [onRefresh, onClose])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const c = checkNews(body)
    if (!c.ok) return setNotice(c.reason)
    const u = checkSourceUrl(url)
    if (!u.ok) return setNotice(u.reason)
    setBusy(true)
    setNotice(null)
    try {
      await onPost(c.text, u.text)
      setBody('')
      setUrl('')
      onPosted()
    } catch (err) {
      setNotice((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <aside className="news-panel" role="dialog" aria-label={title}>
      <header>
        <h2>{title}</h2>
        <button className="ghost small" onClick={onClose}>
          닫기
        </button>
      </header>
      <form className="news-form" onSubmit={submit}>
        <label htmlFor="news-body" className="sr-only">
          소식 쓰기
        </label>
        <textarea
          id="news-body"
          rows={3}
          maxLength={NEWS_MAX}
          placeholder="이 층 이웃과 나눌 소식 (투자 권유·정확한 평단가·개인정보는 올릴 수 없어요)"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <div className="news-form-row">
          <input aria-label="출처 링크 (선택)" placeholder="출처 링크 (선택)" value={url} onChange={(e) => setUrl(e.target.value)} />
          <span className="muted count">
            {body.length}/{NEWS_MAX}
          </span>
          <button className="primary small" disabled={busy || !body.trim()}>
            올리기
          </button>
        </div>
      </form>
      {(notice || error) && (
        <p className="error" role="alert">
          {notice ?? error}
        </p>
      )}
      {posts === null ? (
        <p className="sub center">불러오는 중…</p>
      ) : posts.length === 0 ? (
        <p className="sub center">아직 소식이 없어요. 이 층의 첫 소식을 올려 보세요.</p>
      ) : (
        <ul className="posts">
          {posts.map((p) => (
            <PostCard key={p.id} post={p} onChanged={onRefresh} notify={setNotice} />
          ))}
        </ul>
      )}
      <p className="notice">소식은 같은 층 입주민에게만 보여요. 투자 조언이 아닌 이웃 간 이야기예요.</p>
    </aside>
  )
}
