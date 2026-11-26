-- 주식 빌딩 시티 2단계: 로그인·닉네임·입주(평단가 → 층)·엘리베이터 이동
-- Supabase 대시보드 > SQL Editor 에 붙여 넣고 한 번 실행한다. (다시 실행해도 안전하게 작성)
--
-- 원칙 (PRD 6·7장)
--  * 평단가(avg_price)는 본인만 볼 수 있고, 다른 사람에게는 층수만 노출한다.
--  * 층 계산·이동 제한은 모두 서버(이 함수들)에서 다시 계산·검사한다. 클라이언트가 층을 직접 쓰지 못한다.
--  * 층 표기: 통합 저층은 1, 옥상(펜트하우스)은 max_floor + 1.

-- ---------- 테이블 ----------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nickname text not null,
  created_at timestamptz not null default now(),
  constraint nickname_format check (nickname ~ '^[가-힣a-zA-Z0-9_]{2,12}$')
);
-- 닉네임 중복 방지 (영문 대소문자 구분 없이)
create unique index if not exists profiles_nickname_key on public.profiles (lower(nickname));

create table if not exists public.buildings (
  id text primary key,
  name text not null,
  floor_unit integer not null check (floor_unit > 0),
  merged_floor_max integer not null check (merged_floor_max >= 1),
  max_floor integer not null check (max_floor > merged_floor_max)
);

insert into public.buildings (id, name, floor_unit, merged_floor_max, max_floor) values
  ('samsung', '삼성전자', 10000, 5, 30),
  ('skhynix', 'SK하이닉스', 10000, 100, 150)
on conflict (id) do update set
  name = excluded.name,
  floor_unit = excluded.floor_unit,
  merged_floor_max = excluded.merged_floor_max,
  max_floor = excluded.max_floor;

create table if not exists public.residencies (
  user_id uuid not null references auth.users (id) on delete cascade,
  building_id text not null references public.buildings (id),
  avg_price bigint not null check (avg_price > 0),
  base_floor integer not null, -- 평단가로 계산한 층
  floor integer not null,      -- 지금 머무는 층 (엘리베이터로 옮길 수 있음)
  last_moved_at timestamptz,   -- 마지막 엘리베이터 이동 (하루 1회 제한)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, building_id)
);

-- 지표 (입주까지 걸린 시간 등). 본인 기록만 쓸 수 있다.
create table if not exists public.metrics (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('first_arrival')),
  value numeric not null,
  created_at timestamptz not null default now()
);

-- ---------- 행 수준 보안 ----------

alter table public.profiles enable row level security;
alter table public.buildings enable row level security;
alter table public.residencies enable row level security;
alter table public.metrics enable row level security;

drop policy if exists "닉네임은 누구나 볼 수 있다" on public.profiles;
create policy "닉네임은 누구나 볼 수 있다" on public.profiles for select using (true);

drop policy if exists "빌딩 정보는 누구나 볼 수 있다" on public.buildings;
create policy "빌딩 정보는 누구나 볼 수 있다" on public.buildings for select using (true);

-- residencies 는 정책이 없으므로 직접 읽기·쓰기 불가. 아래 함수로만 다룬다 (평단가 비공개).

drop policy if exists "본인 지표만 기록" on public.metrics;
create policy "본인 지표만 기록" on public.metrics for insert to authenticated with check (user_id = auth.uid());

-- ---------- 층 규칙 (src/lib/floor.ts 와 같은 계산) ----------

-- 평단가 → 층. 1층 단위 미만은 1층, 통합 저층은 1층, 최고층 초과는 옥상(max_floor + 1)
create or replace function public.calc_floor(p_price bigint, p_unit integer, p_merged integer, p_max integer)
returns integer language sql immutable as $$
  select case
    when greatest(1, p_price / p_unit) > p_max then p_max + 1
    when greatest(1, p_price / p_unit) <= p_merged then 1
    else (p_price / p_unit)::integer
  end
$$;

-- 엘리베이터 버튼 목록: 1(통합 저층), merged+1 … max, 옥상
create or replace function public.floor_buttons(p_merged integer, p_max integer)
returns integer[] language sql immutable as $$
  select array[1] || array(select generate_series(p_merged + 1, p_max)) || array[p_max + 1]
$$;

-- 오늘(한국 시간) 남은 이동 횟수: 하루 1회
create or replace function public.moves_left(p_last timestamptz)
returns integer language sql stable as $$
  select case
    when p_last is null then 1
    when (p_last at time zone 'Asia/Seoul')::date < (now() at time zone 'Asia/Seoul')::date then 1
    else 0
  end
$$;

