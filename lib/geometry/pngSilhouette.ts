import { inflateSync } from 'zlib'
import { cleanClosedOutline, normalizeOutline } from './outline'

type Point = { x: number; y: number }

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

function paeth(left: number, above: number, upperLeft: number): number {
  const estimate = left + above - upperLeft
  const leftDistance = Math.abs(estimate - left)
  const aboveDistance = Math.abs(estimate - above)
  const upperLeftDistance = Math.abs(estimate - upperLeft)
  return leftDistance <= aboveDistance && leftDistance <= upperLeftDistance
    ? left
    : aboveDistance <= upperLeftDistance ? above : upperLeft
}

function decodePng(buffer: Buffer): { width: number; height: number; pixels: Uint8Array; channels: number } {
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('Generated image is not a PNG')

  let width = 0
  let height = 0
  let bitDepth = 0
  let colorType = 0
  let interlace = 0
  const imageChunks: Buffer[] = []

  for (let offset = 8; offset + 12 <= buffer.length;) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.toString('ascii', offset + 4, offset + 8)
    const data = buffer.subarray(offset + 8, offset + 8 + length)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      bitDepth = data[8]
      colorType = data[9]
      interlace = data[12]
    } else if (type === 'IDAT') {
      imageChunks.push(data)
    } else if (type === 'IEND') {
      break
    }
    offset += length + 12
  }

  const channelsByType: Record<number, number> = { 0: 1, 2: 3, 4: 2, 6: 4 }
  const channels = channelsByType[colorType]
  if (!width || !height || bitDepth !== 8 || !channels || interlace !== 0) {
    throw new Error('Generated PNG uses an unsupported pixel format')
  }

  const inflated = inflateSync(Buffer.concat(imageChunks))
  const stride = width * channels
  const pixels = new Uint8Array(stride * height)
  let source = 0

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[source++]
    const rowStart = y * stride
    for (let x = 0; x < stride; x += 1) {
      const raw = inflated[source++]
      const left = x >= channels ? pixels[rowStart + x - channels] : 0
      const above = y > 0 ? pixels[rowStart + x - stride] : 0
      const upperLeft = y > 0 && x >= channels ? pixels[rowStart + x - stride - channels] : 0
      const prediction = filter === 0 ? 0
        : filter === 1 ? left
          : filter === 2 ? above
            : filter === 3 ? Math.floor((left + above) / 2)
              : filter === 4 ? paeth(left, above, upperLeft) : Number.NaN
      if (!Number.isFinite(prediction)) throw new Error('Generated PNG uses an unsupported row filter')
      pixels[rowStart + x] = (raw + prediction) & 255
    }
  }

  return { width, height, pixels, channels }
}

function largestComponent(mask: Uint8Array, width: number, height: number): Uint8Array {
  const visited = new Uint8Array(mask.length)
  let largest: number[] = []
  const queue = new Int32Array(mask.length)

  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || visited[start]) continue
    let head = 0
    let tail = 0
    const component: number[] = []
    queue[tail++] = start
    visited[start] = 1

    while (head < tail) {
      const index = queue[head++]
      component.push(index)
      const x = index % width
      const neighbors = [index - width, index + 1, index + width, index - 1]
      for (let direction = 0; direction < 4; direction += 1) {
        const neighbor = neighbors[direction]
        if (neighbor < 0 || neighbor >= mask.length) continue
        if (direction === 1 && x === width - 1) continue
        if (direction === 3 && x === 0) continue
        if (mask[neighbor] && !visited[neighbor]) {
          visited[neighbor] = 1
          queue[tail++] = neighbor
        }
      }
    }
    if (component.length > largest.length) largest = component
  }

  if (largest.length < width * height * 0.005) throw new Error('No usable connected silhouette was found')
  const result = new Uint8Array(mask.length)
  for (const index of largest) result[index] = 1
  return result
}

function closeMask(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  if (radius <= 0) return mask
  const boxCounts = (source: Uint8Array): Int32Array => {
    const stride = width + 1
    const integral = new Int32Array(stride * (height + 1))
    for (let y = 0; y < height; y += 1) {
      let rowTotal = 0
      for (let x = 0; x < width; x += 1) {
        rowTotal += source[y * width + x]
        integral[(y + 1) * stride + x + 1] = integral[y * stride + x + 1] + rowTotal
      }
    }
    return integral
  }
  const countInBox = (integral: Int32Array, left: number, top: number, right: number, bottom: number) => {
    const stride = width + 1
    return integral[bottom * stride + right]
      - integral[top * stride + right]
      - integral[bottom * stride + left]
      + integral[top * stride + left]
  }

  const dilated = new Uint8Array(mask.length)
  const sourceCounts = boxCounts(mask)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const left = Math.max(0, x - radius)
      const top = Math.max(0, y - radius)
      const right = Math.min(width, x + radius + 1)
      const bottom = Math.min(height, y + radius + 1)
      if (countInBox(sourceCounts, left, top, right, bottom) > 0) dilated[y * width + x] = 1
    }
  }

  const eroded = new Uint8Array(mask.length)
  const dilatedCounts = boxCounts(dilated)
  const required = (radius * 2 + 1) ** 2
  for (let y = radius; y < height - radius; y += 1) {
    for (let x = radius; x < width - radius; x += 1) {
      if (countInBox(dilatedCounts, x - radius, y - radius, x + radius + 1, y + radius + 1) === required) {
        eroded[y * width + x] = 1
      }
    }
  }
  return eroded
}

