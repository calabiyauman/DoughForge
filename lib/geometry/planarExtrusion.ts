import { ShapeUtils, Vector2 } from 'three'
import type { Geometry } from '../generators/CookieCutterGenerator'
import {
  fingerprintPlanarRegion,
  groupPlanarRegion,
  subtractPlanarRegions,
  unionPlanarRegions,
  type PlanarPolygon,
  type PlanarRegion
} from './planarKernel'

const AREA_EPSILON = 1e-10
const HEIGHT_EPSILON = 1e-9
const HEIGHT_KEY_SCALE = 1_000_000_000

export interface PlanarExtrusionOptions {
  bottom?: number
  top: number
}

export interface PlanarRegionSlab {
  bottom: number
  top: number
  region: PlanarRegion
}

interface Vertex3D {
  x: number
  y: number
  z: number
}

interface QuantizedPlanarPoint {
  x: number
  y: number
}

interface SplitSegmentPoint {
  point: QuantizedPlanarPoint
  progress: number
}

interface QuantizedPlanarSegment {
  key: string
  start: QuantizedPlanarPoint
  end: QuantizedPlanarPoint
}

type BoundarySplitMap = ReadonlyMap<string, readonly QuantizedPlanarPoint[]>

interface GeometryBuilder {
  vertices: number[]
  faces: number[]
  vertexByCoordinate: Map<string, number>
  unitsPerMillimeter: number
}

function triangleNormalY(first: Vertex3D, second: Vertex3D, third: Vertex3D): number {
  const edgeAX = second.x - first.x
  const edgeAZ = second.z - first.z
  const edgeBX = third.x - first.x
  const edgeBZ = third.z - first.z
  return edgeAZ * edgeBX - edgeAX * edgeBZ
}

function emptyRegion(unitsPerMillimeter: number): PlanarRegion {
  return { paths: [], unitsPerMillimeter }
}

function createBuilder(unitsPerMillimeter: number): GeometryBuilder {
  return {
    vertices: [],
    faces: [],
    vertexByCoordinate: new Map<string, number>(),
    unitsPerMillimeter
  }
}

function addVertex(
  builder: GeometryBuilder,
  point: { x: number; y: number },
  height: number
): number {
  const coordinateX = Math.round(point.x * builder.unitsPerMillimeter)
  const coordinateZ = Math.round(point.y * builder.unitsPerMillimeter)
  const coordinateY = Math.round(height * HEIGHT_KEY_SCALE)
  const key = `${coordinateX}:${coordinateY}:${coordinateZ}`
  const existing = builder.vertexByCoordinate.get(key)
  if (existing !== undefined) return existing

  const index = builder.vertices.length / 3
  builder.vertices.push(
    coordinateX / builder.unitsPerMillimeter,
    coordinateY / HEIGHT_KEY_SCALE,
    coordinateZ / builder.unitsPerMillimeter
  )
  builder.vertexByCoordinate.set(key, index)
  return index
}

function readVertex(builder: GeometryBuilder, index: number): Vertex3D {
  return {
    x: builder.vertices[index * 3],
    y: builder.vertices[index * 3 + 1],
    z: builder.vertices[index * 3 + 2]
  }
}

function addTriangle(
  builder: GeometryBuilder,
  first: number,
  second: number,
  third: number,
  expectedNormalY?: 1 | -1
): void {
  if (first === second || second === third || first === third) return
  let orderedSecond = second
  let orderedThird = third

  if (expectedNormalY) {
    const normalY = triangleNormalY(
      readVertex(builder, first),
      readVertex(builder, orderedSecond),
      readVertex(builder, orderedThird)
    )
    if (Math.abs(normalY) <= AREA_EPSILON) return
    if (Math.sign(normalY) !== expectedNormalY) {
      orderedSecond = third
      orderedThird = second
    }
  }

  builder.faces.push(first, orderedSecond, orderedThird)
}

