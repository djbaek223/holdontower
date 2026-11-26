/**
 * 4단계 마이그레이션(차단, 위기 대응, 이용 제한, 운영자 검토, 탈퇴, 라운지 채널 권한)을 PGlite 에 적용해 검증한다.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'

const read = (f: string) => readFileSync(join(__dirname, '../migrations', f), 'utf8')
const id = (c: string) => `00000000-0000-0000-0000-00000000000${c}`
const A = id('a') // 17층
const B = id('b') // 17층
const C = id('c') // 17층
const ADMIN = id('d') // 30층, 운영자
const X = id('e') // 탈퇴할 사람, 17층

let db: PGlite

async function as<T = any>(uid: string, sql: string, params: unknown[] = []): Promise<T> {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid])
  const res = await db.query<{ r: T }>(sql, params)
  return res.rows[0]?.r as T
}
const fails = (uid: string, sql: string, params: unknown[], message: string) => expect(as(uid, sql, params)).rejects.toThrow(message)
const age = () => db.exec(`update public.news_posts set created_at = created_at - interval '1 hour'; update public.comments set created_at = created_at - interval '1 hour';`)
const post = (uid: string, body: string) => as<{ id: number }>(uid, 'select public.post_news($1, $2, $3) as r', ['samsung', body, null])
const list = (uid: string) => as<any[]>(uid, 'select public.list_floor_news($1) as r', ['samsung'])

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    insert into auth.users values ('${A}'), ('${B}'), ('${C}'), ('${ADMIN}'), ('${X}');
  `)
  for (const f of ['0001_stage2_entry.sql', '0002_stage3_lounge.sql', '0003_stage4_safety.sql']) await db.exec(read(f))
  await db.exec(read('0003_stage4_safety.sql')) // 다시 실행해도 안전해야 한다
  for (const [uid, nick, price] of [[A, '개미A', 170000], [B, '개미B', 171000], [C, '개미C', 172000], [ADMIN, '운영자', 300000], [X, '떠날X', 173000]] as const) {
    await as(uid, 'select public.claim_nickname($1) as r', [nick])
    await as(uid, 'select public.enter_with_price($1, $2) as r', ['samsung', price])
  }
  await db.exec(`insert into public.admins values ('${ADMIN}')`)
})

describe('F9 위기 표현', () => {
  it('소식·댓글에 쓰면 저장하지 않고 crisis_detected', async () => {
    await fails(A, 'select public.post_news($1, $2, $3) as r', ['samsung', '이번엔 진짜 죽고 싶다', null], 'crisis_detected')
    await fails(A, 'select public.post_news($1, $2, $3) as r', ['samsung', '한강 가즈아', null], 'crisis_detected')
    expect(await list(B)).toEqual([])
    const { id: pid } = await post(B, '오늘은 조용하네요')
    await fails(A, 'select public.add_comment($1, $2) as r', [pid, '그냥 사라지고 싶어요'], 'crisis_detected')
  })
  it('평범한 글은 통과하고, 감지 건수는 내용 없이 지표로만 남길 수 있다', async () => {
    await age()
    await post(A, '반도체 업황 이야기해요')
    await as(A, `insert into public.metrics (user_id, kind, value) values (auth.uid(), 'crisis', 1) returning 1 as r`)
  })
})

describe('F8 차단', () => {
  it('차단한 사람의 소식·댓글은 내 목록에서 빠지고, 해제하면 돌아온다', async () => {
    const [p] = (await list(C)).filter((x) => x.author === '개미B')
    await as(A, 'select public.add_comment($1, $2) as r', [p.id, '저도 그렇게 봐요'])
    expect((await list(C)).find((x) => x.id === p.id).comments).toBe(1)

    await as(C, 'select public.block_user($1) as r', [A])
    const forC = await list(C)
    expect(forC.some((x) => x.author === '개미A')).toBe(false)
    expect(forC.find((x) => x.id === p.id).comments).toBe(0)
    expect(await as(C, 'select public.list_comments($1) as r', [p.id])).toEqual([])
    expect((await list(B)).some((x) => x.author === '개미A')).toBe(true) // 다른 사람에게는 그대로

    const st = await as(C, 'select public.my_status() as r')
    expect(st.blocked).toEqual([A])
    expect(await as(C, 'select public.my_blocks() as r')).toEqual([{ id: A, nickname: '개미A' }])

    await as(C, 'select public.unblock_user($1) as r', [A])
    expect((await list(C)).some((x) => x.author === '개미A')).toBe(true)
  })
  it('나 자신은 차단할 수 없다', async () => {
    await fails(A, 'select public.block_user($1) as r', [A], 'invalid_target')
  })
  it('목록에 작성자 id 가 있어 앱에서 신고·차단할 수 있다', async () => {
    expect((await list(B))[0]).toHaveProperty('author_id')
  })
})

describe('운영자 검토와 이용 제한', () => {
  it('운영자가 아니면 신고 목록을 볼 수 없다', async () => {
    await fails(A, 'select public.admin_reports() as r', [], 'not_admin')
    await fails(A, 'select public.admin_resolve($1, $2, $3) as r', ['post', '1', 'hide'], 'not_admin')
  })
  it('신고가 대상별로 묶여 보이고, 제한 처리하면 숨김 + 작성자 7일 제한', async () => {
    await age()
    const { id: pid } = await post(C, '이 종목 내일 두 배 됩니다 믿어요')
    for (const u of [A, B]) await as(u, 'select public.report_target($1, $2, $3, $4) as r', ['post', String(pid), 'false_info', null])
    await as(A, 'select public.report_target($1, $2, $3, $4) as r', ['chat', C, 'abuse', '채팅 내용 예시'])

    const reports = await as<any[]>(ADMIN, 'select public.admin_reports() as r')
    const r = reports.find((x) => x.target_type === 'post' && x.target_id === String(pid))
    expect(r).toMatchObject({ count: 2, reasons: ['false_info'], target: { author: '개미C', status: 'visible' } })
    expect(reports.find((x) => x.target_type === 'chat')).toMatchObject({ detail: '채팅 내용 예시', target: { author: '개미C' } })

    await as(ADMIN, 'select public.admin_resolve($1, $2, $3) as r', ['post', String(pid), 'restrict'])
    expect((await list(A)).some((x) => x.id === pid)).toBe(false)
    expect((await as(C, 'select public.my_status() as r')).restricted_until).toBeTruthy()
    await age()
    await fails(C, 'select public.post_news($1, $2, $3) as r', ['samsung', '다시 써 볼게요', null], 'restricted')
    expect(await as(C, 'select public.can_join_lounge($1) as r', ['lounge:samsung:17:1'])).toBe(false)
    const left = await as<any[]>(ADMIN, 'select public.admin_reports() as r')
    expect(left.some((x) => x.target_type === 'post' && x.target_id === String(pid))).toBe(false)
  })
  it('문제없음 처리하면 숨겨진 글이 다시 보인다', async () => {
    await age()
    const { id: pid } = await post(B, '오늘 장 마감 분위기 공유')
    for (const u of [A, X, C]) await as(u, 'select public.report_target($1, $2, $3, $4) as r', ['post', String(pid), 'other', null])
    expect((await list(A)).some((x) => x.id === pid)).toBe(false) // 3명 신고로 임시 숨김
    await as(ADMIN, 'select public.admin_resolve($1, $2, $3) as r', ['post', String(pid), 'dismiss'])
    expect((await list(A)).some((x) => x.id === pid)).toBe(true)
  })
})

describe('라운지 채널 권한', () => {
  it('같은 빌딩·같은 층 입주민만', async () => {
    expect(await as(A, 'select public.can_join_lounge($1) as r', ['lounge:samsung:17:1'])).toBe(true)
    expect(await as(A, 'select public.can_join_lounge($1) as r', ['lounge:samsung:17:3'])).toBe(true)
    expect(await as(A, 'select public.can_join_lounge($1) as r', ['lounge:samsung:30:1'])).toBe(false)
    expect(await as(A, 'select public.can_join_lounge($1) as r', ['lounge:skhynix:17:1'])).toBe(false)
    expect(await as(A, 'select public.can_join_lounge($1) as r', ['other:samsung:17:1'])).toBe(false)
    expect(await as(ADMIN, 'select public.can_join_lounge($1) as r', ['lounge:samsung:30:1'])).toBe(true)
  })
})

describe('탈퇴', () => {
  it('계정과 닉네임·입주 정보·글·지표가 모두 지워진다', async () => {
    await age()
    await post(X, '떠나기 전 마지막 소식')
    await as(X, 'select public.delete_my_account() as r')
    const left = await db.query<{ n: number }>(
      `select (select count(*) from auth.users where id = $1)
            + (select count(*) from public.profiles where id = $1)
            + (select count(*) from public.residencies where user_id = $1)
            + (select count(*) from public.news_posts where author_id = $1)
            + (select count(*) from public.reports where reporter_id = $1) as n`,
      [X],
    )
    expect(Number(left.rows[0].n)).toBe(0)
    // 탈퇴한 사람의 닉네임은 다시 쓸 수 있다
    await as(A, 'select public.claim_nickname($1) as r', ['떠날X'])
  })
})
