import type { Profile, ProfilePoint } from '../generators/ProfileGenerator'

export interface MeasuredCutterProfile {
  readonly id: string
  readonly units: 'mm'
  readonly overallHeight: number
  readonly flangeHeight: number
  readonly wallThickness: number
  readonly cuttingLipThickness: number
  readonly flangeWidth: number
}

export const REFERENCE_V3_PROFILE: Readonly<MeasuredCutterProfile> = Object.freeze({
  id: 'reference-v3',
  units: 'mm',
  overallHeight: 25.4,
  flangeHeight: 2.032,
  wallThickness: 1.27,
  cuttingLipThickness: 0.99,
  flangeWidth: 6.78
})

const DIMENSION_FIELDS = [
  'overallHeight',
  'flangeHeight',
  'wallThickness',
  'cuttingLipThickness',
  'flangeWidth'
] as const

/**
 * Returns every physical inconsistency instead of stopping at the first one.
 * An empty result means that the measured profile can be converted safely.
 */
export function validateMeasuredCutterProfile(
  definition: MeasuredCutterProfile
): string[] {
  const errors: string[] = []

  for (const field of DIMENSION_FIELDS) {
    const value = definition[field]
    if (!Number.isFinite(value) || value <= 0) {
      errors.push(`${field} must be a finite number greater than zero`)
    }
  }

  if (definition.flangeHeight >= definition.overallHeight) {
    errors.push('flangeHeight must be less than overallHeight')
  }

  if (definition.cuttingLipThickness > definition.wallThickness) {
    errors.push('cuttingLipThickness must not exceed wallThickness')
  }

  if (definition.flangeWidth <= definition.wallThickness) {
    errors.push('flangeWidth must be greater than wallThickness')
  }

  return errors
}

/**
 * Converts an explicitly measured profile to the cross-section currently used
 * by CookieCutterGenerator. The wall's outside face is the x=0 datum. The
 * flange extends outward (+x), while the wall and cutting lip extend inward.
 */
export function measuredCutterProfileToProfile(
  definition: MeasuredCutterProfile = REFERENCE_V3_PROFILE
): Profile {
  const errors = validateMeasuredCutterProfile(definition)
  if (errors.length > 0) {
    throw new RangeError(`Invalid measured cutter profile: ${errors.join('; ')}`)
  }

  const flangeOutsideX = definition.flangeWidth - definition.wallThickness
  const wallInsideX = -definition.wallThickness
  const lipInsideX = -definition.cuttingLipThickness

  const points: ProfilePoint[] = [
    { x: flangeOutsideX, y: 0 },
    { x: flangeOutsideX, y: definition.flangeHeight },
    { x: 0, y: definition.flangeHeight },
    { x: 0, y: definition.overallHeight },
    { x: lipInsideX, y: definition.overallHeight },
    { x: wallInsideX, y: definition.flangeHeight },
    { x: wallInsideX, y: 0 },
    { x: flangeOutsideX, y: 0 }
  ]

  return {
    type: definition.id,
    points,
    metadata: {
      outerOffset: flangeOutsideX,
      outerHeight: definition.flangeHeight,
      innerOffset: wallInsideX,
      innerHeight: definition.overallHeight,
      wallThickness: definition.wallThickness,
      height: definition.overallHeight,
      cutterThickness: definition.cuttingLipThickness,
      description: `Measured ${definition.id} cutter profile (${definition.units})`
    }
  }
}

export function referenceV3Profile(): Profile {
  return measuredCutterProfileToProfile(REFERENCE_V3_PROFILE)
}
