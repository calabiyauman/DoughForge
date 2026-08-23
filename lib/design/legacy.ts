import {
  DESIGN_SPEC_SCHEMA,
  DESIGN_SPEC_UNITS,
  DESIGN_SPEC_VERSION,
  type DesignSpec,
  type DesignTarget,
  type ManufacturingConstraints,
  type Point2D,
  type ProfileReference
} from './types'
import { assertValidDesignSpec } from './validation'

export interface LegacySingleOutline {
  points: readonly Point2D[]
  type?: string
  name?: string
}

export interface LegacyOutlineAdapterOptions {
  id?: string
  name?: string
  target?: DesignTarget
  profile?: ProfileReference
  constraints?: ManufacturingConstraints
  sourceName?: string
  /** Point de-duplication tolerance in millimeters. */
  tolerance?: number
}

export const DEFAULT_PROFILE_REFERENCE: ProfileReference = {
  id: 'doughforge:professional',
  name: 'Professional',
  revision: 'legacy-v1',
  measurements: {
    outerOffset: 6.35,
    outerHeight: 10.16,
    innerOffset: -2.79,
    innerHeight: 17.78,
    chamfer: 2.29
  },
  parameters: {
    chamferAngleDegrees: 80
  }
}

export const DEFAULT_MANUFACTURING_CONSTRAINTS: ManufacturingConstraints = {
  process: 'fdm',
  nozzleDiameter: 0.4,
  minimumWallThickness: 0.8,
  minimumFeatureSize: 0.8,
  minimumClearance: 0.4
}

function distanceSquared(first: Point2D, second: Point2D): number {
  const x = first.x - second.x
  const y = first.y - second.y
  return x * x + y * y
}

function cleanLegacyPoints(input: readonly Point2D[], tolerance: number): Point2D[] {
  const toleranceSquared = tolerance * tolerance
  const points: Point2D[] = []
  for (const point of input) {
    const next = { x: point.x, y: point.y }
    const previous = points[points.length - 1]
    if (!previous || distanceSquared(previous, next) > toleranceSquared) points.push(next)
  }
  while (
    points.length > 1
    && distanceSquared(points[0], points[points.length - 1]) <= toleranceSquared
  ) {
    points.pop()
  }
  return points
}

function slug(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return normalized || 'legacy-design'
}

/**
 * Wraps the application's former `{ points }` outline in a complete DesignSpec.
 * Coordinates are copied and assumed to already be millimeters.
 */
export function designSpecFromLegacyOutline(
  outline: LegacySingleOutline,
  options: LegacyOutlineAdapterOptions = {}
): DesignSpec {
  const tolerance = options.tolerance ?? 1e-4
  if (!Number.isFinite(tolerance) || tolerance < 0) {
    throw new RangeError('Legacy outline tolerance must be a finite, non-negative number')
  }
  const points = cleanLegacyPoints(outline.points, tolerance)
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  const minimumX = Math.min(...xs)
  const maximumX = Math.max(...xs)
  const minimumY = Math.min(...ys)
  const maximumY = Math.max(...ys)
  const width = maximumX - minimumX
  const height = maximumY - minimumY
  const name = options.name ?? outline.name ?? outline.type ?? 'Legacy design'
  const id = options.id ?? slug(name)
  const contourId = `${id}:outline`
  const partId = `${id}:part`
  const profile = options.profile ?? DEFAULT_PROFILE_REFERENCE
  const constraints = options.constraints ?? DEFAULT_MANUFACTURING_CONSTRAINTS
  const { parameters: profileParameters, ...profileFields } = profile
  const { buildVolume, ...constraintFields } = constraints

  const design: DesignSpec = {
    schema: DESIGN_SPEC_SCHEMA,
    version: DESIGN_SPEC_VERSION,
    units: DESIGN_SPEC_UNITS,
    id,
    name,
    canvas: {
      origin: { x: minimumX, y: minimumY },
      size: { width, height }
    },
    target: options.target ?? {
      size: { width, height },
      fit: 'contain'
    },
    contours: [{
      id: contourId,
      kind: 'closed-contour',
      role: 'cut',
      relationship: { kind: 'outer' },
      points
    }],
    strokes: [],
    parts: [{
      id: partId,
      name,
      geometryIds: [contourId]
    }],
    assemblies: [{
      id: `${id}:assembly`,
      name,
      partIds: [partId]
    }],
    profile: {
      ...profileFields,
      measurements: { ...profile.measurements },
      ...(profileParameters ? { parameters: { ...profileParameters } } : {})
    },
    constraints: {
      ...constraintFields,
      ...(buildVolume ? { buildVolume: { ...buildVolume } } : {})
    },
    provenance: {
      sources: [{
        id: `${id}:legacy-source`,
        kind: 'legacy-outline',
        name: options.sourceName ?? name
      }],
      transformations: [{
        kind: 'legacy-adapter',
        description: 'Wrapped a single closed outline and removed redundant seam points',
        parameters: {
          assumedUnits: 'mm',
          pointTolerance: tolerance
        }
      }]
    }
  }

  assertValidDesignSpec(design)
  return design
}
