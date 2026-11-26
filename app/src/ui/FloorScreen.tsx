import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getBuilding, type BuildingConfig } from '../config/buildings'
import { api, type NewsPost } from '../lib/api'
import { floorText } from '../lib/floor'
import { EMOTES, LoungeSession } from '../lib/lounge'
import { CHAT_MAX } from '../lib/moderation'
import { entryStartedAt, useApp } from '../store'
import { LoungeScene, spawnLounge, walkToElevator, type LoungeNear } from '../scene/LoungeScene'
import { leaveBuilding } from './Elevator'
import { NewsPanel } from './NewsPanel'
import { PeoplePanel } from './PeoplePanel'

/**
 * 처음 층에 도착하면 진입부터 걸린 시간을 한 번 기록한다 (게이트: 1분 이내).
 * 사용자별로 한 번만 기록한다.
 */
function useFirstArrivalMetric() {
  const userId = useApp((s) => s.session?.userId)
  const [seconds, setSeconds] = useState<number | null>(null)
  useEffect(() => {
    if (seconds === null) return
    const t = window.setTimeout(() => setSeconds(null), 6000) // 안내는 잠시 뒤 사라진다
    return () => window.clearTimeout(t)
  }, [seconds])
  useEffect(() => {
    if (!userId) return
    const key = `sbc.firstArrival.${userId}`
    try {
      if (localStorage.getItem(key)) return
      localStorage.setItem(key, '1')
    } catch {
      return
    }
    const s = Math.round((Date.now() - entryStartedAt()) / 100) / 10
    setSeconds(s)
    api.recordMetric('first_arrival', s).catch(() => {})
  }, [userId])
  return seconds
}

/**
 * 엘리베이터에서 내린 층 = 층 라운지 (PRD F6·F7·F16·F17).
 * 같은 층 사람들과 함께 걷고, 이모트·말풍선 채팅을 하고, 층 소식 게시판을 쓴다.
 */
export function FloorScreen() {
  const id = useApp((s) => s.insideBuilding)
  const floor = useApp((s) => s.atFloor)
  if (!id || floor === null) return null
  return <Lounge key={`${id}:${floor}`} b={getBuilding(id)} floor={floor} />
}