function addPolygonCap(
  builder: GeometryBuilder,
  polygon: PlanarPolygon,
  height: number,
  expectedNormalY: 1 | -1,
  splitPoints: BoundarySplitMap
): void {
  const rings = [polygon.outer, ...polygon.holes].map((ring) => (
    refinePlanarRing(ring, splitPoints, builder.unitsPerMillimeter)
  ))
  const flattened = rings.flat()
  const indices = flattened.map((point) => addVertex(builder, point, height))
  const contour = rings[0].map((point) => new Vector2(point.x, point.y))
  const holes = rings.slice(1).map((hole) => (
    hole.map((point) => new Vector2(point.x, point.y))
  ))
  const triangles = ShapeUtils.triangulateShape(contour, holes)

  if (triangles.length === 0) {
    throw new Error('Planar region could not be triangulated')
  }

  for (const [first, second, third] of triangles) {
    addTriangle(
      builder,
      indices[first],
      indices[second],
      indices[third],
      expectedNormalY
    )
  }
}

function addRegionCap(
  builder: GeometryBuilder,
  region: PlanarRegion,
  height: number,
  expectedNormalY: 1 | -1,
  splitPoints: BoundarySplitMap = new Map()
): void {
  for (const polygon of groupPlanarRegion(region)) {
    addPolygonCap(builder, polygon, height, expectedNormalY, splitPoints)
  }
}

function quantizePlanarPoint(
  point: { x: number; y: number },
  unitsPerMillimeter: number
): QuantizedPlanarPoint {
  return {
    x: Math.round(point.x * unitsPerMillimeter),
    y: Math.round(point.y * unitsPerMillimeter)
  }
}

function planarPointKey(point: QuantizedPlanarPoint): string {
  return `${point.x}:${point.y}`
}

function planarSegmentKey(
  start: QuantizedPlanarPoint,
  end: QuantizedPlanarPoint
): string {
  return `${planarPointKey(start)}>${planarPointKey(end)}`
}

function greatestCommonDivisor(first: number, second: number): number {
  let a = Math.abs(first)
  let b = Math.abs(second)
  while (b !== 0) {
    const remainder = a % b
    a = b
    b = remainder
  }
  return a
}

function planarLineKey(
  start: QuantizedPlanarPoint,
  end: QuantizedPlanarPoint
): string {
  const deltaX = end.x - start.x
  const deltaY = end.y - start.y
  const divisor = greatestCommonDivisor(deltaX, deltaY)
  if (divisor === 0) return `point:${planarPointKey(start)}`
  let directionX = deltaX / divisor
  let directionY = deltaY / divisor
  if (directionX < 0 || (directionX === 0 && directionY < 0)) {
    directionX *= -1
    directionY *= -1
  }
  const offset = directionX * start.y - directionY * start.x
  return `${directionX}:${directionY}:${offset}`
}

function pointOnPlanarSegment(
  point: QuantizedPlanarPoint,
  start: QuantizedPlanarPoint,
  end: QuantizedPlanarPoint
): boolean {
  const cross = (end.x - start.x) * (point.y - start.y)
    - (end.y - start.y) * (point.x - start.x)
  return cross === 0
    && point.x >= Math.min(start.x, end.x)
    && point.x <= Math.max(start.x, end.x)
    && point.y >= Math.min(start.y, end.y)
    && point.y <= Math.max(start.y, end.y)
}

function segmentProgress(
  point: QuantizedPlanarPoint,
  start: QuantizedPlanarPoint,
  end: QuantizedPlanarPoint
): number {
  const deltaX = end.x - start.x
  const deltaY = end.y - start.y
  if (Math.abs(deltaX) >= Math.abs(deltaY)) {
    return Math.sign(deltaX) * (point.x - start.x)
  }
  return Math.sign(deltaY) * (point.y - start.y)
}

