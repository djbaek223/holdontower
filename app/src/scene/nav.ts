import { Vector3 } from 'three'

/** 바닥 위 막힌 사각형 (x0, x1, z0, z1) */
export type Rect = [number, number, number, number]
export type Bounds = { x0: number; x1: number; z0: number; z1: number }

/**
 * 방 안 걷기: 가구(사각형)를 피해 밀어내기와 격자 A* 길찾기.
 * 로비와 라운지가 같이 쓴다.
 */
export function makeNav(blocks: Rect[], bounds: Bounds, radius = 0.42, cell = 0.5) {
  const blocked = (x: number, z: number) =>
    blocks.some(([x0, x1, z0, z1]) => x > x0 - radius && x < x1 + radius && z > z0 - radius && z < z1 + radius)

  /** 가구 안이나 방 밖으로 나가지 않게 밀어낸다 */
  function resolve(p: Vector3) {
    for (const [x0, x1, z0, z1] of blocks) {
      const ax0 = x0 - radius
      const ax1 = x1 + radius
      const az0 = z0 - radius
      const az1 = z1 + radius
      if (p.x <= ax0 || p.x >= ax1 || p.z <= az0 || p.z >= az1) continue
      const dx = Math.min(p.x - ax0, ax1 - p.x)
      const dz = Math.min(p.z - az0, az1 - p.z)
      if (dx < dz) p.x = p.x - ax0 < ax1 - p.x ? ax0 : ax1
      else p.z = p.z - az0 < az1 - p.z ? az0 : az1
    }
    p.x = Math.min(bounds.x1, Math.max(bounds.x0, p.x))
    p.z = Math.min(bounds.z1, Math.max(bounds.z0, p.z))
  }

  const GX = Math.ceil((bounds.x1 - bounds.x0) / cell) + 1
  const GZ = Math.ceil((bounds.z1 - bounds.z0) / cell) + 1
  const cellX = (i: number) => bounds.x0 + i * cell
  const cellZ = (j: number) => bounds.z0 + j * cell
  let free: Uint8Array | null = null
  const grid = () => {
    if (free) return free
    free = new Uint8Array(GX * GZ)
    for (let i = 0; i < GX; i++) for (let j = 0; j < GZ; j++) free[i + j * GX] = blocked(cellX(i), cellZ(j)) ? 0 : 1
    return free
  }
  const clearLine = (a: Vector3, b: Vector3) => {
    const n = Math.ceil(a.distanceTo(b) / 0.2)
    for (let k = 1; k < n; k++) {
      const t = k / n
      if (blocked(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) return false
    }
    return true
  }
  const nearestFree = (x: number, z: number): [number, number] => {
    const g = grid()
    let best: [number, number] = [0, 0]
    let bd = Infinity
    for (let i = 0; i < GX; i++)
      for (let j = 0; j < GZ; j++) {
        if (!g[i + j * GX]) continue
        const d = (cellX(i) - x) ** 2 + (cellZ(j) - z) ** 2
        if (d < bd) {
          bd = d
          best = [i, j]
        }
      }
    return best
  }

  /** 시작점에서 목표까지 장애물을 피해 가는 지점 목록 (직선으로 갈 수 있는 곳은 건너뛴다) */
  function findPath(from: Vector3, to: Vector3): Vector3[] {
    if (clearLine(from, to)) return [to]
    const g = grid()
    const [si, sj] = nearestFree(from.x, from.z)
    const [ti, tj] = nearestFree(to.x, to.z)
    const start = si + sj * GX
    const goal = ti + tj * GX
    const cost = new Float32Array(GX * GZ).fill(Infinity)
    const prev = new Int32Array(GX * GZ).fill(-1)
    const open: number[] = [start]
    cost[start] = 0
    const h = (c: number) => Math.hypot((c % GX) - ti, Math.floor(c / GX) - tj)
    while (open.length) {
      let bi = 0
      for (let k = 1; k < open.length; k++) if (cost[open[k]] + h(open[k]) < cost[open[bi]] + h(open[bi])) bi = k
      const c = open.splice(bi, 1)[0]
      if (c === goal) break
      const ci = c % GX
      const cj = Math.floor(c / GX)
      for (let di = -1; di <= 1; di++)
        for (let dj = -1; dj <= 1; dj++) {
          if (!di && !dj) continue
          const ni = ci + di
          const nj = cj + dj
          if (ni < 0 || nj < 0 || ni >= GX || nj >= GZ) continue
          const nIdx = ni + nj * GX
          if (!g[nIdx] || (di && dj && (!g[ci + nj * GX] || !g[ni + cj * GX]))) continue
          const nc = cost[c] + (di && dj ? Math.SQRT2 : 1)
          if (nc < cost[nIdx]) {
            if (cost[nIdx] === Infinity) open.push(nIdx)
            cost[nIdx] = nc
            prev[nIdx] = c
          }
        }
    }
    if (prev[goal] < 0 && goal !== start) return [to]
    const cells: Vector3[] = []
    for (let c = goal; c >= 0; c = prev[c]) cells.unshift(new Vector3(cellX(c % GX), 0, cellZ(Math.floor(c / GX))))
    cells.push(to)
    // 줄 당기기: 보이는 가장 먼 지점으로 바로 간다
    const out: Vector3[] = []
    let cur = from
    let k = 0
    while (k < cells.length) {
      let far = k
      for (let m = cells.length - 1; m > k; m--)
        if (clearLine(cur, cells[m])) {
          far = m
          break
        }
      out.push(cells[far])
      cur = cells[far]
      k = far + 1
    }
    return out
  }

  return { blocked, resolve, findPath }
}
