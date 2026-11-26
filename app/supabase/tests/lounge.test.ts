/**
 * 3단계 마이그레이션(층 소식·반응·댓글·신고)을 메모리 Postgres(PGlite)에 적용해 서버 규칙을 검증한다.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'

const SQL1 = readFileSync(join(__dirname, '../migrations/0001_stage2_entry.sql'), 'utf8')
const SQL2 = readFileSync(join(__dirname, '../migrations/0002_stage3_lounge.sql'), 'utf8')
const id = (c: string) => `00000000-0000-0000-0000-00000000000${c}`
const A = id('a') // 17층
const B = id('b') // 17층
const C = id('c') // 30층
const D = id('d') // 17층
const E = id('e') // 입주 안 함

let db: PGlite

async function as<T = any>(uid: string, sql: string, params: unknown[] = []): Promise<T> {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid])
  const res = await db.query<{ r: T }>(sql, params)
  return res.rows[0]?.r as T
}
const fails = (uid: string, sql: string, params: unknown[], message: string) => expect(as(uid, sql, params)).rejects.toThrow(message)
/** 도배 제한을 피하려고 내 글 시각을 과거로 돌린다 */
const age = () => db.exec(`update public.news_posts set created_at = created_at - interval '1 hour'; update public.comments set created_at = created_at - interval '1 hour';`)

