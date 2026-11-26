import { Room, ServerError, type Client } from 'colyseus'
import { EMOTES_LIST, ROOM_BOUNDS } from './rules.ts'
import { SpamGuard, checkChat } from '../../app/src/lib/moderation.ts'
import { AuthError, verify, type Who } from './auth.ts'
import { LoungeState, Player } from './state.ts'

/**
 * 층 라운지 방 (PRD F6·F7). 방 종류 하나("lounge")를 빌딩·층으로 나눠 쓴다 (filterBy).
 * 한 방은 30명까지이고, 가득 차면 Colyseus 가 같은 층의 새 방을 만든다.
 *
 *  - 위치: 클라이언트가 'move' 를 보내면 서버 상태(players)를 고치고, 0.1초마다 변경분만 모두에게 보낸다
 *  - 채팅: 서버가 앱과 같은 규칙으로 다시 검사하고(개인정보·평단가·권유 차단, 금칙어 가림, 도배 방지)
 *          위기 표현이면 아무에게도 보내지 않고 보낸 사람에게만 'crisis' 를 돌려준다 (PRD F9)
 *  - 이모트, 새 소식 알림은 그대로 전달
 */

/** 층마다 쓰고 있는 방 번호 (한 서버 프로세스 기준) */
const roomNumbers = new Map<string, Set<number>>()

type Opts = { building: string; floor: number; x?: number; z?: number; yaw?: number; token?: string; local?: { id?: string; nickname?: string } }

export class LoungeRoom extends Room<{ state: LoungeState }> {
  maxClients = 30
  patchRate = 100
  maxMessagesPerSecond = 30
  state = new LoungeState()
  private floorKey = ''
  private spam = new Map<string, SpamGuard>()
  private who = new Map<string, Who>()

  onCreate(options: Opts) {
    this.floorKey = `${options.building}:${options.floor}`
    const used = roomNumbers.get(this.floorKey) ?? new Set<number>()
    let n = 1
    while (used.has(n)) n++
    used.add(n)
    roomNumbers.set(this.floorKey, used)
    this.state.roomNo = n

    this.onMessage('move', (client, m: { x?: unknown; z?: unknown; yaw?: unknown }) => {
      const p = this.state.players.get(client.sessionId)
      const x = Number(m?.x)
      const z = Number(m?.z)
      const yaw = Number(m?.yaw)
      if (!p || ![x, z, yaw].every(Number.isFinite)) return
      p.x = Math.min(ROOM_BOUNDS.x1, Math.max(ROOM_BOUNDS.x0, x))
      p.z = Math.min(ROOM_BOUNDS.z1, Math.max(ROOM_BOUNDS.z0, z))
      p.yaw = yaw
    })

    this.onMessage('chat', (client, m: { text?: unknown }) => {
      const who = this.who.get(client.sessionId)
      if (!who) return
      const c = checkChat(String(m?.text ?? ''))
      if (!c.ok) {
        client.send(c.crisis ? 'crisis' : 'notice', c.crisis ? {} : { reason: c.reason })
        return
      }
      const s = this.spam.get(client.sessionId)!.check(c.text)
      if (!s.ok) return client.send('notice', { reason: s.reason })
      this.broadcast('chat', { id: who.id, nickname: who.nickname, text: c.text }, { except: client })
      client.send('chat:ok', { text: c.text }) // 가려진 글자까지 반영된 내 말
    })

    this.onMessage('emote', (client, m: { e?: unknown }) => {
      const who = this.who.get(client.sessionId)
      const e = String(m?.e ?? '')
      if (who && EMOTES_LIST.includes(e)) this.broadcast('emote', { id: who.id, e }, { except: client })
    })

    this.onMessage('news', (client) => {
      const who = this.who.get(client.sessionId)
      if (who) this.broadcast('news', { id: who.id }, { except: client })
    })
  }

  async onAuth(_client: Client, options: Opts) {
    try {
      return await verify(options)
    } catch (e) {
      if (e instanceof AuthError) throw new ServerError(e.code, e.message)
      throw new ServerError(500, 'auth_failed')
    }
  }

  onJoin(client: Client, options: Opts, auth: Who) {
    const who = (client.auth as Who | undefined) ?? auth
    this.who.set(client.sessionId, who)
    this.spam.set(client.sessionId, new SpamGuard())
    const p = new Player()
    p.id = who.id
    p.nickname = who.nickname
    p.x = Math.min(ROOM_BOUNDS.x1, Math.max(ROOM_BOUNDS.x0, Number(options.x) || -13))
    p.z = Math.min(ROOM_BOUNDS.z1, Math.max(ROOM_BOUNDS.z0, Number(options.z) || 7))
    p.yaw = Number(options.yaw) || 0
    this.state.players.set(client.sessionId, p)
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId)
    this.who.delete(client.sessionId)
    this.spam.delete(client.sessionId)
  }

  onDispose() {
    roomNumbers.get(this.floorKey)?.delete(this.state.roomNo)
  }
}
