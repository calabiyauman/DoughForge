import {
  difference,
  EndType,
  FillRule,
  inflatePaths,
  intersect,
  JoinType,
  pointInPolygon,
  PointInPolygonResult,
  simplifyPaths,
  union,
  type Path64,
  type Paths64
} from 'clipper2-ts'
import type { Point2D } from '../design/types'

/** One integer unit is one micron. All public coordinates remain millimetres. */
export const DEFAULT_PLANAR_UNITS_PER_MILLIMETER = 1_000

// Keeping coordinates below this bound also keeps the cross products used by
// DoughForge's topology checks inside JavaScript's safe-integer range.
const MAX_QUANTIZED_COORDINATE = Math.floor(
  Math.sqrt(Number.MAX_SAFE_INTEGER / 8)
)

export type PlanarFillRule = 'nonzero' | 'evenodd'
export type PlanarJoin = 'miter' | 'square' | 'bevel' | 'round'
export type PlanarEndCap = 'butt' | 'square' | 'round'

export interface PlanarRingInput {
  points: readonly Point2D[]
  kind?: 'outer' | 'hole'
}

export interface PlanarKernelOptions {
  unitsPerMillimeter?: number
  fillRule?: PlanarFillRule
  /** Resolve valid fill-rule self-crossings instead of rejecting the source ring. */
  repairSelfIntersections?: boolean
}

export interface PlanarOffsetOptions extends PlanarKernelOptions {
  join?: PlanarJoin
  miterLimit?: number
  arcTolerance?: number
}

export interface PlanarStrokeOptions extends PlanarOffsetOptions {
  endCap?: PlanarEndCap
}

export interface PlanarRegion {
  /** Canonical rings in millimetres. Positive rings are outers; negative rings are holes. */
  paths: Point2D[][]
  unitsPerMillimeter: number
}

export interface PlanarPolygon {
  outer: Point2D[]
  holes: Point2D[][]
}

export interface PlanarRegionReport {
  rings: number
  components: number
  holes: number
  area: number
  bounds: {
    minX: number
    minY: number
    maxX: number
    maxY: number
    width: number
    height: number
  } | null
}

export class PlanarKernelError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PlanarKernelError'
  }
}

interface ResolvedOptions {
  unitsPerMillimeter: number
  fillRule: FillRule
}

function resolveOptions(options: PlanarKernelOptions = {}): ResolvedOptions {
  const unitsPerMillimeter = options.unitsPerMillimeter
    ?? DEFAULT_PLANAR_UNITS_PER_MILLIMETER

  if (
    !Number.isSafeInteger(unitsPerMillimeter)
    || unitsPerMillimeter < 1
    || unitsPerMillimeter > 1_000_000
  ) {
    throw new PlanarKernelError(
      'unitsPerMillimeter must be a safe integer between 1 and 1000000'
    )
  }

  const fillRule = options.fillRule ?? 'nonzero'
  if (fillRule !== 'nonzero' && fillRule !== 'evenodd') {
    throw new PlanarKernelError(`Unsupported planar fill rule: ${String(fillRule)}`)
  }

  return {
    unitsPerMillimeter,
    fillRule: fillRule === 'evenodd' ? FillRule.EvenOdd : FillRule.NonZero
  }
}

function quantizeCoordinate(
  value: number,
  unitsPerMillimeter: number,
  label: string
): number {
  if (!Number.isFinite(value)) {
    throw new PlanarKernelError(`${label} must be finite`)
  }

  const quantized = Math.round(value * unitsPerMillimeter)
  if (
    !Number.isSafeInteger(quantized)
    || Math.abs(quantized) > MAX_QUANTIZED_COORDINATE
  ) {
    throw new PlanarKernelError(
      `${label} is outside the planar kernel's safe coordinate range`
    )
  }
  return quantized
}

function pointsEqual(first: Path64[number], second: Path64[number]): boolean {
  return first.x === second.x && first.y === second.y
}

function cross(
  first: Path64[number],
  second: Path64[number],
  third: Path64[number]
): number {
  return (second.x - first.x) * (third.y - first.y)
    - (second.y - first.y) * (third.x - first.x)
}

