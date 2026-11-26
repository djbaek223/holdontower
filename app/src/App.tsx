import { useEffect } from 'react'
import { api, LOGIN_ENABLED, type Session } from './lib/api'
import { useApp } from './store'
import { World } from './scene/World'
import { Hud } from './ui/Hud'
import { LoginScreen } from './ui/LoginScreen'
import { NicknameGate } from './ui/NicknameGate'
import { GuestEntry } from './ui/GuestEntry'
import { Elevator } from './ui/Elevator'
import { Lobby } from './ui/Lobby'
import { FloorScreen } from './ui/FloorScreen'
import { ModelViewer } from './scene/ModelViewer'
import { CrisisCard } from './ui/CrisisCard'
import { AdminPage } from './ui/AdminPage'

const VIEWER = new URLSearchParams(location.search).has('viewer')
const ADMIN = new URLSearchParams(location.search).has('admin')

/** 로그인 상태와 닉네임을 확인해 store에 넣는다 */
function useAuthBootstrap() {
  const setAuth = useApp((s) => s.setAuth)
  useEffect(() => {
    let alive = true
    const apply = async (session: Session | null) => {
      const nickname = session ? await api.getNickname().catch(() => null) : null
      if (alive) setAuth({ session, nickname })
    }
    api.getSession().then(apply)
    const off = api.onAuthChange(apply)
    return () => {
      alive = false
      off()
    }
  }, [setAuth])
}

function Main() {
  useAuthBootstrap()
  const authReady = useApp((s) => s.authReady)
  const session = useApp((s) => s.session)
  const nickname = useApp((s) => s.nickname)
  const setStatus = useApp((s) => s.setStatus)
  const userId = session?.userId
  // 이용 제한, 운영자 여부, 차단 목록
  useEffect(() => {
    if (userId && nickname) api.myStatus().then(setStatus).catch(() => {})
  }, [userId, nickname, setStatus])

  if (!authReady) return <div className="overlay" aria-busy="true" />
  // 로그인을 끈 동안은 별명만 넣고 들어온다 (다시 켜려면 VITE_LOGIN=google)
  if (!LOGIN_ENABLED && (!session || !nickname)) return <GuestEntry />
  if (!session) return <LoginScreen />
  if (!nickname) return <NicknameGate />
  if (ADMIN) return <AdminPage />
  return (
    <>
      <CrisisCard />
      <World nickname={nickname} />
      <Hud nickname={nickname} />
      <Lobby />
      <Elevator />
      <FloorScreen />
    </>
  )
}

export default function App() {
  return VIEWER ? <ModelViewer /> : <Main />
}