function splitPlanarSegment(
  startPoint: { x: number; y: number },
  endPoint: { x: number; y: number },
  candidates: readonly QuantizedPlanarPoint[],
  unitsPerMillimeter: number
): SplitSegmentPoint[] {
  const start = quantizePlanarPoint(startPoint, unitsPerMillimeter)
  const end = quantizePlanarPoint(endPoint, unitsPerMillimeter)
  const points = new Map<string, QuantizedPlanarPoint>([
    [planarPointKey(start), start],
    [planarPointKey(end), end]
  ])

  for (const candidate of candidates) {
    if (pointOnPlanarSegment(candidate, start, end)) {
      points.set(planarPointKey(candidate), candidate)
    }
  }

  return [...points.values()]
    .map((point) => ({
      point,
      progress: segmentProgress(point, start, end)
    }))
    .sort((first, second) => first.progress - second.progress)
}

function refinePlanarRing(
  ring: readonly { x: number; y: number }[],
  splitPoints: BoundarySplitMap,
  unitsPerMillimeter: number
): Array<{ x: number; y: number }> {
  const refined: Array<{ x: number; y: number }> = []
  for (let index = 0; index < ring.length; index += 1) {
    const start = ring[index]
    const end = ring[(index + 1) % ring.length]
    const quantizedStart = quantizePlanarPoint(start, unitsPerMillimeter)
    const quantizedEnd = quantizePlanarPoint(end, unitsPerMillimeter)
    const segmentPoints = splitPlanarSegment(
      start,
      end,
      splitPoints.get(planarSegmentKey(quantizedStart, quantizedEnd)) ?? [],
      unitsPerMillimeter
    )
    for (let pointIndex = 0; pointIndex < segmentPoints.length - 1; pointIndex += 1) {
      const { point } = segmentPoints[pointIndex]
      refined.push({
        x: point.x / unitsPerMillimeter,
        y: point.y / unitsPerMillimeter
      })
    }
  }
  return refined
}

function addNodedWallSegment(
  builder: GeometryBuilder,
  start: { x: number; y: number },
  end: { x: number; y: number },
  bottom: number,
  top: number,
  bottomSplitPoints: readonly QuantizedPlanarPoint[] = [],
  topSplitPoints: readonly QuantizedPlanarPoint[] = []
): void {
  const bottomPoints = splitPlanarSegment(
    start,
    end,
    bottomSplitPoints,
    builder.unitsPerMillimeter
  )
  const topPoints = splitPlanarSegment(
    start,
    end,
    topSplitPoints,
    builder.unitsPerMillimeter
  )
  const toPlanarPoint = (point: QuantizedPlanarPoint) => ({
    x: point.x / builder.unitsPerMillimeter,
    y: point.y / builder.unitsPerMillimeter
  })
  const bottomIndices = bottomPoints.map(({ point }) => (
    addVertex(builder, toPlanarPoint(point), bottom)
  ))
  const topIndices = topPoints.map(({ point }) => (
    addVertex(builder, toPlanarPoint(point), top)
  ))
  let bottomIndex = 0
  let topIndex = 0

  // The two horizontal edges may be noded differently by the interfaces above
  // and below this slab. Triangulate the vertical rectangle as a monotone
  // zipper so every boundary subdivision is retained without adding T-junctions.
  while (
    bottomIndex < bottomPoints.length - 1
    || topIndex < topPoints.length - 1
  ) {
    const nextBottom = bottomPoints[bottomIndex + 1]
    const nextTop = topPoints[topIndex + 1]

    if (!nextTop || (nextBottom && nextBottom.progress < nextTop.progress)) {
      addTriangle(
        builder,
        bottomIndices[bottomIndex],
        topIndices[topIndex],
        bottomIndices[bottomIndex + 1]
      )
      bottomIndex += 1
      continue
    }

    if (!nextBottom || nextTop.progress < nextBottom.progress) {
      addTriangle(
        builder,
        bottomIndices[bottomIndex],
        topIndices[topIndex],
        topIndices[topIndex + 1]
      )
      topIndex += 1
      continue
    }

    addTriangle(
      builder,
      bottomIndices[bottomIndex],
      topIndices[topIndex],
      bottomIndices[bottomIndex + 1]
    )
    addTriangle(
      builder,
      bottomIndices[bottomIndex + 1],
      topIndices[topIndex],
      topIndices[topIndex + 1]
    )
    bottomIndex += 1
    topIndex += 1
  }
}

