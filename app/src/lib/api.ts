import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getBuilding, type BuildingConfig } from '../config/buildings'
import { calcFloor, floorButtons, floorNumber, movesLeft, reachableFloors } from './floor'

/**
 * 서버와 주고받는 기능을 한곳에 모은다.
 * - Supabase 설정(.env.local)이 있으면 Supabase (구글 로그인 또는 게스트, DB 함수)
 * - 없거나 주소에 ?local 이 있으면 브라우저에만 저장하는 로컬 임시 저장소 (같은 규칙)
 *
 * 로그인 켜고 끄기: .env.local 의 VITE_LOGIN=google 이면 구글 로그인, 없으면 별명만 넣고 들어온다(게스트).
 * 게스트는 Supabase 익명 로그인을 쓰고, 프로젝트에서 익명 로그인이 꺼져 있으면 이 브라우저에만 저장한다.
 */
export const LOGIN_ENABLED = import.meta.env.VITE_LOGIN === 'google'

export type BuildingId = BuildingConfig['id']

/** 내 입주 정보. 평단가는 서버 밖으로 나오지 않는다 */
export type Residency = {
  buildingId: BuildingId
  /** 지금 머무는 층 (통합 저층 = 1, 옥상 = 최고층 + 1) */
  floor: number
  /** 평단가로 계산한 층 */
  baseFloor: number
  /** 오늘 남은 엘리베이터 이동 횟수 */
  movesLeft: number
}

export type Session = { userId: string; email: string | null }

/** 서버가 돌려주는 오류 코드 → 사용자에게 보여 줄 문장 */
export const ERROR_TEXT: Record<string, string> = {
  nickname_taken: '이미 쓰고 있는 닉네임이에요. 다른 닉네임을 골라 주세요.',
  invalid_nickname: '닉네임은 2~12자의 한글, 영문, 숫자, _만 쓸 수 있어요.',
  invalid_price: '평단가를 다시 확인해 주세요.',
  no_moves_left: '오늘은 이미 엘리베이터로 이동했어요. 내일 다시 이동할 수 있어요.',
  out_of_range: '내 평단가 층에서 위아래 5칸까지만 이동할 수 있어요.',
  invalid_floor: '없는 층이에요.',
  not_resident: '먼저 평단가를 입력해 입주해 주세요.',
  not_authenticated: '로그인이 필요해요.',
  unknown_building: '없는 빌딩이에요.',
  guest_unavailable: '게스트 입장을 쓸 수 없어요.',
  empty_text: '내용을 입력해 주세요.',
  too_long: '글이 너무 길어요.',
  pii_blocked: '전화번호·계좌번호 같은 개인정보는 올릴 수 없어요.',
  price_blocked: '정확한 평단가는 올릴 수 없어요. 층수로 이야기해 주세요.',
  solicit_blocked: '매수·매도 권유, 수익 보장, 리딩방 유도는 금지예요.',
  link_blocked: '댓글에는 링크를 올릴 수 없어요.',
  invalid_url: '출처는 http(s)로 시작하는 주소로 넣어 주세요.',
  rate_limited: '조금 뒤에 다시 올려 주세요.',
  not_on_floor: '같은 층 입주민만 볼 수 있는 소식이에요.',
  post_not_found: '숨겨졌거나 없는 소식이에요.',
  invalid_reaction: '없는 반응이에요.',
  crisis_detected: '이 글은 올리지 않았어요.',
  restricted: '신고 처리로 지금은 글을 쓰거나 라운지에 들어갈 수 없어요.',
  invalid_target: '나 자신은 차단할 수 없어요.',
  not_admin: '운영자만 볼 수 있어요.',
  invalid_action: '잘못된 처리예요.',
}

export class ApiError extends Error {
  constructor(public code: string) {
    super(ERROR_TEXT[code] ?? '잠시 후 다시 시도해 주세요.')
  }
}

