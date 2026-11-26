import { useEffect, useMemo, useRef, useState } from 'react'
import { getBuilding, type BuildingConfig } from '../config/buildings'
import { api, type Residency } from '../lib/api'
import { calcFloor, floorButtons, floorNumber, floorText, parsePrice, reachableFloors } from '../lib/floor'
import { ElevatorScene, type KeyState } from '../scene/ElevatorScene'
import { player, useApp } from '../store'
import { entrancePoint } from '../scene/layout'

type Phase = 'loading' | 'price' | 'panel' | 'riding'

/** 건물을 나가 정문 앞 거리로 */
export function leaveBuilding(b: BuildingConfig) {
  player.position.copy(entrancePoint(b))
  player.position.z += 1
  useApp.getState().exit()
}

/** 층 표시등: 숫자가 한 칸씩 바뀌며 올라가거나 내려간다 */
function useRide(b: BuildingConfig) {
  const [display, setDisplay] = useState<number | null>(null)
  const [dir, setDir] = useState<0 | 1 | -1>(0)
  const timer = useRef<number>()
  useEffect(() => () => window.clearInterval(timer.current), [])

  const ride = (from: number, to: number) =>
    new Promise<void>((resolve) => {
      const buttons = floorButtons(b)
      let i = Math.max(0, buttons.indexOf(from))
      const j = Math.max(0, buttons.indexOf(to))
      const step = j >= i ? 1 : -1
      const steps = Math.abs(j - i)
      setDir(steps ? (step as 1 | -1) : 0)
      setDisplay(buttons[i])
      // 멀어도 2.4초 안에 도착하도록 간격을 조절
      const interval = Math.max(45, Math.min(260, 2400 / Math.max(steps, 1)))
      window.clearInterval(timer.current)
      timer.current = window.setInterval(() => {
        if (i === j) {
          window.clearInterval(timer.current)
          setDir(0)
          window.setTimeout(resolve, 350)
          return
        }
        i += step
        setDisplay(buttons[i])
      }, interval)
    })
  return { display, setDisplay, dir, ride }
}

export function Elevator() {
  const id = useApp((s) => s.insideBuilding)
  const atFloor = useApp((s) => s.atFloor)
  const inElevator = useApp((s) => s.inElevator)
  if (!id || !inElevator || atFloor !== null) return null
  return <ElevatorCabin key={id} b={getBuilding(id)} />
}