function collectBoundarySplitPoints(
  region: PlanarRegion,
  interfaceRegions: readonly PlanarRegion[],
  unitsPerMillimeter: number
): BoundarySplitMap {
  const segmentsByLine = new Map<string, QuantizedPlanarSegment[]>()
  for (const path of region.paths) {
    for (let index = 0; index < path.length; index += 1) {
      const start = quantizePlanarPoint(path[index], unitsPerMillimeter)
      const end = quantizePlanarPoint(
        path[(index + 1) % path.length],
        unitsPerMillimeter
      )
      const segment = {
        key: planarSegmentKey(start, end),
        start,
        end
      }
      const lineKey = planarLineKey(start, end)
      const segments = segmentsByLine.get(lineKey)
      if (segments) segments.push(segment)
      else segmentsByLine.set(lineKey, [segment])
    }
  }

  const pointsBySegment = new Map<string, Map<string, QuantizedPlanarPoint>>()
  for (const interfaceRegion of interfaceRegions) {
    if (interfaceRegion.unitsPerMillimeter !== unitsPerMillimeter) {
      throw new RangeError('Planar regions use incompatible precision scales')
    }
    for (const path of interfaceRegion.paths) {
      for (let index = 0; index < path.length; index += 1) {
        const interfaceStart = quantizePlanarPoint(path[index], unitsPerMillimeter)
        const interfaceEnd = quantizePlanarPoint(
          path[(index + 1) % path.length],
          unitsPerMillimeter
        )
        const matchingSegments = segmentsByLine.get(
          planarLineKey(interfaceStart, interfaceEnd)
        ) ?? []

        for (const segment of matchingSegments) {
          for (const point of [interfaceStart, interfaceEnd]) {
            if (!pointOnPlanarSegment(point, segment.start, segment.end)) continue
            if (
              planarPointKey(point) === planarPointKey(segment.start)
              || planarPointKey(point) === planarPointKey(segment.end)
            ) {
              continue
            }
            const points = pointsBySegment.get(segment.key)
              ?? new Map<string, QuantizedPlanarPoint>()
            points.set(planarPointKey(point), point)
            pointsBySegment.set(segment.key, points)
          }
        }
      }
    }
  }

  return new Map([...pointsBySegment].map(([key, points]) => (
    [key, [...points.values()]]
  )))
}

function addRegionWalls(
  builder: GeometryBuilder,
  region: PlanarRegion,
  bottom: number,
  top: number,
  bottomSplitPoints: BoundarySplitMap = new Map(),
  topSplitPoints: BoundarySplitMap = new Map()
): void {
  for (const polygon of groupPlanarRegion(region)) {
    for (const ring of [polygon.outer, ...polygon.holes]) {
      for (let index = 0; index < ring.length; index += 1) {
        const nextIndex = (index + 1) % ring.length
        const quantizedStart = quantizePlanarPoint(
          ring[index],
          builder.unitsPerMillimeter
        )
        const quantizedEnd = quantizePlanarPoint(
          ring[nextIndex],
          builder.unitsPerMillimeter
        )
        const segmentKey = planarSegmentKey(quantizedStart, quantizedEnd)
        // Canonical paths keep material on the left side of every boundary.
        // This winding points both outer and hole walls away from the material.
        addNodedWallSegment(
          builder,
          ring[index],
          ring[nextIndex],
          bottom,
          top,
          bottomSplitPoints.get(segmentKey),
          topSplitPoints.get(segmentKey)
        )
      }
    }
  }
}

function finishGeometry(builder: GeometryBuilder): Geometry {
  return {
    vertices: new Float32Array(builder.vertices),
    faces: new Uint32Array(builder.faces)
  }
}

