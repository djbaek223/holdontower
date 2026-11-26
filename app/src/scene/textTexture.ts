import { CanvasTexture, SRGBColorSpace } from 'three'

const cache = new Map<string, CanvasTexture>()

/**
 * 한글 텍스트를 캔버스 텍스처로 만든다. 외부 폰트 로딩 없이 시스템 폰트 사용.
 * 같은 텍스트·스타일은 캐시해서 재사용.
 */
export function textTexture(
  text: string,
  opts: { color?: string; bg?: string; size?: number; width?: number; height?: number; weight?: number } = {},
) {
  const { color = '#fff', bg = 'transparent', size = 64, width = 512, height = 128, weight = 800 } = opts
  const key = [text, color, bg, size, width, height, weight].join('|')
  const hit = cache.get(key)
  if (hit) return hit

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  if (bg !== 'transparent') {
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, width, height)
  }
  ctx.fillStyle = color
  ctx.font = `${weight} ${size}px "Pretendard", "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, width / 2, height / 2 + size * 0.04)

  const tex = new CanvasTexture(canvas)
  tex.colorSpace = SRGBColorSpace
  tex.anisotropy = 4
  cache.set(key, tex)
  return tex
}
