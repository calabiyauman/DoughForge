import { deflateSync } from 'node:zlib'
import type {
  AIDecorationCandidateDraft,
  AIColorSlot,
  AINormalizedPoint,
} from './decorationPlan'

type Color = readonly [number, number, number, number]
type PixelPoint = { x: number; y: number }

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
const DEFAULT_SIZE = 512
const MIN_SIZE = 64
const MAX_SIZE = 2048
const COOKIE_DIAMETER_MM = 75

const FALLBACK_COLORS: Record<AIColorSlot, string> = {
  base: '#F4E1C1',
  outline: '#6B3F2A',
  accent: '#E76F89',
  detail: '#49352C',
  neutral: '#FFF9EE',
}

// A deliberately small, dependency-free bitmap face. It is not intended to
// reproduce the requested decorator font; it keeps requested copy legible in
// server-side previews when a native font renderer is unavailable.
const GLYPHS: Record<string, readonly string[]> = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01111', '10000', '10000', '10111', '10001', '10001', '01111'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  J: ['00111', '00010', '00010', '00010', '10010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '10101', '01010'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  0: ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  1: ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  2: ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  3: ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  4: ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  5: ['11111', '10000', '10000', '11110', '00001', '00001', '11110'],
  6: ['01110', '10000', '10000', '11110', '10001', '10001', '01110'],
  7: ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  8: ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  9: ['01110', '10001', '10001', '01111', '00001', '00001', '01110'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  '&': ['01100', '10010', '10100', '01000', '10101', '10010', '01101'],
  '!': ['00100', '00100', '00100', '00100', '00100', '00000', '00100'],
  '?': ['01110', '10001', '00001', '00010', '00100', '00000', '00100'],
  '.': ['00000', '00000', '00000', '00000', '00000', '00110', '00110'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
}

function parseHex(hex: string | undefined, fallback: string): Color {
  const value = /^#[0-9a-f]{6}$/i.test(hex ?? '') ? hex! : fallback
  return [
    Number.parseInt(value.slice(1, 3), 16),
    Number.parseInt(value.slice(3, 5), 16),
    Number.parseInt(value.slice(5, 7), 16),
    255,
  ]
}

function colorWithAlpha(color: Color, alpha: number): Color {
  return [color[0], color[1], color[2], Math.max(0, Math.min(255, Math.round(alpha)))]
}

function shade(color: Color, amount: number): Color {
  const target = amount < 0 ? 0 : 255
  const strength = Math.min(1, Math.abs(amount))
  return [
    Math.round(color[0] + (target - color[0]) * strength),
    Math.round(color[1] + (target - color[1]) * strength),
    Math.round(color[2] + (target - color[2]) * strength),
    color[3],
  ]
}

function setPixel(
  pixels: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
  color: Color,
  clip?: Uint8Array
): void {
  if (x < 0 || y < 0 || x >= width || y >= height) return
  const pixelIndex = y * width + x
  if (clip && clip[pixelIndex] === 0) return
  const offset = pixelIndex * 4
  const alpha = color[3] / 255
  const inverse = 1 - alpha
  pixels[offset] = Math.round(color[0] * alpha + pixels[offset] * inverse)
  pixels[offset + 1] = Math.round(color[1] * alpha + pixels[offset + 1] * inverse)
  pixels[offset + 2] = Math.round(color[2] * alpha + pixels[offset + 2] * inverse)
  pixels[offset + 3] = 255
}

function fillSurface(pixels: Uint8Array, color: Color): void {
  for (let offset = 0; offset < pixels.length; offset += 4) {
    pixels[offset] = color[0]
    pixels[offset + 1] = color[1]
    pixels[offset + 2] = color[2]
    pixels[offset + 3] = color[3]
  }
}

function scanlinePolygon(
  points: readonly PixelPoint[],
  width: number,
  height: number,
  visit: (x: number, y: number) => void
): void {
  if (points.length < 3) return
  const minY = Math.max(0, Math.floor(Math.min(...points.map((point) => point.y))))
  const maxY = Math.min(height - 1, Math.ceil(Math.max(...points.map((point) => point.y))))

  for (let y = minY; y <= maxY; y += 1) {
    const scanY = y + 0.5
    const intersections: number[] = []
    for (let index = 0; index < points.length; index += 1) {
      const start = points[index]
      const end = points[(index + 1) % points.length]
      if ((start.y <= scanY && end.y > scanY) || (end.y <= scanY && start.y > scanY)) {
        intersections.push(start.x + ((scanY - start.y) * (end.x - start.x)) / (end.y - start.y))
      }
    }
    intersections.sort((left, right) => left - right)
    for (let index = 0; index + 1 < intersections.length; index += 2) {
      const startX = Math.max(0, Math.ceil(intersections[index] - 0.5))
      const endX = Math.min(width - 1, Math.floor(intersections[index + 1] - 0.5))
      for (let x = startX; x <= endX; x += 1) visit(x, y)
    }
  }
}

function polygonMask(points: readonly PixelPoint[], width: number, height: number): Uint8Array {
  const mask = new Uint8Array(width * height)
  scanlinePolygon(points, width, height, (x, y) => { mask[y * width + x] = 1 })
  return mask
}

function fillPolygon(
  pixels: Uint8Array,
  width: number,
  height: number,
  points: readonly PixelPoint[],
  color: Color,
  clip?: Uint8Array
): void {
  scanlinePolygon(points, width, height, (x, y) => setPixel(pixels, width, height, x, y, color, clip))
}

function fillEllipse(
  pixels: Uint8Array,
  width: number,
  height: number,
  center: PixelPoint,
  radiusX: number,
  radiusY: number,
  color: Color,
  clip?: Uint8Array
): void {
  if (radiusX <= 0 || radiusY <= 0) return
  const left = Math.max(0, Math.floor(center.x - radiusX))
  const right = Math.min(width - 1, Math.ceil(center.x + radiusX))
  const top = Math.max(0, Math.floor(center.y - radiusY))
  const bottom = Math.min(height - 1, Math.ceil(center.y + radiusY))
  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      const dx = (x + 0.5 - center.x) / radiusX
      const dy = (y + 0.5 - center.y) / radiusY
      if (dx * dx + dy * dy <= 1) setPixel(pixels, width, height, x, y, color, clip)
    }
  }
}

