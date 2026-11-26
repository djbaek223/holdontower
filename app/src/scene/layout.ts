import { Vector3 } from 'three'
import type { BuildingConfig } from '../config/buildings'

/** 빌딩 치수 (월드 단위 ≈ 1m). 마을 배치는 townPlan.ts */
export const BUILDING_SIZE = { w: 10, d: 10 }
export const LOBBY_H = 5
export const FLOOR_H = 0.55
export const ROOF_H = 2

/** 표시용 층 모듈 개수 (통합 저층은 로비 하나로 합침) */
export function stackedFloorCount(b: BuildingConfig) {
  return b.maxFloor - b.mergedFloorMax
}

export function buildingHeight(b: BuildingConfig) {
  return LOBBY_H + stackedFloorCount(b) * FLOOR_H
}

/** 빌딩 정문 앞 인도 위 지점 */
export function entrancePoint(b: BuildingConfig) {
  const [x, z] = b.position
  return new Vector3(x, 0, z + BUILDING_SIZE.d / 2 + 1.5)
}

export const ENTER_RADIUS = 2.8

