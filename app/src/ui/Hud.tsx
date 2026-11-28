import { useEffect, useState } from 'react'
import { getBuilding } from '../config/buildings'
import { cameraRig, player, useApp } from '../store'
import { api, LOGIN_ENABLED } from '../lib/api'
import { MyInfo } from './MyInfo'

const KEYMAP: Record<string, [number, number]> = {
  ArrowUp: [0, -1],
  KeyW: [0, -1],
  ArrowDown: [0, 1],
  KeyS: [0, 1],
  ArrowLeft: [-1, 0],
  KeyA: [-1, 0],
  ArrowRight: [1, 0],
  KeyD: [1, 0],
}

/** 키보드 이동 (접근성: 키보드·터치 모두 지원) */
function useKeyboard() {
  useEffect(() => {
    const pressed = new Set<string>()
    const sync = () => {
      let x = 0
      let z = 0
      pressed.forEach((code) => {
        const k = KEYMAP[code]
        if (k) {
          x += k[0]
          z += k[1]
        }
      })
      player.keys.x = Math.sign(x)
      player.keys.z = Math.sign(z)
    }
    const isTyping = (e: KeyboardEvent) =>
      e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
    const down = (e: KeyboardEvent) => {
      if (isTyping(e)) return
      const st = useApp.getState()
      if ((e.code === 'KeyE' || e.code === 'Enter') && st.nearBuilding && !st.insideBuilding) {
        // 막 열린 평단가 입력창에 키가 들어가지 않도록
        e.preventDefault()
        pressed.clear()
        sync()
        st.enter(st.nearBuilding)
        return
      }
      if (KEYMAP[e.code]) {
        e.preventDefault()
        pressed.add(e.code)
        sync()
      }
    }
    const up = (e: KeyboardEvent) => {
      pressed.delete(e.code)
      sync()
    }
    const blur = () => {
      pressed.clear()
      sync()
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
    }
  }, [])
}

export function Hud({ nickname }: { nickname: string }) {
  useKeyboard()
  const near = useApp((s) => s.nearBuilding)
  const inside = useApp((s) => s.insideBuilding)
  const enter = useApp((s) => s.enter)
  const fps = useApp((s) => s.fps)
  const isAdmin = useApp((s) => s.status.is_admin)
  const [info, setInfo] = useState(false)
  const selected = useApp((s) => s.selected)
  const select = useApp((s) => s.select)
  const cameraFree = useApp((s) => s.cameraFree)

  return (
    <>
      <header className="topbar">
        <strong>주식 빌딩 시티</strong>
        <button className="who" onClick={() => setInfo(true)} aria-label={`내 정보: ${nickname}`}>
          {nickname}
        </button>
        {isAdmin && (
          <a className="logout" href="?admin">
            신고 검토
          </a>
        )}
        {LOGIN_ENABLED && (
          <button className="logout" onClick={() => api.signOut()}>
            로그아웃
          </button>
        )}
        <span className={`fps ${fps && fps < 30 ? 'low' : ''}`} title="초당 프레임">
          {fps} FPS
        </span>
      </header>

      {!inside && (
        <p className="hint">
          <span className="fine">땅을 클릭해 이동 · 드래그 회전 · 휠 줌 · WASD/화살표</span>
          <span className="coarse">탭해서 이동 · 드래그로 화면 이동 · 두 손가락 드래그로 회전 · 핀치로 확대/축소</span>
        </p>
      )}

      {!inside && (
        <button
          className={`focus-me ${cameraFree ? 'away' : ''}`}
          onClick={() => {
            cameraRig.focusRequested = true
          }}
          aria-label="카메라를 내 캐릭터로"
          title="내 캐릭터 보기"
        >
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <circle cx="12" cy="12" r="6.5" fill="none" stroke="currentColor" strokeWidth="2" />
            <circle cx="12" cy="12" r="2.4" fill="currentColor" />
            <path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      )}

      {selected && !inside && (
        <div className="selection" role="status">
          <strong>{selected.kind === 'building' ? `${getBuilding(selected.id).name} 빌딩` : selected.name}</strong>
          <span>{selected.kind === 'building' ? (near === selected.id ? '입구 앞' : '입구로 가는 중') : '마을 주민'}</span>
          <button onClick={() => select(null)} aria-label="선택 해제">
            ✕
          </button>
        </div>
      )}

      {info && <MyInfo onClose={() => setInfo(false)} />}

      {near && !inside && (
        <button className="enter primary" onClick={() => enter(near)}>
          {getBuilding(near).name} 빌딩 입장 <kbd>E</kbd>
        </button>
      )}
    </>
  )
}
