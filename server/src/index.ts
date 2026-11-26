import { defineRoom, defineServer } from 'colyseus'
import { LOCAL_AUTH } from './auth.ts'
import { LoungeRoom } from './LoungeRoom.ts'

/**
 * 주식 빌딩 시티 실시간 서버 (Colyseus). 기본 포트 2567.
 *  SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY : 입장 토큰·입주 층 확인용 (앱 .env.local 의 VITE_ 값을 그대로 읽기도 한다)
 *  LOCAL_AUTH=1 : 토큰 없이 들어오는 로컬 테스트 허용 (개발용, 배포에서는 끈다)
 */
const port = Number(process.env.PORT ?? 2567)

export const server = defineServer({
  rooms: {
    lounge: defineRoom(LoungeRoom).filterBy(['building', 'floor']),
  },
})

server.listen(port).then(() => {
  console.log(`[realtime] Colyseus 라운지 서버 :${port}${LOCAL_AUTH ? ' (로컬 테스트 입장 허용)' : ''}`)
})