function ElevatorCabin({ b }: { b: BuildingConfig }) {
  const arrive = useApp((s) => s.arrive)
  const toLobby = useApp((s) => s.toLobby)
  const [phase, setPhase] = useState<Phase>('loading')
  const [res, setRes] = useState<Residency | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const { display, setDisplay, dir, ride } = useRide(b)
  const [doorsOpen, setDoorsOpen] = useState(true)

  useEffect(() => {
    let alive = true
    api
      .getResidency(b.id)
      .then((r) => {
        if (!alive) return
        setRes(r)
        setDisplay(r?.floor ?? 1)
        setPhase(r ? 'panel' : 'price')
      })
      .catch((e) => {
        if (!alive) return
        setError((e as Error).message)
        setPhase('price')
      })
    return () => {
      alive = false
    }
  }, [b.id, setDisplay])

  /** 문 닫힘 → 층 이동 → 문 열림 → 층 화면 */
  const go = async (from: number, to: number) => {
    setPhase('riding')
    setDoorsOpen(false)
    await new Promise((r) => setTimeout(r, 700))
    await ride(from, to)
    setDoorsOpen(true) // 문이 열리고 도착한 층 로비가 보인다
    await new Promise((r) => setTimeout(r, 1100))
    arrive(to)
  }

  const submitPrice = async (price: number) => {
    setBusy(true)
    setError(null)
    try {
      const r = await api.enterWithPrice(b.id, price)
      setRes(r)
      await go(res?.floor ?? 1, r.floor)
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  const moveTo = async (floor: number) => {
    if (!res) return
    setConfirm(null)
    setBusy(true)
    setError(null)
    try {
      const r = await api.moveFloor(b.id, floor)
      setRes(r)
      await go(res.floor, r.floor)
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  const reachable = useMemo(() => (res ? reachableFloors(res.baseFloor, b) : []), [res, b])
  const keys: KeyState[] = useMemo(
    () =>
      res
        ? [...reachable].reverse().map((f) => ({
            floor: f,
            label: floorText(f, b, { short: true }),
            current: f === res.floor,
            base: f === res.baseFloor,
            aria: `${floorText(f, b)}${f === res.floor ? ', 지금 내 층' : ''}${f === res.baseFloor ? ', 평단가 층' : ''}`,
          }))
        : [],
    [res, reachable, b],
  )
  const pick = (f: number) => {
    if (!res) return
    setError(null)
    if (f === res.floor) go(res.floor, f)
    else if (res.movesLeft < 1) setError('오늘은 이미 엘리베이터로 이동했어요. 내일 다시 이동할 수 있어요.')
    else setConfirm(f)
  }

  return (
    <div className="elevator-screen" role="dialog" aria-label={`${b.name} 엘리베이터`}>
      <div className="elevator-3d">
        <ElevatorScene
          arrow={dir > 0 ? '▲' : dir < 0 ? '▼' : ''}
          label={display ? floorText(display, b, { short: true }) : '--'}
          lobbyLabel={display ? floorText(display, b).replace(/ \(.*\)/, '') : '로비'}
          doorsOpen={doorsOpen}
          moving={dir}
          keys={phase === 'price' ? [] : keys}
          keysDisabled={phase !== 'panel' || busy || confirm !== null}
          doorsDisabled={phase === 'riding' || phase === 'loading' || confirm !== null}
          onPress={pick}
          onOpenDoors={() => setDoorsOpen(true)}
          onCloseDoors={() => setDoorsOpen(false)}
        />
        <header className="elevator-head">
          <span className="chip">{b.name} 엘리베이터</span>
          <button className="chip button" onClick={toLobby} disabled={phase === 'riding'}>
            로비로 내리기
          </button>
        </header>
        <p className="sr-only" aria-live="polite">
          {display ? `현재 ${floorText(display, b)}` : ''}
        </p>
      </div>

      <div className="elevator-sheet">
        {phase === 'loading' && <p className="sub center">입주 정보를 확인하는 중…</p>}
        {phase === 'price' && (
          <PriceForm b={b} resident={res} busy={busy} onSubmit={submitPrice} onCancel={res ? () => setPhase('panel') : undefined} />
        )}
        {phase === 'panel' && res && (
          <div className="panel">
            <button className="primary big" onClick={() => go(res.floor, res.floor)} disabled={busy}>
              내 층으로 가기 · {floorText(res.floor, b)}
            </button>
            <p className="moves">
              키패드에서 층을 고르면 이동해요 · 오늘 남은 이동 <strong>{res.movesLeft}회</strong>
            </p>
            <p className="legend">
              <span className="dot current" /> 지금 내 층 <span className="dot base" /> 평단가 층 · 평단가 층 위아래 5칸까지
            </p>
            <button className="link" onClick={() => setPhase('price')}>
              평단가 다시 입력
            </button>
          </div>
        )}
        {phase === 'riding' && <p className="sub center riding">{dir === 0 ? '도착했어요' : '이동 중…'}</p>}
        {error && (
          <p className="error center" role="alert">
            {error}
          </p>
        )}
      </div>

      {confirm !== null && res && (
        <div className="confirm" role="alertdialog" aria-label="층 이동 확인">
          <div className="card warm">
            <h2>{floorText(confirm, b)}으로 이동할까요?</h2>
            <p className="sub">오늘 이동 1회를 써요. 이동한 뒤에는 내일 다시 이동할 수 있어요.</p>
            <button className="primary" onClick={() => moveTo(confirm)}>
              이동하기
            </button>
            <button className="ghost" onClick={() => setConfirm(null)}>
              취소
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/** 평단가 입력 (첫 입주 또는 다시 입력) */
function PriceForm({
  b,
  resident,
  busy,
  onSubmit,
  onCancel,
}: {
  b: BuildingConfig
  resident: Residency | null
  busy: boolean
  onSubmit: (price: number) => void
  onCancel?: () => void
}) {
  const [input, setInput] = useState('')
  const price = parsePrice(input)
  const valid = price !== null && price > 0 && price <= 1e11
  const preview = valid ? floorNumber(calcFloor(price, b), b) : null

  return (
    <form
      className="price-form"
      onSubmit={(e) => {
        e.preventDefault()
        if (valid && !busy) onSubmit(price)
      }}
    >
      <label htmlFor="price">내 {b.name} 평단가 (원)</label>
      <input
        id="price"
        inputMode="numeric"
        autoFocus
        autoComplete="off"
        placeholder="예: 170000 또는 17만"
        value={input}
        onChange={(e) => setInput(e.target.value)}
      />
      <p className="hint-line">
        {input && !valid ? '숫자로 입력해 주세요. 예: 170000 또는 17만' : preview ? `${floorText(preview, b)}으로 입주해요` : `1층 = ${b.floorUnit.toLocaleString()}원`}
      </p>
      {resident && <p className="todo">평단가를 바꿔 층이 달라지면 오늘 이동 1회를 써요.</p>}
      <button type="submit" className="primary" disabled={!valid || busy}>
        {busy ? '확인하는 중…' : resident ? '평단가 바꾸기' : '입주하기'}
      </button>
      {onCancel && (
        <button type="button" className="ghost" onClick={onCancel}>
          층 버튼으로 돌아가기
        </button>
      )}
      <p className="notice">평단가는 자기 신고이며 다른 입주민에게는 층수만 보여요. 이 서비스는 투자 조언이 아닌 커뮤니티입니다.</p>
    </form>
  )
}
