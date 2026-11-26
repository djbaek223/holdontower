import { Component, Suspense, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react'
import { useGLTF } from '@react-three/drei'
import { BufferGeometry, InstancedMesh, Mesh, MeshLambertMaterial, Object3D } from 'three'

/**
 * 3D 모델(GLB) 경로. 파일을 바꿔 끼우려면 public/models/README.md 규칙을 따른다.
 */
export const MODELS = {
  character: '/models/character.glb',
  tree: '/models/tree.glb',
  lamp: '/models/lamp.glb',
  planter: '/models/planter.glb',
} as const

// 압축(Draco) 디코더를 외부 CDN에서 받지 않도록 false
export const useModel = (url: string) => useGLTF(url, false)
Object.values(MODELS).forEach((u) => useGLTF.preload(u, false))

/** 정점 색 모델용 공용 재질 (성능 규칙: 단색 Lambert) */
export const vertexColorMaterial = new MeshLambertMaterial({ vertexColors: true })

/** 모델 로딩 실패 시 대체 화면으로 */
class Fallback extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(err: unknown) {
    console.warn('[models] GLB 로딩 실패, 박스 모델로 대체합니다', err)
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

/** 로딩 중·실패 시 fallback을 보여 주는 래퍼 */
export function WithModel({ fallback, children }: { fallback: ReactNode; children: ReactNode }) {
  return (
    <Fallback fallback={fallback}>
      <Suspense fallback={fallback}>{children}</Suspense>
    </Fallback>
  )
}

/** GLB 안의 첫 메시 지오메트리 (소품 모델은 메시 1개로 만든다) */
function firstGeometry(scene: Object3D): BufferGeometry {
  let geo: BufferGeometry | null = null
  scene.traverse((o) => {
    if (!geo && (o as Mesh).isMesh) geo = (o as Mesh).geometry
  })
  if (!geo) throw new Error('모델에 메시가 없습니다')
  return geo
}

export type Placement = { p: [number, number, number]; r?: number; s?: number }

const tmp = new Object3D()

/** 같은 소품 모델을 여러 곳에 배치 (인스턴싱: 드로우콜 1개) */
export function ModelInstances({ url, items }: { url: string; items: Placement[] }) {
  const { scene } = useModel(url)
  const geometry = useMemo(() => firstGeometry(scene), [scene])
  const ref = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    const mesh = ref.current!
    items.forEach((it, i) => {
      tmp.position.set(...it.p)
      tmp.rotation.set(0, it.r ?? 0, 0)
      tmp.scale.setScalar(it.s ?? 1)
      tmp.updateMatrix()
      mesh.setMatrixAt(i, tmp.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [items, geometry])
  return <instancedMesh ref={ref} args={[geometry, vertexColorMaterial, items.length]} />
}