function signedArea64(path: Path64): number {
  let doubleArea = 0
  for (let index = 0; index < path.length; index += 1) {
    const current = path[index]
    const next = path[(index + 1) % path.length]
    doubleArea += current.x * next.y - next.x * current.y
  }
  return doubleArea / 2
}

function removeRedundantVertices(input: Path64, closed: boolean): Path64 {
  const path: Path64 = []
  for (const point of input) {
    const previous = path[path.length - 1]
    if (!previous || !pointsEqual(previous, point)) path.push({ x: point.x, y: point.y })
  }

  if (closed) {
    while (path.length > 1 && pointsEqual(path[0], path[path.length - 1])) path.pop()
  }

  if (!closed || path.length < 3) return path

  let changed = true
  while (changed && path.length >= 3) {
    changed = false
    for (let index = 0; index < path.length; index += 1) {
      const previous = path[(index - 1 + path.length) % path.length]
      const current = path[index]
      const next = path[(index + 1) % path.length]
      const forwardDot = (current.x - previous.x) * (next.x - current.x)
        + (current.y - previous.y) * (next.y - current.y)

      if (cross(previous, current, next) === 0 && forwardDot >= 0) {
        path.splice(index, 1)
        changed = true
        break
      }
    }
  }

  return path
}

function orientationSign(
  first: Path64[number],
  second: Path64[number],
  third: Path64[number]
): -1 | 0 | 1 {
  const value = cross(first, second, third)
  return value === 0 ? 0 : value > 0 ? 1 : -1
}

function pointOnSegment(
  point: Path64[number],
  start: Path64[number],
  end: Path64[number]
): boolean {
  return orientationSign(start, end, point) === 0
    && point.x >= Math.min(start.x, end.x)
    && point.x <= Math.max(start.x, end.x)
    && point.y >= Math.min(start.y, end.y)
    && point.y <= Math.max(start.y, end.y)
}

function segmentsTouchOrCross(
  firstStart: Path64[number],
  firstEnd: Path64[number],
  secondStart: Path64[number],
  secondEnd: Path64[number]
): boolean {
  const firstSecondStart = orientationSign(firstStart, firstEnd, secondStart)
  const firstSecondEnd = orientationSign(firstStart, firstEnd, secondEnd)
  const secondFirstStart = orientationSign(secondStart, secondEnd, firstStart)
  const secondFirstEnd = orientationSign(secondStart, secondEnd, firstEnd)

  if (
    firstSecondStart !== firstSecondEnd
    && secondFirstStart !== secondFirstEnd
    && firstSecondStart !== 0
    && firstSecondEnd !== 0
    && secondFirstStart !== 0
    && secondFirstEnd !== 0
  ) {
    return true
  }

  return (firstSecondStart === 0 && pointOnSegment(secondStart, firstStart, firstEnd))
    || (firstSecondEnd === 0 && pointOnSegment(secondEnd, firstStart, firstEnd))
    || (secondFirstStart === 0 && pointOnSegment(firstStart, secondStart, secondEnd))
    || (secondFirstEnd === 0 && pointOnSegment(firstEnd, secondStart, secondEnd))
}

interface IndexedSegment {
  index: number
  start: Path64[number]
  end: Path64[number]
  minX: number
  minY: number
  maxX: number
  maxY: number
}

interface PathSelfIntersection {
  first: IndexedSegment
  second: IndexedSegment
  point: Path64[number]
}

function segmentIntersectionPoint(
  first: IndexedSegment,
  second: IndexedSegment
): Path64[number] {
  for (const candidate of [first.start, first.end, second.start, second.end]) {
    if (
      pointOnSegment(candidate, first.start, first.end)
      && pointOnSegment(candidate, second.start, second.end)
    ) {
      return { x: candidate.x, y: candidate.y }
    }
  }

  const firstDX = first.end.x - first.start.x
  const firstDY = first.end.y - first.start.y
  const secondDX = second.end.x - second.start.x
  const secondDY = second.end.y - second.start.y
  const denominator = firstDX * secondDY - firstDY * secondDX
  if (denominator === 0) {
    throw new PlanarKernelError('Unable to node a collinear self-overlap')
  }
  const originDX = second.start.x - first.start.x
  const originDY = second.start.y - first.start.y
  const interpolation = (originDX * secondDY - originDY * secondDX) / denominator
  return {
    x: Math.round(first.start.x + interpolation * firstDX),
    y: Math.round(first.start.y + interpolation * firstDY)
  }
}

