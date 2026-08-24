import {
  assertValidDesignSpec,
  type ClosedContour,
  type DesignRole,
  type DesignSpec,
  type OpenStroke,
  type Point2D,
  type Transform2D
} from '../design'
import {
  CookieCutterGenerator,
  type Geometry
} from './CookieCutterGenerator'
import type { Profile, ProfilePoint } from './ProfileGenerator'
import {
  extrudePlanarRegion,
  extrudeStackedPlanarRegions,
  normalizePlanarRegionSlabs,
  type PlanarRegionSlab
} from '../geometry/planarExtrusion'
import {
  createPlanarRegion,
  intersectPlanarRegions,
  offsetPlanarRegion,
  planarPathSignedArea,
  simplifyPlanarRegion,
  subtractPlanarRegions,
  strokePlanarPaths,
  type PlanarRegion
} from '../geometry/planarKernel'
import { analyzeMesh } from '../geometry/meshValidation'
import { sweepProfileOverPlanarRegion } from '../geometry/profiledPlanarSweep'

const EPSILON = 1e-6
const OPTIMIZATION_TOLERANCE = 0.01
const IDENTITY_TRANSFORM: Transform2D = [1, 0, 0, 1, 0, 0]
const DESIGN_ROLES: readonly DesignRole[] = ['cut', 'stamp', 'emboss', 'support', 'handle']

export interface Bounds2D {
  minX: number
  minY: number
  maxX: number
  maxY: number
  width: number
  height: number
}

export interface Bounds3D {
  minX: number
  minY: number
  minZ: number
  maxX: number
  maxY: number
  maxZ: number
}

export interface GeneratedElementMetadata {
  id: string
  sourceIds: string[]
  assemblyId: string
  partId: string
  kind: 'closed-contour' | 'open-stroke'
  role: DesignRole
  height: number
  thickness: number
  minimumCrossSectionWidth?: number
  profileBands?: number
  maximumProfileError?: number
  bounds: Bounds3D
}

export interface MeshQualityMetadata {
  watertight: boolean
  connectedComponents: number
  boundaryEdges: number
  nonManifoldEdges: number
  inconsistentWindingEdges: number
  degenerateTriangles: number
  duplicateTriangles: number
}

export interface GeneratedAssemblyMetadata {
  id: string
  partIds: string[]
  sourceIds: string[]
  vertexStart: number
  vertexCount: number
  triangleStart: number
  triangleCount: number
  bounds: Bounds3D
  meshQuality: MeshQualityMetadata
}

export type ProductionReadinessReasonCode =
  | 'skipped-elements'
  | 'mesh-topology'
  | 'disconnected-assembly'
  | 'weak-attachment'
  | 'manufacturing-constraints'
  | 'cross-assembly-collision'
  | 'multipart-export-unsupported'

export interface ProductionReadinessReason {
  code: ProductionReadinessReasonCode
  message: string
  assemblyId?: string
}

export interface StructuredGenerationMetadata {
  vertices: number
  faces: number
  scale: number
  optimized: boolean
  generatedElements: number
  skippedElements: number
  roleCounts: Record<DesignRole, number>
  roleHeights: Record<DesignRole, number>
  sourceBounds: Bounds2D
  elements: GeneratedElementMetadata[]
  assemblies: GeneratedAssemblyMetadata[]
  meshQuality: MeshQualityMetadata
  productionReadiness: {
    ready: boolean
    reasons: ProductionReadinessReason[]
  }
  warnings: string[]
}

export interface StructuredCookieCutter {
  geometry: Geometry
  metadata: StructuredGenerationMetadata
}

export interface StructuredGeneratorOptions {
  design: DesignSpec
  profile: Profile
  /** Scales the fitted X/Z footprint without changing physical profile heights. */
  scale?: number
  optimize?: boolean
  smoothCorners?: boolean
  cornerRadius?: number
  angleThreshold?: number
}

interface TransformedElement {
  source: ClosedContour | OpenStroke
  points: Point2D[]
  localWidthScale: number
  assemblyId: string
  partId: string
  instanceId: string
}

type TransformedClosedElement = TransformedElement & {
  source: ClosedContour
}

interface SolidContribution {
  assemblyId: string
  partId: string
  sourceIds: string[]
  slabs: PlanarRegionSlab[]
  metadata: GeneratedElementMetadata
}

interface QuantizedPoint2D {
  x: number
  y: number
}

interface FitTransform {
  scaleX: number
  scaleY: number
  centerX: number
  centerY: number
}

interface RoleGeometryDefinition {
  height: number
  thickness: number
  profile: Profile
}

function multiplyTransforms(left: Transform2D, right: Transform2D): Transform2D {
  const [a1, b1, c1, d1, e1, f1] = left
  const [a2, b2, c2, d2, e2, f2] = right
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1
  ]
}

function applyTransform(point: Point2D, transform: Transform2D): Point2D {
  const [a, b, c, d, e, f] = transform
  return {
    x: a * point.x + c * point.y + e,
    y: b * point.x + d * point.y + f
  }
}

function transformWidthScale(transform: Transform2D): number {
  const [a, b, c, d] = transform
  const determinantScale = Math.sqrt(Math.abs(a * d - b * c))
  if (determinantScale > EPSILON) return determinantScale

  const firstAxisScale = Math.hypot(a, b)
  const secondAxisScale = Math.hypot(c, d)
  return Math.max(firstAxisScale, secondAxisScale, EPSILON)
}

function createRoleCounts(): Record<DesignRole, number> {
  return {
    cut: 0,
    stamp: 0,
    emboss: 0,
    support: 0,
    handle: 0
  }
}

function boundsFromElements(
  design: DesignSpec,
  elements: readonly TransformedElement[]
): Bounds2D {
  // Preserve intentional authoring-canvas whitespace while still expanding the
  // fit frame for transformed parts that move beyond that canvas.
  let minX = design.canvas.origin.x
  let minY = design.canvas.origin.y
  let maxX = design.canvas.origin.x + design.canvas.size.width
  let maxY = design.canvas.origin.y + design.canvas.size.height

  for (const element of elements) {
    for (const point of element.points) {
      minX = Math.min(minX, point.x)
      minY = Math.min(minY, point.y)
      maxX = Math.max(maxX, point.x)
      maxY = Math.max(maxY, point.y)
    }
  }

  if (![minX, minY, maxX, maxY].every(Number.isFinite)) {
    throw new Error('The design does not contain finite geometry bounds')
  }

  const width = maxX - minX
  const height = maxY - minY
  if (width <= EPSILON && height <= EPSILON) {
    throw new Error('The design content has no measurable width or height')
  }

  return { minX, minY, maxX, maxY, width, height }
}

