import type { BuildingConfig } from '../config/buildings'

/** PRD 3장 층 규칙 계산 결과 */
export type FloorResult =
  | { kind: 'floor'; floor: number; merged: boolean }
  | { kind: 'penthouse' }

export type FloorRules = Pick<BuildingConfig, 'floorUnit' | 'mergedFloorMax' | 'maxFloor'>

/**
 * 평단가 → 표시 층
 * 1) 층 = 평단가 ÷ 층 단위, 소수점 내림
 * 2) 1층 단위 미만이면 1층
 * 3) 통합 저층(1 ~ mergedFloorMax)은 표시 층 1층
 * 4) 최고층을 넘으면 옥상(펜트하우스)
 */
export function calcFloor(avgPrice: number, rules: FloorRules): FloorResult {
  if (!Number.isFinite(avgPrice) || avgPrice <= 0) {
    throw new RangeError('평단가는 0보다 큰 숫자여야 합니다')
  }
  const raw = Math.max(1, Math.floor(avgPrice / rules.floorUnit))
  if (raw > rules.maxFloor) return { kind: 'penthouse' }
  if (raw <= rules.mergedFloorMax) return { kind: 'floor', floor: 1, merged: rules.mergedFloorMax > 1 }
  return { kind: 'floor', floor: raw, merged: false }
}

/** "170,000" / "17만" / "17만 5천" 같은 입력을 원 단위 숫자로. 실패 시 null */
export function parsePrice(input: string): number | null {
  const s = input.replace(/[\s,원]/g, '')
  if (!s) return null
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s)
  const m = s.match(/^(?:(\d+(?:\.\d+)?)만)?(?:(\d+)천)?(\d+)?$/)
  if (!m || (!m[1] && !m[2] && !m[3])) return null
  const man = m[1] ? Number(m[1]) * 10_000 : 0
  const cheon = m[2] ? Number(m[2]) * 1_000 : 0
  const rest = m[3] ? Number(m[3]) : 0
  return man + cheon + rest
}

export function floorLabel(r: FloorResult): string {
  return r.kind === 'penthouse' ? '옥상(펜트하우스)' : `${r.floor}층`
}

// ---------- 2단계: 층 번호·엘리베이터 규칙 (supabase/migrations 의 SQL 함수와 같은 계산) ----------

/** 서버와 같은 층 번호: 통합 저층 = 1, 옥상 = maxFloor + 1 */
export function floorNumber(r: FloorResult, rules: FloorRules): number {
  return r.kind === 'penthouse' ? rules.maxFloor + 1 : r.floor
}

export const isPenthouse = (floor: number, rules: FloorRules) => floor > rules.maxFloor

/** 층 번호 → 표시 문자열 */
export function floorText(floor: number, rules: FloorRules, opts: { short?: boolean } = {}): string {
  if (isPenthouse(floor, rules)) return opts.short ? 'PH' : '옥상'
  if (floor === 1 && rules.mergedFloorMax > 1 && !opts.short) return `1층 (1~${rules.mergedFloorMax}층 통합)`
  return opts.short ? `${floor}` : `${floor}층`
}

/** 엘리베이터 버튼 목록: 1(통합 저층), merged+1 … max, 옥상 */
export function floorButtons(rules: FloorRules): number[] {
  const list = [1]
  for (let f = rules.mergedFloorMax + 1; f <= rules.maxFloor; f++) list.push(f)
  list.push(rules.maxFloor + 1)
  return list
}

/** 엘리베이터로 갈 수 있는 범위: 평단가 기준 층에서 버튼 ±range칸 (PRD 오픈 이슈, 제안값 5) */
export const MOVE_RANGE = 5
export function reachableFloors(baseFloor: number, rules: FloorRules, range = MOVE_RANGE): number[] {
  const buttons = floorButtons(rules)
  const i = buttons.indexOf(baseFloor)
  if (i < 0) return []
  return buttons.slice(Math.max(0, i - range), i + range + 1)
}

/** 한국 날짜 (YYYY-MM-DD) */
function kstDate(d: Date) {
  return new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10)
}

/** 오늘(한국 시간) 남은 엘리베이터 이동 횟수: 하루 1회 */
export function movesLeft(lastMovedAt: Date | null, now = new Date()): number {
  if (!lastMovedAt) return 1
  return kstDate(lastMovedAt) < kstDate(now) ? 1 : 0
}
