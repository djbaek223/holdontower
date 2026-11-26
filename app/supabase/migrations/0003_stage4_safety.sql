-- 주식 빌딩 시티 4단계: 안전 (차단, 위기 대응, 이용 제한, 운영자 검토, 탈퇴, 라운지 채널 권한)
-- 0002 다음에 Supabase 대시보드 > SQL Editor 에서 한 번 실행한다. (다시 실행해도 안전하게 작성)
--
-- 원칙 (PRD 5·6·7장)
--  * F8  차단한 사람의 소식·댓글은 내 목록에서 뺀다 (채팅·말풍선은 앱이 숨긴다).
--  * F9  극단적 선택을 암시하는 글은 저장하지 않고(다른 사람에게 비노출) 오류 'crisis_detected' 를 돌려준다.
--        앱은 쓴 사람에게만 위로와 상담 안내를 보여 준다. 감지 건수만 지표로 남기고 내용은 남기지 않는다.
--  * 반복 위반자는 운영자가 기간을 정해 작성·라운지 입장을 제한한다.
--  * 운영자(admins 표에 넣은 계정)만 신고 목록을 보고 처리한다.
--  * 탈퇴하면 계정과 관련 기록을 모두 지운다.
--  * 라운지 실시간 채널은 비공개 채널로 바꾸고, 같은 빌딩·같은 층 입주민만 주고받게 한다.

-- ---------- 테이블 ----------

create table if not exists public.blocks (
  blocker uuid not null references auth.users (id) on delete cascade,
  blocked uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked),
  check (blocker <> blocked)
);

create table if not exists public.restrictions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  until timestamptz not null,
  reason text,
  created_at timestamptz not null default now()
);

-- 운영자 계정 (대시보드에서 직접 넣는다: insert into public.admins values ('<user id>');)
create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);

alter table public.blocks enable row level security;
alter table public.restrictions enable row level security;
alter table public.admins enable row level security;

-- 지표 종류 추가: 위기 감지 건수(내용 없이 숫자만)
alter table public.metrics drop constraint if exists metrics_kind_check;
alter table public.metrics add constraint metrics_kind_check check (kind in ('first_arrival', 'crisis'));

-- ---------- 공통 ----------

-- 위기 표현 (src/lib/moderation.ts 의 CRISIS 와 같은 목록. 운영자가 정기적으로 갱신)
create or replace function public.is_crisis(p_text text)
returns boolean language sql immutable as $$
  select coalesce(p_text, '') ~ '(죽고\s*싶|자살|극단적\s*선택|목숨을\s*끊|살기\s*싫|사라지고\s*싶|뛰어\s*내리|뛰어\s*내릴|한강\s*(가즈아|물|가고\s*싶|간다)|유서|생을\s*마감)'
$$;

-- 글 검사 (0002 의 check_text 에 위기 표현 검사를 더한다)
create or replace function public.check_text(p_text text, p_max integer, p_allow_url boolean)
returns text language plpgsql immutable as $$
declare
  v text := btrim(regexp_replace(coalesce(p_text, ''), '\s+', ' ', 'g'));
  v_plain text;
begin
  if v = '' then raise exception 'empty_text'; end if;
  if char_length(v) > p_max then raise exception 'too_long'; end if;
  if public.is_crisis(v) then raise exception 'crisis_detected'; end if;
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

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where user_id = auth.uid())
$$;

create or replace function public.restricted_until(p_user uuid)
returns timestamptz language sql stable security definer set search_path = public as $$
  select until from restrictions where user_id = p_user and until > now()
$$;

create or replace function public.assert_not_restricted()
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if public.restricted_until(auth.uid()) is not null then raise exception 'restricted'; end if;
end;
$$;

-- 내 상태: 이용 제한, 운영자 여부, 차단한 사람 (앱 시작 시 한 번 읽는다)
create or replace function public.my_status()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'restricted_until', public.restricted_until(auth.uid()),
    'is_admin', public.is_admin(),
    'blocked', coalesce((select json_agg(blocked) from blocks where blocker = auth.uid()), '[]'::json)
  )
$$;

-- ---------- F8 차단 ----------

create or replace function public.block_user(p_user uuid)
returns json language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_user = auth.uid() then raise exception 'invalid_target'; end if;
  insert into blocks (blocker, blocked) values (auth.uid(), p_user) on conflict do nothing;
  return json_build_object('blocked', true);
