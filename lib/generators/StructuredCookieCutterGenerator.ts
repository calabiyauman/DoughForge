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

const EPSILON = 1e-6
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
  kind: 'closed-contour' | 'open-stroke'
  role: DesignRole
  vertexStart: number
  vertexCount: number
  triangleStart: number
  triangleCount: number
  height: number
  thickness: number
  bounds: Bounds3D
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
          localWidthScale
        })
      }
    }
  }

  return elements
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

    const transformedElements = collectTransformedElements(design)
    const sourceBounds = boundsFromElements(design, transformedElements)
    const fit = createFitTransform(design, sourceBounds, scale)
    const roleDefinitions = createRoleDefinitions(design, profile)
    const roleCounts = createRoleCounts()
    const vertices: number[] = []
    const faces: number[] = []
    const elements: GeneratedElementMetadata[] = []
    const warnings: string[] = []
    let skippedElements = 0

    for (const transformedElement of transformedElements) {
      const { source } = transformedElement
      const roleDefinition = roleDefinitions[source.role]
      const fittedPoints = transformedElement.points.map((point) => fitPoint(point, fit))

      try {
        let geometry: Geometry
        let thickness = roleDefinition.thickness

        if (source.kind === 'closed-contour') {
          geometry = CookieCutterGenerator.generate({
            outline: { points: fittedPoints },
            profile: roleDefinition.profile,
            scale: 1,
            optimize,
            smoothCorners,
            cornerRadius,
            angleThreshold
          }).geometry
        } else {
          const globalWidthScale = Math.sqrt(Math.abs(fit.scaleX * fit.scaleY))
          const authoredWidth = source.width ?? roleDefinition.thickness
          thickness = Math.max(
            design.constraints.minimumWallThickness,
            authoredWidth * transformedElement.localWidthScale * globalWidthScale
          )
          geometry = createRibbonGeometry(
            fittedPoints,
            thickness,
            roleDefinition.height,
            source.lineCap
          )
          if (source.lineJoin === 'round' || source.lineJoin === 'bevel') {
            warnings.push(
              `Open stroke "${source.id}" uses a bounded miter approximation for its ${source.lineJoin} joins.`
            )
          }
        }

        validateGeneratedGeometry(geometry)
        const vertexStart = vertices.length / 3
        const triangleStart = faces.length / 3
        const bounds = geometryBounds(geometry)
        mergeGeometry(vertices, faces, geometry)
        roleCounts[source.role] += 1
        elements.push({
          id: source.id,
          kind: source.kind,
          role: source.role,
          vertexStart,
          vertexCount: geometry.vertices.length / 3,
          triangleStart,
          triangleCount: geometry.faces.length / 3,
          height: bounds.maxY - bounds.minY,
          thickness,
          bounds
        })
      } catch (error) {
        skippedElements += 1
        const message = error instanceof Error ? error.message : String(error)
        warnings.push(`Skipped ${source.kind} "${source.id}": ${message}`)
      }
    }

    const geometry: Geometry = {
      vertices: new Float32Array(vertices),
      faces: new Uint32Array(faces)
    }
    if (elements.length === 0 || geometry.faces.length === 0) {
      const summary = warnings.length > 0 ? ` ${warnings.join(' ')}` : ''
      throw new Error(
        `No printable geometry was produced (${skippedElements} of ${transformedElements.length} elements skipped).${summary}`
      )
    }
    const roleHeights = Object.fromEntries(
      DESIGN_ROLES.map((role) => [role, roleDefinitions[role].height])
    ) as Record<DesignRole, number>

    return {
      geometry,
      metadata: {
        vertices: geometry.vertices.length / 3,
        faces: geometry.faces.length / 3,
        scale,
        optimized: optimize,
        generatedElements: elements.length,
        skippedElements,
        roleCounts,
        roleHeights,
        sourceBounds,
        elements,
        warnings
      }
    }
  }
}