/** 층 소식 하나 */
export type NewsPost = {
  id: number
  body: string
  source_url: string | null
  created_at: string
  author: string
  author_id?: string
  mine: boolean
  reactions: Record<string, number>
  my_reactions: string[]
  comments: number
}
export type NewsComment = { id: number; body: string; author: string; author_id?: string; mine: boolean; created_at: string }
/** 내 상태: 이용 제한, 운영자 여부, 차단한 사람 */
export type MyStatus = { restricted_until: string | null; is_admin: boolean; blocked: string[] }
/** 운영자 검토용 신고 묶음 */
export type AdminReport = {
  target_type: 'post' | 'comment' | 'chat' | 'user'
  target_id: string
  count: number
  latest: string
  reasons: ReportReason[]
  detail: string | null
  target: { body?: string; status?: string; author?: string; author_id?: string; where?: string } | null
  restricted_until: string | null
}
export const REACTIONS = ['👍', '🔥', '😢', '😂', '👀'] as const
export type ReportReason = 'solicit' | 'false_info' | 'abuse' | 'privacy' | 'other'

/** 라운지 실시간 채널 (같은 방 사람들의 상태 + 순간 메시지) */
export type PeerState = { id: string; nickname: string; x: number; z: number; yaw: number }
export interface Channel {
  /** 내 상태를 방 사람들에게 알린다 (입장·위치 갱신) */
  track(state: PeerState): void
  /** 순간 메시지 (위치, 이모트, 채팅) */
  send(event: string, payload: Record<string, unknown>): void
  leave(): void
}
export type ChannelHandlers = {
  /** 방에 있는 사람 목록 (나 포함) */
  onSync: (peers: PeerState[]) => void
  onEvent: (event: string, payload: Record<string, unknown>) => void
  onReady: () => void
}

export interface Api {
  mode: 'supabase' | 'local'
  getSession(): Promise<Session | null>
  onAuthChange(cb: (s: Session | null) => void): () => void
  signInWithGoogle(): Promise<void>
  /** 로그인 없이 들어오기 (이미 들어와 있으면 그대로) */
  signInAsGuest(): Promise<Session>
  signOut(): Promise<void>
  getNickname(): Promise<string | null>
  claimNickname(nickname: string): Promise<void>
  getResidency(building: BuildingId): Promise<Residency | null>
  enterWithPrice(building: BuildingId, price: number): Promise<Residency>
  moveFloor(building: BuildingId, floor: number): Promise<Residency>
  recordMetric(kind: 'first_arrival' | 'crisis', value: number): Promise<void>
  // 3단계: 층 소식
  listNews(building: BuildingId): Promise<NewsPost[]>
  postNews(building: BuildingId, body: string, sourceUrl: string): Promise<void>
  toggleReaction(postId: number, type: string): Promise<void>
  listComments(postId: number): Promise<NewsComment[]>
  addComment(postId: number, body: string): Promise<void>
  report(type: 'post' | 'comment' | 'chat' | 'user', targetId: string, reason: ReportReason, detail?: string): Promise<void>
  /** 라운지 실시간 채널 */
  openChannel(name: string, me: PeerState, h: ChannelHandlers): Channel
  // 4단계: 안전
  myStatus(): Promise<MyStatus>
  block(userId: string): Promise<void>
  unblock(userId: string): Promise<void>
  myBlocks(): Promise<{ id: string; nickname: string }[]>
  adminReports(): Promise<AdminReport[]>
  adminResolve(type: string, targetId: string, action: 'dismiss' | 'hide' | 'restrict'): Promise<void>
  /** 탈퇴: 계정과 기록을 모두 지운다 */
  deleteAccount(): Promise<void>
}

// ---------- Supabase ----------

type RpcResidency = { building_id: BuildingId; floor: number; base_floor: number; moves_left: number }
const toResidency = (r: RpcResidency): Residency => ({
  buildingId: r.building_id,
  floor: r.floor,
  baseFloor: r.base_floor,
  movesLeft: r.moves_left,
})