const post = (uid: string, body: string, url: string | null = null) => as<{ id: number }>(uid, 'select public.post_news($1, $2, $3) as r', ['samsung', body, url])
const list = (uid: string) => as<any[]>(uid, 'select public.list_floor_news($1) as r', ['samsung'])

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    insert into auth.users values ('${A}'), ('${B}'), ('${C}'), ('${D}'), ('${E}');
  `)
  await db.exec(SQL1)
  await db.exec(SQL2)
  await db.exec(SQL2) // 다시 실행해도 안전해야 한다
  for (const [uid, nick, price] of [[A, '개미A', 170000], [B, '개미B', 175000], [C, '고래C', 300000], [D, '개미D', 171000]] as const) {
    await as(uid, 'select public.claim_nickname($1) as r', [nick])
    await as(uid, 'select public.enter_with_price($1, $2) as r', ['samsung', price])
  }
  await as(E, 'select public.claim_nickname($1) as r', ['손님E'])
})

describe('층 소식', () => {
  it('같은 층 입주민만 읽고 쓴다', async () => {
    const { id: pid } = await post(A, '오늘 17층 분위기 좋네요', 'https://news.example.com/a')
    const forB = await list(B)
    expect(forB).toHaveLength(1)
    expect(forB[0]).toMatchObject({ id: pid, author: '개미A', mine: false, source_url: 'https://news.example.com/a', comments: 0 })
    expect(forB[0]).not.toHaveProperty('author_id')
    expect(await list(C)).toEqual([]) // 다른 층
    await fails(E, 'select public.list_floor_news($1) as r', ['samsung'], 'not_resident')
    await fails(E, 'select public.post_news($1, $2, $3) as r', ['samsung', '안녕', null], 'not_resident')
  })
  it('글 검사: 개인정보, 정확한 평단가, 투자 권유, 길이, 출처 주소', async () => {
    await age()
    await fails(B, 'select public.post_news($1, $2, $3) as r', ['samsung', '연락 010-1234-5678', null], 'pii_blocked')
    await fails(B, 'select public.post_news($1, $2, $3) as r', ['samsung', '제 평단 172300원', null], 'price_blocked')
    await fails(B, 'select public.post_news($1, $2, $3) as r', ['samsung', '수익 보장 리딩방', null], 'solicit_blocked')
    await fails(B, 'select public.post_news($1, $2, $3) as r', ['samsung', '가'.repeat(301), null], 'too_long')
    await fails(B, 'select public.post_news($1, $2, $3) as r', ['samsung', '   ', null], 'empty_text')
    await fails(B, 'select public.post_news($1, $2, $3) as r', ['samsung', '출처', 'javascript:alert(1)'], 'invalid_url')
  })
  it('도배 제한: 30초에 1개', async () => {
    await age()
    await post(B, '첫 소식')
    await fails(B, 'select public.post_news($1, $2, $3) as r', ['samsung', '두 번째', null], 'rate_limited')
  })
})

describe('반응과 댓글', () => {
  it('반응을 누르고 다시 누르면 취소된다', async () => {
    const [p] = (await list(A)).filter((x) => x.author === '개미A')
    expect(await as(B, 'select public.toggle_reaction($1, $2) as r', [p.id, '🔥'])).toEqual({ on: true })
    await as(D, 'select public.toggle_reaction($1, $2) as r', [p.id, '🔥'])
    let mine = (await list(B)).find((x) => x.id === p.id)
    expect(mine.reactions).toEqual({ '🔥': 2 })
    expect(mine.my_reactions).toEqual(['🔥'])
    expect(await as(B, 'select public.toggle_reaction($1, $2) as r', [p.id, '🔥'])).toEqual({ on: false })
    mine = (await list(B)).find((x) => x.id === p.id)
    expect(mine.reactions).toEqual({ '🔥': 1 })
    await fails(B, 'select public.toggle_reaction($1, $2) as r', [p.id, '💩'], 'invalid_reaction')
    await fails(C, 'select public.toggle_reaction($1, $2) as r', [p.id, '👍'], 'not_on_floor')
  })
  it('댓글: 같은 층만, 검사·도배 제한', async () => {
    const [p] = (await list(A)).filter((x) => x.author === '개미A')
    await as(B, 'select public.add_comment($1, $2) as r', [p.id, '좋은 소식이네요'])
    await fails(B, 'select public.add_comment($1, $2) as r', [p.id, '또 달기'], 'rate_limited')
    await fails(D, 'select public.add_comment($1, $2) as r', [p.id, 'https://x.example.com'], 'link_blocked')
    await fails(C, 'select public.add_comment($1, $2) as r', [p.id, '다른 층'], 'not_on_floor')
    const cs = await as<any[]>(A, 'select public.list_comments($1) as r', [p.id])
    expect(cs).toHaveLength(1)
    expect(cs[0]).toMatchObject({ body: '좋은 소식이네요', author: '개미B', mine: false })
    expect((await list(A)).find((x) => x.id === p.id).comments).toBe(1)
  })
})

describe('신고', () => {
  it('서로 다른 3명이 신고하면 소식을 숨긴다 (같은 사람 중복 신고는 한 번)', async () => {
    await age()
    const { id: pid } = await post(D, '이 종목 무조건 간다 믿어봐요')
    const report = (uid: string) => as(uid, 'select public.report_target($1, $2, $3, $4) as r', ['post', String(pid), 'false_info', null])
    expect(await report(A)).toEqual({ hidden: false })
    expect(await report(A)).toEqual({ hidden: false })
    expect(await report(B)).toEqual({ hidden: false })
    expect(await report(C)).toEqual({ hidden: true })
    expect((await list(A)).some((x) => x.id === pid)).toBe(false)
  })
  it('잘못된 신고 사유는 거부', async () => {
    await expect(as(A, 'select public.report_target($1, $2, $3, $4) as r', ['post', '1', 'hate', null])).rejects.toThrow()
  })
})

describe('직접 테이블 접근', () => {
  it('정책이 없어 막혀 있다 (RLS 켜짐)', async () => {
    const res = await db.query<{ relname: string; relrowsecurity: boolean }>(
      `select relname, relrowsecurity from pg_class where relname in ('news_posts','reactions','comments','reports')`,
    )
    expect(res.rows.every((r) => r.relrowsecurity)).toBe(true)
    const pol = await db.query(`select * from pg_policies where tablename in ('news_posts','reactions','comments','reports')`)
    expect(pol.rows).toHaveLength(0)
  })
})
