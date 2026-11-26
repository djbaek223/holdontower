import { createClient } from '@supabase/supabase-js'

/**
 * 라운지 입장 자격 확인.
 *  - Supabase 로그인 토큰이 진짜인지 Supabase 에 물어본다 (익명 로그인 포함)
 *  - 그 사람이 이 빌딩·이 층에 실제로 입주해 있는지, 이용 제한 중이 아닌지 서버 함수로 확인한다
 * 로컬 테스트(LOCAL_AUTH=1)에서는 앱의 ?local 모드처럼 토큰 없이 id·별명만 받는다.
 */
export type Who = { id: string; nickname: string }

const URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const KEY = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY
export const LOCAL_AUTH = process.env.LOCAL_AUTH === '1'

export class AuthError extends Error {
  constructor(public code: number, message: string) {
    super(message)
  }
}

export async function verify(options: { token?: string; local?: { id?: string; nickname?: string }; building?: string; floor?: number }): Promise<Who> {
  const building = String(options.building ?? '')
  const floor = Number(options.floor)
  if (!building || !Number.isInteger(floor)) throw new AuthError(400, 'bad_room')

  if (!options.token) {
    if (LOCAL_AUTH && options.local?.id) return { id: String(options.local.id).slice(0, 64), nickname: String(options.local.nickname ?? '이웃').slice(0, 12) }
    throw new AuthError(401, 'not_authenticated')
  }
  if (!URL || !KEY) throw new AuthError(500, 'server_not_configured')

  const sb = createClient(URL, KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${options.token}` } },
  })
  const { data: user, error } = await sb.auth.getUser(options.token)
  if (error || !user.user) throw new AuthError(401, 'not_authenticated')

  const [{ data: profile }, { data: res, error: resErr }, status] = await Promise.all([
    sb.from('profiles').select('nickname').eq('id', user.user.id).maybeSingle(),
    sb.rpc('my_residency', { p_building: building }),
    sb.rpc('my_status'), // 4단계 함수 (없으면 이용 제한 검사는 건너뛴다)
  ])
  if (resErr || !res) throw new AuthError(403, 'not_resident')
  if ((res as { floor: number }).floor !== floor) throw new AuthError(403, 'not_on_floor')
  if (!status.error && (status.data as { restricted_until: string | null })?.restricted_until) throw new AuthError(403, 'restricted')
  return { id: user.user.id, nickname: (profile as { nickname?: string } | null)?.nickname ?? '이웃' }
}