function createFitTransform(design: DesignSpec, bounds: Bounds2D, scale: number): FitTransform {
  const widthRatio = bounds.width > EPSILON
    ? design.target.size.width / bounds.width
    : Number.POSITIVE_INFINITY
  const heightRatio = bounds.height > EPSILON
    ? design.target.size.height / bounds.height
    : Number.POSITIVE_INFINITY

  let scaleX: number
  let scaleY: number
  if (design.target.fit === 'contain') {
    const uniformScale = Math.min(widthRatio, heightRatio)
    const finiteScale = Number.isFinite(uniformScale)
      ? uniformScale
      : Math.max(
        Number.isFinite(widthRatio) ? widthRatio : 0,
        Number.isFinite(heightRatio) ? heightRatio : 0
      )
    scaleX = finiteScale * scale
    scaleY = finiteScale * scale
  } else {
    const fallbackScale = Math.min(widthRatio, heightRatio)
    const finiteFallback = Number.isFinite(fallbackScale) ? fallbackScale : 1
    scaleX = (Number.isFinite(widthRatio) ? widthRatio : finiteFallback) * scale
    scaleY = (Number.isFinite(heightRatio) ? heightRatio : finiteFallback) * scale
  }

  if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY) || scaleX <= 0 || scaleY <= 0) {
    throw new Error('Unable to fit the design into its target dimensions')
  }

  return {
    scaleX,
    scaleY,
    centerX: (bounds.minX + bounds.maxX) / 2,
    centerY: (bounds.minY + bounds.maxY) / 2
  }
}

function fitPoint(point: Point2D, fit: FitTransform): Point2D {
  return {
    x: (point.x - fit.centerX) * fit.scaleX,
    y: (point.y - fit.centerY) * fit.scaleY
  }
}

function rectangularProfile(type: string, thickness: number, height: number): Profile {
  const halfThickness = thickness / 2
  const points: ProfilePoint[] = [
    { x: -halfThickness, y: 0 },
    { x: -halfThickness, y: height },
    { x: halfThickness, y: height },
    { x: halfThickness, y: 0 }
  ]

  return {
    type,
    points,
    metadata: {
      wallThickness: thickness,
      height,
      description: `${type} rectangular detail profile`
    }
  }
}

function maximumDetailHeight(
  cutHeight: number,
  desiredHeight: number,
  minimumFeatureSize: number,
  clearance: number
): number {
  const availableHeight = Math.max(EPSILON * 10, cutHeight - clearance)
  return Math.min(Math.max(minimumFeatureSize, desiredHeight), availableHeight)
}

function createRoleDefinitions(
  design: DesignSpec,
  profile: Profile
): Record<DesignRole, RoleGeometryDefinition> {
  const preparedProfile = CookieCutterGenerator.prepareProfile(profile)
  const profileYs = preparedProfile.map((point) => point.y)
  const profileXs = preparedProfile.map((point) => point.x)
  const cutHeight = Math.max(...profileYs) - Math.min(...profileYs)
  if (cutHeight <= EPSILON) throw new Error('The selected profile must have a positive height')

  const minimumWall = design.constraints.minimumWallThickness
  const minimumFeature = design.constraints.minimumFeatureSize
  const clearance = design.constraints.minimumClearance
  const flangeHeight = profile.metadata.outerHeight
    ?? Math.min(cutHeight * 0.2, Math.max(minimumFeature, cutHeight * 0.1))
  const cutThickness = profile.metadata.wallThickness
    ?? Math.max(...profileXs) - Math.min(...profileXs)

  const stampThickness = Math.max(minimumWall, minimumFeature)
  const embossThickness = Math.max(minimumWall, minimumFeature * 1.25)
  const supportThickness = Math.max(minimumWall * 1.5, minimumFeature)
  const handleThickness = Math.max(minimumWall * 2, minimumFeature * 1.5)
  const heights: Record<DesignRole, number> = {
    cut: cutHeight,
    stamp: maximumDetailHeight(cutHeight, cutHeight * 0.68, minimumFeature, clearance),
    emboss: maximumDetailHeight(cutHeight, cutHeight * 0.55, minimumFeature, clearance),
    support: Math.min(cutHeight * 0.3, Math.max(minimumFeature, flangeHeight)),
    handle: Math.min(cutHeight * 0.5, Math.max(minimumFeature, flangeHeight))
  }

  return {
    cut: {
      height: heights.cut,
      thickness: cutThickness,
      profile
    },
    stamp: {
      height: heights.stamp,
      thickness: stampThickness,
      profile: rectangularProfile('structured-stamp', stampThickness, heights.stamp)
    },
    emboss: {
      height: heights.emboss,
      thickness: embossThickness,
      profile: rectangularProfile('structured-emboss', embossThickness, heights.emboss)
    },
    support: {
      height: heights.support,
      thickness: supportThickness,
      profile: rectangularProfile('structured-support', supportThickness, heights.support)
    },
    handle: {
      height: heights.handle,
      thickness: handleThickness,
      profile: rectangularProfile('structured-handle', handleThickness, heights.handle)
    }
  }
}

function normalizeVector(x: number, y: number): Point2D {
  const length = Math.hypot(x, y)
  if (length <= EPSILON) throw new Error('Open stroke contains a zero-length segment')
  return { x: x / length, y: y / length }
}

function cleanOpenStroke(points: readonly Point2D[]): Point2D[] {
  const cleaned: Point2D[] = []
  for (const point of points) {
    const previous = cleaned[cleaned.length - 1]
    if (!previous || Math.hypot(point.x - previous.x, point.y - previous.y) > EPSILON) {
      cleaned.push({ x: point.x, y: point.y })
    }
  }
  if (cleaned.length < 2) throw new Error('Open stroke must contain at least two distinct points')
  return cleaned
}

