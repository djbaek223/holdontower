import { Callbacks, Client, type Room } from '@colyseus/sdk'
import { api, type BuildingId, type Channel, type PeerState } from './api'
import { SpamGuard, checkChat } from './moderation'

/**
 * 실시간 서버 (Colyseus, server/ 폴더). 기본은 이 페이지를 연 주소의 2567 포트라서
 * 같은 와이파이의 휴대폰도 그대로 접속된다. 배포에서는 VITE_REALTIME_URL 로 지정한다.
 */
export const REALTIME_URL =
  (import.meta.env.VITE_REALTIME_URL as string | undefined) ||
  (typeof location !== 'undefined' ? `${location.protocol}//${location.hostname}:2567` : 'http://localhost:2567')

type ServerPlayer = { id: string; nickname: string; x: number; z: number; yaw: number }

/**
 * 층 라운지 실시간 세션 (PRD F6·F7).
 *
 * 실제 서버(Supabase 로그인)는 Colyseus 라운지 방을 쓴다: 빌딩·층별 방, 30명이 차면 서버가 새 방을 만든다.
 * 서버가 입장 자격(입주한 층, 이용 제한)과 채팅 규칙을 다시 확인한다.
 *
 * 아래는 로컬 테스트(?local) 전용: 같은 브라우저 탭끼리 BroadcastChannel 로 맞춘다.
 * 방 이름은 "lounge:빌딩:층:방번호". 한 방이 30명이면 다음 방으로 들어간다 (소식은 층 단위로 공유).
 *
 * 동기화 방식
 *  - 방 명단(Presence)은 들어올 때 한 번만 등록한다. 움직일 때마다 다시 등록하면
 *    Supabase Realtime 이 요청 과다로 연결을 끊고 명단에서 빠진다 (실제로 겪은 문제).
 *  - 위치는 방송(Broadcast) 'pos' 로만 보낸다: 움직이는 동안 초당 5번까지, 가만히 있으면 5초마다 한 번.
 *    별명을 함께 실어서, 명단에 아직 없는 사람도 위치 신호만으로 화면에 나타난다.
 *  - 새로 들어오면 'hello' 를 보내고, 방에 있던 사람들은 지금 위치를 바로 한 번 답한다.
 *  - 나갈 때 'bye'. 명단에도 없고 15초 넘게 신호가 없는 사람은 나간 것으로 본다.
 */
export const ROOM_CAP = 30
export const EMOTES = ['👋', '👍', '😂', '😢', '🔥', '❤️'] as const
const POS_INTERVAL = 200
const IDLE_BEAT = 5000
const STALE = 15000
const CHAT_TTL = 6000
const EMOTE_TTL = 3000

export type Peer = PeerState & { tx: number; tz: number; tyaw: number; seen: number }
export type Bubble = { text: string; kind: 'chat' | 'emote'; at: number }
export type ChatLine = { id: string; nickname: string; text: string; at: number; mine: boolean }

export const roomName = (b: BuildingId, floor: number, n: number) => `lounge:${b}:${floor}:${n}`

export class LoungeSession {
  /** 다른 사람들 (매 프레임 읽음) */
  peers = new Map<string, Peer>()
  bubbles = new Map<string, Bubble>()
  log: ChatLine[] = []
  room = 0
  private ch: Channel | null = null
  private spam = new SpamGuard()
  private lastSent = 0
  private lastPos = { x: NaN, z: NaN, yaw: NaN }
  /** 방 명단(Presence)에 있는 사람들 */
  private present = new Set<string>()
  private listeners = new Set<() => void>()
  private newsListeners = new Set<() => void>()
  private closed = false
  /** 들어가기 시도 번호: 나갔다 다시 들어오면(개발 모드 StrictMode 포함) 이전 시도의 결과는 버린다 */
  private gen = 0
  private timer = 0
  /** Colyseus 방 (실제 서버) */
  private cRoom: Room | null = null
  /** 연결 실패 이유 (화면에 보여 준다) */
  error: string | null = null
  private noticeListeners = new Set<(reason: string) => void>()
  private crisisListeners = new Set<() => void>()
  /** 내가 차단한 사람: 채팅·말풍선·이모트를 숨긴다 (PRD F8) */
  private blocked = new Set<string>()