function findPathSelfIntersection(path: Path64): PathSelfIntersection | undefined {
  const segments: IndexedSegment[] = path.map((start, index) => {
    const end = path[(index + 1) % path.length]
    return {
      index,
      start,
      end,
      minX: Math.min(start.x, end.x),
      minY: Math.min(start.y, end.y),
      maxX: Math.max(start.x, end.x),
      maxY: Math.max(start.y, end.y)
    }
  }).sort((first, second) => (
    first.minX - second.minX
    || first.minY - second.minY
    || first.index - second.index
  ))

  for (let firstPosition = 0; firstPosition < segments.length; firstPosition += 1) {
    const first = segments[firstPosition]
    for (
      let secondPosition = firstPosition + 1;
      secondPosition < segments.length;
      secondPosition += 1
    ) {
      const second = segments[secondPosition]
      if (second.minX > first.maxX) break
      if (second.minY > first.maxY || second.maxY < first.minY) continue
      const firstNext = (first.index + 1) % path.length
      const secondNext = (second.index + 1) % path.length
      const adjacent = first.index === second.index
        || firstNext === second.index
        || secondNext === first.index
      if (adjacent) continue

      if (segmentsTouchOrCross(first.start, first.end, second.start, second.end)) {
        return {
          first,
          second,
          point: segmentIntersectionPoint(first, second)
        }
      }
    }
  }
  return undefined
}

function assertSimpleClosedPath(path: Path64, label: string): void {
  if (path.length < 3) {
    throw new PlanarKernelError(`${label} must contain at least three distinct points`)
  }

  const intersection = findPathSelfIntersection(path)
  if (intersection) {
    const { first, second } = intersection
    throw new PlanarKernelError(
      `${label} self-intersects or self-touches at segments ${first.index} (${first.start.x},${first.start.y} -> ${first.end.x},${first.end.y}) and ${second.index} (${second.start.x},${second.start.y} -> ${second.end.x},${second.end.y})`
    )
  }

  if (signedArea64(path) === 0) {
    throw new PlanarKernelError(`${label} must enclose a non-zero area`)
  }
}

function quantizeClosedPath(
  points: readonly Point2D[],
  unitsPerMillimeter: number,
  label: string,
  requireSimple = true
): Path64 {
  const quantized = points.map((point, index) => ({
    x: quantizeCoordinate(point?.x, unitsPerMillimeter, `${label} point ${index} x`),
    y: quantizeCoordinate(point?.y, unitsPerMillimeter, `${label} point ${index} y`)
  }))
  const path = removeRedundantVertices(quantized, true)
  if (requireSimple) assertSimpleClosedPath(path, label)
  else if (path.length < 3) {
    throw new PlanarKernelError(`${label} must contain at least three distinct points`)
  }
  return path
}

function quantizeOpenPath(
  points: readonly Point2D[],
  unitsPerMillimeter: number,
  label: string
): Path64 {
  const path = removeRedundantVertices(points.map((point, index) => ({
    x: quantizeCoordinate(point?.x, unitsPerMillimeter, `${label} point ${index} x`),
    y: quantizeCoordinate(point?.y, unitsPerMillimeter, `${label} point ${index} y`)
  })), false)

  if (path.length < 2) {
    throw new PlanarKernelError(`${label} must contain at least two distinct points`)
  }
  return path
}

function lexicographicPointCompare(
  first: Path64[number],
  second: Path64[number]
): number {
  return first.x - second.x || first.y - second.y
}

function canonicalizePath(input: Path64): Path64 {
  const path = removeRedundantVertices(input, true)
  assertSimpleClosedPath(path, 'Planar kernel output ring')

  let firstIndex = 0
  for (let index = 1; index < path.length; index += 1) {
    if (lexicographicPointCompare(path[index], path[firstIndex]) < 0) firstIndex = index
  }

  return [
    ...path.slice(firstIndex),
    ...path.slice(0, firstIndex)
  ]
}

