import { cleanClosedOutline, signedArea } from '../geometry/outline'

interface GeneratorOptions {
  outline: any
  profile: any
  scale?: number
  optimize?: boolean
  smoothCorners?: boolean
  cornerRadius?: number
  angleThreshold?: number
}

export interface Geometry {
  vertices: Float32Array
  faces: Uint32Array
}

interface CookieCutter {
  geometry: Geometry
  metadata: {
    vertices: number
    faces: number
    scale: number
    optimized: boolean
  }
}

export interface PathPoint {
  x: number
  y: number
  z: number
}

interface PathFrame {
  normal: { x: number; z: number }
  miterScale: number
}

const EPSILON = 1e-6
const MITER_LIMIT = 4

export class CookieCutterGenerator {
  static generate(options: GeneratorOptions): CookieCutter {
    const {
      outline,
      profile,
      scale = 1,
      optimize = true,
      smoothCorners = true,
      cornerRadius = 0.5,
      angleThreshold = 15
    } = options

    if (!outline || !profile) {
      throw new Error('Both outline and profile are required')
    }

    const geometry = this.sweepProfileAlongPath(outline, profile, scale, {
      smoothCorners,
      cornerRadius,
      angleThreshold
    })

    if (optimize) this.optimizeForPrinting(geometry)

    return {
      geometry,
      metadata: {
        vertices: geometry.vertices.length / 3,
        faces: geometry.faces.length / 3,
        scale,
        optimized: optimize
      }
    }
  }

  static sweepProfileAlongPath(
    outline: any,
    profile: any,
    scale: number,
    smoothingOptions: {
      smoothCorners: boolean
      cornerRadius: number
      angleThreshold: number
    } = { smoothCorners: true, cornerRadius: 0.5, angleThreshold: 15 }
  ): Geometry {
    const pathPoints = this.outlineToPath(outline, scale, smoothingOptions)
    const profilePoints = this.prepareProfile(profile)
    return this.createSweptGeometry(pathPoints, profilePoints)
  }

  static outlineToPath(
    outline: any,
    scale: number,
    smoothingOptions: {
      smoothCorners: boolean
      cornerRadius: number
      angleThreshold: number
    } = { smoothCorners: true, cornerRadius: 0.5, angleThreshold: 15 }
  ): PathPoint[] {
    const rawPoints: Array<{ x: number; y: number }> = []

    if (Array.isArray(outline.points)) {
      rawPoints.push(...outline.points)
    } else if (Array.isArray(outline.curves)) {
      for (const curve of outline.curves) {
        rawPoints.push(...this.sampleCurve(curve, 50))
      }
    } else if (typeof outline.path === 'string') {
      rawPoints.push(...this.parseSVGPath(outline.path))
    }

    const cleanPoints = cleanClosedOutline(rawPoints)
    if (cleanPoints.length < 3) {
      throw new Error('Outline must contain at least three distinct points')
    }

    let pathPoints = cleanPoints.map((point) => ({
      x: point.x * scale,
      y: 0,
      z: point.y * scale
    }))

    if (smoothingOptions.smoothCorners) {
      pathPoints = this.smoothPathAngles(
        pathPoints,
        smoothingOptions.cornerRadius,
        smoothingOptions.angleThreshold
      )
    }

    return this.cleanPathPoints(pathPoints)
  }

  static prepareProfile(profile: any): Array<{ x: number; y: number }> {
    if (!Array.isArray(profile?.points)) {
      throw new Error('Profile must contain points')
    }

    const points: Array<{ x: number; y: number }> = []
    for (const point of profile.points) {
      if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) continue
      const previous = points[points.length - 1]
      if (!previous || Math.hypot(point.x - previous.x, point.y - previous.y) > EPSILON) {
        points.push({ x: point.x, y: point.y })
      }
    }

    while (
      points.length > 1
      && Math.hypot(
        points[0].x - points[points.length - 1].x,
        points[0].y - points[points.length - 1].y
      ) <= EPSILON
    ) {
      points.pop()
    }

    if (points.length < 3) {
      throw new Error('Profile must contain at least three distinct points')
    }

