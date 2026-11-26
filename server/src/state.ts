import { schema, t } from '@colyseus/schema'

/** 라운지에 있는 한 사람 (위치는 서버가 바닥 범위 안으로 맞춘다) */
export const Player = schema(
  {
    id: t.string(), // 계정 번호 (차단·신고 대상)
    nickname: t.string(),
    x: t.number(),
    z: t.number(),
    yaw: t.number(),
  },
  'Player',
)
export type Player = InstanceType<typeof Player>

export const LoungeState = schema(
  {
    players: t.map(Player),
    /** 같은 층 안에서 몇 번째 방인지 (1부터) */
    roomNo: t.number(),
  },
  'LoungeState',
)
export type LoungeState = InstanceType<typeof LoungeState>