  constructor(
    private building: BuildingId,
    private floor: number,
    private me: PeerState,
  ) {}

  setBlocked(ids: string[]) {
    this.blocked = new Set(ids)
    for (const id of ids) this.bubbles.delete(id)
    this.log = this.log.filter((l) => !this.blocked.has(l.id))
    this.emit()
  }
  isBlocked(id: string) {
    return this.blocked.has(id)
  }
  /** 이 사람이 최근에 한 말 (채팅 신고에 함께 보낸다) */
  lastLineOf(id: string) {
    return [...this.log].reverse().find((l) => l.id === id)?.text ?? null
  }

  /** 화면 갱신 구독 (사람 목록, 말풍선, 채팅 기록이 바뀔 때) */
  subscribe(fn: () => void) {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }
  private emit() {
    this.listeners.forEach((f) => f())
  }

  /** 서버가 채팅을 막았을 때 (도배·개인정보 등) 이유 */
  onNotice(fn: (reason: string) => void) {
    this.noticeListeners.add(fn)
    return () => {
      this.noticeListeners.delete(fn)
    }
  }
  /** 서버가 위기 표현을 감지했을 때 (보낸 사람에게만) */
  onCrisis(fn: () => void) {
    this.crisisListeners.add(fn)
    return () => {
      this.crisisListeners.delete(fn)
    }
  }

  /** 실제 서버: Colyseus 라운지 방에 들어간다 */
  private async joinColyseus(g: number) {
    try {
      const token = await api.accessToken()
      const room = await new Client(REALTIME_URL).joinOrCreate('lounge', {
        building: this.building,
        floor: this.floor,
        token,
        x: this.me.x,
        z: this.me.z,
        yaw: this.me.yaw,
      })
      if (this.closed || g !== this.gen) {
        room.leave()
        return
      }
      this.cRoom = room
      const cb = Callbacks.get(room)
      cb.listen('roomNo' as never, ((v: number) => {
        this.room = v
        this.emit()
      }) as never)
      cb.onAdd('players' as never, ((p: ServerPlayer, key: string) => {
        if (key === room.sessionId || p.id === this.me.id) return
        const now = Date.now()
        this.peers.set(p.id, { id: p.id, nickname: p.nickname, x: p.x, z: p.z, yaw: p.yaw, tx: p.x, tz: p.z, tyaw: p.yaw, seen: now })
        cb.onChange(p, () => {
          const peer = this.peers.get(p.id)
          if (!peer) return
          peer.tx = p.x
          peer.tz = p.z
          peer.tyaw = p.yaw
          peer.seen = Date.now()
          if (peer.nickname !== p.nickname) {
            peer.nickname = p.nickname
            this.emit()
          }
        })
        this.emit()
      }) as never)
      cb.onRemove('players' as never, ((p: ServerPlayer, key: string) => {
        if (key === room.sessionId) return
        this.peers.delete(p.id)
        this.bubbles.delete(p.id)
        this.emit()
      }) as never)
      for (const ev of ['chat', 'emote', 'news'] as const) room.onMessage(ev, (m: Record<string, unknown>) => this.onEvent(ev, m))
      room.onMessage('notice', (m: { reason?: string }) => this.noticeListeners.forEach((f) => f(String(m?.reason ?? ''))))
      room.onMessage('crisis', () => this.crisisListeners.forEach((f) => f()))
      room.onMessage('chat:ok', () => {})
      room.onLeave(() => {
        if (this.closed) return
        this.cRoom = null
        this.error = '라운지 서버와 연결이 끊겼어요. 잠시 후 다시 들어와 주세요.'
        this.emit()
      })
      this.error = null
      this.emit()
    } catch (e) {
      if (g !== this.gen) return
      const msg = String((e as Error).message ?? '')
      this.error = msg.includes('restricted')
        ? '신고 처리로 지금은 라운지에 들어갈 수 없어요.'
        : msg.includes('not_on_floor') || msg.includes('not_resident')
          ? '이 층 입주민만 라운지에 들어갈 수 있어요.'
          : '라운지 서버에 연결하지 못했어요. 실시간 서버가 켜져 있는지 확인해 주세요.'
      this.emit()
    }
  }