/** 내 층 소식 + 안 읽은 수 (마지막으로 본 글 번호를 브라우저에 기억) */
function useFloorNews(b: BuildingConfig, floor: number, session: LoungeSession) {
  const seenKey = `sbc.newsSeen.${b.id}:${floor}`
  const [posts, setPosts] = useState<NewsPost[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [seen, setSeen] = useState(() => Number(localStorage.getItem(seenKey) ?? 0))
  const refresh = useCallback(() => {
    api
      .listNews(b.id)
      .then((p) => {
        setPosts(p)
        setError(null)
      })
      .catch((e) => setError((e as Error).message))
  }, [b.id])
  useEffect(() => {
    refresh()
    return session.onNews(refresh)
  }, [refresh, session])
  const markSeen = useCallback(() => {
    const top = posts?.[0]?.id ?? 0
    if (top > seen) {
      setSeen(top)
      try {
        localStorage.setItem(seenKey, String(top))
      } catch {
        /* 기억 못 해도 괜찮다 */
      }
    }
  }, [posts, seen, seenKey])
  const unread = (posts ?? []).filter((p) => p.id > seen && !p.mine).length
  return { posts, error, refresh, unread, markSeen }
}

function Lounge({ b, floor }: { b: BuildingConfig; floor: number }) {
  const session0 = useApp((s) => s.session)
  const nickname = useApp((s) => s.nickname) ?? ''
  const backToElevator = useApp((s) => s.backToElevator)
  const status = useApp((s) => s.status)
  const setCrisis = useApp((s) => s.setCrisis)
  const restricted = !!status.restricted_until
  const myId = session0?.userId ?? 'me'
  useState(() => spawnLounge())
  const session = useMemo(
    () => new LoungeSession(b.id, floor, { id: myId, nickname, x: -14, z: 7.2, yaw: Math.PI / 2 }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [b.id, floor, myId],
  )
  const [, force] = useState(0)
  useEffect(() => {
    const off = session.subscribe(() => force((n) => n + 1))
    // 이용 제한 중이면 라운지 채널에 들어가지 않는다 (서버 정책도 막는다)
    if (!useApp.getState().status.restricted_until) session.join()
    return () => {
      off()
      session.leave()
    }
  }, [session])

  // 차단 목록이 바뀌면 라운지에도 반영
  useEffect(() => session.setBlocked(status.blocked), [session, status.blocked])

  const seconds = useFirstArrivalMetric()
  const [peopleOpen, setPeopleOpen] = useState(false)
  const [near, setNear] = useState<LoungeNear>(null)
  const [boardOpen, setBoardOpen] = useState(false)
  const [text, setText] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [showLog, setShowLog] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const news = useFloorNews(b, floor, session)
  const label = floorText(floor, b)
  const shortLabel = floorText(floor, b, { short: true })

  const openBoard = useCallback(() => {
    setBoardOpen(true)
    news.refresh()
  }, [news])
  useEffect(() => {
    if (boardOpen) news.markSeen()
  }, [boardOpen, news])

  // 알림 문구는 잠시 뒤 사라진다
  useEffect(() => {
    if (!notice) return
    const t = window.setTimeout(() => setNotice(null), 3500)
    return () => window.clearTimeout(t)
  }, [notice])

  // Enter: 채팅칸으로, E: 엘리베이터 앞이면 타기 / 게시판 앞이면 열기
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLButtonElement) return
      if (e.code === 'Enter') {
        e.preventDefault()
        input.current?.focus()
      } else if (e.code === 'KeyE') {
        if (near === 'elevator') backToElevator()
        else if (near === 'board') openBoard()
      }
    }
    window.addEventListener('keydown', down)
    return () => window.removeEventListener('keydown', down)
  }, [near, backToElevator, openBoard])

  const send = (e: React.FormEvent) => {
    e.preventDefault()
    const err = session.say(text)
    if (err?.crisis) {
      // 보내지 않고, 나에게만 위로와 상담 안내 (감지 건수만 지표로 남긴다)
      setText('')
      setCrisis(true)
      api.recordMetric('crisis', 1).catch(() => {})
    } else if (err) setNotice(err.reason)
    else setText('')
  }

  return (
    <div className="lobby-screen lounge-screen" role="region" aria-label={`${b.name} ${label} 라운지`}>
      <LoungeScene
        nickname={nickname}
        myId={myId}
        floorLabel={shortLabel}
        newCount={news.unread}
        session={session}
        onNear={setNear}
        onOpenBoard={openBoard}
        onElevator={walkToElevator}
      />

      <header className="elevator-head">
        <span className="chip">
          {b.name} · {label} 라운지
          <span className="room">{restricted ? ' · 이용 제한 중' : session.room ? ` · ${session.room}번 방 ${session.count}명` : ' · 연결 중…'}</span>
        </span>
        <span className="head-actions">
          <button className="chip button" onClick={backToElevator}>
            엘리베이터
          </button>
          <button className="chip button" onClick={() => leaveBuilding(b)}>
            건물 나가기
          </button>
        </span>
      </header>

      {restricted && (
        <p className="toast warn">
          신고 처리로 {new Date(status.restricted_until!).toLocaleString('ko-KR')}까지 라운지 대화와 글쓰기가 제한돼요.
        </p>
      )}
      {seconds !== null && <p className="toast">입주 완료! 들어온 지 {seconds}초 만에 도착했어요.</p>}

      {showLog && session.log.length > 0 && (
        <ol className="chat-log" aria-label="최근 대화">
          {session.log.filter((l) => !session.isBlocked(l.id)).slice(-8).map((l) => (
            <li key={`${l.id}:${l.at}`} className={l.mine ? 'mine' : ''}>
              <strong>{l.nickname}</strong> {l.text}
            </li>
          ))}
        </ol>
      )}

      <div className="lounge-bar">
        {near === 'elevator' && (
          <button className="primary near" onClick={backToElevator}>
            엘리베이터 타기 <kbd>E</kbd>
          </button>
        )}
        {near === 'board' && !boardOpen && (
          <button className="primary near" onClick={openBoard}>
            층 소식 보기 <kbd>E</kbd>
          </button>
        )}
        {notice && (
          <p className="error bar-notice" role="alert">
            {notice}
          </p>
        )}
        <div className="emotes" role="group" aria-label="이모트">
          {EMOTES.map((e) => (
            <button key={e} className="emote-btn" aria-label={`이모트 ${e}`} onClick={() => session.emote(e)}>
              {e}
            </button>
          ))}
          <button className={`emote-btn log ${showLog ? 'on' : ''}`} aria-pressed={showLog} onClick={() => setShowLog((v) => !v)}>
            대화
          </button>
          <button className="emote-btn log" aria-expanded={peopleOpen} onClick={() => setPeopleOpen(true)}>
            이웃 {session.peers.size}
          </button>
          <button className="emote-btn news" onClick={openBoard}>
            층 소식{news.unread ? <span className="dot-count">{news.unread}</span> : null}
          </button>
        </div>
        <form className="chat-form" onSubmit={send}>
          <input
            ref={input}
            aria-label="채팅"
            maxLength={CHAT_MAX}
            placeholder={restricted ? '이용 제한 중이에요' : '같은 층 이웃에게 한마디 (Enter)'}
            disabled={restricted}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && (e.target as HTMLInputElement).blur()}
          />
          <button className="primary small" disabled={!text.trim()}>
            보내기
          </button>
        </form>
      </div>

      {peopleOpen && <PeoplePanel session={session} onClose={() => setPeopleOpen(false)} />}

      {boardOpen && (
        <NewsPanel
          title={`${b.name} ${label} 소식`}
          posts={news.posts}
          error={news.error}
          onRefresh={news.refresh}
          onPost={async (body, url) => {
            await api.postNews(b.id, body, url)
          }}
          onPosted={() => {
            session.announceNews()
            news.refresh()
          }}
          onClose={() => setBoardOpen(false)}
        />
      )}
    </div>
  )
}