function createRibbonGeometry(
  inputPoints: readonly Point2D[],
  width: number,
  height: number,
  lineCap: OpenStroke['lineCap']
): Geometry {
  const points = cleanOpenStroke(inputPoints)
  const halfWidth = width / 2
  const segmentDirections: Point2D[] = []
  const segmentNormals: Point2D[] = []

  for (let index = 0; index < points.length - 1; index += 1) {
    const direction = normalizeVector(
      points[index + 1].x - points[index].x,
      points[index + 1].y - points[index].y
    )
    segmentDirections.push(direction)
    segmentNormals.push({ x: -direction.y, y: direction.x })
  }

  if (lineCap === 'square') {
    const firstDirection = segmentDirections[0]
    const lastDirection = segmentDirections[segmentDirections.length - 1]
    points[0] = {
      x: points[0].x - firstDirection.x * halfWidth,
      y: points[0].y - firstDirection.y * halfWidth
    }
    const lastIndex = points.length - 1
    points[lastIndex] = {
      x: points[lastIndex].x + lastDirection.x * halfWidth,
      y: points[lastIndex].y + lastDirection.y * halfWidth
    }
  }

  const left: Point2D[] = []
  const right: Point2D[] = []
  for (let index = 0; index < points.length; index += 1) {
    if (index === 0 || index === points.length - 1) {
      const normal = index === 0
        ? segmentNormals[0]
        : segmentNormals[segmentNormals.length - 1]
      left.push({
        x: points[index].x + normal.x * halfWidth,
        y: points[index].y + normal.y * halfWidth
      })
      right.push({
        x: points[index].x - normal.x * halfWidth,
        y: points[index].y - normal.y * halfWidth
      })
      continue
    }

    const previousNormal = segmentNormals[index - 1]
    const nextNormal = segmentNormals[index]
    const summedX = previousNormal.x + nextNormal.x
    const summedY = previousNormal.y + nextNormal.y
    const summedLength = Math.hypot(summedX, summedY)
    const miter = summedLength > EPSILON
      ? { x: summedX / summedLength, y: summedY / summedLength }
      : nextNormal
    const denominator = miter.x * nextNormal.x + miter.y * nextNormal.y
    const rawMiterScale = Math.abs(denominator) > EPSILON ? 1 / denominator : 1
    const miterScale = Math.max(-4, Math.min(4, rawMiterScale)) * halfWidth

    left.push({
      x: points[index].x + miter.x * miterScale,
      y: points[index].y + miter.y * miterScale
    })
    right.push({
      x: points[index].x - miter.x * miterScale,
      y: points[index].y - miter.y * miterScale
    })
  }

  const vertices: number[] = []
  const faces: number[] = []
  const rings: Array<{ leftBottom: number; rightBottom: number; leftTop: number; rightTop: number }> = []

  const addVertex = (point: Point2D, y: number): number => {
    const index = vertices.length / 3
    vertices.push(point.x, y, point.y)
    return index
  }

  const addTriangle = (first: number, second: number, third: number): void => {
    if (first === second || second === third || first === third) return

    const ax = vertices[second * 3] - vertices[first * 3]
    const ay = vertices[second * 3 + 1] - vertices[first * 3 + 1]
    const az = vertices[second * 3 + 2] - vertices[first * 3 + 2]
    const bx = vertices[third * 3] - vertices[first * 3]
    const by = vertices[third * 3 + 1] - vertices[first * 3 + 1]
    const bz = vertices[third * 3 + 2] - vertices[first * 3 + 2]
    const crossX = ay * bz - az * by
    const crossY = az * bx - ax * bz
    const crossZ = ax * by - ay * bx
    if (Math.hypot(crossX, crossY, crossZ) > EPSILON) faces.push(first, second, third)
  }

  for (let index = 0; index < points.length; index += 1) {
    rings.push({
      leftBottom: addVertex(left[index], 0),
      rightBottom: addVertex(right[index], 0),
      leftTop: addVertex(left[index], height),
      rightTop: addVertex(right[index], height)
    })
  }

  for (let index = 0; index < rings.length - 1; index += 1) {
    const current = rings[index]
    const next = rings[index + 1]

    addTriangle(current.leftTop, next.leftTop, next.rightTop)
    addTriangle(current.leftTop, next.rightTop, current.rightTop)
    addTriangle(current.leftBottom, next.rightBottom, next.leftBottom)
    addTriangle(current.leftBottom, current.rightBottom, next.rightBottom)
    addTriangle(current.leftBottom, next.leftBottom, next.leftTop)
    addTriangle(current.leftBottom, next.leftTop, current.leftTop)
    addTriangle(current.rightBottom, current.rightTop, next.rightTop)
    addTriangle(current.rightBottom, next.rightTop, next.rightBottom)
  }

  const addButtCap = (
    ring: typeof rings[number],
    atStart: boolean
  ): void => {
    if (atStart) {
      addTriangle(ring.leftBottom, ring.leftTop, ring.rightTop)
      addTriangle(ring.leftBottom, ring.rightTop, ring.rightBottom)
    } else {
      addTriangle(ring.leftBottom, ring.rightBottom, ring.rightTop)
      addTriangle(ring.leftBottom, ring.rightTop, ring.leftTop)
    }
  }

  const addRoundCap = (
    ring: typeof rings[number],
    center: Point2D,
    direction: Point2D,
    normal: Point2D,
    atStart: boolean
  ): void => {
    const segments = 8
    const bottomArc: number[] = [ring.leftBottom]
    const topArc: number[] = [ring.leftTop]

    for (let segment = 1; segment < segments; segment += 1) {
      const t = segment / segments
      const angle = atStart
        ? Math.PI / 2 + Math.PI * t
        : Math.PI / 2 - Math.PI * t
      const point = {
        x: center.x + direction.x * Math.cos(angle) * halfWidth
          + normal.x * Math.sin(angle) * halfWidth,
        y: center.y + direction.y * Math.cos(angle) * halfWidth
          + normal.y * Math.sin(angle) * halfWidth
      }
      bottomArc.push(addVertex(point, 0))
      topArc.push(addVertex(point, height))
    }

    bottomArc.push(ring.rightBottom)
    topArc.push(ring.rightTop)

    for (let index = 0; index < bottomArc.length - 1; index += 1) {
      addTriangle(bottomArc[index], bottomArc[index + 1], topArc[index + 1])
      addTriangle(bottomArc[index], topArc[index + 1], topArc[index])
    }

    for (let index = 1; index < topArc.length - 1; index += 1) {
      addTriangle(topArc[0], topArc[index], topArc[index + 1])
      addTriangle(bottomArc[0], bottomArc[index + 1], bottomArc[index])
    }
  }

  if (lineCap === 'round') {
    addRoundCap(
      rings[0],
      points[0],
      segmentDirections[0],
      segmentNormals[0],
      true
    )
    const lastRingIndex = rings.length - 1
    addRoundCap(
      rings[lastRingIndex],
      points[lastRingIndex],
      segmentDirections[segmentDirections.length - 1],
      segmentNormals[segmentNormals.length - 1],
      false
    )
  } else {
    addButtCap(rings[0], true)
    addButtCap(rings[rings.length - 1], false)
  }

  return {
    vertices: new Float32Array(vertices),
    faces: new Uint32Array(faces)
  }
}