/** Postgres raise exception 메시지에서 오류 코드만 꺼낸다 */
function codeOf(err: { message?: string } | null) {
  const msg = err?.message ?? ''
  return Object.keys(ERROR_TEXT).find((k) => msg.includes(k)) ?? 'unknown'
}

function supabaseApi(client: SupabaseClient): Api {
  const toSession = (s: { user: { id: string; email?: string } } | null): Session | null =>
    s ? { userId: s.user.id, email: s.user.email ?? null } : null

  async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await client.rpc(fn, args)
    if (error) throw new ApiError(codeOf(error))
    return data as T
  }

  return {
    mode: 'supabase',
    async getSession() {
      const { data } = await client.auth.getSession()
      return toSession(data.session)
    },
    onAuthChange(cb) {
      const { data } = client.auth.onAuthStateChange((_e, s) => cb(toSession(s)))
      return () => data.subscription.unsubscribe()
    },
    async signInWithGoogle() {
      const { error } = await client.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin + window.location.pathname },
      })
      if (error) throw new ApiError(codeOf(error))
    },
    async signInAsGuest() {
      const { data: cur } = await client.auth.getSession()
      if (cur.session) return toSession(cur.session)!
      const { data, error } = await client.auth.signInAnonymously()
      if (error || !data.session) throw new ApiError('guest_unavailable')
      return toSession(data.session)!
    },
    async signOut() {
      await client.auth.signOut()
    },
    async getNickname() {
      const { data: s } = await client.auth.getSession()
      if (!s.session) return null
      const { data } = await client.from('profiles').select('nickname').eq('id', s.session.user.id).maybeSingle()
      return data?.nickname ?? null
    },
    async claimNickname(nickname) {
      await rpc('claim_nickname', { p_nickname: nickname })
    },
    async getResidency(building) {
      const r = await rpc<RpcResidency | null>('my_residency', { p_building: building })
      return r ? toResidency(r) : null
    },
    async enterWithPrice(building, price) {
      return toResidency(await rpc<RpcResidency>('enter_with_price', { p_building: building, p_price: Math.floor(price) }))
    },
    async moveFloor(building, floor) {
      return toResidency(await rpc<RpcResidency>('move_floor', { p_building: building, p_floor: floor }))
    },
    async recordMetric(kind, value) {
      await client.from('metrics').insert({ kind, value })
    },
    async listNews(building) {
      return rpc<NewsPost[]>('list_floor_news', { p_building: building })
    },
    async postNews(building, body, sourceUrl) {
      await rpc('post_news', { p_building: building, p_body: body, p_source_url: sourceUrl || null })
    },
    async toggleReaction(postId, type) {
      await rpc('toggle_reaction', { p_post: postId, p_type: type })
    },
    async listComments(postId) {
      return rpc<NewsComment[]>('list_comments', { p_post: postId })
    },
    async addComment(postId, body) {
      await rpc('add_comment', { p_post: postId, p_body: body })
    },
    async report(type, targetId, reason, detail) {
      await rpc('report_target', { p_type: type, p_target: targetId, p_reason: reason, p_detail: detail ?? null })
    },
    openChannel(name, me, h) {
      // 비공개 채널: 같은 층 입주민만 주고받는다 (0003 의 realtime.messages 정책)
      const ch = client.channel(name, { config: { private: true, presence: { key: me.id }, broadcast: { self: false } } })
      const peers = () =>
        Object.values(ch.presenceState<PeerState>())
          .map((list) => list[list.length - 1])
          .filter(Boolean)
          .map(({ id, nickname, x, z, yaw }) => ({ id, nickname, x, z, yaw }))
      ch.on('presence', { event: 'sync' }, () => h.onSync(peers()))
      ch.on('broadcast', { event: '*' }, (m: { event: string; payload: Record<string, unknown> }) => h.onEvent(m.event, m.payload))
      // 실시간 연결에 로그인 토큰을 실어야 비공개 채널 권한을 확인할 수 있다
      client.auth.getSession().then(({ data }) => {
        if (data.session) client.realtime.setAuth(data.session.access_token)
        ch.subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            await ch.track(me)
            h.onReady()
          }
        })
      })
      return {
        track: (st) => void ch.track(st),
        send: (event, payload) => void ch.send({ type: 'broadcast', event, payload }),
        leave: () => void client.removeChannel(ch),
      }
    },
    async myStatus() {
      return rpc<MyStatus>('my_status', {})
    },
    async block(userId) {
      await rpc('block_user', { p_user: userId })
    },
    async unblock(userId) {
      await rpc('unblock_user', { p_user: userId })
    },
    async myBlocks() {
      return rpc<{ id: string; nickname: string }[]>('my_blocks', {})
    },
    async adminReports() {
      return rpc<AdminReport[]>('admin_reports', {})
    },
    async adminResolve(type, targetId, action) {
      await rpc('admin_resolve', { p_type: type, p_target: targetId, p_action: action })
    },
    async deleteAccount() {
      await rpc('delete_my_account', {})
      await client.auth.signOut()
    },
  }
}

