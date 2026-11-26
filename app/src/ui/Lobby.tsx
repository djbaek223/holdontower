import { useEffect, useState } from 'react'
import { getBuilding, type BuildingConfig } from '../config/buildings'
import { useApp } from '../store'
import { LobbyScene, spawnLobby, walkToElevator, type LobbyAction, type LobbyNear } from '../scene/LobbyScene'
import { leaveBuilding } from './Elevator'

/** 빌딩에 들어오면 먼저 1층 로비. 엘리베이터 앞까지 걸어가서 탄다 */
export function Lobby() {
  const id = useApp((s) => s.insideBuilding)
  const inElevator = useApp((s) => s.inElevator)
  if (!id || inElevator) return null
  return <LobbyRoom key={id} b={getBuilding(id)} />
}

function LobbyRoom({ b }: { b: BuildingConfig }) {
  const nickname = useApp((s) => s.nickname) ?? ''
  const board = useApp((s) => s.boardElevator)
  // 첫 렌더 전에 시작 위치를 잡는다
  useState(() => spawnLobby(useApp.getState().lobbyFrom))
  const [near, setNear] = useState<LobbyNear>(null)

  const act = (a: LobbyAction) => (a === 'board' ? board() : leaveBuilding(b))

  // E / Enter: 엘리베이터 타기 또는 건물 나가기
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.repeat) return
      if (e.code !== 'KeyE' && e.code !== 'Enter') return
      if (e.code === 'Enter' && e.target instanceof HTMLButtonElement) return // 버튼 자체 클릭에 맡긴다
      if (near === 'elevator') {
        e.preventDefault()
        board()
      } else if (near === 'exit') {
        e.preventDefault()
        leaveBuilding(b)
      }
    }
    window.addEventListener('keydown', down)
    return () => window.removeEventListener('keydown', down)
  }, [near, board, b])

  return (
    <div className="lobby-screen" role="dialog" aria-label={`${b.name} 1층 로비`}>
      <LobbyScene nickname={nickname} onNear={setNear} onAction={act} />
      <header className="elevator-head">
        <span className="chip">{b.name} · 1층 로비</span>
        <button className="chip button" onClick={() => leaveBuilding(b)}>
          건물 나가기
        </button>
      </header>
      <p className="hint lobby-hint">
        <span className="fine">바닥을 클릭해 이동 · 휠 줌 · WASD/화살표 · 엘리베이터 앞에서 E</span>
        <span className="coarse">바닥을 눌러 이동 · 핀치 줌 · 엘리베이터 앞에서 타기</span>
      </p>
      <div className="lobby-actions">
        {near === 'elevator' ? (
          <button className="primary" onClick={board}>
            엘리베이터 타기 <kbd>E</kbd>
          </button>
        ) : near === 'exit' ? (
          <button className="primary" onClick={() => leaveBuilding(b)}>
            건물 나가기 <kbd>E</kbd>
          </button>
        ) : (
          <button className="primary soft" onClick={walkToElevator}>
            엘리베이터로 걸어가기
          </button>
        )}
      </div>
    </div>
  )
}
