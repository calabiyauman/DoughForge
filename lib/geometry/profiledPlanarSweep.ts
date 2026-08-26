import type { Geometry } from '../generators/CookieCutterGenerator'
import { CookieCutterGenerator } from '../generators/CookieCutterGenerator'
import type { Profile } from '../generators/ProfileGenerator'
import {
  extrudeStackedPlanarRegions,
  type PlanarRegionSlab
} from './planarExtrusion'
import {
  createPlanarRegion,
  offsetPlanarRegion,
  simplifyPlanarRegion,
  subtractPlanarRegions,
  unionPlanarRegions,
  type PlanarJoin,
  type PlanarRegion
} from './planarKernel'

const PROFILE_EPSILON = 1e-9

export interface ProfileInterval {
  minimumOffset: number
  maximumOffset: number
}

export interface ProfileBand {
  bottom: number
  top: number
  intervals: ProfileInterval[]
  maximumLateralError: number
}

export interface ProfiledPlanarSweepOptions {
  outline: readonly { x: number; y: number }[]
  profile: Profile
  join?: PlanarJoin
  miterLimit?: number
  maximumProfileError?: number
  /** Maximum planar simplification error in millimetres. Set to zero to disable. */
  simplificationTolerance?: number
  /** @deprecated Stacked regions now share a true boundary and never overlap. */
  layerOverlap?: number
}

export interface ProfiledPlanarRegionSweepOptions
  extends Omit<ProfiledPlanarSweepOptions, 'outline'> {
  region: PlanarRegion
}

export interface ProfiledPlanarSweepResult {
  geometry: Geometry
  bands: ProfileBand[]
  /** Piecewise-constant material footprints used to build the final boundary. */
  slabs: PlanarRegionSlab[]
  maximumLateralError: number
}

function distinctSorted(values: readonly number[]): number[] {
  return [...values]
    .sort((first, second) => first - second)
    .filter((value, index, sorted) => (
      index === 0 || Math.abs(value - sorted[index - 1]) > PROFILE_EPSILON
    ))
}

function intervalsAtHeight(
  profile: readonly { x: number; y: number }[],
  height: number
): ProfileInterval[] {
  const intersections: number[] = []

  for (let index = 0; index < profile.length; index += 1) {
    const start = profile[index]
    const end = profile[(index + 1) % profile.length]
    if (Math.abs(end.y - start.y) <= PROFILE_EPSILON) continue

    const minimumY = Math.min(start.y, end.y)
    const maximumY = Math.max(start.y, end.y)
    if (height < minimumY || height >= maximumY) continue
    const interpolation = (height - start.y) / (end.y - start.y)
    intersections.push(start.x + (end.x - start.x) * interpolation)
  }

  const xs = distinctSorted(intersections)
  if (xs.length % 2 !== 0) {
    throw new Error(`Profile has an odd number of intersections at height ${height}`)
  }

  const intervals: ProfileInterval[] = []
  for (let index = 0; index < xs.length; index += 2) {
    if (xs[index + 1] - xs[index] <= PROFILE_EPSILON) continue
    intervals.push({ minimumOffset: xs[index], maximumOffset: xs[index + 1] })
  }
  return intervals
}

function intervalDistance(
  first: readonly ProfileInterval[],
  second: readonly ProfileInterval[]
): number {
  if (first.length !== second.length) return Number.POSITIVE_INFINITY
  let maximum = 0
  for (let index = 0; index < first.length; index += 1) {
    maximum = Math.max(
      maximum,
      Math.abs(first[index].minimumOffset - second[index].minimumOffset),
      Math.abs(first[index].maximumOffset - second[index].maximumOffset)
    )
  }
  return maximum
}

function intervalsEqual(
  first: readonly ProfileInterval[],
  second: readonly ProfileInterval[]
): boolean {
  return intervalDistance(first, second) <= PROFILE_EPSILON
}

