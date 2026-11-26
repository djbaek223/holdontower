-- 주식 빌딩 시티 3단계: 층 소식 게시판, 반응, 댓글, 신고
-- 0001 다음에 Supabase 대시보드 > SQL Editor 에서 한 번 실행한다. (다시 실행해도 안전하게 작성)
--
-- 원칙 (PRD 5·7장)
--  * 소식은 같은 빌딩·같은 층(지금 머무는 층) 입주민만 쓰고 읽는다. 라운지 방이 나뉘어도 층 단위로 공유.
--  * 글 검사(개인정보, 정확한 평단가, 투자 권유)와 도배 제한을 서버에서 다시 한다 (src/lib/moderation.ts 와 같은 규칙).
--  * 신고가 3명 이상 쌓인 소식·댓글은 임시로 숨기고 운영자가 검토한다.
--  * 테이블은 정책이 없어 직접 읽기·쓰기가 안 되고, 아래 함수로만 다룬다.
--  * 라운지 실시간 위치·이모트·채팅은 Supabase Realtime 채널로 주고받고 DB에 저장하지 않는다.

-- ---------- 테이블 ----------

create table if not exists public.news_posts (
  id bigint generated always as identity primary key,
  building_id text not null references public.buildings (id),
  floor integer not null,
  author_id uuid not null references auth.users (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 300),
  source_url text check (source_url is null or source_url ~ '^https?://'),
  status text not null default 'visible' check (status in ('visible', 'hidden')),
  created_at timestamptz not null default now()
);
create index if not exists news_posts_floor_idx on public.news_posts (building_id, floor, created_at desc);

create table if not exists public.reactions (
  post_id bigint not null references public.news_posts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null check (type in ('👍', '🔥', '😢', '😂', '👀')),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id, type)
);

create table if not exists public.comments (
  id bigint generated always as identity primary key,
  post_id bigint not null references public.news_posts (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 100),
  status text not null default 'visible' check (status in ('visible', 'hidden')),
  created_at timestamptz not null default now()
);
create index if not exists comments_post_idx on public.comments (post_id, created_at);

create table if not exists public.reports (
  id bigint generated always as identity primary key,
  target_type text not null check (target_type in ('post', 'comment', 'chat', 'user')),
  target_id text not null,
  reporter_id uuid not null references auth.users (id) on delete cascade,
  reason text not null check (reason in ('solicit', 'false_info', 'abuse', 'privacy', 'other')),
  detail text check (detail is null or char_length(detail) <= 200),
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now(),
  unique (target_type, target_id, reporter_id)
);

alter table public.news_posts enable row level security;
alter table public.reactions enable row level security;
alter table public.comments enable row level security;
alter table public.reports enable row level security;

-- ---------- 공통 검사 ----------

-- 글 검사. 문제가 있으면 오류 코드를 던진다.
create or replace function public.check_text(p_text text, p_max integer, p_allow_url boolean)
returns text language plpgsql immutable as $$
declare
  v text := btrim(regexp_replace(coalesce(p_text, ''), '\s+', ' ', 'g'));
  v_plain text;
begin
  if v = '' then raise exception 'empty_text'; end if;
  if char_length(v) > p_max then raise exception 'too_long'; end if;
  v_plain := case when p_allow_url then regexp_replace(v, 'https?://\S+', '', 'g') else v end;
  if v_plain ~ '01[016789][ .-]?[0-9]{3,4}[ .-]?[0-9]{4}' or v_plain ~ '([0-9]{2,6}-[0-9]{2,6}-[0-9]{2,8})|([0-9]{10,})' then
    raise exception 'pii_blocked';
  end if;
  if v_plain ~ '평단가?\s*[:은는이]?\s*[0-9]' then raise exception 'price_blocked'; end if;
  if v_plain ~ '(리딩방|수익\s*보장|무조건\s*(오른|상승|수익)|원금\s*보장|텔레그램|카톡방|오픈채팅|단톡방\s*초대|급등주\s*추천|매수\s*추천|종목\s*추천해\s*드)' then
    raise exception 'solicit_blocked';
  end if;
  if not p_allow_url and v ~ 'https?://' then raise exception 'link_blocked'; end if;
  return v;
end;
$$;

-- 지금 머무는 층 (입주하지 않았으면 null)
create or replace function public.my_floor(p_building text)
returns integer language sql stable security definer set search_path = public as $$
  select floor from residencies where user_id = auth.uid() and building_id = p_building
$$;

-- 소식 하나가 내 층 소식인지 (아니면 오류)
create or replace function public.assert_post_on_my_floor(p_post bigint)
returns public.news_posts language plpgsql stable security definer set search_path = public as $$
declare
  p news_posts;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into p from news_posts where id = p_post and status = 'visible';
  if not found then raise exception 'post_not_found'; end if;
  if public.my_floor(p.building_id) is distinct from p.floor then raise exception 'not_on_floor'; end if;
  return p;
end;
$$;

-- ---------- 소식 ----------