function canonicalizePaths(paths: Paths64): Paths64 {
  const canonical = paths.map(canonicalizePath)
  canonical.sort((first, second) => {
    const firstArea = signedArea64(first)
    const secondArea = signedArea64(second)
    const firstKind = firstArea > 0 ? 0 : 1
    const secondKind = secondArea > 0 ? 0 : 1
    if (firstKind !== secondKind) return firstKind - secondKind
    if (Math.abs(firstArea) !== Math.abs(secondArea)) {
      return Math.abs(secondArea) - Math.abs(firstArea)
    }
    const pointOrder = lexicographicPointCompare(first[0], second[0])
    if (pointOrder !== 0) return pointOrder
    if (first.length !== second.length) return first.length - second.length
    for (let index = 1; index < first.length; index += 1) {
      const order = lexicographicPointCompare(first[index], second[index])
      if (order !== 0) return order
    }
    return 0
  })
  return canonical
}

function ensureWinding(path: Path64, positive: boolean): Path64 {
  return (signedArea64(path) > 0) === positive ? path : [...path].reverse()
}

function splitRepeatedVertices(path: Path64): Paths64 {
  const firstIndexByPoint = new Map<string, number>()

  for (let index = 0; index < path.length; index += 1) {
    const point = path[index]
    const key = `${point.x}:${point.y}`
    const firstIndex = firstIndexByPoint.get(key)
    if (firstIndex === undefined) {
      firstIndexByPoint.set(key, index)
      continue
    }

    const separation = index - firstIndex
    if (separation <= 1 || separation >= path.length - 1) continue
    const firstLoop = removeRedundantVertices(path.slice(firstIndex, index), true)
    const secondLoop = removeRedundantVertices([
      ...path.slice(index),
      ...path.slice(0, firstIndex)
    ], true)
    return [firstLoop, secondLoop].flatMap((loop) => (
      loop.length >= 3 ? splitRepeatedVertices(loop) : []
    ))
  }

  return [path]
}

function nodeAndSplitSelfIntersections(path: Path64, depth = 0): Paths64 {
  if (depth > path.length) {
    throw new PlanarKernelError('Unable to resolve planar self-intersections deterministically')
  }
  const intersection = findPathSelfIntersection(path)
  if (!intersection) return [path]

  const insertAfter = new Set([
    intersection.first.index,
    intersection.second.index
  ])
  const noded: Path64 = []
  for (let index = 0; index < path.length; index += 1) {
    const current = path[index]
    const next = path[(index + 1) % path.length]
    noded.push({ x: current.x, y: current.y })
    if (
      insertAfter.has(index)
      && !pointsEqual(intersection.point, current)
      && !pointsEqual(intersection.point, next)
    ) {
      noded.push({ x: intersection.point.x, y: intersection.point.y })
    }
  }

  const split = splitRepeatedVertices(removeRedundantVertices(noded, true))
  if (split.length === 1 && split[0].length === path.length) {
    throw new PlanarKernelError('Unable to split a noded planar self-intersection')
  }
  return split.flatMap((loop) => nodeAndSplitSelfIntersections(loop, depth + 1))
}

function pathPerimeter64(path: Path64): number {
  let perimeter = 0
  for (let index = 0; index < path.length; index += 1) {
    const current = path[index]
    const next = path[(index + 1) % path.length]
    perimeter += Math.hypot(next.x - current.x, next.y - current.y)
  }
  return perimeter
}

function splitTouchingOutput(paths: Paths64, repairTolerance: number): Paths64 {
  const split = paths.flatMap((path) => nodeAndSplitSelfIntersections(path))
  const withoutSlivers = split.filter((path) => (
    Math.abs(signedArea64(path)) > pathPerimeter64(path) * repairTolerance / 2
  ))
  return withoutSlivers.length > 0 ? withoutSlivers : split
}

function dequantizePaths(paths: Paths64, unitsPerMillimeter: number): Point2D[][] {
  return paths.map((path) => path.map((point) => ({
    x: point.x / unitsPerMillimeter,
    y: point.y / unitsPerMillimeter
  })))
}