function drawRoundSegment(
  pixels: Uint8Array,
  width: number,
  height: number,
  start: PixelPoint,
  end: PixelPoint,
  lineWidth: number,
  color: Color,
  clip?: Uint8Array
): void {
  const radius = Math.max(0.5, lineWidth / 2)
  const left = Math.max(0, Math.floor(Math.min(start.x, end.x) - radius))
  const right = Math.min(width - 1, Math.ceil(Math.max(start.x, end.x) + radius))
  const top = Math.max(0, Math.floor(Math.min(start.y, end.y) - radius))
  const bottom = Math.min(height - 1, Math.ceil(Math.max(start.y, end.y) + radius))
  const dx = end.x - start.x
  const dy = end.y - start.y
  const lengthSquared = dx * dx + dy * dy

  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      const px = x + 0.5
      const py = y + 0.5
      const projection = lengthSquared <= Number.EPSILON
        ? 0
        : Math.max(0, Math.min(1, ((px - start.x) * dx + (py - start.y) * dy) / lengthSquared))
      const nearestX = start.x + projection * dx
      const nearestY = start.y + projection * dy
      if ((px - nearestX) ** 2 + (py - nearestY) ** 2 <= radius ** 2) {
        setPixel(pixels, width, height, x, y, color, clip)
      }
    }
  }
}

function drawPolyline(
  pixels: Uint8Array,
  width: number,
  height: number,
  points: readonly PixelPoint[],
  lineWidth: number,
  color: Color,
  closed: boolean,
  clip?: Uint8Array
): void {
  for (let index = 1; index < points.length; index += 1) {
    drawRoundSegment(pixels, width, height, points[index - 1], points[index], lineWidth, color, clip)
  }
  if (closed && points.length > 2) {
    drawRoundSegment(pixels, width, height, points[points.length - 1], points[0], lineWidth, color, clip)
  }
}

function scalePolygon(points: readonly PixelPoint[], scale: number, offsetY = 0): PixelPoint[] {
  const center = points.reduce(
    (sum, point) => ({ x: sum.x + point.x / points.length, y: sum.y + point.y / points.length }),
    { x: 0, y: 0 }
  )
  return points.map((point) => ({
    x: center.x + (point.x - center.x) * scale,
    y: center.y + (point.y - center.y) * scale + offsetY,
  }))
}

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBytes = Buffer.from(type, 'ascii')
  const chunk = Buffer.allocUnsafe(data.length + 12)
  chunk.writeUInt32BE(data.length, 0)
  typeBytes.copy(chunk, 4)
  data.copy(chunk, 8)
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), data.length + 8)
  return chunk
}