-- 내 층 소식 최신순 50개 (반응 수, 내 반응, 댓글 수 포함)
create or replace function public.list_floor_news(p_building text)
returns json language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_floor integer;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  v_floor := public.my_floor(p_building);
  if v_floor is null then raise exception 'not_resident'; end if;
  return coalesce((
    select json_agg(x order by x.created_at desc) from (
      select p.id, p.body, p.source_url, p.created_at, pr.nickname as author, p.author_id = v_uid as mine,
        coalesce((select json_object_agg(t.type, t.n) from (select type, count(*) as n from reactions where post_id = p.id group by type) t), '{}'::json) as reactions,
        coalesce((select json_agg(type) from reactions where post_id = p.id and user_id = v_uid), '[]'::json) as my_reactions,
        (select count(*) from comments c where c.post_id = p.id and c.status = 'visible') as comments
      from news_posts p join profiles pr on pr.id = p.author_id
      where p.building_id = p_building and p.floor = v_floor and p.status = 'visible'
      order by p.created_at desc
      limit 50
    ) x
  ), '[]'::json);
end;
$$;

-- 소식 올리기: 30초에 1개, 하루 20개까지
create or replace function public.post_news(p_building text, p_body text, p_source_url text)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_floor integer;
  v_body text;
  v_url text := nullif(btrim(coalesce(p_source_url, '')), '');
  v_id bigint;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  v_floor := public.my_floor(p_building);
  if v_floor is null then raise exception 'not_resident'; end if;
  v_body := public.check_text(p_body, 300, true);
  if v_url is not null and (v_url !~ '^https?://[^\s]+\.[^\s]+$' or char_length(v_url) > 300) then raise exception 'invalid_url'; end if;
  if exists (select 1 from news_posts where author_id = v_uid and created_at > now() - interval '30 seconds')
     or (select count(*) from news_posts where author_id = v_uid and created_at > now() - interval '1 day') >= 20 then
    raise exception 'rate_limited';
  end if;
  insert into news_posts (building_id, floor, author_id, body, source_url)
  values (p_building, v_floor, v_uid, v_body, v_url) returning id into v_id;
  return json_build_object('id', v_id);
end;
$$;

-- 반응 누르기/취소
create or replace function public.toggle_reaction(p_post bigint, p_type text)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  perform public.assert_post_on_my_floor(p_post);
  if p_type not in ('👍', '🔥', '😢', '😂', '👀') then raise exception 'invalid_reaction'; end if;
  if exists (select 1 from reactions where post_id = p_post and user_id = v_uid and type = p_type) then
    delete from reactions where post_id = p_post and user_id = v_uid and type = p_type;
    return json_build_object('on', false);
  end if;
  insert into reactions (post_id, user_id, type) values (p_post, v_uid, p_type);
  return json_build_object('on', true);
end;
$$;

-- 댓글 목록 (오래된 순)
create or replace function public.list_comments(p_post bigint)
returns json language plpgsql stable security definer set search_path = public as $$
begin
  perform public.assert_post_on_my_floor(p_post);
  return coalesce((
    select json_agg(json_build_object('id', c.id, 'body', c.body, 'author', pr.nickname, 'mine', c.author_id = auth.uid(), 'created_at', c.created_at) order by c.created_at)
    from comments c join profiles pr on pr.id = c.author_id
    where c.post_id = p_post and c.status = 'visible'
  ), '[]'::json);
end;
$$;

-- 댓글 달기: 5초에 1개
create or replace function public.add_comment(p_post bigint, p_body text)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_body text;
  v_id bigint;
begin
  perform public.assert_post_on_my_floor(p_post);
  v_body := public.check_text(p_body, 100, false);
  if exists (select 1 from comments where author_id = v_uid and created_at > now() - interval '5 seconds') then
    raise exception 'rate_limited';
  end if;
  insert into comments (post_id, author_id, body) values (p_post, v_uid, v_body) returning id into v_id;
  return json_build_object('id', v_id);
end;
$$;

-- 신고. 같은 대상에 한 사람은 한 번. 서로 다른 3명이 신고한 소식·댓글은 임시로 숨긴다.
create or replace function public.report_target(p_type text, p_target text, p_reason text, p_detail text)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_count integer;
  v_hidden boolean := false;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  insert into reports (target_type, target_id, reporter_id, reason, detail)
  values (p_type, p_target, v_uid, p_reason, nullif(left(btrim(coalesce(p_detail, '')), 200), ''))
  on conflict (target_type, target_id, reporter_id) do nothing;
  select count(*) into v_count from reports where target_type = p_type and target_id = p_target and status = 'open';
  if v_count >= 3 and p_type = 'post' then
    update news_posts set status = 'hidden' where id = p_target::bigint;
    v_hidden := true;
  elsif v_count >= 3 and p_type = 'comment' then
    update comments set status = 'hidden' where id = p_target::bigint;
    v_hidden := true;
  end if;
  return json_build_object('hidden', v_hidden);
end;
$$;

-- ---------- 실행 권한 ----------

revoke all on function public.list_floor_news(text) from public, anon;
revoke all on function public.post_news(text, text, text) from public, anon;
revoke all on function public.toggle_reaction(bigint, text) from public, anon;
revoke all on function public.list_comments(bigint) from public, anon;
revoke all on function public.add_comment(bigint, text) from public, anon;
revoke all on function public.report_target(text, text, text, text) from public, anon;
revoke all on function public.my_floor(text) from public, anon;
revoke all on function public.assert_post_on_my_floor(bigint) from public, anon;
grant execute on function public.list_floor_news(text) to authenticated;
grant execute on function public.post_news(text, text, text) to authenticated;
grant execute on function public.toggle_reaction(bigint, text) to authenticated;
grant execute on function public.list_comments(bigint) to authenticated;
grant execute on function public.add_comment(bigint, text) to authenticated;
grant execute on function public.report_target(text, text, text, text) to authenticated;
