import { create } from 'zustand'
import { Vector3 } from 'three'
import type { BuildingConfig } from './config/buildings'
import type { MyStatus, Session } from './lib/api'

type BuildingId = BuildingConfig['id']

/**
 * 매 프레임 바뀌는 값은 리렌더를 피하려고 store 밖의 가변 객체로 둔다.
 */
export const player = {
  position: new Vector3(0, 0, 16),
  /** 이동 목표. null이면 정지 */
  target: null as Vector3 | null,
  /** 키보드 입력 방향 (x, z) */
  keys: { x: 0, z: 0 },
  moving: false,
}

/** 아이소메트릭 카메라 기준값 (World가 화면 크기에 맞춰 정한다) */
export const cameraRig = {
  /** 섬 전체가 보이는 배율 */
  baseZoom: 10,
  /** 섬 전체를 볼 때 바라보는 점 */
  center: new Vector3(0, 0, 0),
}

/**
 * 처음 들어온 시각 (PRD 10장 '입주까지 걸린 시간' 측정용).
 * 구글 로그인으로 페이지를 떠났다 돌아와도 이어지도록 sessionStorage에 둔다.
 */
export function entryStartedAt(): number {
  try {
    const saved = Number(sessionStorage.getItem('sbc.entryStart'))
    if (saved > 0) return saved
    const now = Date.now()
    sessionStorage.setItem('sbc.entryStart', String(now))
    return now
  } catch {
    return Date.now()
  }
}
entryStartedAt() // 앱을 연 순간 기록

interface AppState {
  /** 로그인 상태를 처음 확인했는지 */
  authReady: boolean
  session: Session | null
  nickname: string | null
  setAuth: (a: { session: Session | null; nickname: string | null }) => void
  setNickname: (n: string) => void
  /** 입구 근처에 있는 빌딩 (입장 버튼 표시) */
  nearBuilding: BuildingId | null
  setNearBuilding: (id: BuildingId | null) => void
  /** 입장한 빌딩 (엘리베이터 화면) */
  insideBuilding: BuildingId | null
  /** 로비에서 엘리베이터에 탔는지 (false면 1층 로비) */
  inElevator: boolean
  /** 로비에 어디로 들어왔는지 (시작 위치) */
  lobbyFrom: 'entrance' | 'elevator'
  /** 엘리베이터에서 내린 층 (층 화면). null이면 엘리베이터 안 */
  atFloor: number | null
  enter: (id: BuildingId) => void
  boardElevator: () => void
  toLobby: () => void
  arrive: (floor: number) => void
  backToElevator: () => void
  exit: () => void
  fps: number
  setFps: (n: number) => void
  /** 이용 제한, 운영자 여부, 차단한 사람 (로그인 뒤 서버에서 읽는다) */
  status: MyStatus
  setStatus: (s: MyStatus) => void
  /** 위기 표현 감지 → 위로·상담 안내 카드 (본인에게만) */
  crisis: boolean
  setCrisis: (v: boolean) => void
}

export const useApp = create<AppState>((set) => ({
  authReady: false,
  session: null,
  nickname: null,
  setAuth: ({ session, nickname }) =>
    // 같은 사람의 닉네임을 늦게 도착한 '없음'으로 지우지 않는다
    set((s) => ({
      authReady: true,
      session,
      nickname: nickname ?? (session && s.session?.userId === session.userId ? s.nickname : null),
    })),
  setNickname: (n) => set({ nickname: n }),
  nearBuilding: null,
  setNearBuilding: (id) => set((s) => (s.nearBuilding === id ? s : { nearBuilding: id })),
  insideBuilding: null,
  inElevator: false,
  lobbyFrom: 'entrance',
  atFloor: null,
  enter: (id) => {
    player.target = null
    set({ insideBuilding: id, inElevator: false, lobbyFrom: 'entrance', atFloor: null })
  },
  boardElevator: () => set({ inElevator: true, atFloor: null }),
  toLobby: () => set({ inElevator: false, lobbyFrom: 'elevator', atFloor: null }),
  arrive: (floor) => set({ atFloor: floor }),
  backToElevator: () => set({ atFloor: null }),
  exit: () => set({ insideBuilding: null, inElevator: false, atFloor: null }),
  fps: 0,
  setFps: (n) => set({ fps: n }),
  status: { restricted_until: null, is_admin: false, blocked: [] },
  setStatus: (status) => set({ status }),
  crisis: false,
  setCrisis: (crisis) => set({ crisis }),
}))