function traceBoundary(mask: Uint8Array, width: number, height: number): Point[] {
  const nextByStart = new Map<string, Point[]>()
  const add = (start: Point, end: Point) => {
    const key = `${start.x},${start.y}`
    const ends = nextByStart.get(key) ?? []
    ends.push(end)
    nextByStart.set(key, ends)
  }
  const filled = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height && mask[y * width + x] === 1

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!filled(x, y)) continue
      if (!filled(x, y - 1)) add({ x, y }, { x: x + 1, y })
      if (!filled(x + 1, y)) add({ x: x + 1, y }, { x: x + 1, y: y + 1 })
      if (!filled(x, y + 1)) add({ x: x + 1, y: y + 1 }, { x, y: y + 1 })
      if (!filled(x - 1, y)) add({ x, y: y + 1 }, { x, y })
    }
  }

  const startKey = Array.from(nextByStart.keys()).sort((a, b) => {
    const [ax, ay] = a.split(',').map(Number)
    const [bx, by] = b.split(',').map(Number)
    return ay - by || ax - bx
  })[0]
  if (!startKey) throw new Error('Silhouette has no exterior boundary')

  const [startX, startY] = startKey.split(',').map(Number)
  const start = { x: startX, y: startY }
  const points: Point[] = [start]
  let current = start
  const maximumSteps = nextByStart.size * 2

  for (let step = 0; step < maximumSteps; step += 1) {
    const candidates = nextByStart.get(`${current.x},${current.y}`)
    if (!candidates?.length) throw new Error('Silhouette boundary is discontinuous')
    const next = candidates.shift()!
    if (next.x === start.x && next.y === start.y) return points
    points.push(next)
    current = next
  }
  throw new Error('Silhouette boundary did not close')
}

function pointLineDistance(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x
  const dy = end.y - start.y
  if (dx === 0 && dy === 0) return Math.hypot(point.x - start.x, point.y - start.y)
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy))
}

function simplifyOpen(points: readonly Point[], tolerance: number): Point[] {
  if (points.length <= 2) return [...points]
  let farthest = -1
  let farthestIndex = -1
  for (let index = 1; index < points.length - 1; index += 1) {
    const distance = pointLineDistance(points[index], points[0], points[points.length - 1])
    if (distance > farthest) {
      farthest = distance
      farthestIndex = index
    }
  }
  if (farthest <= tolerance) return [points[0], points[points.length - 1]]
  return [
    ...simplifyOpen(points.slice(0, farthestIndex + 1), tolerance).slice(0, -1),
    ...simplifyOpen(points.slice(farthestIndex), tolerance)
  ]
}

function simplifyClosed(points: readonly Point[], tolerance: number): Point[] {
  let split = 1
  let farthest = 0
  for (let index = 1; index < points.length; index += 1) {
    const distance = Math.hypot(points[index].x - points[0].x, points[index].y - points[0].y)
    if (distance > farthest) {
      farthest = distance
      split = index
    }
  }
  const first = simplifyOpen(points.slice(0, split + 1), tolerance)
  const second = simplifyOpen([...points.slice(split), points[0]], tolerance)
  return cleanClosedOutline([...first.slice(0, -1), ...second.slice(0, -1)], 0.01)
}

export function tracePngSilhouette(buffer: Buffer, targetSize = 75, closingRadius = 0): Point[] {
  const decoded = decodePng(buffer)
  if (decoded.width * decoded.height > 4_194_304) throw new Error('Generated image is too large to trace safely')

  const scale = Math.min(1, 320 / Math.max(decoded.width, decoded.height))
  const width = Math.max(1, Math.round(decoded.width * scale))
  const height = Math.max(1, Math.round(decoded.height * scale))

  const mask = new Uint8Array(width * height)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(decoded.width - 1, Math.floor((x + 0.5) / scale))
      const sourceY = Math.min(decoded.height - 1, Math.floor((y + 0.5) / scale))
      const offset = (sourceY * decoded.width + sourceX) * decoded.channels
      const red = decoded.pixels[offset]
      const green = decoded.channels >= 3 ? decoded.pixels[offset + 1] : red
      const blue = decoded.channels >= 3 ? decoded.pixels[offset + 2] : red
      const alpha = decoded.channels === 2
        ? decoded.pixels[offset + 1]
        : decoded.channels === 4 ? decoded.pixels[offset + 3] : 255
      const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue
      mask[y * width + x] = alpha >= 80 && luminance <= 190 ? 1 : 0
    }
  }

  const printableMask = closeMask(mask, width, height, closingRadius)
  const boundary = traceBoundary(largestComponent(printableMask, width, height), width, height)
  const tolerance = Math.max(1, Math.max(width, height) / 500, closingRadius / 5)
  const simplified = simplifyClosed(boundary, tolerance).map(({ x, y }) => ({ x, y: -y }))
  if (simplified.length < 12) throw new Error('Generated silhouette is too simple')
  return normalizeOutline(simplified, targetSize)
}