function geometryBounds(geometry: Geometry): Bounds3D {
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let minZ = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  let maxZ = Number.NEGATIVE_INFINITY

  for (let index = 0; index < geometry.vertices.length; index += 3) {
    const x = geometry.vertices[index]
    const y = geometry.vertices[index + 1]
    const z = geometry.vertices[index + 2]
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    minZ = Math.min(minZ, z)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
    maxZ = Math.max(maxZ, z)
  }

  return { minX, minY, minZ, maxX, maxY, maxZ }
}

function validateGeneratedGeometry(geometry: Geometry): void {
  if (geometry.vertices.length === 0 || geometry.vertices.length % 3 !== 0) {
    throw new Error('Generated geometry has an invalid vertex buffer')
  }
  if (geometry.faces.length === 0 || geometry.faces.length % 3 !== 0) {
    throw new Error('Generated geometry has an invalid face buffer')
  }
  if (!Array.from(geometry.vertices).every(Number.isFinite)) {
    throw new Error('Generated geometry contains a non-finite vertex')
  }

  const vertexCount = geometry.vertices.length / 3
  for (const index of geometry.faces) {
    if (index >= vertexCount) throw new Error('Generated geometry contains an invalid face index')
  }
}

function mergeGeometry(
  targetVertices: number[],
  targetFaces: number[],
  geometry: Geometry
): void {
  const vertexOffset = targetVertices.length / 3
  if (vertexOffset + geometry.vertices.length / 3 > 0xffffffff) {
    throw new RangeError('Merged geometry exceeds the Uint32 index limit')
  }

  // Avoid spreading a large typed array into Function#apply-style arguments.
  // Dense imported paths can exceed the JavaScript engine's argument limit.
  for (const coordinate of geometry.vertices) targetVertices.push(coordinate)
  for (const faceIndex of geometry.faces) targetFaces.push(faceIndex + vertexOffset)
}

function summarizeMeshQuality(geometry: Geometry): MeshQualityMetadata {
  const report = analyzeMesh(geometry)
  return {
    watertight: report.isWatertight,
    connectedComponents: report.connectedComponentCount,
    boundaryEdges: report.boundaryEdges.length,
    nonManifoldEdges: report.nonManifoldEdges.length,
    inconsistentWindingEdges: report.inconsistentlyOrientedEdges.length,
    degenerateTriangles: report.degenerateTriangleIndices.length,
    duplicateTriangles: report.duplicateTriangles.length
  }
}

function slabCollectionsCollide(
  first: readonly PlanarRegionSlab[],
  second: readonly PlanarRegionSlab[]
): boolean {
  for (const firstSlab of first) {
    for (const secondSlab of second) {
      const verticalOverlap = Math.min(firstSlab.top, secondSlab.top)
        - Math.max(firstSlab.bottom, secondSlab.bottom)
      if (verticalOverlap <= EPSILON) continue
      if (intersectPlanarRegions(firstSlab.region, secondSlab.region).paths.length > 0) {
        return true
      }
      if (regionBoundariesIntersectOrTouch(firstSlab.region, secondSlab.region)) {
        return true
      }
    }
  }
  return false
}

function contributionsHavePrintableAttachment(
  first: SolidContribution,
  second: SolidContribution,
  minimumFeatureSize: number
): boolean {
  for (const firstSlab of first.slabs) {
    for (const secondSlab of second.slabs) {
      const verticalOverlap = Math.min(firstSlab.top, secondSlab.top)
        - Math.max(firstSlab.bottom, secondSlab.bottom)
      const verticalSeparation = -verticalOverlap
      if (verticalSeparation > EPSILON) continue
      const intersection = intersectPlanarRegions(firstSlab.region, secondSlab.region)
      if (intersection.paths.length > 0) {
        try {
          const precisionAllowance = 1 / intersection.unitsPerMillimeter
          const erosion = Math.max(
            0,
            minimumFeatureSize / 2 - precisionAllowance
          )
          if (erosion === 0) return true
          const printableCore = offsetPlanarRegion(
            intersection,
            -erosion,
            { join: 'miter', miterLimit: 4 }
          )
          if (printableCore.paths.length > 0) return true
        } catch {
          // A collapsed inward offset is intentionally treated as a weak bond.
        }
      }
      if (
        verticalOverlap + EPSILON >= minimumFeatureSize
        && sharedRegionBoundaryLength(firstSlab.region, secondSlab.region) + EPSILON
          >= minimumFeatureSize
      ) {
        return true
      }
    }
  }
  return false
}

function countContributionAttachmentGroups(
  contributions: readonly SolidContribution[],
  minimumFeatureSize: number
): number {
  if (contributions.length === 0) return 0
  const parent = contributions.map((_, index) => index)
  const find = (index: number): number => {
    if (parent[index] === index) return index
    parent[index] = find(parent[index])
    return parent[index]
  }
  const connect = (first: number, second: number): void => {
    const firstRoot = find(first)
    const secondRoot = find(second)
    if (firstRoot !== secondRoot) parent[Math.max(firstRoot, secondRoot)] = Math.min(firstRoot, secondRoot)
  }

  for (let first = 0; first < contributions.length; first += 1) {
    for (let second = first + 1; second < contributions.length; second += 1) {
      if (contributionsHavePrintableAttachment(
        contributions[first],
        contributions[second],
        minimumFeatureSize
      )) {
        connect(first, second)
      }
    }
  }

  return new Set(contributions.map((_, index) => find(index))).size
}

/**
 * Verifies that the complete 3D assembly retains one connected structural
 * core after every planar slice is eroded by half the minimum feature width.
 * Auditing the full stack preserves alternate connections at other heights.
 */