    return points
  }

  static calculatePathFrames(pathPoints: PathPoint[]): PathFrame[] {
    if (pathPoints.length < 3) {
      throw new Error('A closed sweep path requires at least three points')
    }

    const area = signedArea(pathPoints.map((point) => ({ x: point.x, y: point.z })))
    if (Math.abs(area) <= EPSILON) {
      throw new Error('Outline area is too small to generate a cookie cutter')
    }

    // Positive profile X always means away from the cookie interior, regardless of winding.
    const outwardSide = area > 0 ? -1 : 1

    return pathPoints.map((current, index) => {
      const previous = pathPoints[(index - 1 + pathPoints.length) % pathPoints.length]
      const next = pathPoints[(index + 1) % pathPoints.length]
      const incoming = this.normalize2D(current.x - previous.x, current.z - previous.z)
      const outgoing = this.normalize2D(next.x - current.x, next.z - current.z)
      const incomingNormal = {
        x: -incoming.z * outwardSide,
        z: incoming.x * outwardSide
      }
      const outgoingNormal = {
        x: -outgoing.z * outwardSide,
        z: outgoing.x * outwardSide
      }
      const summed = {
        x: incomingNormal.x + outgoingNormal.x,
        z: incomingNormal.z + outgoingNormal.z
      }
      const summedLength = Math.hypot(summed.x, summed.z)

      if (summedLength <= EPSILON) {
        return { normal: outgoingNormal, miterScale: 1 }
      }

      const normal = {
        x: summed.x / summedLength,
        z: summed.z / summedLength
      }
      const denominator = normal.x * outgoingNormal.x + normal.z * outgoingNormal.z
      const rawMiterScale = Math.abs(denominator) > EPSILON ? 1 / denominator : MITER_LIMIT

      return {
        normal,
        miterScale: Math.max(-MITER_LIMIT, Math.min(MITER_LIMIT, rawMiterScale))
      }
    })
  }

  static createSweptGeometry(
    pathPoints: PathPoint[],
    profilePoints: Array<{ x: number; y: number }>
  ): Geometry {
    const vertices: number[] = []
    const faces: number[] = []
    const pathLength = pathPoints.length
    const profileLength = profilePoints.length
    const frames = this.calculatePathFrames(pathPoints)

    for (let pathIndex = 0; pathIndex < pathLength; pathIndex += 1) {
      const pathPoint = pathPoints[pathIndex]
      const frame = frames[pathIndex]

      for (const profilePoint of profilePoints) {
        const offset = profilePoint.x * frame.miterScale
        vertices.push(
          pathPoint.x + offset * frame.normal.x,
          profilePoint.y,
          pathPoint.z + offset * frame.normal.z
        )
      }
    }

    for (let pathIndex = 0; pathIndex < pathLength; pathIndex += 1) {
      const nextPathIndex = (pathIndex + 1) % pathLength

      for (let profileIndex = 0; profileIndex < profileLength; profileIndex += 1) {
        const nextProfileIndex = (profileIndex + 1) % profileLength
        const first = pathIndex * profileLength + profileIndex
        const second = pathIndex * profileLength + nextProfileIndex
        const third = nextPathIndex * profileLength + profileIndex
        const fourth = nextPathIndex * profileLength + nextProfileIndex

        faces.push(first, second, third, second, fourth, third)
      }
    }

    return {
      vertices: new Float32Array(vertices),
      faces: new Uint32Array(faces)
    }
  }

  static smoothPathAngles(
    points: PathPoint[],
    cornerRadius = 0.5,
    angleThreshold = 15
  ): PathPoint[] {
    if (points.length < 3 || cornerRadius <= EPSILON) return points

    const smoothed: PathPoint[] = []

    for (let index = 0; index < points.length; index += 1) {
      const previous = points[(index - 1 + points.length) % points.length]
      const current = points[index]
      const next = points[(index + 1) % points.length]
      const incomingLength = Math.hypot(current.x - previous.x, current.z - previous.z)
      const outgoingLength = Math.hypot(next.x - current.x, next.z - current.z)

      if (incomingLength <= EPSILON || outgoingLength <= EPSILON) continue

      const incoming = {
        x: (current.x - previous.x) / incomingLength,
        z: (current.z - previous.z) / incomingLength
      }
      const outgoing = {
        x: (next.x - current.x) / outgoingLength,
        z: (next.z - current.z) / outgoingLength
      }
      const dot = Math.max(-1, Math.min(1, incoming.x * outgoing.x + incoming.z * outgoing.z))
      const turnAngle = Math.acos(dot)
      const turnDegrees = turnAngle * 180 / Math.PI

      if (turnDegrees < angleThreshold) {
        this.pushDistinct(smoothed, current)
        continue
      }

      const desiredCut = cornerRadius * Math.tan(Math.min(turnAngle, Math.PI - 0.01) / 2)
      const cut = Math.min(desiredCut, incomingLength * 0.35, outgoingLength * 0.35)

      if (!Number.isFinite(cut) || cut <= EPSILON) {
        this.pushDistinct(smoothed, current)
        continue
      }

      const entry = {
        x: current.x - incoming.x * cut,
        y: current.y,
        z: current.z - incoming.z * cut
      }
      const exit = {
        x: current.x + outgoing.x * cut,
        y: current.y,
        z: current.z + outgoing.z * cut
      }
      const segments = Math.max(2, Math.min(8, Math.ceil(turnDegrees / 15)))

      for (let segment = 0; segment <= segments; segment += 1) {
        const t = segment / segments
        const oneMinusT = 1 - t
        this.pushDistinct(smoothed, {
          x: oneMinusT * oneMinusT * entry.x + 2 * oneMinusT * t * current.x + t * t * exit.x,
          y: current.y,
          z: oneMinusT * oneMinusT * entry.z + 2 * oneMinusT * t * current.z + t * t * exit.z
        })
      }
    }

    return smoothed
  }

  static sampleCurve(curve: any, numPoints: number): Array<{ x: number; y: number }> {
    const points: Array<{ x: number; y: number }> = []

    if (curve.type === 'line') {
      const steps = Math.max(2, Math.floor(numPoints / 10))
      for (let index = 0; index < steps; index += 1) {
        const t = index / (steps - 1)
        points.push({
          x: curve.x1 + (curve.x2 - curve.x1) * t,
          y: curve.y1 + (curve.y2 - curve.y1) * t
        })
      }
    } else if (curve.type === 'arc' || curve.type === 'circle') {
      const centerX = curve.cx || 0
      const centerY = curve.cy || 0
      const radius = curve.r || curve.radius || 1
      const startAngle = curve.startAngle || 0
      const endAngle = curve.endAngle || Math.PI * 2

      for (let index = 0; index < numPoints; index += 1) {
        const t = index / (numPoints - 1)
        const angle = startAngle + (endAngle - startAngle) * t
        points.push({
          x: centerX + Math.cos(angle) * radius,
          y: centerY + Math.sin(angle) * radius
        })
      }
    } else if (curve.type === 'bezier') {
      for (let index = 0; index < numPoints; index += 1) {
        points.push(this.evaluateBezier(curve, index / (numPoints - 1)))
      }
    } else {
      const steps = Math.max(2, Math.floor(numPoints / 10))
      for (let index = 0; index < steps; index += 1) {
        const t = index / (steps - 1)
        points.push({
          x: (curve.x1 || 0) + ((curve.x2 || 1) - (curve.x1 || 0)) * t,
          y: (curve.y1 || 0) + ((curve.y2 || 0) - (curve.y1 || 0)) * t
        })
      }
    }

    return points
  }

  static evaluateBezier(curve: any, t: number): { x: number; y: number } {
    const oneMinusT = 1 - t
    return {
      x: oneMinusT * oneMinusT * curve.x1
        + 2 * oneMinusT * t * curve.cx
        + t * t * curve.x2,
      y: oneMinusT * oneMinusT * curve.y1
        + 2 * oneMinusT * t * curve.cy
        + t * t * curve.y2
    }
  }

  static parseSVGPath(pathData: string): Array<{ x: number; y: number }> {
    const points: Array<{ x: number; y: number }> = []
    const commands = pathData.match(/[MmLlHhVvZz][^MmLlHhVvZz]*/g) || []
    let currentX = 0
    let currentY = 0

    for (const command of commands) {
      const type = command[0]
      const coordinates = command.slice(1).trim().split(/[\s,]+/).map(Number)

      switch (type) {
        case 'M':
          currentX = coordinates[0]
          currentY = coordinates[1]
          points.push({ x: currentX, y: currentY })
          break
        case 'm':
          currentX += coordinates[0]
          currentY += coordinates[1]
          points.push({ x: currentX, y: currentY })
          break
        case 'L':
        case 'l':
          for (let index = 0; index < coordinates.length; index += 2) {
            currentX = type === 'L' ? coordinates[index] : currentX + coordinates[index]
            currentY = type === 'L' ? coordinates[index + 1] : currentY + coordinates[index + 1]
            points.push({ x: currentX, y: currentY })
          }
          break
        case 'H':
          currentX = coordinates[0]
          points.push({ x: currentX, y: currentY })
          break
        case 'h':
          currentX += coordinates[0]
          points.push({ x: currentX, y: currentY })
          break
        case 'V':
          currentY = coordinates[0]
          points.push({ x: currentX, y: currentY })
          break
        case 'v':
          currentY += coordinates[0]
          points.push({ x: currentX, y: currentY })
          break
        default:
          break
      }
    }

    return points
  }

  static optimizeForPrinting(geometry: Geometry): Geometry {
    return geometry
  }

  private static normalize2D(x: number, z: number): { x: number; z: number } {
    const length = Math.hypot(x, z)
    if (length <= EPSILON) throw new Error('Outline contains a zero-length edge')
    return { x: x / length, z: z / length }
  }

  private static cleanPathPoints(points: PathPoint[]): PathPoint[] {
    const cleaned: PathPoint[] = []
    for (const point of points) this.pushDistinct(cleaned, point)

    while (
      cleaned.length > 1
      && Math.hypot(
        cleaned[0].x - cleaned[cleaned.length - 1].x,
        cleaned[0].z - cleaned[cleaned.length - 1].z
      ) <= EPSILON
    ) {
      cleaned.pop()
    }

    if (cleaned.length < 3) {
      throw new Error('Outline must contain at least three distinct points')
    }

    return cleaned
  }

  private static pushDistinct(points: PathPoint[], point: PathPoint): void {
    const previous = points[points.length - 1]
    if (!previous || Math.hypot(point.x - previous.x, point.z - previous.z) > EPSILON) {
      points.push({ ...point })
    }
  }
}

