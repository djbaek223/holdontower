# 라운지 실시간 서버 (Colyseus)

층 라운지(PRD F6·F7)의 위치·이모트·말풍선 채팅을 맡는다.

- 방: `lounge` 하나를 빌딩·층으로 나눠 쓴다 (`filterBy(['building','floor'])`). 한 방은 **30명**, 가득 차면 같은 층의 새 방이 생긴다. 소식 게시판은 층 단위라 방이 달라도 같다.
- 입장 확인: 앱이 보낸 Supabase 로그인 토큰을 Supabase 에 확인하고, `my_residency` 로 **그 빌딩·그 층 입주민**인지, `my_status`(0003) 로 이용 제한 중인지 본다.
- 위치: 클라이언트가 `move` 를 초당 5번까지 보내면 서버 상태를 고치고 0.1초마다 바뀐 것만 보낸다. 좌표는 바닥 범위로 자른다.
- 채팅: 앱과 같은 규칙(`app/src/lib/moderation.ts`)으로 서버가 다시 검사한다. 개인정보·정확한 평단가·투자 권유는 막고(`notice`), 욕설은 가리고, 도배는 막는다. **위기 표현은 아무에게도 보내지 않고 보낸 사람에게만 `crisis`** 를 돌려준다 (PRD F9).

## 실행

```bash
npm install
npm run dev          # app/.env.local 의 Supabase 주소·키를 읽어 2567 포트로 실행
npm run dev:local    # 앱의 ?local 테스트처럼 토큰 없이도 입장 허용 (개발용)
npm test             # 서버를 띄워 클라이언트 여러 개로 통합 테스트 (31명 → 방 2개 포함)
```

앱은 기본으로 `페이지 주소의 2567 포트`에 붙는다. 같은 와이파이의 휴대폰도 `http://<맥 IP>:5173` 으로 들어오면 그대로 연결된다.

## 배포 (Render)

Vercel 은 오래 열린 WebSocket 서버를 돌릴 수 없어서 Render 에 따로 올린다. 저장소 루트의 `render.yaml` 블루프린트를 쓴다.

1. Render → New → Blueprint → 이 저장소 선택. `holdontower-realtime` 웹 서비스(무료, 싱가포르)가 만들어진다.
2. 환경 변수 `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` 를 넣는다. `PORT` 는 Render 가 넣고, `LOCAL_AUTH` 는 넣지 않는다.
3. 배포가 끝나면 `https://<서비스>.onrender.com/__healthcheck` 가 `OK` 를 돌려준다.
4. Vercel 의 `VITE_REALTIME_URL` 에 `wss://<서비스>.onrender.com` 을 넣고 앱을 다시 배포한다.

무료 플랜은 15분 동안 접속이 없으면 잠들어, 다음 첫 입장이 30초쯤 걸릴 수 있다.
