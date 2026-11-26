# 주식 빌딩 시티 — 2단계 입장 플로우

PRD 11장 로드맵의 **1단계(3D 프로토타입)**: 마을 거리와 건물 2동, 박스 캐릭터와 이동, 층 모듈 쌓기.
게이트: 모바일 브라우저에서 부드럽게 동작 (화면 오른쪽 위 FPS 표시로 확인, 30 미만이면 빨간색).

## 실행

```bash
npm install
npm run dev      # http://localhost:5173 , 같은 Wi-Fi의 휴대폰에서는 표시되는 Network 주소로 접속
npm test         # 층 계산 규칙 단위 테스트
npm run models   # public/models/ 의 기본 3D 모델(GLB)을 코드로 다시 생성
npm run build
```

## 구현 범위

| PRD | 내용 |
| --- | --- |
| F1 3D 마을 씬 | 공중에 떠 있는 로우폴리 섬 마을(아이소메트릭 시점): 돌 포장 광장·분수, 시청, 풍차, 집, 카페, 시장 노점, 텃밭, 걸어 다니는 주민, 삼성전자·SK하이닉스 타워, 앞으로 건물을 지을 빈 부지 6곳. 카메라 회전·줌(확대할수록 캐릭터를 따라감) |
| F2 캐릭터 | GLB 캐릭터(팔·다리 노드 회전으로 걷기), 클릭·터치 이동 + WASD/화살표, 걷기 애니메이션, 닉네임 표시 |
| 층 모듈 | 통합 저층은 로비 한 덩어리, 그 위는 층마다 창문 띠·슬래브를 인스턴싱으로 반복, 옥상(펜트하우스) 별도 |
| 층 규칙 (3장) | `src/lib/floor.ts` — 평단 ÷ 1만 원 내림, 1층 미만 → 1층, 통합 저층 → 1층, 최고층 초과 → 옥상 |
| 입장 | 입구에 다가가면 입장 버튼(또는 E 키) → 1층 로비(안내 데스크·대기 공간·엘리베이터 2대)를 걸어 엘리베이터 앞으로 → 엘리베이터 화면에서 평단가 입력 → 층 계산 |

그래픽·성능: 부드러운 그림자(모바일은 해상도 낮춤), 정점 색 Lambert 재질 + 바닥 쪽 음영(가짜 AO), 소품은 종류별로 합쳐 인스턴싱, 외부 다운로드 없이 코드로 만든 도형과 GLB만 사용, 픽셀비 상한 1.75. PRD 8장의 "그림자 끄기"와 달라졌으므로 모바일 FPS 확인이 필요하다.

## 3D 모델 (GLB)

캐릭터는 `public/models/character.glb` 를 불러와 그린다. 마을 소품과 지형은 로우폴리 도형 목록(`src/scene/props.ts`, `Island.tsx`)으로 코드에서 만든다. 로딩 중이거나 파일이 없으면 박스 모델로 대신 보인다.

## 마을 확장

배치는 `src/scene/townPlan.ts` 한 곳에서 관리한다. `PLOTS`는 길과 이어진 빈 부지(잔디 + 경계석 + 측량 깃발)이고, 새 건물은 부지 하나를 골라 그 자리에 놓고 `OBSTACLES`에 충돌 영역을 더하면 된다. 길은 `PATHS`에 사각형을 더하면 돌 포장이 깔린다.
기본 모델은 `tools/build-models.mjs` 가 코드로 만든다. Blender·AI 도구로 만든 모델로 바꾸는 규칙은 [public/models/README.md](public/models/README.md),
확인은 `http://localhost:5173/?viewer`.

## 2단계: 입장 플로우 (로그인 → 닉네임 → 평단가 → 층 도착)

| PRD | 구현 |
| --- | --- |
| F3 로그인·닉네임 | 구글 로그인(Supabase Auth), 닉네임 중복 방지(서버, 대소문자 무시). **지금은 로그인을 꺼 두고 별명만 받는다** (아래 '로그인 켜고 끄기') |
| F4 평단가 → 층 | 엘리베이터에서 입력(“17만”도 가능), 서버 함수가 층을 다시 계산해 저장. 평단가는 본인에게도 다시 보여 주지 않고 층수만 다룬다 |
| F5 엘리베이터 | 층 표시등, 문 닫힘·열림과 층 숫자가 바뀌는 이동 연출, 층 버튼 패널, 도착 화면(라운지는 3단계) |
| F11 층 이동 | 층 버튼으로 하루 1회(한국 시간 자정 기준), 평단가 층에서 버튼 ±5칸까지. 최초 입주는 횟수에 넣지 않음. 이미 이동한 날 평단가를 바꿔 층을 옮기는 것도 막음 |
| 지표 | 처음 들어와서 층에 도착하기까지 걸린 시간을 `metrics` 테이블에 기록 (게이트: 1분 이내) |

서버 규칙은 [supabase/migrations/0001_stage2_entry.sql](supabase/migrations/0001_stage2_entry.sql) 에 있고, `npm test` 가 메모리 Postgres(PGlite)에 실제로 적용해 검증한다.

### Supabase 설정 (한 번)