end;
$$;

create or replace function public.unblock_user(p_user uuid)
returns json language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  delete from blocks where blocker = auth.uid() and blocked = p_user;
  return json_build_object('blocked', false);
end;
$$;

-- 차단한 사람 목록 (별명 포함, 차단 해제 화면용)
create or replace function public.my_blocks()
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(json_build_object('id', b.blocked, 'nickname', coalesce(p.nickname, '(탈퇴한 이웃)')) order by b.created_at desc), '[]'::json)
  from blocks b left join profiles p on p.id = b.blocked
  where b.blocker = auth.uid()
$$;

-- ---------- 소식·댓글 (0002 함수에 차단·이용 제한을 더한다) ----------

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
      select p.id, p.body, p.source_url, p.created_at, pr.nickname as author, p.author_id as author_id, p.author_id = v_uid as mine,
        coalesce((select json_object_agg(t.type, t.n) from (select type, count(*) as n from reactions where post_id = p.id group by type) t), '{}'::json) as reactions,
        coalesce((select json_agg(type) from reactions where post_id = p.id and user_id = v_uid), '[]'::json) as my_reactions,
        (select count(*) from comments c where c.post_id = p.id and c.status = 'visible'
           and not exists (select 1 from blocks bl where bl.blocker = v_uid and bl.blocked = c.author_id)) as comments
      from news_posts p join profiles pr on pr.id = p.author_id
      where p.building_id = p_building and p.floor = v_floor and p.status = 'visible'
        and not exists (select 1 from blocks bl where bl.blocker = v_uid and bl.blocked = p.author_id)
      order by p.created_at desc
      limit 50
    ) x
  ), '[]'::json);
end;
$$;

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
  perform public.assert_not_restricted();
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

create or replace function public.list_comments(p_post bigint)
returns json language plpgsql stable security definer set search_path = public as $$
begin
  perform public.assert_post_on_my_floor(p_post);
  return coalesce((
    select json_agg(json_build_object('id', c.id, 'body', c.body, 'author', pr.nickname, 'author_id', c.author_id, 'mine', c.author_id = auth.uid(), 'created_at', c.created_at) order by c.created_at)
    from comments c join profiles pr on pr.id = c.author_id
    where c.post_id = p_post and c.status = 'visible'
      and not exists (select 1 from blocks bl where bl.blocker = auth.uid() and bl.blocked = c.author_id)
  ), '[]'::json);
end;
$$;

create or replace function public.add_comment(p_post bigint, p_body text)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_body text;
  v_id bigint;
begin
  perform public.assert_post_on_my_floor(p_post);
  perform public.assert_not_restricted();
  v_body := public.check_text(p_body, 100, false);
  if exists (select 1 from comments where author_id = v_uid and created_at > now() - interval '5 seconds') then
    raise exception 'rate_limited';
  end if;
  insert into comments (post_id, author_id, body) values (p_post, v_uid, v_body) returning id into v_id;
  return json_build_object('id', v_id);
end;
$$;

-- ---------- 운영자 검토 ----------

-- 처리 안 된 신고를 대상별로 묶어서 (많이 신고된 순)
create or replace function public.admin_reports()
returns json language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  return coalesce((
    select json_agg(x order by x.count desc, x.latest desc) from (
      select r.target_type, r.target_id, count(*) as count, max(r.created_at) as latest,
        json_agg(distinct r.reason) as reasons,
        (array_agg(r.detail order by r.created_at desc) filter (where r.detail is not null))[1] as detail,
        case r.target_type
          when 'post' then (select json_build_object('body', p.body, 'status', p.status, 'author', pr.nickname, 'author_id', p.author_id, 'where', p.building_id || ' ' || p.floor || '층')
                            from news_posts p left join profiles pr on pr.id = p.author_id where p.id::text = r.target_id)
          when 'comment' then (select json_build_object('body', c.body, 'status', c.status, 'author', pr.nickname, 'author_id', c.author_id)
                               from comments c left join profiles pr on pr.id = c.author_id where c.id::text = r.target_id)
          else (select json_build_object('author', pr.nickname, 'author_id', pr.id) from profiles pr where pr.id::text = r.target_id)
        end as target,
        public.restricted_until(case r.target_type
          when 'post' then (select author_id from news_posts where id::text = r.target_id)
          when 'comment' then (select author_id from comments where id::text = r.target_id)
          else (select id from profiles where id::text = r.target_id) end) as restricted_until
      from reports r
      where r.status = 'open'
      group by r.target_type, r.target_id
    ) x
  ), '[]'::json);