-- 내 입주 정보를 클라이언트에 돌려줄 모양 (평단가는 빼고)
create or replace function public.residency_json(r public.residencies)
returns json language sql stable as $$
  select json_build_object(
    'building_id', r.building_id,
    'floor', r.floor,
    'base_floor', r.base_floor,
    'moves_left', public.moves_left(r.last_moved_at)
  )
$$;

-- ---------- 클라이언트가 부르는 함수 ----------

-- 닉네임 정하기 (처음 한 번, 또는 변경). 중복이면 'nickname_taken' 오류
create or replace function public.claim_nickname(p_nickname text)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_nickname !~ '^[가-힣a-zA-Z0-9_]{2,12}$' then raise exception 'invalid_nickname'; end if;
  if exists (select 1 from profiles where lower(nickname) = lower(p_nickname) and id <> v_uid) then
    raise exception 'nickname_taken';
  end if;
  insert into profiles (id, nickname) values (v_uid, p_nickname)
  on conflict (id) do update set nickname = excluded.nickname;
  return json_build_object('nickname', p_nickname);
exception when unique_violation then
  raise exception 'nickname_taken';
end;
$$;

-- 내 입주 정보 (없으면 null)
create or replace function public.my_residency(p_building text)
returns json language sql stable security definer set search_path = public as $$
  select public.residency_json(r) from residencies r where r.user_id = auth.uid() and r.building_id = p_building
$$;

-- 평단가 입력 → 층 배치.
-- 처음 입주는 이동 횟수에 넣지 않는다. 이미 입주한 사람이 평단가를 바꿔 층이 달라지면 오늘 이동 1회를 쓴다.
create or replace function public.enter_with_price(p_building text, p_price bigint)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  b buildings;
  r residencies;
  v_floor integer;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_price is null or p_price <= 0 or p_price > 100000000000 then raise exception 'invalid_price'; end if;
  select * into b from buildings where id = p_building;
  if not found then raise exception 'unknown_building'; end if;

  v_floor := public.calc_floor(p_price, b.floor_unit, b.merged_floor_max, b.max_floor);
  select * into r from residencies where user_id = v_uid and building_id = p_building for update;

  if not found then
    insert into residencies (user_id, building_id, avg_price, base_floor, floor)
    values (v_uid, p_building, p_price, v_floor, v_floor)
    returning * into r;
  elsif v_floor = r.floor then
    update residencies set avg_price = p_price, base_floor = v_floor, updated_at = now()
    where user_id = v_uid and building_id = p_building returning * into r;
  else
    if public.moves_left(r.last_moved_at) < 1 then raise exception 'no_moves_left'; end if;
    update residencies
    set avg_price = p_price, base_floor = v_floor, floor = v_floor, last_moved_at = now(), updated_at = now()
    where user_id = v_uid and building_id = p_building returning * into r;
  end if;
  return public.residency_json(r);
end;
$$;

-- 엘리베이터 층 버튼으로 이동: 하루 1회, 평단가 기준 층에서 버튼 ±5칸 이내
create or replace function public.move_floor(p_building text, p_floor integer)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  b buildings;
  r residencies;
  v_buttons integer[];
  v_base_idx integer;
  v_target_idx integer;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into b from buildings where id = p_building;
  if not found then raise exception 'unknown_building'; end if;
  select * into r from residencies where user_id = v_uid and building_id = p_building for update;
  if not found then raise exception 'not_resident'; end if;

  v_buttons := public.floor_buttons(b.merged_floor_max, b.max_floor);
  v_base_idx := array_position(v_buttons, r.base_floor);
  v_target_idx := array_position(v_buttons, p_floor);
  if v_target_idx is null then raise exception 'invalid_floor'; end if;
  if abs(v_target_idx - v_base_idx) > 5 then raise exception 'out_of_range'; end if;
  if p_floor = r.floor then return public.residency_json(r); end if;
  if public.moves_left(r.last_moved_at) < 1 then raise exception 'no_moves_left'; end if;

  update residencies set floor = p_floor, last_moved_at = now(), updated_at = now()
  where user_id = v_uid and building_id = p_building returning * into r;
  return public.residency_json(r);
end;
$$;

-- ---------- 실행 권한 ----------

revoke all on function public.claim_nickname(text) from public, anon;
revoke all on function public.my_residency(text) from public, anon;
revoke all on function public.enter_with_price(text, bigint) from public, anon;
revoke all on function public.move_floor(text, integer) from public, anon;
grant execute on function public.claim_nickname(text) to authenticated;
grant execute on function public.my_residency(text) to authenticated;
grant execute on function public.enter_with_price(text, bigint) to authenticated;
grant execute on function public.move_floor(text, integer) to authenticated;