1. **SQL 실행**: 대시보드 > SQL Editor 에 `supabase/migrations/0001_stage2_entry.sql` 내용을 붙여 넣고 Run
2. **구글 로그인 켜기**: Authentication > Sign In / Providers > Google 을 켜고, Google Cloud Console 에서 만든 OAuth 클라이언트 ID·시크릿을 넣는다. Google 쪽 “승인된 리디렉션 URI” 에는 Supabase 화면에 표시되는 콜백 주소(`https://<프로젝트>.supabase.co/auth/v1/callback`)를 넣는다
3. **돌아올 주소 허용**: Authentication > URL Configuration 의 Site URL 과 Redirect URLs 에 `http://localhost:5173` (배포하면 배포 주소도)를 넣는다
4. `.env.local` 에 URL과 공개(publishable) 키 — `.env.example` 참고

### 로그인 켜고 끄기

- 지금은 **꺼짐**: 첫 화면에서 별명만 넣고 들어온다. 같은 브라우저로 다시 오면 그대로 들어오고, 로그아웃 버튼은 숨긴다.
- 게스트는 Supabase **익명 로그인**으로 서버에 저장된다. 프로젝트에서 익명 로그인이 꺼져 있으면(현재 상태) 자동으로 이 브라우저에만 저장한다. 서버에 저장하려면 Authentication > Sign In / Providers 에서 **Allow anonymous sign-ins** 를 켠다.
- 다시 켜기: `.env.local` 에 `VITE_LOGIN=google` 을 넣고 개발 서버를 다시 시작한다. 구글 로그인 → 닉네임 흐름이 그대로 돌아온다.

`.env.local` 이 없거나 주소에 `?local` 을 붙이면 같은 규칙의 **로컬 임시 저장소**로 동작한다 (구글 대신 테스트 계정, 데이터는 브라우저에만).

## 3단계: 층 라운지와 소식

엘리베이터에서 내리면 그 층 라운지로 들어간다 (가운데를 넓게 비운 아이소메트릭 라운지, 30명 이상 수용).

| 기능 | 구현 |
| :-- | :-- |
| F6 실시간 동기화 | 방 `lounge:빌딩:층:방번호` 에 들어가 위치(초당 5회까지)·이모트를 주고받는다. 한 방이 30명이면 다음 방으로 |
| F7 말풍선과 채팅 | 80자, 말풍선 6초 뒤 사라짐. 금칙어 가림, 개인정보·정확한 평단가·투자 권유 차단, 도배 방지(1.2초 간격·같은 말 반복·10초 5회) |
| F16 층 소식 게시판 | 왼쪽 벽 게시판을 누르거나 "층 소식" 버튼. 300자 + 출처 링크(배지 표시), 최신순, 같은 층 입주민만. 새 글은 게시판에 "새 글 N" 표시 |
| F17 반응과 댓글 | 이모지 반응 5종(다시 누르면 취소), 100자 댓글, 소식·댓글 신고(사유 선택). 서로 다른 3명이 신고하면 임시로 숨김 |

- 서버 규칙: `supabase/migrations/0002_stage3_lounge.sql` (0001 다음에 SQL Editor 에서 실행). 글 검사·도배 제한·같은 층 확인을 서버 함수가 다시 한다. 테스트: `supabase/tests/lounge.test.ts`
- 실시간: **Colyseus 서버**(`../server`)를 쓴다. 빌딩·층별 방, 30명이 차면 새 방. 서버가 입장 자격(입주 층·이용 제한)과 채팅 규칙을 다시 확인한다. 채팅은 저장하지 않는다. 실행: `npm --prefix ../server run dev`
- 로컬 테스트(`?local`): 서버 없이 같은 브라우저의 탭끼리 `BroadcastChannel` 로 맞춘다. 탭마다 다른 사람으로 들어가려면 `?local&as=a`, `?local&as=b`
- 여러 기기에서 만나려면 서버 저장이 필요하다: 구글 로그인(`VITE_LOGIN=google`)을 켜거나 Supabase 익명 로그인을 켠다. 지금처럼 브라우저 저장만 쓰면 라운지·소식은 같은 브라우저 안에서만 공유된다
- 4단계에서 더한 것: 차단(F8), 위기 표현 감지와 안내(F9), 운영자 검토 화면(`?admin`), 이용 제한, 탈퇴 — `supabase/migrations/0003_stage4_safety.sql`

## 구조

```
src/
  config/buildings.ts   빌딩 설정 (층 단위, 통합 저층 상한, 최고층, 외관)
  lib/floor.ts          층 계산·평단가 입력 파싱 (+ floor.test.ts)
  scene/                World(Canvas·카메라·조명) · Town · Island(섬 지형·길·빈 부지) · townPlan(배치도·충돌) · props(소품·건물) · lowpoly(도형 병합) · Npcs · Clouds
                        Building · Player · layout · models(GLB 로딩) · ModelViewer
  ui/                   로그인 · 닉네임 · HUD · 로비(Lobby) · 엘리베이터(Elevator) · 도착한 층(FloorScreen)
  lib/api.ts            서버 기능 모음 (Supabase / 로컬 임시 저장소)
  store.ts              Zustand 상태 + 프레임 단위 가변 player 객체
tools/build-models.mjs  기본 GLB 모델 생성 스크립트
supabase/               DB 스키마·서버 함수(migrations)와 그 테스트(tests)
public/models/          GLB 모델 파일 + 교체 규칙
```