end;
$$;

-- 처리: dismiss(문제없음, 숨김 해제) / hide(숨김) / restrict(숨김 + 작성자 7일 이용 제한)
create or replace function public.admin_resolve(p_type text, p_target text, p_action text)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_author uuid;
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  if p_action not in ('dismiss', 'hide', 'restrict') then raise exception 'invalid_action'; end if;
  v_author := case p_type
    when 'post' then (select author_id from news_posts where id::text = p_target)
    when 'comment' then (select author_id from comments where id::text = p_target)
    else (select id from profiles where id::text = p_target) end;
  if p_type = 'post' then
    update news_posts set status = case when p_action = 'dismiss' then 'visible' else 'hidden' end where id::text = p_target;
  elsif p_type = 'comment' then
    update comments set status = case when p_action = 'dismiss' then 'visible' else 'hidden' end where id::text = p_target;
  end if;
  if p_action = 'restrict' and v_author is not null then
    insert into restrictions (user_id, until, reason) values (v_author, now() + interval '7 days', p_type || ' 신고 처리')
    on conflict (user_id) do update set until = greatest(restrictions.until, excluded.until), reason = excluded.reason;
  end if;
  update reports set status = 'resolved' where target_type = p_type and target_id = p_target and status = 'open';
  return json_build_object('ok', true);
end;
$$;

-- ---------- 탈퇴 ----------

-- 내 계정과 기록(닉네임, 입주 정보, 소식, 댓글, 반응, 신고, 차단, 지표)을 모두 지운다
create or replace function public.delete_my_account()
returns json language plpgsql security definer set search_path = public, auth as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  delete from auth.users where id = v_uid;
  return json_build_object('deleted', true);
end;
$$;

-- ---------- 라운지 실시간 채널 권한 (비공개 채널) ----------

-- 채널 이름 "lounge:빌딩:층:방번호" 에 들어갈 수 있는지: 그 빌딩·그 층 입주민이고 이용 제한 중이 아니어야 한다
create or replace function public.can_join_lounge(p_topic text)
returns boolean language sql stable security definer set search_path = public as $$
  select split_part(p_topic, ':', 1) = 'lounge'
    and public.restricted_until(auth.uid()) is null
    and exists (
      select 1 from residencies
      where user_id = auth.uid()
        and building_id = split_part(p_topic, ':', 2)
        and floor::text = split_part(p_topic, ':', 3)
    )
$$;

do $$
begin
  if to_regclass('realtime.messages') is not null then
    execute 'drop policy if exists "라운지: 같은 층 입주민만 받기" on realtime.messages';
    execute 'drop policy if exists "라운지: 같은 층 입주민만 보내기" on realtime.messages';
    execute $p$create policy "라운지: 같은 층 입주민만 받기" on realtime.messages for select to authenticated
      using (public.can_join_lounge(realtime.topic()))$p$;
    execute $p$create policy "라운지: 같은 층 입주민만 보내기" on realtime.messages for insert to authenticated
      with check (public.can_join_lounge(realtime.topic()))$p$;
  end if;
end;
$$;

-- ---------- 실행 권한 ----------

revoke all on function public.my_status() from public, anon;
revoke all on function public.block_user(uuid) from public, anon;
revoke all on function public.unblock_user(uuid) from public, anon;
revoke all on function public.my_blocks() from public, anon;
revoke all on function public.admin_reports() from public, anon;
revoke all on function public.admin_resolve(text, text, text) from public, anon;
revoke all on function public.delete_my_account() from public, anon;
revoke all on function public.restricted_until(uuid) from public, anon;
revoke all on function public.assert_not_restricted() from public, anon;
grant execute on function public.my_status() to authenticated;
grant execute on function public.block_user(uuid) to authenticated;
grant execute on function public.unblock_user(uuid) to authenticated;
grant execute on function public.my_blocks() to authenticated;
grant execute on function public.admin_reports() to authenticated;
grant execute on function public.admin_resolve(text, text, text) to authenticated;
grant execute on function public.delete_my_account() to authenticated;
grant execute on function public.can_join_lounge(text) to authenticated;