function quantizeRegion(region: PlanarRegion): Paths64 {
  const resolved = resolveOptions({ unitsPerMillimeter: region.unitsPerMillimeter })
  return region.paths.map((path, index) => (
    quantizeClosedPath(path, resolved.unitsPerMillimeter, `Region ring ${index}`)
  ))
}

function regionFromPaths(
  paths: Paths64,
  unitsPerMillimeter: number,
  repairInvalidOutput = false
): PlanarRegion {
  let canonical: Paths64
  try {
    canonical = canonicalizePaths(paths)
  } catch (error) {
    if (!repairInvalidOutput || !(error instanceof PlanarKernelError)) throw error
    const repairTolerance = Math.max(1, Math.round(unitsPerMillimeter * 0.002))
    const simplified = union(
      simplifyPaths(paths, repairTolerance, true),
      FillRule.NonZero
    )
    canonical = canonicalizePaths(
      splitTouchingOutput(simplified, repairTolerance)
    )
  }
  return {
    paths: dequantizePaths(canonical, unitsPerMillimeter),
    unitsPerMillimeter
  }
}

function assertCompatibleRegions(regions: readonly PlanarRegion[]): number {
  const unitsPerMillimeter = regions[0]?.unitsPerMillimeter
    ?? DEFAULT_PLANAR_UNITS_PER_MILLIMETER
  for (const region of regions) {
    if (region.unitsPerMillimeter !== unitsPerMillimeter) {
      throw new PlanarKernelError('Planar regions use incompatible precision scales')
    }
  }
  return unitsPerMillimeter
}

function resolveFillRule(fillRule: PlanarFillRule | undefined): FillRule {
  return resolveOptions({ fillRule }).fillRule
}

export function createPlanarRegion(
  rings: readonly PlanarRingInput[],
  options: PlanarKernelOptions = {}
): PlanarRegion {
  const resolved = resolveOptions(options)
  if (rings.length === 0) {
    return { paths: [], unitsPerMillimeter: resolved.unitsPerMillimeter }
  }

  const inputs = rings.map((ring, index) => {
    const path = quantizeClosedPath(
      ring.points,
      resolved.unitsPerMillimeter,
      `Input ring ${index}`,
      options.repairSelfIntersections !== true
    )
    return ensureWinding(path, ring.kind !== 'hole')
  })
  let result = union(inputs, resolved.fillRule)
  if (options.repairSelfIntersections === true) {
    const repairTolerance = Math.max(
      1,
      Math.round(resolved.unitsPerMillimeter * 0.002)
    )
    result = union(
      simplifyPaths(result, repairTolerance, true),
      resolved.fillRule
    )
    result = splitTouchingOutput(result, repairTolerance)
  }
  return regionFromPaths(result, resolved.unitsPerMillimeter, true)
}

export function unionPlanarRegions(
  regions: readonly PlanarRegion[],
  fillRule: PlanarFillRule = 'nonzero'
): PlanarRegion {
  const unitsPerMillimeter = assertCompatibleRegions(regions)
  const paths = regions.flatMap((region) => quantizeRegion(region))
  if (paths.length === 0) return { paths: [], unitsPerMillimeter }
  return regionFromPaths(
    union(paths, resolveFillRule(fillRule)),
    unitsPerMillimeter,
    true
  )
}

export function subtractPlanarRegions(
  subject: PlanarRegion,
  clip: PlanarRegion,
  fillRule: PlanarFillRule = 'nonzero'
): PlanarRegion {
  const unitsPerMillimeter = assertCompatibleRegions([subject, clip])
  if (subject.paths.length === 0) return { paths: [], unitsPerMillimeter }
  if (clip.paths.length === 0) return regionFromPaths(quantizeRegion(subject), unitsPerMillimeter)
  return regionFromPaths(
    difference(quantizeRegion(subject), quantizeRegion(clip), resolveFillRule(fillRule)),
    unitsPerMillimeter,
    true
  )
}