function encodePng(width: number, height: number, pixels: Uint8Array): Buffer {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 6
  header[10] = 0
  header[11] = 0
  header[12] = 0

  const rowLength = width * 4
  const scanlines = Buffer.allocUnsafe((rowLength + 1) * height)
  for (let y = 0; y < height; y += 1) {
    const target = y * (rowLength + 1)
    scanlines[target] = 0
    Buffer.from(pixels.buffer, pixels.byteOffset + y * rowLength, rowLength).copy(scanlines, target + 1)
  }

  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(scanlines, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

function downsample(source: Uint8Array, sourceSize: number, targetSize: number): Uint8Array {
  if (sourceSize === targetSize) return source
  const factor = sourceSize / targetSize
  const samples = Math.round(factor) ** 2
  const output = new Uint8Array(targetSize * targetSize * 4)
  for (let y = 0; y < targetSize; y += 1) {
    for (let x = 0; x < targetSize; x += 1) {
      const totals = [0, 0, 0, 0]
      for (let sampleY = 0; sampleY < factor; sampleY += 1) {
        for (let sampleX = 0; sampleX < factor; sampleX += 1) {
          const sourceOffset = ((y * factor + sampleY) * sourceSize + x * factor + sampleX) * 4
          totals[0] += source[sourceOffset]
          totals[1] += source[sourceOffset + 1]
          totals[2] += source[sourceOffset + 2]
          totals[3] += source[sourceOffset + 3]
        }
      }
      const targetOffset = (y * targetSize + x) * 4
      output[targetOffset] = Math.round(totals[0] / samples)
      output[targetOffset + 1] = Math.round(totals[1] / samples)
      output[targetOffset + 2] = Math.round(totals[2] / samples)
      output[targetOffset + 3] = Math.round(totals[3] / samples)
    }
  }
  return output
}

function drawLettering(
  pixels: Uint8Array,
  width: number,
  height: number,
  item: AIDecorationCandidateDraft['lettering'][number],
  toPixel: (point: AINormalizedPoint) => PixelPoint,
  canvasSpan: number,
  color: Color,
  clip: Uint8Array
): void {
  const text = item.text.toUpperCase().slice(0, 24)
  if (!text) return
  const unitWidth = Math.max(1, text.length * 6 - 1)
  const desiredHeight = (item.fontSizeMm / COOKIE_DIAMETER_MM) * canvasSpan
  const maxTextWidth = item.maxWidthRatio * canvasSpan
  const cellSize = Math.max(1, Math.min(desiredHeight / 7, maxTextWidth / unitWidth))
  const textWidth = unitWidth * cellSize
  const textHeight = 7 * cellSize
  const anchor = toPixel(item.position)
  const startX = item.align === 'start' ? anchor.x : item.align === 'end' ? anchor.x - textWidth : anchor.x - textWidth / 2
  const startY = anchor.y - textHeight / 2
  const angle = (-item.rotationDegrees * Math.PI) / 180
  const cosine = Math.cos(angle)
  const sine = Math.sin(angle)
  const rotate = (point: PixelPoint): PixelPoint => {
    const dx = point.x - anchor.x
    const dy = point.y - anchor.y
    return {
      x: anchor.x + dx * cosine - dy * sine,
      y: anchor.y + dx * sine + dy * cosine,
    }
  }

  Array.from(text).forEach((character, characterIndex) => {
    const glyph = GLYPHS[character] ?? GLYPHS['?']
    glyph.forEach((row, rowIndex) => {
      Array.from(row).forEach((filled, columnIndex) => {
        if (filled !== '1') return
        const padding = Math.min(cellSize * 0.12, 1.5)
        const left = startX + (characterIndex * 6 + columnIndex) * cellSize + padding
        const top = startY + rowIndex * cellSize + padding
        const right = left + cellSize - padding * 2
        const bottom = top + cellSize - padding * 2
        fillPolygon(pixels, width, height, [
          rotate({ x: left, y: top }),
          rotate({ x: right, y: top }),
          rotate({ x: right, y: bottom }),
          rotate({ x: left, y: bottom }),
        ], color, clip)
      })
    })
  })
}

/**
 * Render an AI decoration draft to a deterministic, dependency-free PNG.
 * Coordinates use the generation canvas convention: x grows left-to-right and
 * y grows bottom-to-top. The output is an opaque square RGBA image.
 */
export function renderDecorationCandidatePng(
  candidate: AIDecorationCandidateDraft,
  normalizedOutline: readonly AINormalizedPoint[],
  size = DEFAULT_SIZE,
  options: { neutralizeOutline?: boolean } = {}
): Buffer {
  if (!Number.isInteger(size) || size < MIN_SIZE || size > MAX_SIZE) {
    throw new RangeError(`PNG size must be an integer between ${MIN_SIZE} and ${MAX_SIZE}`)
  }

  const outline = normalizedOutline.filter((point) => Number.isFinite(point?.x) && Number.isFinite(point?.y))
  const withoutClosure = outline.length > 3
    && Math.abs(outline[0].x - outline[outline.length - 1].x) < 1e-8
    && Math.abs(outline[0].y - outline[outline.length - 1].y) < 1e-8
    ? outline.slice(0, -1)
    : outline
  if (withoutClosure.length < 3) throw new TypeError('A decoration preview requires at least three outline points')

  const supersampling = size <= 1024 ? 2 : 1
  const renderSize = size * supersampling
  const pixels = new Uint8Array(renderSize * renderSize * 4)
  fillSurface(pixels, [250, 247, 242, 255])

  const padding = renderSize * 0.09
  const canvasSpan = renderSize - padding * 2
  const toPixel = (point: AINormalizedPoint): PixelPoint => ({
    x: padding + point.x * canvasSpan,
    y: padding + (1 - point.y) * canvasSpan,
  })
  const outlinePixels = options.neutralizeOutline
    ? [
        toPixel({ x: 0, y: 0 }),
        toPixel({ x: 1, y: 0 }),
        toPixel({ x: 1, y: 1 }),
        toPixel({ x: 0, y: 1 }),
      ]
    : withoutClosure.map(toPixel)
  const shadow = outlinePixels.map((point) => ({ x: point.x, y: point.y + renderSize * 0.018 }))
  fillPolygon(pixels, renderSize, renderSize, scalePolygon(shadow, 1.015), [66, 42, 26, 28])
  fillPolygon(pixels, renderSize, renderSize, shadow, [66, 42, 26, 28])

  const cookieEdge: Color = [151, 87, 39, 255]
  const cookieTop: Color = [213, 151, 83, 255]
  fillPolygon(pixels, renderSize, renderSize, outlinePixels, cookieEdge)
  fillPolygon(pixels, renderSize, renderSize, scalePolygon(outlinePixels, 0.986), cookieTop)

  const palette = new Map<AIColorSlot, Color>()
  for (const entry of candidate.palette) {
    if (!palette.has(entry.slot)) palette.set(entry.slot, parseHex(entry.hex, FALLBACK_COLORS[entry.slot]))
  }
  const colorFor = (slot: AIColorSlot) => palette.get(slot) ?? parseHex(undefined, FALLBACK_COLORS[slot])
  const baseColor = colorFor('base')
  const icingOutline = scalePolygon(outlinePixels, 0.95)
  const icing = scalePolygon(outlinePixels, 0.937)
  fillPolygon(pixels, renderSize, renderSize, icingOutline, shade(baseColor, -0.14))
  fillPolygon(pixels, renderSize, renderSize, icing, baseColor)
  const icingMask = polygonMask(icing, renderSize, renderSize)
  drawPolyline(
    pixels,
    renderSize,
    renderSize,
    icing,
    Math.max(1, renderSize * 0.004),
    colorWithAlpha(shade(baseColor, 0.32), 150),
    true,
    icingMask
  )

  type Drawable =
    | { type: 'region'; layer: number; order: number; value: AIDecorationCandidateDraft['regions'][number] }
    | { type: 'stroke'; layer: number; order: number; value: AIDecorationCandidateDraft['strokes'][number] }
    | { type: 'lettering'; layer: number; order: number; value: AIDecorationCandidateDraft['lettering'][number] }
  const drawables: Drawable[] = [
    ...candidate.regions.map((value, order): Drawable => ({ type: 'region', layer: value.layer, order, value })),
    ...candidate.strokes.map((value, order): Drawable => ({ type: 'stroke', layer: value.layer, order, value })),
    ...candidate.lettering.map((value, order): Drawable => ({ type: 'lettering', layer: value.layer, order, value })),
  ].sort((left, right) => left.layer - right.layer
    || (left.type === right.type ? left.order - right.order : left.type === 'region' ? -1 : right.type === 'region' ? 1 : left.type === 'stroke' ? -1 : 1))

  for (const drawable of drawables) {
    const color = colorFor(drawable.value.colorSlot)
    if (drawable.type === 'region') {
      if (drawable.value.kind === 'ellipse') {
        fillEllipse(
          pixels,
          renderSize,
          renderSize,
          toPixel({ x: drawable.value.centerX, y: drawable.value.centerY }),
          drawable.value.radiusX * canvasSpan,
          drawable.value.radiusY * canvasSpan,
          color,
          icingMask
        )
      } else {
        fillPolygon(
          pixels,
          renderSize,
          renderSize,
          drawable.value.points.map(toPixel),
          color,
          icingMask
        )
      }
    } else if (drawable.type === 'stroke') {
      const strokeWidth = Math.max(1.5 * supersampling, (drawable.value.widthMm / COOKIE_DIAMETER_MM) * canvasSpan)
      drawPolyline(
        pixels,
        renderSize,
        renderSize,
        drawable.value.points.map(toPixel),
        strokeWidth,
        color,
        drawable.value.closed,
        icingMask
      )
    } else {
      drawLettering(pixels, renderSize, renderSize, drawable.value, toPixel, canvasSpan, color, icingMask)
    }
  }

  return encodePng(size, size, downsample(pixels, renderSize, size))
}