// ---------- 로컬 임시 저장소 (Supabase 없이 개발·테스트용) ----------

type LocalRow = { avgPrice: number; baseFloor: number; floor: number; lastMovedAt: string | null }
type LocalPost = { id: number; building: BuildingId; floor: number; author: string; body: string; source_url: string | null; created_at: string; hidden?: boolean }
type LocalComment = { id: number; post: number; author: string; body: string; created_at: string }
type LocalDb = {
  session: Session | null
  nicknames: Record<string, string>
  residencies: Record<string, LocalRow>
  posts?: LocalPost[]
  comments?: LocalComment[]
  reactions?: { post: number; user: string; type: string }[]
  reports?: { type: string; target: string; reporter: string }[]
  blocks?: { blocker: string; blocked: string }[]
}
const LOCAL_KEY = 'sbc.localdb'

function localApi(): Api {
  // 로컬 테스트: 주소에 ?local&as=이름 을 붙이면 그 탭은 다른 사람으로 들어간다 (같은 저장소를 함께 써서 두 사람 흉내)
  const as = new URLSearchParams(location.search).get('as')
  const raw = (): LocalDb => {
    try {
      return JSON.parse(localStorage.getItem(LOCAL_KEY) ?? '') as LocalDb
    } catch {
      // 중복 검사를 확인할 수 있도록 이웃 한 명을 미리 넣어 둔다
      return { session: null, nicknames: { 'local-neighbor': '이웃주민' }, residencies: {} }
    }
  }
  const load = (): LocalDb => {
    const db = raw()
    if (as) db.session = { userId: `tab-${as}`, email: null }
    return db
  }
  const save = (db: LocalDb) => {
    const out = as ? { ...db, session: raw().session } : db // 탭 사용자는 저장된 로그인 정보를 건드리지 않는다
    localStorage.setItem(LOCAL_KEY, JSON.stringify(out))
  }
  const listeners = new Set<(s: Session | null) => void>()
  const me = () => {
    const db = load()
    if (!db.session) throw new ApiError('not_authenticated')
    return { db, uid: db.session.userId }
  }
  const toRes = (building: BuildingId, r: LocalRow): Residency => ({
    buildingId: building,
    floor: r.floor,
    baseFloor: r.baseFloor,
    movesLeft: movesLeft(r.lastMovedAt ? new Date(r.lastMovedAt) : null),
  })
  const wait = () => new Promise((r) => setTimeout(r, 150)) // 네트워크 흉내

  return {
    mode: 'local',
    async getSession() {
      return load().session
    },
    onAuthChange(cb) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    async signInWithGoogle() {
      await wait()
      const db = load()
      db.session = { userId: 'local-user', email: 'local@test' }
      save(db)
      listeners.forEach((l) => l(db.session))
    },
    async signInAsGuest() {
      const db = load()
      if (!db.session) {
        const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Date.now())
        db.session = { userId: `guest-${id}`, email: null }
        save(db)
        listeners.forEach((l) => l(db.session))
      }
      return db.session
    },
    async signOut() {
      const db = load()
      db.session = null
      save(db)
      listeners.forEach((l) => l(null))
    },
    async getNickname() {
      const db = load()
      return db.session ? db.nicknames[db.session.userId] ?? null : null
    },
    async claimNickname(nickname) {
      await wait()
      const { db, uid } = me()
      if (!/^[가-힣a-zA-Z0-9_]{2,12}$/.test(nickname)) throw new ApiError('invalid_nickname')
      const taken = Object.entries(db.nicknames).some(([id, n]) => id !== uid && n.toLowerCase() === nickname.toLowerCase())
      if (taken) throw new ApiError('nickname_taken')
      db.nicknames[uid] = nickname
      save(db)
    },
    async getResidency(building) {
      const { db, uid } = me()
      const r = db.residencies[`${uid}:${building}`]
      return r ? toRes(building, r) : null
    },
    async enterWithPrice(building, price) {
      await wait()
      const { db, uid } = me()
      if (!(price > 0) || price > 1e11) throw new ApiError('invalid_price')
      const b = getBuilding(building)
      const floor = floorNumber(calcFloor(price, b), b)
      const key = `${uid}:${building}`
      const r = db.residencies[key]
      if (!r) db.residencies[key] = { avgPrice: price, baseFloor: floor, floor, lastMovedAt: null }
      else if (floor === r.floor) Object.assign(r, { avgPrice: price, baseFloor: floor })
      else {
        if (movesLeft(r.lastMovedAt ? new Date(r.lastMovedAt) : null) < 1) throw new ApiError('no_moves_left')
        Object.assign(r, { avgPrice: price, baseFloor: floor, floor, lastMovedAt: new Date().toISOString() })
      }
      save(db)
      return toRes(building, db.residencies[key])
    },
    async moveFloor(building, floor) {
      await wait()
      const { db, uid } = me()
      const b = getBuilding(building)
      const r = db.residencies[`${uid}:${building}`]
      if (!r) throw new ApiError('not_resident')
      if (!floorButtons(b).includes(floor)) throw new ApiError('invalid_floor')
      if (!reachableFloors(r.baseFloor, b).includes(floor)) throw new ApiError('out_of_range')
      if (floor !== r.floor) {
        if (movesLeft(r.lastMovedAt ? new Date(r.lastMovedAt) : null) < 1) throw new ApiError('no_moves_left')
        Object.assign(r, { floor, lastMovedAt: new Date().toISOString() })
        save(db)
      }
      return toRes(building, r)
    },
    async recordMetric(kind, value) {
      console.info(`[metric] ${kind} = ${value}`)
    },
    async listNews(building) {
      const { db, uid } = me()
      const r = db.residencies[`${uid}:${building}`]
      if (!r) throw new ApiError('not_resident')
      const reactions = db.reactions ?? []
      return (db.posts ?? [])
        .filter((p) => p.building === building && p.floor === r.floor && !p.hidden)
        .filter((p) => !(db.blocks ?? []).some((b) => b.blocker === uid && b.blocked === p.author))
        .sort((a, b) => b.id - a.id)
        .slice(0, 50)
        .map((p) => {
          const mineR = reactions.filter((x) => x.post === p.id)
          const counts: Record<string, number> = {}
          mineR.forEach((x) => (counts[x.type] = (counts[x.type] ?? 0) + 1))
          return {
            id: p.id,
            body: p.body,
            source_url: p.source_url,
            created_at: p.created_at,
            author: db.nicknames[p.author] ?? '이웃',
            author_id: p.author,
            mine: p.author === uid,
            reactions: counts,
            my_reactions: mineR.filter((x) => x.user === uid).map((x) => x.type),
            comments: (db.comments ?? []).filter((c) => c.post === p.id).length,
          }
        })
    },
    async postNews(building, body, sourceUrl) {
      await wait()
      const { db, uid } = me()
      const r = db.residencies[`${uid}:${building}`]
      if (!r) throw new ApiError('not_resident')
      const posts = (db.posts ??= [])
      const last = posts.filter((p) => p.author === uid).at(-1)
      if (last && Date.now() - Date.parse(last.created_at) < 30_000) throw new ApiError('rate_limited')
      posts.push({ id: (posts.at(-1)?.id ?? 0) + 1, building, floor: r.floor, author: uid, body, source_url: sourceUrl || null, created_at: new Date().toISOString() })
      save(db)
    },
    async toggleReaction(postId, type) {
      const { db, uid } = me()
      const list = (db.reactions ??= [])
      const i = list.findIndex((x) => x.post === postId && x.user === uid && x.type === type)
      if (i >= 0) list.splice(i, 1)
      else list.push({ post: postId, user: uid, type })
      save(db)
    },
    async listComments(postId) {
      const { db, uid } = me()
      return (db.comments ?? [])
        .filter((c) => c.post === postId)
        .filter((c) => !(db.blocks ?? []).some((b) => b.blocker === uid && b.blocked === c.author))
        .map((c) => ({ id: c.id, body: c.body, author: db.nicknames[c.author] ?? '이웃', author_id: c.author, mine: c.author === uid, created_at: c.created_at }))
    },
    async addComment(postId, body) {
      await wait()
      const { db, uid } = me()
      const list = (db.comments ??= [])
      const last = list.filter((c) => c.author === uid).at(-1)
      if (last && Date.now() - Date.parse(last.created_at) < 5_000) throw new ApiError('rate_limited')
      list.push({ id: (list.at(-1)?.id ?? 0) + 1, post: postId, author: uid, body, created_at: new Date().toISOString() })
      save(db)
    },
    async report(type, targetId) {
      const { db, uid } = me()
      const list = (db.reports ??= [])
      if (!list.some((x) => x.type === type && x.target === targetId && x.reporter === uid)) list.push({ type, target: targetId, reporter: uid })
      if (type === 'post' && list.filter((x) => x.type === 'post' && x.target === targetId).length >= 3) {
        const p = db.posts?.find((x) => String(x.id) === targetId)
        if (p) p.hidden = true
      }
      save(db)
    },
    openChannel(name, me, h) {
      return localChannel(name, me, h)
    },
    async myStatus() {
      const { db, uid } = me()
      return { restricted_until: null, is_admin: false, blocked: (db.blocks ?? []).filter((b) => b.blocker === uid).map((b) => b.blocked) }
    },
    async block(userId) {
      const { db, uid } = me()
      if (userId === uid) throw new ApiError('invalid_target')
      const list = (db.blocks ??= [])
      if (!list.some((b) => b.blocker === uid && b.blocked === userId)) list.push({ blocker: uid, blocked: userId })
      save(db)
    },
    async unblock(userId) {
      const { db, uid } = me()
      db.blocks = (db.blocks ?? []).filter((b) => !(b.blocker === uid && b.blocked === userId))
      save(db)
    },
    async myBlocks() {
      const { db, uid } = me()
      return (db.blocks ?? []).filter((b) => b.blocker === uid).map((b) => ({ id: b.blocked, nickname: db.nicknames[b.blocked] ?? '(탈퇴한 이웃)' }))
    },
    async adminReports() {
      throw new ApiError('not_admin') // 운영자 검토는 Supabase 에서만
    },
    async adminResolve() {
      throw new ApiError('not_admin')
    },
    async deleteAccount() {
      const { db, uid } = me()
      delete db.nicknames[uid]
      for (const k of Object.keys(db.residencies)) if (k.startsWith(`${uid}:`)) delete db.residencies[k]
      db.posts = (db.posts ?? []).filter((p) => p.author !== uid)
      db.comments = (db.comments ?? []).filter((c) => c.author !== uid)
      db.reactions = (db.reactions ?? []).filter((r) => r.user !== uid)
      db.blocks = (db.blocks ?? []).filter((b) => b.blocker !== uid && b.blocked !== uid)
      db.session = null
      save(db)
      listeners.forEach((l) => l(null))
    },
  }
}