function lacksPrintableStructuralCore(
  slabs: readonly PlanarRegionSlab[],
  minimumFeatureSize: number,
  originalComponentCount: number
): boolean {
  if (slabs.length === 0 || originalComponentCount !== 1) return false
  const precisionAllowance = 1 / slabs[0].region.unitsPerMillimeter
  const erosion = Math.max(0, minimumFeatureSize / 2 - precisionAllowance)
  if (erosion <= 0) return false

  try {
    const erodedSlabs = slabs.flatMap((slab): PlanarRegionSlab[] => {
      const region = offsetPlanarRegion(
        slab.region,
        -erosion,
        { join: 'round', miterLimit: 4 }
      )
      return region.paths.length > 0 ? [{ ...slab, region }] : []
    })
    if (erodedSlabs.length === 0) return true

    const erodedGeometry = extrudeStackedPlanarRegions(erodedSlabs)
    if (erodedGeometry.faces.length === 0) return true
    const erodedQuality = analyzeMesh(erodedGeometry)
    return !erodedQuality.isWatertight
      || erodedQuality.connectedComponentCount !== 1
  } catch {
    // Offset or meshing failure means the printable core cannot be proven.
    return true
  }
}

function collectTransformedElements(design: DesignSpec): TransformedElement[] {
  const geometryById = new Map<string, ClosedContour | OpenStroke>()
  for (const contour of design.contours) geometryById.set(contour.id, contour)
  for (const stroke of design.strokes) geometryById.set(stroke.id, stroke)

  const partById = new Map(design.parts.map((part) => [part.id, part]))
  const elements: TransformedElement[] = []

  for (const assembly of design.assemblies) {
    const assemblyTransform = assembly.transform ?? IDENTITY_TRANSFORM
    for (const partId of assembly.partIds) {
      const part = partById.get(partId)
      if (!part) continue
      const transform = multiplyTransforms(
        assemblyTransform,
        part.transform ?? IDENTITY_TRANSFORM
      )
      const localWidthScale = transformWidthScale(transform)

      for (const geometryId of part.geometryIds) {
        const source = geometryById.get(geometryId)
        if (!source) continue
        elements.push({
          source,
          points: source.points.map((point) => applyTransform(point, transform)),
          localWidthScale,
          assemblyId: assembly.id,
          partId: part.id,
          instanceId: `${assembly.id}/${part.id}`
        })
      }
    }
  }

  return elements
}

function quantizeRegionPath(
  path: readonly Point2D[],
  unitsPerMillimeter: number
): QuantizedPoint2D[] {
  return path.map((point) => ({
    x: Math.round(point.x * unitsPerMillimeter),
    y: Math.round(point.y * unitsPerMillimeter)
  }))
}

function crossProduct(
  first: QuantizedPoint2D,
  second: QuantizedPoint2D,
  third: QuantizedPoint2D
): number {
  return (second.x - first.x) * (third.y - first.y)
    - (second.y - first.y) * (third.x - first.x)
}

function isPointOnSegment(
  point: QuantizedPoint2D,
  start: QuantizedPoint2D,
  end: QuantizedPoint2D
): boolean {
  return crossProduct(start, end, point) === 0
    && point.x >= Math.min(start.x, end.x)
    && point.x <= Math.max(start.x, end.x)
    && point.y >= Math.min(start.y, end.y)
    && point.y <= Math.max(start.y, end.y)
}

function segmentsIntersectOrTouch(
  firstStart: QuantizedPoint2D,
  firstEnd: QuantizedPoint2D,
  secondStart: QuantizedPoint2D,
  secondEnd: QuantizedPoint2D
): boolean {
  if (
    Math.max(firstStart.x, firstEnd.x) < Math.min(secondStart.x, secondEnd.x)
    || Math.max(secondStart.x, secondEnd.x) < Math.min(firstStart.x, firstEnd.x)
    || Math.max(firstStart.y, firstEnd.y) < Math.min(secondStart.y, secondEnd.y)
    || Math.max(secondStart.y, secondEnd.y) < Math.min(firstStart.y, firstEnd.y)
  ) {
    return false
  }

  const firstSide = crossProduct(firstStart, firstEnd, secondStart)
  const secondSide = crossProduct(firstStart, firstEnd, secondEnd)
  const thirdSide = crossProduct(secondStart, secondEnd, firstStart)
  const fourthSide = crossProduct(secondStart, secondEnd, firstEnd)

  if (firstSide === 0 && isPointOnSegment(secondStart, firstStart, firstEnd)) return true
  if (secondSide === 0 && isPointOnSegment(secondEnd, firstStart, firstEnd)) return true
  if (thirdSide === 0 && isPointOnSegment(firstStart, secondStart, secondEnd)) return true
  if (fourthSide === 0 && isPointOnSegment(firstEnd, secondStart, secondEnd)) return true

  return (firstSide > 0) !== (secondSide > 0)
    && (thirdSide > 0) !== (fourthSide > 0)
}

function regionBoundariesIntersectOrTouch(
  first: PlanarRegion,
  second: PlanarRegion
): boolean {
  if (first.unitsPerMillimeter !== second.unitsPerMillimeter) {
    throw new Error('Cannot validate planar regions with different precision scales')
  }

  const firstPaths = first.paths.map((path) => (
    quantizeRegionPath(path, first.unitsPerMillimeter)
  ))
  const secondPaths = second.paths.map((path) => (
    quantizeRegionPath(path, second.unitsPerMillimeter)
  ))

  for (const firstPath of firstPaths) {
    for (const secondPath of secondPaths) {
      for (let firstIndex = 0; firstIndex < firstPath.length; firstIndex += 1) {
        const firstStart = firstPath[firstIndex]
        const firstEnd = firstPath[(firstIndex + 1) % firstPath.length]
        for (let secondIndex = 0; secondIndex < secondPath.length; secondIndex += 1) {
          const secondStart = secondPath[secondIndex]
          const secondEnd = secondPath[(secondIndex + 1) % secondPath.length]
          if (segmentsIntersectOrTouch(firstStart, firstEnd, secondStart, secondEnd)) {
            return true
          }
        }
      }
    }
  }

  return false
}

