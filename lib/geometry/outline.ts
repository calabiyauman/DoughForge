export interface Point2D {
  x: number
  y: number
}

const DEFAULT_TOLERANCE = 1e-4

function distanceSquared(a: Point2D, b: Point2D): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return dx * dx + dy * dy
}

export function cleanClosedOutline(
  input: readonly Point2D[],
  tolerance = DEFAULT_TOLERANCE
): Point2D[] {
  const toleranceSquared = tolerance * tolerance
  const points: Point2D[] = []

  for (const point of input) {
    if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) continue

    const next = { x: point.x, y: point.y }
    const previous = points[points.length - 1]
    if (!previous || distanceSquared(previous, next) > toleranceSquared) {
      points.push(next)
    }
  }

  while (
    points.length > 1
    && distanceSquared(points[0], points[points.length - 1]) <= toleranceSquared
  ) {
    points.pop()
  }

  return points
}

export function closeOutline(input: readonly Point2D[]): Point2D[] {
  const points = cleanClosedOutline(input)
  return points.length > 0 ? [...points, { ...points[0] }] : []
}

export function signedArea(points: readonly Point2D[]): number {
  let area = 0

  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]
    const next = points[(index + 1) % points.length]
    area += current.x * next.y - next.x * current.y
  }

  return area / 2
}

function orientation(a: Point2D, b: Point2D, c: Point2D): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
}

function segmentsIntersect(a: Point2D, b: Point2D, c: Point2D, d: Point2D): boolean {
  const abC = orientation(a, b, c)
  const abD = orientation(a, b, d)
  const cdA = orientation(c, d, a)
  const cdB = orientation(c, d, b)
  const epsilon = 1e-9

  return (
    ((abC > epsilon && abD < -epsilon) || (abC < -epsilon && abD > epsilon))
    && ((cdA > epsilon && cdB < -epsilon) || (cdA < -epsilon && cdB > epsilon))
  )
}

export function hasSelfIntersections(points: readonly Point2D[]): boolean {
  const length = points.length

  for (let first = 0; first < length; first += 1) {
    const firstNext = (first + 1) % length

    for (let second = first + 1; second < length; second += 1) {
      const secondNext = (second + 1) % length
      const adjacent = first === second
        || firstNext === second
        || secondNext === first

      if (adjacent) continue

      if (segmentsIntersect(
        points[first],
        points[firstNext],
        points[second],
        points[secondNext]
      )) {
        return true
      }
    }
  }

  return false
}

export function normalizeOutline(
  input: readonly Point2D[],
  targetSize = 50
): Point2D[] {
  const points = cleanClosedOutline(input)
  if (points.length < 3) return points

  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const width = maxX - minX
  const height = maxY - minY
  const largestDimension = Math.max(width, height)

  if (largestDimension <= DEFAULT_TOLERANCE) return []

  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2
  const scale = targetSize / largestDimension

  return points.map((point) => ({
    x: Number(((point.x - centerX) * scale).toFixed(4)),
    y: Number(((point.y - centerY) * scale).toFixed(4))
  }))
}