/**
 * 같은 브라우저의 다른 탭끼리 라운지를 맞춘다 (로컬 테스트용 실시간 채널).
 * 1.5초마다 내 상태를 알리고, 5초 넘게 소식이 없는 사람은 나간 것으로 본다.
 */
function localChannel(name: string, me0: PeerState, h: ChannelHandlers): Channel {
  const bc = new BroadcastChannel(`sbc:${name}`)
  let me = me0
  const peers = new Map<string, { st: PeerState; seen: number }>()
  const sync = () => h.onSync([me, ...[...peers.values()].map((p) => p.st)])
  const hello = () => bc.postMessage({ kind: 'state', st: me })
  bc.onmessage = (e: MessageEvent) => {
    const m = e.data as { kind: string; st?: PeerState; id?: string; event?: string; payload?: Record<string, unknown> }
    if (m.kind === 'state' && m.st) {
      const isNew = !peers.has(m.st.id)
      peers.set(m.st.id, { st: m.st, seen: Date.now() })
      if (isNew) {
        sync()
        hello() // 새로 온 사람에게 나를 알린다
      }
    } else if (m.kind === 'bye' && m.id) {
      peers.delete(m.id)
      sync()
    } else if (m.kind === 'event' && m.event) h.onEvent(m.event, m.payload ?? {})
  }
  const beat = window.setInterval(() => {
    hello()
    const now = Date.now()
    let changed = false
    peers.forEach((p, id) => {
      if (now - p.seen > 5000) {
        peers.delete(id)
        changed = true
      }
    })
    if (changed) sync()
  }, 1500)
  const bye = () => bc.postMessage({ kind: 'bye', id: me.id })
  window.addEventListener('pagehide', bye)
  setTimeout(() => {
    hello()
    sync()
    h.onReady()
  }, 0)
  return {
    track: (st) => {
      me = st
    },
    send: (event, payload) => bc.postMessage({ kind: 'event', event, payload }),
    leave: () => {
      bye()
      window.clearInterval(beat)
      window.removeEventListener('pagehide', bye)
      bc.close()
    },
  }
}

