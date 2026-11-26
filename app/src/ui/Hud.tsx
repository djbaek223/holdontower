import { useEffect } from 'react'
import { getBuilding } from '../config/buildings'
import { player, useApp } from '../store'
import { api, LOGIN_ENABLED } from '../lib/api'

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

  return (
    <>
      <header className="topbar">
        <strong>주식 빌딩 시티</strong>
        <span className="who">{nickname}</span>
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
          <span className="coarse">땅을 눌러 이동 · 드래그 회전 · 핀치 줌</span>
        </p>
      )}

      {near && !inside && (
        <button className="enter primary" onClick={() => enter(near)}>
          {getBuilding(near).name} 빌딩 입장 <kbd>E</kbd>
        </button>
      )}
    </>
  )
}