function sharedRegionBoundaryLength(
  first: PlanarRegion,
  second: PlanarRegion
): number {
  if (first.unitsPerMillimeter !== second.unitsPerMillimeter) {
    throw new Error('Cannot compare planar regions with different precision scales')
  }
  const unitsPerMillimeter = first.unitsPerMillimeter
  const firstPaths = first.paths.map((path) => quantizeRegionPath(path, unitsPerMillimeter))
  const secondPaths = second.paths.map((path) => quantizeRegionPath(path, unitsPerMillimeter))
  let sharedLength = 0

  for (const firstPath of firstPaths) {
    for (const secondPath of secondPaths) {
      for (let firstIndex = 0; firstIndex < firstPath.length; firstIndex += 1) {
        const firstStart = firstPath[firstIndex]
        const firstEnd = firstPath[(firstIndex + 1) % firstPath.length]
        const directionX = firstEnd.x - firstStart.x
        const directionY = firstEnd.y - firstStart.y
        const squaredLength = directionX ** 2 + directionY ** 2
        if (squaredLength === 0) continue

        for (let secondIndex = 0; secondIndex < secondPath.length; secondIndex += 1) {
          const secondStart = secondPath[secondIndex]
          const secondEnd = secondPath[(secondIndex + 1) % secondPath.length]
          if (
            crossProduct(firstStart, firstEnd, secondStart) !== 0
            || crossProduct(firstStart, firstEnd, secondEnd) !== 0
          ) {
            continue
          }
          const startProjection = (
            (secondStart.x - firstStart.x) * directionX
            + (secondStart.y - firstStart.y) * directionY
          ) / squaredLength
          const endProjection = (
            (secondEnd.x - firstStart.x) * directionX
            + (secondEnd.y - firstStart.y) * directionY
          ) / squaredLength
          const overlapStart = Math.max(0, Math.min(startProjection, endProjection))
          const overlapEnd = Math.min(1, Math.max(startProjection, endProjection))
          if (overlapEnd > overlapStart) {
            sharedLength += (overlapEnd - overlapStart) * Math.sqrt(squaredLength)
          }
        }
      }
    }
  }

  return sharedLength / unitsPerMillimeter
}

function createContourRegion(element: TransformedClosedElement): PlanarRegion {
  // A declared hole is built as positive clip material first. It is subtracted
  // only from its referenced outer after strict containment has been verified.
  const region = createPlanarRegion(
    [{ points: element.points, kind: 'outer' }],
    {
      fillRule: element.source.fillRule,
      repairSelfIntersections: true
    }
  )
  if (region.paths.length === 0) {
    throw new Error(`Contour "${element.source.id}" produced no planar area`)
  }
  return region
}

function unionResolvedRegions(regions: readonly PlanarRegion[]): PlanarRegion {
  const unitsPerMillimeter = regions[0]?.unitsPerMillimeter ?? 1_000
  for (const region of regions) {
    if (region.unitsPerMillimeter !== unitsPerMillimeter) {
      throw new Error('Cannot union planar regions with different precision scales')
    }
  }
  return createPlanarRegion(
    regions.flatMap((region) => region.paths.map((points) => ({
      points,
      kind: planarPathSignedArea(points) >= 0 ? 'outer' as const : 'hole' as const
    }))),
    { unitsPerMillimeter, fillRule: 'nonzero', repairSelfIntersections: true }
  )
}

function applyCornerControls(
  elements: readonly TransformedClosedElement[],
  smoothCorners: boolean,
  cornerRadius: number,
  angleThreshold: number
): TransformedClosedElement[] {
  if (!smoothCorners || cornerRadius <= EPSILON) return elements.map((element) => ({ ...element }))

  return elements.map((element) => ({
    ...element,
    points: CookieCutterGenerator.outlineToPath(
      { points: element.points },
      1,
      { smoothCorners: true, cornerRadius, angleThreshold }
    ).map((point) => ({ x: point.x, y: point.z }))
  }))
}

function createClosedContourGroupRegion(
  closedElements: readonly TransformedClosedElement[]
): PlanarRegion {
  const outerElements = closedElements.filter(
    (element) => element.source.relationship.kind === 'outer'
  )
  if (outerElements.length === 0) {
    throw new Error('Closed contour group does not contain an outer contour')
  }

  const outerById = new Map(
    outerElements.map((element) => [element.source.id, element])
  )
  const holesByOuterId = new Map<string, TransformedClosedElement[]>()

  for (const element of closedElements) {
    if (element.source.relationship.kind !== 'hole') continue
    const outerContourId = element.source.relationship.outerContourId
    if (!outerById.has(outerContourId)) {
      throw new Error(
        `Hole "${element.source.id}" is separated from outer contour "${outerContourId}" by its role or part`
      )
    }
    const holes = holesByOuterId.get(outerContourId) ?? []
    holes.push(element)
    holesByOuterId.set(outerContourId, holes)
  }

  const compounds = outerElements.map((outerElement) => {
    const outerRegion = createContourRegion(outerElement)
    const holeRegions = (holesByOuterId.get(outerElement.source.id) ?? []).map(
      (holeElement) => {
        const holeRegion = createContourRegion(holeElement)
        const outside = subtractPlanarRegions(holeRegion, outerRegion)
        if (
          outside.paths.length > 0
          || regionBoundariesIntersectOrTouch(holeRegion, outerRegion)
        ) {
          throw new Error(
            `Hole "${holeElement.source.id}" lies outside or touches referenced outer contour "${outerElement.source.id}"`
          )
        }
        return holeRegion
      }
    )

    if (holeRegions.length === 0) return outerRegion
    return subtractPlanarRegions(
      outerRegion,
      unionResolvedRegions(holeRegions),
      'nonzero'
    )
  })

  return unionResolvedRegions(compounds)
}