export function intersectPlanarRegions(
  subject: PlanarRegion,
  clip: PlanarRegion,
  fillRule: PlanarFillRule = 'nonzero'
): PlanarRegion {
  const unitsPerMillimeter = assertCompatibleRegions([subject, clip])
  if (subject.paths.length === 0 || clip.paths.length === 0) {
    return { paths: [], unitsPerMillimeter }
  }
  return regionFromPaths(
    intersect(quantizeRegion(subject), quantizeRegion(clip), resolveFillRule(fillRule)),
    unitsPerMillimeter,
    true
  )
}

function resolveJoin(join: PlanarJoin | undefined): JoinType {
  switch (join ?? 'miter') {
    case 'miter': return JoinType.Miter
    case 'square': return JoinType.Square
    case 'bevel': return JoinType.Bevel
    case 'round': return JoinType.Round
    default: throw new PlanarKernelError(`Unsupported planar join: ${String(join)}`)
  }
}

function resolveEndCap(endCap: PlanarEndCap | undefined): EndType {
  switch (endCap ?? 'round') {
    case 'butt': return EndType.Butt
    case 'square': return EndType.Square
    case 'round': return EndType.Round
    default: throw new PlanarKernelError(`Unsupported planar end cap: ${String(endCap)}`)
  }
}

function resolveOffsetParameters(
  options: PlanarOffsetOptions,
  unitsPerMillimeter: number
): { join: JoinType; miterLimit: number; arcTolerance: number } {
  const miterLimit = options.miterLimit ?? 4
  if (!Number.isFinite(miterLimit) || miterLimit < 1) {
    throw new PlanarKernelError('miterLimit must be a finite number greater than or equal to 1')
  }

  const arcToleranceMm = options.arcTolerance ?? 0.01
  if (!Number.isFinite(arcToleranceMm) || arcToleranceMm <= 0) {
    throw new PlanarKernelError('arcTolerance must be a finite number greater than zero')
  }

  return {
    join: resolveJoin(options.join),
    miterLimit,
    arcTolerance: Math.max(1, Math.round(arcToleranceMm * unitsPerMillimeter))
  }
}

export function offsetPlanarRegion(
  region: PlanarRegion,
  delta: number,
  options: PlanarOffsetOptions = {}
): PlanarRegion {
  const unitsPerMillimeter = assertCompatibleRegions([region])
  if (!Number.isFinite(delta)) throw new PlanarKernelError('Offset delta must be finite')
  if (region.paths.length === 0 || delta === 0) {
    return regionFromPaths(quantizeRegion(region), unitsPerMillimeter)
  }

  const quantizedDelta = Math.round(delta * unitsPerMillimeter)
  if (quantizedDelta === 0) {
    throw new PlanarKernelError('Offset delta is smaller than the configured precision')
  }
  const parameters = resolveOffsetParameters(options, unitsPerMillimeter)
  const source = union(quantizeRegion(region), resolveFillRule(options.fillRule))
  const result = inflatePaths(
    source,
    quantizedDelta,
    parameters.join,
    EndType.Polygon,
    parameters.miterLimit,
    parameters.arcTolerance
  )
  return regionFromPaths(result, unitsPerMillimeter, true)
}

export function simplifyPlanarRegion(
  region: PlanarRegion,
  tolerance: number
): PlanarRegion {
  const unitsPerMillimeter = assertCompatibleRegions([region])
  if (!Number.isFinite(tolerance) || tolerance < 0) {
    throw new PlanarKernelError('Simplification tolerance must be a finite non-negative number')
  }
  if (region.paths.length === 0 || tolerance === 0) {
    return regionFromPaths(quantizeRegion(region), unitsPerMillimeter)
  }

  const quantizedTolerance = Math.max(1, Math.round(tolerance * unitsPerMillimeter))
  const simplified = simplifyPaths(
    quantizeRegion(region),
    quantizedTolerance,
    true
  )
  return regionFromPaths(
    union(simplified, FillRule.NonZero),
    unitsPerMillimeter,
    true
  )
}

