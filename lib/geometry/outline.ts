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

function pointToSegmentDistance(point: Point2D, start: Point2D, end: Point2D): number {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const lengthSquared = dx * dx + dy * dy

  if (lengthSquared <= Number.EPSILON) {
    return Math.sqrt(distanceSquared(point, start))
  }

  const projection = Math.max(0, Math.min(1, (
    (point.x - start.x) * dx + (point.y - start.y) * dy
  ) / lengthSquared))
  return Math.hypot(
    point.x - (start.x + projection * dx),
    point.y - (start.y + projection * dy)
  )
}

export function minimumNonAdjacentSegmentDistance(points: readonly Point2D[]): number {
  const length = points.length
  let minimum = Number.POSITIVE_INFINITY

  for (let first = 0; first < length; first += 1) {
    const firstNext = (first + 1) % length

    for (let second = first + 1; second < length; second += 1) {
      const secondNext = (second + 1) % length
      const separation = Math.min(second - first, length - (second - first))
      // Edges within two steps belong to the same local corner or curve. Their
      // clearance is handled by the sweep join; only separated outline regions
      // can form a pinched channel with colliding walls.
      if (separation <= 2 || firstNext === second || secondNext === first) continue

      const firstStart = points[first]
      const firstEnd = points[firstNext]
      const secondStart = points[second]
      const secondEnd = points[secondNext]

      if (segmentsIntersect(firstStart, firstEnd, secondStart, secondEnd)) return 0

      minimum = Math.min(
        minimum,
        pointToSegmentDistance(firstStart, secondStart, secondEnd),
        pointToSegmentDistance(firstEnd, secondStart, secondEnd),
        pointToSegmentDistance(secondStart, firstStart, firstEnd),
        pointToSegmentDistance(secondEnd, firstStart, firstEnd)
      )
    }
  }

  return minimum
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

export function createOffsetOutline(
  input: readonly Point2D[],
  offset: number,
  miterLimit = 4
): Point2D[] {
  const points = cleanClosedOutline(input)
  const area = signedArea(points)
  if (points.length < 3 || Math.abs(area) <= Number.EPSILON) return []

  const outwardSide = area > 0 ? -1 : 1
  const offsetPoints: Point2D[] = []

  for (let index = 0; index < points.length; index += 1) {
    const previous = points[(index - 1 + points.length) % points.length]
    const current = points[index]
    const next = points[(index + 1) % points.length]
    const incomingLength = Math.hypot(current.x - previous.x, current.y - previous.y)
    const outgoingLength = Math.hypot(next.x - current.x, next.y - current.y)
    if (incomingLength <= Number.EPSILON || outgoingLength <= Number.EPSILON) continue

    const incoming = {
      x: (current.x - previous.x) / incomingLength,
      y: (current.y - previous.y) / incomingLength
    }
    const outgoing = {
      x: (next.x - current.x) / outgoingLength,
      y: (next.y - current.y) / outgoingLength
    }
    const incomingNormal = {
      x: -incoming.y * outwardSide,
      y: incoming.x * outwardSide
    }
    const outgoingNormal = {
      x: -outgoing.y * outwardSide,
      y: outgoing.x * outwardSide
    }
    const turn = (incoming.x * outgoing.y - incoming.y * outgoing.x) * area

    if (offset > 0 && turn < 0) {
      offsetPoints.push(
        {
          x: current.x + outgoingNormal.x * offset,
          y: current.y + outgoingNormal.y * offset
        },
        {
          x: current.x + incomingNormal.x * offset,
          y: current.y + incomingNormal.y * offset
        }
      )
      continue
    }

    const summedX = incomingNormal.x + outgoingNormal.x
    const summedY = incomingNormal.y + outgoingNormal.y
    const summedLength = Math.hypot(summedX, summedY)
    if (summedLength <= Number.EPSILON) continue

    const normal = { x: summedX / summedLength, y: summedY / summedLength }
    const denominator = normal.x * outgoingNormal.x + normal.y * outgoingNormal.y
    const rawScale = Math.abs(denominator) > Number.EPSILON ? 1 / denominator : miterLimit
    const miterScale = Math.max(-miterLimit, Math.min(miterLimit, rawScale))
    offsetPoints.push({
      x: current.x + normal.x * offset * miterScale,
      y: current.y + normal.y * offset * miterScale
    })
  }

  return offsetPoints
}

export function hasOffsetSelfIntersections(
  points: readonly Point2D[],
  offsets: readonly number[]
): boolean {
  return offsets.some((offset) => {
    const offsetOutline = createOffsetOutline(points, offset)
    return offsetOutline.length < 3 || hasSelfIntersections(offsetOutline)
  })
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

