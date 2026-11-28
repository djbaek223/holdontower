import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { OrthographicCamera, Plane, Raycaster, Vector2, Vector3 } from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { cameraRig, player, useApp } from '../store'
import { ISLAND } from './townPlan'
import { lastPointer, townGesture } from './touchGesture'

const GROUND = new Plane(new Vector3(0, 1, 0), 0)
const ray = new Raycaster()
const ndc = new Vector2()
const hitA = new Vector3()
const hitB = new Vector3()
const shift = new Vector3()
const offset = new Vector3()
const UP = new Vector3(0, 1, 0)

/** 캐릭터 보기: 카메라를 캐릭터로 옮기는 시간 */
const FOCUS_MS = 400
/** 캐릭터를 따라가기 시작하는 확대 배율 (Player 의 추적 공식에서 follow = 1 이 되는 값) */
const FOLLOW_ZOOM = 1.8

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

/**
 * 마을 화면 터치 조작. 마우스·휠·키보드는 OrbitControls 가 그대로 맡고, 터치만 여기서 처리한다.
 * 한 손가락 끌기 = 화면 이동, 두 손가락 좌우 끌기 = 회전(세로축), 핀치 = 두 손가락 가운데를 향해 확대·축소.
 * 아이소메트릭 기울기(위아래 각도)는 바꾸지 않는다.
 */
export function CameraGestures() {
  const camera = useThree((s) => s.camera) as OrthographicCamera
  const gl = useThree((s) => s.gl)
  const connected = useThree((s) => s.events.connected) as HTMLElement | undefined
  const controls = useThree((s) => s.controls) as unknown as OrbitControlsImpl | null

  useEffect(() => {
    const el = connected ?? gl.domElement
    if (!controls) return

    /** 화면 좌표(client) 아래의 땅 위 점 */
    const groundAt = (x: number, y: number, out: Vector3) => {
      const r = el.getBoundingClientRect()
      ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1)
      camera.updateMatrixWorld()
      ray.setFromCamera(ndc, camera)
      return ray.ray.intersectPlane(GROUND, out)
    }

    /** 카메라와 바라보는 점을 함께 옮기고, 바라보는 점은 섬 안으로 제한한다 */
    const translate = (d: Vector3) => {
      const t = controls.target
      const nx = Math.max(-ISLAND.halfX, Math.min(ISLAND.halfX, t.x + d.x))
      const nz = Math.max(-ISLAND.halfZ, Math.min(ISLAND.halfZ, t.z + d.z))
      shift.set(nx - t.x, 0, nz - t.z)
      camera.position.add(shift)
      t.add(shift)
    }

    const takeOver = () => {
      cameraRig.free = true
      cameraRig.focusing = false
      cameraRig.focusRequested = false
      useApp.getState().setCameraFree(true)
    }

    const onDown = (e: PointerEvent) => {
      lastPointer.type = e.pointerType
      if (e.pointerType !== 'touch' || !(e.target instanceof Node) || !el.contains(e.target)) return
      townGesture.down(e.pointerId, e.clientX, e.clientY)
    }

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return
      const a = townGesture.move(e.pointerId, e.clientX, e.clientY)
      if (!a) return
      if (a.type === 'pan') {
        if (!groundAt(a.from.x, a.from.y, hitA) || !groundAt(a.to.x, a.to.y, hitB)) return
        takeOver()
        translate(hitA.sub(hitB))
      } else if (a.type === 'rotate') {
        // 데스크톱 마우스 끌기와 같은 방향·감도 (화면 높이만큼 끌면 한 바퀴)
        const angle = (-2 * Math.PI * a.dx) / el.clientHeight
        offset.subVectors(camera.position, controls.target).applyAxisAngle(UP, angle)
        camera.position.copy(controls.target).add(offset)
      } else {
        if (!groundAt(a.fromMid.x, a.fromMid.y, hitA)) return
        takeOver()
        const z = Math.max(controls.minZoom, Math.min(controls.maxZoom, camera.zoom * a.scale))
        camera.zoom = z
        camera.updateProjectionMatrix()
        // 손가락 가운데 밑의 땅이 그대로 손가락 가운데에 남도록 옮긴다 (가운데가 움직이면 함께 이동)
        if (groundAt(a.toMid.x, a.toMid.y, hitB)) translate(hitA.sub(hitB))
      }
      controls.update()
    }

    const onUp = (e: PointerEvent) => {
      if (e.pointerType === 'touch') townGesture.up(e.pointerId, performance.now())
    }

    // 손가락이 캔버스 밖(버튼 위 등)에서 떼어져도 놓치지 않게 window 에서 듣는다
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerup', onUp, true)
    window.addEventListener('pointercancel', onUp, true)
    // iOS 사파리의 페이지 확대 제스처 막기
    const stop = (e: Event) => e.preventDefault()
    el.addEventListener('gesturestart', stop)
    return () => {
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp, true)
      window.removeEventListener('pointercancel', onUp, true)
      el.removeEventListener('gesturestart', stop)
      townGesture.reset()
    }
  }, [camera, gl, connected, controls])

  // 캐릭터 보기: 0.4초 동안 바라보는 점을 캐릭터로, 배율을 추적 배율까지 부드럽게 옮긴다
  const anim = useRef({ t0: 0, from: new Vector3(), zoomFrom: 1, zoomTo: 1 }).current
  useFrame(() => {
    if (!controls) return
    if (cameraRig.focusRequested) {
      cameraRig.focusRequested = false
      cameraRig.focusing = true
      anim.t0 = performance.now()
      anim.from.copy(controls.target)
      anim.zoomFrom = camera.zoom
      anim.zoomTo = Math.min(controls.maxZoom, Math.max(camera.zoom, cameraRig.baseZoom * FOLLOW_ZOOM))
    }
    if (!cameraRig.focusing) return
    const t = Math.min(1, (performance.now() - anim.t0) / FOCUS_MS)
    const k = ease(t)
    // 캐릭터가 걷는 중이어도 지금 위치를 향해 간다
    hitA.set(player.position.x, cameraRig.center.y, player.position.z)
    shift.lerpVectors(anim.from, hitA, k).sub(controls.target)
    camera.position.add(shift)
    controls.target.add(shift)
    camera.zoom = anim.zoomFrom + (anim.zoomTo - anim.zoomFrom) * k
    camera.updateProjectionMatrix()
    controls.update()
    if (t >= 1) {
      cameraRig.focusing = false
      cameraRig.free = false
      useApp.getState().setCameraFree(false)
    }
  })
  return null
}