export class StructuredCookieCutterGenerator {
  static generate(options: StructuredGeneratorOptions): StructuredCookieCutter {
    const {
      design,
      profile,
      scale = 1,
      optimize = true,
      smoothCorners = false,
      cornerRadius = 0.5,
      angleThreshold = 15
    } = options

    assertValidDesignSpec(design)
    if (!Number.isFinite(scale) || scale <= 0) {
      throw new RangeError('Structured generator scale must be a finite number greater than zero')
    }
    if (!Number.isFinite(cornerRadius) || cornerRadius < 0) {
      throw new RangeError('cornerRadius must be a finite non-negative number')
    }
    if (!Number.isFinite(angleThreshold) || angleThreshold < 0 || angleThreshold > 180) {
      throw new RangeError('angleThreshold must be a finite number from 0 to 180 degrees')
    }

    const transformedElements = collectTransformedElements(design)
    const sourceBounds = boundsFromElements(design, transformedElements)
    const fit = createFitTransform(design, sourceBounds, scale)
    const fittedElements = transformedElements.map((element) => ({
      ...element,
      points: element.points.map((point) => fitPoint(point, fit))
    }))
    const roleDefinitions = createRoleDefinitions(design, profile)
    const roleCounts = createRoleCounts()
    const elements: GeneratedElementMetadata[] = []
    const contributions: SolidContribution[] = []
    const warnings: string[] = []
    let skippedElements = 0
    let generatedElements = 0
    const pendingElementIndices = new Set(fittedElements.map((_, index) => index))

    for (let elementIndex = 0; elementIndex < fittedElements.length; elementIndex += 1) {
      if (!pendingElementIndices.delete(elementIndex)) continue
      const transformedElement = fittedElements[elementIndex]
      const { source } = transformedElement
      const roleDefinition = roleDefinitions[source.role]
      const groupedElements = source.kind === 'closed-contour'
        ? fittedElements.filter((candidate, candidateIndex) => {
          if (candidateIndex === elementIndex) return true
          if (!pendingElementIndices.has(candidateIndex)) return false
          const matches = candidate.source.kind === 'closed-contour'
            && candidate.instanceId === transformedElement.instanceId
            && candidate.source.role === source.role
          if (matches) pendingElementIndices.delete(candidateIndex)
          return matches
        })
        : [transformedElement]
      const sourceIds = groupedElements.map((element) => element.source.id)

      try {
        let geometry: Geometry
        let slabs: PlanarRegionSlab[]
        let thickness = roleDefinition.thickness
        let minimumCrossSectionWidth: number | undefined
        let profileBands: number | undefined
        let maximumProfileError: number | undefined

        if (source.kind === 'closed-contour') {
          const closedElements = applyCornerControls(
            groupedElements as TransformedClosedElement[],
            smoothCorners,
            cornerRadius,
            angleThreshold
          )
          let region = createClosedContourGroupRegion(closedElements)
          if (optimize) {
            region = simplifyPlanarRegion(region, OPTIMIZATION_TOLERANCE)
          }

          if (source.role === 'support' || source.role === 'handle') {
            slabs = [{ bottom: 0, top: roleDefinition.height, region }]
            geometry = extrudePlanarRegion(region, { top: roleDefinition.height })
          } else {
            const sweep = sweepProfileOverPlanarRegion({
              region,
              profile: roleDefinition.profile,
              join: smoothCorners && cornerRadius > EPSILON ? 'round' : 'miter',
              miterLimit: 4,
              maximumProfileError: 0.05,
              simplificationTolerance: 0
            })
            geometry = sweep.geometry
            slabs = sweep.slabs
            profileBands = sweep.bands.length
            maximumProfileError = sweep.maximumLateralError
            minimumCrossSectionWidth = Math.min(...sweep.bands.flatMap(
              (band) => band.intervals.map(
                (interval) => interval.maximumOffset - interval.minimumOffset
              )
            ))
          }
        } else {
          const globalWidthScale = Math.sqrt(Math.abs(fit.scaleX * fit.scaleY))
          const authoredWidth = source.width ?? roleDefinition.thickness
          thickness = Math.max(
            design.constraints.minimumWallThickness,
            design.constraints.minimumFeatureSize,
            authoredWidth * transformedElement.localWidthScale * globalWidthScale
          )
          minimumCrossSectionWidth = thickness
          let strokeRegion = strokePlanarPaths(
            [transformedElement.points],
            thickness,
            {
              join: source.lineJoin ?? 'miter',
              endCap: source.lineCap ?? 'butt',
              miterLimit: 4,
              arcTolerance: 0.01
            }
          )
          if (optimize) {
            strokeRegion = simplifyPlanarRegion(
              strokeRegion,
              OPTIMIZATION_TOLERANCE
            )
          }
          slabs = [{ bottom: 0, top: roleDefinition.height, region: strokeRegion }]
          geometry = extrudePlanarRegion(strokeRegion, { top: roleDefinition.height })
        }

        validateGeneratedGeometry(geometry)
        const bounds = geometryBounds(geometry)
        roleCounts[source.role] += groupedElements.length
        generatedElements += groupedElements.length
        const metadata: GeneratedElementMetadata = {
          id: sourceIds.length === 1
            ? source.id
            : `${source.role}:${transformedElement.instanceId}`,
          sourceIds,
          assemblyId: transformedElement.assemblyId,
          partId: transformedElement.partId,
          kind: source.kind,
          role: source.role,
          height: bounds.maxY - bounds.minY,
          thickness,
          minimumCrossSectionWidth,
          profileBands,
          maximumProfileError,
          bounds
        }
        elements.push(metadata)
        contributions.push({
          assemblyId: transformedElement.assemblyId,
          partId: transformedElement.partId,
          sourceIds,
          slabs,
          metadata
        })
      } catch (error) {
        skippedElements += groupedElements.length
        const message = error instanceof Error ? error.message : String(error)
        warnings.push(`Skipped ${source.kind} group "${sourceIds.join(', ')}": ${message}`)
      }
    }

    if (generatedElements === 0 || contributions.length === 0) {
      const summary = warnings.length > 0 ? ` ${warnings.join(' ')}` : ''
      throw new Error(
        `No printable geometry was produced (${skippedElements} of ${transformedElements.length} elements skipped).${summary}`
      )
    }

    const vertices: number[] = []
    const faces: number[] = []
    const assemblies: GeneratedAssemblyMetadata[] = []
    const assemblySlabs = new Map<string, PlanarRegionSlab[]>()
    const readinessReasons: ProductionReadinessReason[] = []

    if (skippedElements > 0) {
      readinessReasons.push({
        code: 'skipped-elements',
        message: `${skippedElements} source element${skippedElements === 1 ? ' was' : 's were'} skipped during geometry generation.`
      })
    }

    for (const assembly of design.assemblies) {
      const assemblyContributions = contributions.filter(
        (contribution) => contribution.assemblyId === assembly.id
      )
      if (assemblyContributions.length === 0) continue

      const slabs = normalizePlanarRegionSlabs(
        assemblyContributions.flatMap((contribution) => contribution.slabs)
      )
      const assemblyGeometry = extrudeStackedPlanarRegions(slabs)
      validateGeneratedGeometry(assemblyGeometry)
      const meshQuality = summarizeMeshQuality(assemblyGeometry)
      const vertexStart = vertices.length / 3
      const triangleStart = faces.length / 3
      const bounds = geometryBounds(assemblyGeometry)
      mergeGeometry(vertices, faces, assemblyGeometry)
      assemblySlabs.set(assembly.id, slabs)
      assemblies.push({
        id: assembly.id,
        partIds: assembly.partIds.filter((partId) => (
          assemblyContributions.some((contribution) => contribution.partId === partId)
        )),
        sourceIds: [...new Set(assemblyContributions.flatMap(
          (contribution) => contribution.sourceIds
        ))],
        vertexStart,
        vertexCount: assemblyGeometry.vertices.length / 3,
        triangleStart,
        triangleCount: assemblyGeometry.faces.length / 3,
        bounds,
        meshQuality
      })

      if (!meshQuality.watertight) {
        readinessReasons.push({
          code: 'mesh-topology',
          assemblyId: assembly.id,
          message: `Assembly "${assembly.name}" failed its mesh audit: ${meshQuality.boundaryEdges} boundary edges, ${meshQuality.nonManifoldEdges} non-manifold edges, ${meshQuality.inconsistentWindingEdges} winding conflicts, ${meshQuality.degenerateTriangles} degenerate triangles, and ${meshQuality.duplicateTriangles} duplicate triangles.`
        })
      }
      if (meshQuality.connectedComponents !== 1) {
        readinessReasons.push({
          code: 'disconnected-assembly',
          assemblyId: assembly.id,
          message: `Assembly "${assembly.name}" contains ${meshQuality.connectedComponents} disconnected material islands; add printable support geometry or separate them into assemblies.`
        })
      }

      const attachmentGroups = countContributionAttachmentGroups(
        assemblyContributions,
        design.constraints.minimumFeatureSize
      )
      if (attachmentGroups > 1) {
        readinessReasons.push({
          code: 'weak-attachment',
          assemblyId: assembly.id,
          message: `Assembly "${assembly.name}" has ${attachmentGroups} contribution groups that are not joined across at least ${design.constraints.minimumFeatureSize} mm; widen their support overlap.`
        })
      }

      const minimumWall = design.constraints.minimumWallThickness
      const minimumFeature = design.constraints.minimumFeatureSize
      const nozzleWidth = design.constraints.nozzleDiameter ?? minimumWall
      const filledMinimumCrossSection = Math.max(minimumWall, minimumFeature)
      const dimensionalViolations: string[] = []
      const hasFilledContribution = assemblyContributions.some(
        ({ metadata }) => metadata.role === 'support' || metadata.role === 'handle'
      )
      if (
        hasFilledContribution
        && lacksPrintableStructuralCore(
          slabs,
          filledMinimumCrossSection,
          meshQuality.connectedComponents
        )
      ) {
        dimensionalViolations.push(
          `the assembly does not retain one printable structural core at ${filledMinimumCrossSection.toFixed(3)} mm required cross-section`
        )
      }
      for (const contribution of assemblyContributions) {
        const { metadata } = contribution
        const requiredCrossSection = metadata.role === 'cut'
          ? Math.min(minimumWall, nozzleWidth)
          : Math.max(minimumWall, minimumFeature)
        if (metadata.thickness + EPSILON < minimumWall) {
          dimensionalViolations.push(
            `${metadata.id} wall ${metadata.thickness.toFixed(3)} mm < ${minimumWall.toFixed(3)} mm`
          )
        }
        if (
          metadata.minimumCrossSectionWidth !== undefined
          && metadata.minimumCrossSectionWidth + EPSILON < requiredCrossSection
        ) {
          dimensionalViolations.push(
            `${metadata.id} cross-section ${metadata.minimumCrossSectionWidth.toFixed(3)} mm < ${requiredCrossSection.toFixed(3)} mm`
          )
        }
        if (metadata.height + EPSILON < minimumFeature) {
          dimensionalViolations.push(
            `${metadata.id} height ${metadata.height.toFixed(3)} mm < ${minimumFeature.toFixed(3)} mm`
          )
        }
      }
      const buildVolume = design.constraints.buildVolume
      if (buildVolume) {
        const assemblyWidth = bounds.maxX - bounds.minX
        const assemblyHeight = bounds.maxY - bounds.minY
        const assemblyDepth = bounds.maxZ - bounds.minZ
        if (
          assemblyWidth > buildVolume.width + EPSILON
          || assemblyDepth > buildVolume.depth + EPSILON
          || assemblyHeight > buildVolume.height + EPSILON
        ) {
          dimensionalViolations.push(
            `bounds ${assemblyWidth.toFixed(2)} × ${assemblyDepth.toFixed(2)} × ${assemblyHeight.toFixed(2)} mm exceed build volume ${buildVolume.width} × ${buildVolume.depth} × ${buildVolume.height} mm`
          )
        }
      }
      if (dimensionalViolations.length > 0) {
        readinessReasons.push({
          code: 'manufacturing-constraints',
          assemblyId: assembly.id,
          message: `Assembly "${assembly.name}" violates manufacturing constraints: ${dimensionalViolations.join('; ')}.`
        })
      }
    }

    for (let firstIndex = 0; firstIndex < assemblies.length; firstIndex += 1) {
      const first = assemblies[firstIndex]
      const firstSlabs = assemblySlabs.get(first.id) ?? []
      for (let secondIndex = firstIndex + 1; secondIndex < assemblies.length; secondIndex += 1) {
        const second = assemblies[secondIndex]
        const secondSlabs = assemblySlabs.get(second.id) ?? []
        if (!slabCollectionsCollide(firstSlabs, secondSlabs)) continue
        readinessReasons.push({
          code: 'cross-assembly-collision',
          message: `Assemblies "${first.id}" and "${second.id}" occupy overlapping printable volume.`
        })
      }
    }

    if (assemblies.length > 1) {
      readinessReasons.push({
        code: 'multipart-export-unsupported',
        message: `This design contains ${assemblies.length} printable assemblies; STL/OBJ export is blocked until multipart 3MF export is available.`
      })
    }

    const geometry: Geometry = {
      vertices: new Float32Array(vertices),
      faces: new Uint32Array(faces)
    }
    if (geometry.faces.length === 0) {
      throw new Error('No printable assembly geometry was produced')
    }
    const roleHeights = Object.fromEntries(
      DESIGN_ROLES.map((role) => [role, roleDefinitions[role].height])
    ) as Record<DesignRole, number>
    const meshQuality = summarizeMeshQuality(geometry)
    for (const reason of readinessReasons) warnings.push(reason.message)

    return {
      geometry,
      metadata: {
        vertices: geometry.vertices.length / 3,
        faces: geometry.faces.length / 3,
        scale,
        optimized: optimize,
        generatedElements,
        skippedElements,
        roleCounts,
        roleHeights,
        sourceBounds,
        elements,
        assemblies,
        meshQuality,
        productionReadiness: {
          ready: readinessReasons.length === 0,
          reasons: readinessReasons
        },
        warnings
      }
    }
  }
}