export function strokePlanarPaths(
  paths: readonly (readonly Point2D[])[],
  width: number,
  options: PlanarStrokeOptions = {}
): PlanarRegion {
  const resolved = resolveOptions(options)
  if (!Number.isFinite(width) || width <= 0) {
    throw new PlanarKernelError('Stroke width must be a finite number greater than zero')
  }
  if (paths.length === 0) {
    return { paths: [], unitsPerMillimeter: resolved.unitsPerMillimeter }
  }

  const halfWidth = Math.round(width * resolved.unitsPerMillimeter / 2)
  if (halfWidth < 1) {
    throw new PlanarKernelError('Stroke width is smaller than the configured precision')
  }
  const parameters = resolveOffsetParameters(options, resolved.unitsPerMillimeter)
  const result = inflatePaths(
    paths.map((path, index) => (
      quantizeOpenPath(path, resolved.unitsPerMillimeter, `Open path ${index}`)
    )),
    halfWidth,
    parameters.join,
    resolveEndCap(options.endCap),
    parameters.miterLimit,
    parameters.arcTolerance
  )
  return regionFromPaths(
    union(result, resolved.fillRule),
    resolved.unitsPerMillimeter,
    true
  )
}

export function planarPathSignedArea(path: readonly Point2D[]): number {
  let doubleArea = 0
  for (let index = 0; index < path.length; index += 1) {
    const current = path[index]
    const next = path[(index + 1) % path.length]
    doubleArea += current.x * next.y - next.x * current.y
  }
  return doubleArea / 2
}

export function inspectPlanarRegion(region: PlanarRegion): PlanarRegionReport {
  const quantized = quantizeRegion(region)
  let doubleArea = 0
  let components = 0
  let holes = 0
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  for (let pathIndex = 0; pathIndex < region.paths.length; pathIndex += 1) {
    const path = quantized[pathIndex]
    const pathArea = signedArea64(path)
    doubleArea += pathArea * 2
    if (pathArea > 0) components += 1
    else holes += 1

    for (const point of path) {
      minX = Math.min(minX, point.x)
      minY = Math.min(minY, point.y)
      maxX = Math.max(maxX, point.x)
      maxY = Math.max(maxY, point.y)
    }
  }

  return {
    rings: region.paths.length,
    components,
    holes,
    area: doubleArea / (2 * region.unitsPerMillimeter * region.unitsPerMillimeter),
    bounds: region.paths.length === 0 ? null : {
      minX: minX / region.unitsPerMillimeter,
      minY: minY / region.unitsPerMillimeter,
      maxX: maxX / region.unitsPerMillimeter,
      maxY: maxY / region.unitsPerMillimeter,
      width: (maxX - minX) / region.unitsPerMillimeter,
      height: (maxY - minY) / region.unitsPerMillimeter
    }
  }
}

export function groupPlanarRegion(region: PlanarRegion): PlanarPolygon[] {
  const quantized = quantizeRegion(region)
  const outers = quantized
    .filter((path) => signedArea64(path) > 0)
    .map((outer) => ({ outer, holes: [] as Path64[] }))
  const holes = quantized.filter((path) => signedArea64(path) < 0)

  for (const hole of holes) {
    const testPoint = hole[0]
    let owner: typeof outers[number] | undefined
    let ownerArea = Number.POSITIVE_INFINITY

    for (const candidate of outers) {
      const containment = pointInPolygon(testPoint, candidate.outer)
      if (containment === PointInPolygonResult.IsOutside) continue
      const candidateArea = Math.abs(signedArea64(candidate.outer))
      if (candidateArea < ownerArea) {
        owner = candidate
        ownerArea = candidateArea
      }
    }

    if (!owner) {
      throw new PlanarKernelError('Planar region contains a hole without an enclosing outer ring')
    }
    owner.holes.push(hole)
  }

  return outers.map((polygon) => ({
    outer: dequantizePaths([polygon.outer], region.unitsPerMillimeter)[0],
    holes: dequantizePaths(
      canonicalizePaths(polygon.holes),
      region.unitsPerMillimeter
    )
  }))
}

/** Stable string suitable for replay snapshots and cache keys. */
export function fingerprintPlanarRegion(region: PlanarRegion): string {
  const canonical = regionFromPaths(quantizeRegion(region), region.unitsPerMillimeter)
  return JSON.stringify({
    unitsPerMillimeter: canonical.unitsPerMillimeter,
    paths: canonical.paths
  })
}
