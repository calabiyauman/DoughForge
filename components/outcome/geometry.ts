import type { OutcomePoint } from './types'

export interface OutcomeBounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
  width: number
  height: number
}

const FALLBACK_BOUNDS: OutcomeBounds = {
  minX: 0,
  minY: 0,
  maxX: 100,
  maxY: 100,
  width: 100,
  height: 100,
}

export function getOutcomeBounds(pointSets: OutcomePoint[][]): OutcomeBounds {
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  for (const points of pointSets) {
    for (const point of points) {
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue
      minX = Math.min(minX, point.x)
      minY = Math.min(minY, point.y)
      maxX = Math.max(maxX, point.x)
      maxY = Math.max(maxY, point.y)
    }
  }

  if (![minX, minY, maxX, maxY].every(Number.isFinite)) return FALLBACK_BOUNDS

  const width = Math.max(maxX - minX, 1)
  const height = Math.max(maxY - minY, 1)
  return { minX, minY, maxX, maxY, width, height }
}

export function projectOutcomePoint(point: OutcomePoint, bounds: OutcomeBounds): OutcomePoint {
  return {
    x: point.x,
    y: bounds.minY + bounds.maxY - point.y,
  }
}

export function pointsToSvgPath(
  points: OutcomePoint[],
  bounds: OutcomeBounds,
  close = true
): string {
  if (points.length === 0) return ''

  const projected = points.map((point) => projectOutcomePoint(point, bounds))
  const commands = projected.map(
    (point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(3)} ${point.y.toFixed(3)}`
  )
  return close ? `${commands.join(' ')} Z` : commands.join(' ')
}

export function compoundSvgPath(
  outer: OutcomePoint[],
  holes: OutcomePoint[][] | undefined,
  bounds: OutcomeBounds
): string {
  return [pointsToSvgPath(outer, bounds), ...(holes ?? []).map((hole) => pointsToSvgPath(hole, bounds))]
    .filter(Boolean)
    .join(' ')
}

export function getRegionLabelPoint(points: OutcomePoint[], bounds: OutcomeBounds): OutcomePoint {
  if (points.length === 0) {
    return { x: bounds.minX + bounds.width / 2, y: bounds.minY + bounds.height / 2 }
  }

  let signedArea = 0
  let centroidX = 0
  let centroidY = 0

  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]
    const next = points[(index + 1) % points.length]
    const cross = current.x * next.y - next.x * current.y
    signedArea += cross
    centroidX += (current.x + next.x) * cross
    centroidY += (current.y + next.y) * cross
  }

  signedArea *= 0.5
  if (Math.abs(signedArea) < 0.0001) {
    const total = points.reduce(
      (sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }),
      { x: 0, y: 0 }
    )
    return projectOutcomePoint({ x: total.x / points.length, y: total.y / points.length }, bounds)
  }

  return projectOutcomePoint(
    {
      x: centroidX / (6 * signedArea),
      y: centroidY / (6 * signedArea),
    },
    bounds
  )
}

export function formatMoney(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
    }).format(value)
  } catch {
    return `${currency} ${value.toFixed(2)}`
  }
}