  /** 자리가 있는 첫 방에 들어간다 */
  async join() {
    const g = ++this.gen
    this.closed = false
    this.error = null
    if (api.mode === 'supabase') return this.joinColyseus(g)
    for (let n = 1; n <= 50 && !this.closed && g === this.gen; n++) {
      const full = await this.tryRoom(n, g)
      if (g !== this.gen) return // 그 사이 나갔다 다시 들어왔다: 이 시도는 버린다
      if (!full) {
        this.room = n
        this.emit()
        this.sendPos(true)
        this.ch?.send('hello', { id: this.me.id })
        // 가만히 있어도 가끔 위치를 알리고, 오래 소식 없는 사람은 정리한다
        this.timer = window.setInterval(() => {
          if (performance.now() - this.lastSent > IDLE_BEAT) this.sendPos(true)
          this.prune()
        }, 2500)
        return
      }
    }
  }

  private tryRoom(n: number, g: number) {
    return new Promise<boolean>((resolve) => {
      let decided = false
      let ready = false
      const decide = (others: number) => {
        if (decided) return
        decided = true
        if (others >= ROOM_CAP) {
          ch.leave()
          this.peers.clear()
          this.present.clear()
          resolve(true)
        } else if (g !== this.gen) {
          ch.leave() // 이미 버려진 시도
          resolve(false)
        } else {
          this.ch = ch
          resolve(false)
        }
      }
      const ch = api.openChannel(roomName(this.building, this.floor, n), this.me, {
        onReady: () => {
          // 다시 연결됐을 때도 불린다: 내 위치를 다시 알린다
          if (decided && this.ch === ch) {
            this.sendPos(true)
            return
          }
          ready = true
          setTimeout(() => decide(this.present.size), 900) // 첫 명단을 잠깐 기다린다
        },
        onSync: (list) => {
          const others = list.filter((p) => p.id !== this.me.id)
          if (!decided && ready && others.length >= ROOM_CAP) return decide(others.length)
          this.syncPeers(others)
        },
        onEvent: (event, payload) => this.onEvent(event, payload),
      })
    })
  }

  /** 명단(Presence)이 바뀌었을 때: 새 사람은 추가, 빠진 사람은 최근 신호가 없을 때만 지운다 */
  private syncPeers(list: PeerState[]) {
    const now = Date.now()
    this.present = new Set(list.map((p) => p.id))
    for (const st of list) {
      const p = this.peers.get(st.id)
      if (p) {
        p.nickname = st.nickname || p.nickname
        p.seen = now
      } else this.peers.set(st.id, { ...st, tx: st.x, tz: st.z, tyaw: st.yaw, seen: now })
    }
    this.prune()
    this.emit()
  }

  private prune() {
    const now = Date.now()
    let changed = false
    for (const [id, p] of this.peers) {
      if (!this.present.has(id) && now - p.seen > STALE) {
        this.peers.delete(id)
        this.bubbles.delete(id)
        changed = true
      }
    }
    if (changed) this.emit()
  }

  private onEvent(event: string, m: Record<string, unknown>) {
    const id = String(m.id ?? '')
    if (!id || id === this.me.id) return
    const now = Date.now()
    if (event === 'pos') {
      const x = Number(m.x)
      const z = Number(m.z)
      const yaw = Number(m.yaw)
      if (![x, z, yaw].every(Number.isFinite)) return
      const p = this.peers.get(id)
      if (p) {
        p.tx = x
        p.tz = z
        p.tyaw = yaw
        p.seen = now
        if (m.nickname && p.nickname !== m.nickname) {
          p.nickname = String(m.nickname)
          this.emit()
        }
      } else {
        // 명단에 아직(또는 더 이상) 없어도 위치 신호가 오면 보여 준다
        const nickname = String(m.nickname ?? '이웃').slice(0, 12)
        this.peers.set(id, { id, nickname, x, z, yaw, tx: x, tz: z, tyaw: yaw, seen: now })
        this.emit()
      }
    } else if (event === 'hello') {
      this.sendPos(true) // 새로 온 사람에게 지금 내 위치를 알려 준다
    } else if (event === 'bye') {
      this.peers.delete(id)
      this.present.delete(id)
      this.emit()
    } else if (this.blocked.has(id) && (event === 'chat' || event === 'emote')) {
      return // 차단한 사람의 말은 받지 않는다
    } else if (event === 'chat') {
      // 보낸 쪽이 검사했더라도 받는 쪽에서 한 번 더 검사한다
      const c = checkChat(String(m.text ?? ''))
      if (!c.ok) return
      const nickname = this.peers.get(id)?.nickname ?? String(m.nickname ?? '이웃')
      this.bubbles.set(id, { text: c.text, kind: 'chat', at: now })
      this.pushLog({ id, nickname, text: c.text, at: now, mine: false })
    } else if (event === 'news') {
      this.newsListeners.forEach((f) => f())
    } else if (event === 'emote') {
      const e = String(m.e ?? '')
      if ((EMOTES as readonly string[]).includes(e)) {
        this.bubbles.set(id, { text: e, kind: 'emote', at: now })
        this.emit()
      }
    }
  }