function heightKey(height: number, label: string): number {
  if (!Number.isFinite(height)) {
    throw new RangeError(`${label} must be finite`)
  }
  const key = Math.round(height * HEIGHT_KEY_SCALE)
  if (!Number.isSafeInteger(key)) {
    throw new RangeError(`${label} is outside the supported height range`)
  }
  return key
}

/**
 * Converts arbitrary overlapping solid contributions into a deterministic
 * piecewise-constant stack. Every output interval contains the planar union of
 * all contributions active throughout that height range.
 */
export function normalizePlanarRegionSlabs(
  input: readonly PlanarRegionSlab[]
): PlanarRegionSlab[] {
  if (input.length === 0) return []
  const unitsPerMillimeter = input[0].region.unitsPerMillimeter
  const contributions = input.map((slab, index) => {
    if (slab.region.unitsPerMillimeter !== unitsPerMillimeter) {
      throw new RangeError('Planar slabs use incompatible precision scales')
    }
    const bottomKey = heightKey(slab.bottom, `Planar slab ${index} bottom`)
    const topKey = heightKey(slab.top, `Planar slab ${index} top`)
    if (topKey <= bottomKey) {
      throw new RangeError(`Planar slab ${index} top must be greater than bottom`)
    }
    return { region: slab.region, bottomKey, topKey }
  })
  const heightKeys = [...new Set(contributions.flatMap((slab) => (
    [slab.bottomKey, slab.topKey]
  )))].sort((first, second) => first - second)
  const normalized: PlanarRegionSlab[] = []
  let previousFingerprint: string | undefined

  for (let index = 0; index < heightKeys.length - 1; index += 1) {
    const bottomKey = heightKeys[index]
    const topKey = heightKeys[index + 1]
    if (topKey <= bottomKey) continue
    const activeRegions = contributions
      .filter((slab) => slab.bottomKey <= bottomKey && slab.topKey >= topKey)
      .map((slab) => slab.region)
    if (activeRegions.length === 0) {
      previousFingerprint = undefined
      continue
    }

    const region = unionPlanarRegions(activeRegions)
    if (region.paths.length === 0) {
      previousFingerprint = undefined
      continue
    }
    const fingerprint = fingerprintPlanarRegion(region)
    const previous = normalized[normalized.length - 1]
    if (
      previous
      && heightKey(previous.top, 'Previous planar slab top') === bottomKey
      && previousFingerprint === fingerprint
    ) {
      previous.top = topKey / HEIGHT_KEY_SCALE
      continue
    }

    normalized.push({
      bottom: bottomKey / HEIGHT_KEY_SCALE,
      top: topKey / HEIGHT_KEY_SCALE,
      region
    })
    previousFingerprint = fingerprint
  }

  return normalized
}

function validateSlabs(input: readonly PlanarRegionSlab[]): PlanarRegionSlab[] {
  if (input.length === 0) return []
  const unitsPerMillimeter = input[0].region.unitsPerMillimeter
  const slabs: PlanarRegionSlab[] = []

  for (let index = 0; index < input.length; index += 1) {
    const slab = input[index]
    if (!Number.isFinite(slab.bottom) || !Number.isFinite(slab.top) || slab.top <= slab.bottom) {
      throw new RangeError(`Planar slab ${index} top must be finite and greater than bottom`)
    }
    if (slab.region.unitsPerMillimeter !== unitsPerMillimeter) {
      throw new RangeError('Planar slabs use incompatible precision scales')
    }

    const previous = slabs[slabs.length - 1]
    let bottom = slab.bottom
    if (previous) {
      if (bottom < previous.top - HEIGHT_EPSILON) {
        throw new RangeError('Planar slabs must be ordered and must not overlap')
      }
      if (Math.abs(bottom - previous.top) <= HEIGHT_EPSILON) bottom = previous.top
    }
    slabs.push({ ...slab, bottom })
  }

  return slabs
}