/** Converts an arbitrary closed profile polygon into bounded-error vertical bands. */
export function sliceProfileIntoBands(
  profile: Profile,
  maximumProfileError = 0.05
): ProfileBand[] {
  if (!Number.isFinite(maximumProfileError) || maximumProfileError <= 0) {
    throw new RangeError('maximumProfileError must be a finite number greater than zero')
  }

  const points = CookieCutterGenerator.prepareProfile(profile)
  const heights = distinctSorted(points.map((point) => point.y))
  if (heights.length < 2) throw new Error('Profile must span at least two heights')
  const bands: ProfileBand[] = []

  for (let heightIndex = 0; heightIndex < heights.length - 1; heightIndex += 1) {
    const bottom = heights[heightIndex]
    const top = heights[heightIndex + 1]
    const span = top - bottom
    if (span <= PROFILE_EPSILON) continue
    const inset = Math.min(span * 1e-6, 1e-6)
    const bottomIntervals = intervalsAtHeight(points, bottom + inset)
    const topIntervals = intervalsAtHeight(points, top - inset)
    const lateralShift = intervalDistance(bottomIntervals, topIntervals)
    if (!Number.isFinite(lateralShift)) {
      throw new Error(`Profile topology changes unexpectedly between heights ${bottom} and ${top}`)
    }
    const subdivisions = Math.max(1, Math.ceil(lateralShift / (2 * maximumProfileError)))
    const bandError = lateralShift / (2 * subdivisions)

    for (let subdivision = 0; subdivision < subdivisions; subdivision += 1) {
      const bandBottom = bottom + span * subdivision / subdivisions
      const bandTop = bottom + span * (subdivision + 1) / subdivisions
      const sampleHeight = (bandBottom + bandTop) / 2
      const intervals = intervalsAtHeight(points, sampleHeight)
      if (intervals.length === 0) continue

      const previous = bands[bands.length - 1]
      if (
        previous
        && Math.abs(previous.top - bandBottom) <= PROFILE_EPSILON
        && intervalsEqual(previous.intervals, intervals)
      ) {
        previous.top = bandTop
        previous.maximumLateralError = Math.max(
          previous.maximumLateralError,
          bandError
        )
      } else {
        bands.push({
          bottom: bandBottom,
          top: bandTop,
          intervals,
          maximumLateralError: bandError
        })
      }
    }
  }

  if (bands.length === 0) throw new Error('Profile does not contain an extrudable area')
  return bands
}

function footprintForIntervals(
  source: PlanarRegion,
  intervals: readonly ProfileInterval[],
  join: PlanarJoin,
  miterLimit: number
): PlanarRegion {
  const footprints = intervals.map((interval) => {
    const outer = offsetPlanarRegion(source, interval.maximumOffset, {
      join,
      miterLimit
    })
    const inner = offsetPlanarRegion(source, interval.minimumOffset, {
      join,
      miterLimit
    })
    return subtractPlanarRegions(outer, inner)
  }).filter((region) => region.paths.length > 0)

  return footprints.length > 0
    ? unionPlanarRegions(footprints)
    : { paths: [], unitsPerMillimeter: source.unitsPerMillimeter }
}

/**
 * Sweeps a physical profile with robust planar offsets instead of vertex miters.
 * Sloped profile edges are represented by deterministic, bounded-error steps.
 */
export function sweepProfileOverPlanarOutline(
  options: ProfiledPlanarSweepOptions
): ProfiledPlanarSweepResult {
  return sweepProfileOverPlanarRegion({
    ...options,
    region: createPlanarRegion([{ points: options.outline, kind: 'outer' }])
  })
}

/** Sweeps the same profile around every outer and hole boundary in a compound region. */
export function sweepProfileOverPlanarRegion(
  options: ProfiledPlanarRegionSweepOptions
): ProfiledPlanarSweepResult {
  const maximumProfileError = options.maximumProfileError ?? 0.05
  const join = options.join ?? 'miter'
  const miterLimit = options.miterLimit ?? 4
  const layerOverlap = options.layerOverlap ?? 0.002
  const simplificationTolerance = options.simplificationTolerance
    ?? Math.min(0.01, maximumProfileError / 5)
  if (!Number.isFinite(layerOverlap) || layerOverlap < 0) {
    throw new RangeError('layerOverlap must be a finite non-negative number')
  }
  if (!Number.isFinite(simplificationTolerance) || simplificationTolerance < 0) {
    throw new RangeError('simplificationTolerance must be a finite non-negative number')
  }
  const source = simplifyPlanarRegion(options.region, simplificationTolerance)
  const bands = sliceProfileIntoBands(options.profile, maximumProfileError)
  const slabs: PlanarRegionSlab[] = bands.map((band) => {
    const footprint = footprintForIntervals(source, band.intervals, join, miterLimit)
    return { bottom: band.bottom, top: band.top, region: footprint }
  })
  const geometry: Geometry = extrudeStackedPlanarRegions(slabs)

  if (geometry.faces.length === 0) {
    throw new Error('Profile sweep collapsed after robust planar offsets')
  }

  return {
    geometry,
    bands,
    slabs,
    maximumLateralError: Math.max(...bands.map((band) => band.maximumLateralError))
  }
}