  private pushLog(line: ChatLine) {
    this.log = [...this.log.slice(-49), line]
    this.emit()
  }

  private sendPos(force = false) {
    if (this.cRoom) {
      this.lastSent = performance.now()
      const { x, z, yaw } = this.me
      this.cRoom.send('move', { x, z, yaw })
      return
    }
    if (!this.ch) return
    const now = performance.now()
    if (!force && now - this.lastSent < POS_INTERVAL) return
    this.lastSent = now
    const { id, nickname, x, z, yaw } = this.me
    this.ch.send('pos', { id, nickname, x, z, yaw })
  }

  /** 내 위치 (매 프레임 불러도 움직일 때 초당 5번까지만 보낸다) */
  updateMe(x: number, z: number, yaw: number) {
    this.me = { ...this.me, x, z, yaw }
    const l = this.lastPos
    if (Math.abs(l.x - x) < 0.02 && Math.abs(l.z - z) < 0.02 && Math.abs(l.yaw - yaw) < 0.05) return
    if (performance.now() - this.lastSent < POS_INTERVAL) return
    this.lastPos = { x, z, yaw }
    this.sendPos()
  }

  /** 채팅 보내기. 막히면 이유를, 위기 표현이면 crisis 를 돌려준다 (그 말은 보내지 않는다) */
  say(raw: string): { reason: string; crisis?: true } | null {
    const c = checkChat(raw)
    if (!c.ok) return c
    const s = this.spam.check(c.text)
    if (!s.ok) return s
    if (this.cRoom) this.cRoom.send('chat', { text: c.text }) // 서버가 다시 검사한 뒤 다른 사람에게 보낸다
    else this.ch?.send('chat', { id: this.me.id, nickname: this.me.nickname, text: c.text })
    this.bubbles.set(this.me.id, { text: c.text, kind: 'chat', at: Date.now() })
    this.pushLog({ id: this.me.id, nickname: this.me.nickname, text: c.text, at: Date.now(), mine: true })
    return null
  }

  emote(e: string) {
    if (this.cRoom) this.cRoom.send('emote', { e })
    else this.ch?.send('emote', { id: this.me.id, e })
    this.bubbles.set(this.me.id, { text: e, kind: 'emote', at: Date.now() })
    this.emit()
  }

  /** 같은 층 소식이 새로 올라왔다고 방 사람들에게 알린다 (다른 방 사람은 열 때 새로 불러온다) */
  announceNews() {
    if (this.cRoom) this.cRoom.send('news', {})
    else this.ch?.send('news', { id: this.me.id })
  }
  onNews(fn: () => void) {
    this.newsListeners.add(fn)
    return () => {
      this.newsListeners.delete(fn)
    }
  }

  /** 지금 보여 줄 말풍선 (시간이 지난 것은 지운다) */
  bubbleOf(id: string): Bubble | null {
    const b = this.bubbles.get(id)
    if (!b) return null
    if (Date.now() - b.at > (b.kind === 'chat' ? CHAT_TTL : EMOTE_TTL)) {
      this.bubbles.delete(id)
      return null
    }
    return b
  }

  get count() {
    return this.peers.size + 1
  }

  leave() {
    this.closed = true
    this.gen++
    window.clearInterval(this.timer)
    this.cRoom?.leave()
    this.cRoom = null
    this.ch?.send('bye', { id: this.me.id })
    const ch = this.ch
    this.ch = null
    // 'bye' 가 나갈 시간을 조금 준 뒤 채널을 닫는다
    setTimeout(() => ch?.leave(), 300)
    this.listeners.clear()
  }
}