/** Extrudes a canonical planar region along DoughForge's vertical Y axis. */
export function extrudePlanarRegion(
  region: PlanarRegion,
  options: PlanarExtrusionOptions
): Geometry {
  const bottom = options.bottom ?? 0
  const top = options.top
  if (!Number.isFinite(bottom) || !Number.isFinite(top) || top <= bottom) {
    throw new RangeError('Planar extrusion top must be finite and greater than bottom')
  }

  const builder = createBuilder(region.unitsPerMillimeter)
  addRegionCap(builder, region, bottom, -1)
  addRegionCap(builder, region, top, 1)
  addRegionWalls(builder, region, bottom, top)
  return finishGeometry(builder)
}

/**
 * Meshes the boundary of a stack of piecewise-constant planar regions.
 *
 * Adjacent slabs share vertical-wall vertices. At an interface, only material
 * present on one side receives a horizontal cap, so the result contains no
 * coincident internal caps and does not rely on overlapping closed prisms.
 */
export function extrudeStackedPlanarRegions(
  input: readonly PlanarRegionSlab[]
): Geometry {
  const slabs = validateSlabs(input)
  if (slabs.length === 0) {
    return { vertices: new Float32Array(), faces: new Uint32Array() }
  }

  const unitsPerMillimeter = slabs[0].region.unitsPerMillimeter
  const builder = createBuilder(unitsPerMillimeter)
  const empty = emptyRegion(unitsPerMillimeter)
  const exposedBottoms: PlanarRegion[] = []
  const exposedTops: PlanarRegion[] = []

  for (let index = 0; index < slabs.length; index += 1) {
    const slab = slabs[index]
    const previous = slabs[index - 1]
    const below = previous && Math.abs(previous.top - slab.bottom) <= HEIGHT_EPSILON
      ? previous.region
      : empty
    const next = slabs[index + 1]
    const above = next && Math.abs(next.bottom - slab.top) <= HEIGHT_EPSILON
      ? next.region
      : empty
    exposedBottoms.push(subtractPlanarRegions(slab.region, below))
    exposedTops.push(subtractPlanarRegions(slab.region, above))
  }

  for (let index = 0; index < slabs.length; index += 1) {
    const slab = slabs[index]
    if (slab.region.paths.length === 0) continue
    const previous = slabs[index - 1]
    const next = slabs[index + 1]
    const bottomInterfaceRegions = [slab.region, exposedBottoms[index]]
    if (previous && Math.abs(previous.top - slab.bottom) <= HEIGHT_EPSILON) {
      bottomInterfaceRegions.push(previous.region, exposedTops[index - 1])
    }
    const topInterfaceRegions = [slab.region, exposedTops[index]]
    if (next && Math.abs(next.bottom - slab.top) <= HEIGHT_EPSILON) {
      topInterfaceRegions.push(next.region, exposedBottoms[index + 1])
    }

    const bottomWallSplits = collectBoundarySplitPoints(
      slab.region,
      bottomInterfaceRegions,
      unitsPerMillimeter
    )
    const topWallSplits = collectBoundarySplitPoints(
      slab.region,
      topInterfaceRegions,
      unitsPerMillimeter
    )

    addRegionWalls(
      builder,
      slab.region,
      slab.bottom,
      slab.top,
      bottomWallSplits,
      topWallSplits
    )
    if (exposedBottoms[index].paths.length > 0) {
      addRegionCap(
        builder,
        exposedBottoms[index],
        slab.bottom,
        -1,
        collectBoundarySplitPoints(
          exposedBottoms[index],
          bottomInterfaceRegions,
          unitsPerMillimeter
        )
      )
    }
    if (exposedTops[index].paths.length > 0) {
      addRegionCap(
        builder,
        exposedTops[index],
        slab.top,
        1,
        collectBoundarySplitPoints(
          exposedTops[index],
          topInterfaceRegions,
          unitsPerMillimeter
        )
      )
    }
  }

  return finishGeometry(builder)
}
