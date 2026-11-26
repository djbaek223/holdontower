import { api, type BuildingId, type Channel, type PeerState } from './api'
import { SpamGuard, checkChat } from './moderation'

/**
 * 층 라운지 실시간 세션 (PRD F6·F7).
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
  private timer = 0

  constructor(
    private building: BuildingId,
    private floor: number,
    private me: PeerState,
  ) {}

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

  /** 자리가 있는 첫 방에 들어간다 */
  async join() {
    for (let n = 1; n <= 50 && !this.closed; n++) {
      const full = await this.tryRoom(n)
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

  private tryRoom(n: number) {
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

  /** 채팅 보내기. 막히면 이유를 돌려준다 */
  say(raw: string): string | null {
    const c = checkChat(raw)
    if (!c.ok) return c.reason
    const s = this.spam.check(c.text)
    if (!s.ok) return s.reason
    this.ch?.send('chat', { id: this.me.id, nickname: this.me.nickname, text: c.text })
    this.bubbles.set(this.me.id, { text: c.text, kind: 'chat', at: Date.now() })
    this.pushLog({ id: this.me.id, nickname: this.me.nickname, text: c.text, at: Date.now(), mine: true })
    return null
  }

  emote(e: string) {
    this.ch?.send('emote', { id: this.me.id, e })
    this.bubbles.set(this.me.id, { text: e, kind: 'emote', at: Date.now() })
    this.emit()
  }

  /** 같은 층 소식이 새로 올라왔다고 방 사람들에게 알린다 (다른 방 사람은 열 때 새로 불러온다) */
  announceNews() {
    this.ch?.send('news', { id: this.me.id })
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
    window.clearInterval(this.timer)
    this.ch?.send('bye', { id: this.me.id })
    const ch = this.ch
    this.ch = null
    // 'bye' 가 나갈 시간을 조금 준 뒤 채널을 닫는다
    setTimeout(() => ch?.leave(), 300)
    this.listeners.clear()
  }
}