// ---------- 선택 ----------

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined
const forceLocal = typeof location !== 'undefined' && new URLSearchParams(location.search).has('local')

const GUEST_LOCAL_KEY = 'sbc.guestLocal'
const guestLocal = () => {
  try {
    return localStorage.getItem(GUEST_LOCAL_KEY) === '1'
  } catch {
    return false
  }
}

let impl: Api =
  url && key && !forceLocal && !(!LOGIN_ENABLED && guestLocal())
    ? supabaseApi(createClient(url, key, { auth: { persistSession: true, detectSessionInUrl: true } }))
    : localApi()

/**
 * 서버가 익명 로그인을 막아 두었으면 이 브라우저 저장소로 바꾼다 (게스트 모드 전용).
 * 한 번 바꾸면 다음 접속에도 그대로 쓴다.
 */
export function fallBackToLocal() {
  try {
    localStorage.setItem(GUEST_LOCAL_KEY, '1')
  } catch {
    /* 저장 못 해도 이번 접속은 로컬로 */
  }
  impl = localApi()
}

/** 지금 쓰는 구현으로 그때그때 넘겨 준다 */
export const api: Api = new Proxy({} as Api, {
  get: (_t, prop) => {
    const v = impl[prop as keyof Api]
    return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(impl) : v
  },
})

