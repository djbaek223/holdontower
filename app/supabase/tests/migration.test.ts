/**
 * supabase/migrations 의 SQL을 메모리 Postgres(PGlite)에 실제로 적용해 서버 규칙을 검증한다.
 * Supabase의 auth 스키마는 최소한으로 흉내 낸다 (auth.users, auth.uid()).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { BUILDINGS } from '../../src/config/buildings'
import { calcFloor, floorButtons, floorNumber } from '../../src/lib/floor'

const SQL = readFileSync(join(__dirname, '../migrations/0001_stage2_entry.sql'), 'utf8')
const A = '00000000-0000-0000-0000-00000000000a'
const B = '00000000-0000-0000-0000-00000000000b'

let db: PGlite

/** 로그인한 사용자로 함수 호출 */
async function as<T = any>(uid: string, sql: string, params: unknown[] = []): Promise<T> {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid])
  const res = await db.query<{ r: T }>(sql, params)
  return res.rows[0]?.r as T
}

async function expectError(uid: string, sql: string, params: unknown[], message: string) {
  await expect(as(uid, sql, params)).rejects.toThrow(message)
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    insert into auth.users values ('${A}'), ('${B}');
  `)
  await db.exec(SQL)
  await db.exec(SQL) // 다시 실행해도 안전해야 한다
})

describe('층 계산이 앱(floor.ts)과 같다', () => {
  it('여러 평단가에서 calc_floor = calcFloor', async () => {
    for (const b of BUILDINGS) {
      for (const price of [1, 9_999, 10_000, 59_999, 60_000, 170_000, 179_999, 300_000, 310_000, 1_009_999, 1_010_000, 1_500_000, 1_510_000, 9_000_000]) {
        const res = await db.query<{ f: number }>('select public.calc_floor($1, $2, $3, $4) as f', [price, b.floorUnit, b.mergedFloorMax, b.maxFloor])
        expect(res.rows[0].f, `${b.id} ${price}`).toBe(floorNumber(calcFloor(price, b), b))
      }
    }
  })
  it('floor_buttons = floorButtons', async () => {
    for (const b of BUILDINGS) {
      const res = await db.query<{ a: number[] }>('select public.floor_buttons($1, $2) as a', [b.mergedFloorMax, b.maxFloor])
      expect(res.rows[0].a).toEqual(floorButtons(b))
    }
  })
})

describe('닉네임', () => {
  it('정하기, 중복 방지 (대소문자 무시), 형식 검사', async () => {
    await as(A, 'select public.claim_nickname($1) as r', ['물타기왕'])
    await expectError(B, 'select public.claim_nickname($1) as r', ['물타기왕'], 'nickname_taken')
    await as(A, 'select public.claim_nickname($1) as r', ['Bull_1'])
    await expectError(B, 'select public.claim_nickname($1) as r', ['bull_1'], 'nickname_taken')
    await expectError(B, 'select public.claim_nickname($1) as r', ['a'], 'invalid_nickname')
  })
  it('로그인하지 않으면 거부', async () => {
    await expectError('', 'select public.claim_nickname($1) as r', ['손님'], 'not_authenticated')
  })
})

describe('입주와 엘리베이터 이동', () => {
  it('처음 평단가 입력은 이동 횟수를 쓰지 않는다 (17만 원 → 17층)', async () => {
    const r = await as<any>(A, 'select public.enter_with_price($1, $2) as r', ['samsung', 170000])
    expect(r).toEqual({ building_id: 'samsung', floor: 17, base_floor: 17, moves_left: 1 })
  })
  it('응답과 내 입주 정보에 평단가가 없다', async () => {
    const r = await as<any>(A, 'select public.my_residency($1) as r', ['samsung'])
    expect(r).not.toHaveProperty('avg_price')
    expect(r.floor).toBe(17)
  })
  it('범위 밖(±5칸 초과)·없는 층은 거부', async () => {
    await expectError(A, 'select public.move_floor($1, $2) as r', ['samsung', 23], 'out_of_range')
    await expectError(A, 'select public.move_floor($1, $2) as r', ['samsung', 3], 'invalid_floor')
  })
  it('하루 1회 이동', async () => {
    const r = await as<any>(A, 'select public.move_floor($1, $2) as r', ['samsung', 22])
    expect(r).toMatchObject({ floor: 22, base_floor: 17, moves_left: 0 })
    await expectError(A, 'select public.move_floor($1, $2) as r', ['samsung', 12], 'no_moves_left')
  })
  it('오늘 이미 이동했으면 평단가를 바꿔 다른 층으로 가는 것도 막는다', async () => {
    await expectError(A, 'select public.enter_with_price($1, $2) as r', ['samsung', 200000], 'no_moves_left')
  })
  it('다음 날(한국 시간)이 되면 다시 1회', async () => {
    await db.query(`update public.residencies set last_moved_at = now() - interval '1 day' where user_id = $1`, [A])
    const r = await as<any>(A, 'select public.move_floor($1, $2) as r', ['samsung', 12])
    expect(r).toMatchObject({ floor: 12, moves_left: 0 })
  })
  it('SK하이닉스 통합 저층과 옥상', async () => {
    expect(await as<any>(B, 'select public.enter_with_price($1, $2) as r', ['skhynix', 900000])).toMatchObject({ floor: 1 })
    expect(await as<any>(B, 'select public.move_floor($1, $2) as r', ['skhynix', 105])).toMatchObject({ floor: 105 })
  })
  it('잘못된 평단가·빌딩은 거부', async () => {
    await expectError(B, 'select public.enter_with_price($1, $2) as r', ['samsung', 0], 'invalid_price')
    await expectError(B, 'select public.enter_with_price($1, $2) as r', ['apple', 10000], 'unknown_building')
  })
})

describe('권한', () => {
  it('익명(anon)은 함수를 부를 수 없고, 로그인 사용자는 입주 테이블을 직접 읽지 못한다', async () => {
    await db.exec('grant usage on schema public to anon, authenticated; grant select on all tables in schema public to anon, authenticated;')
    await db.exec('set role anon')
    await expect(db.query(`select public.enter_with_price('samsung', 10000)`)).rejects.toThrow(/permission denied/)
    await db.exec('reset role')
    await db.exec('set role authenticated')
    const rows = await db.query('select * from public.residencies')
    expect(rows.rows).toHaveLength(0) // RLS: 정책이 없으니 평단가가 든 행이 하나도 안 보인다
    await db.exec('reset role')
  })
})
