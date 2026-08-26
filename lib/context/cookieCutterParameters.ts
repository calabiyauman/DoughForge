export interface CookieCutterParameters {
  scale: number
  profileType: string
  outerOffset: number
  outerHeight: number
  innerOffset: number
  innerHeight: number
  chamfer: number
  optimizePrinting: boolean
  smoothCorners: boolean
  cornerRadius: number
  angleThreshold: number
}

export const DEFAULT_COOKIE_CUTTER_PARAMETERS: Readonly<CookieCutterParameters> = {
  scale: 1,
  profileType: 'reference-v3',
  outerOffset: 6.35,
  outerHeight: 10.16,
  innerOffset: -2.79,
  innerHeight: 17.78,
  chamfer: 2.29,
  optimizePrinting: true,
  // Exact imported corners are preserved unless the user opts in to smoothing.
  smoothCorners: false,
  cornerRadius: 0.5,
  angleThreshold: 15
}

const PROFILE_TYPES = new Set([
  'reference-v3',
  'professional',
  'classic',
  'bella',
  'ergonomic',
  'custom'
])

type NumericParameter = Exclude<{
  [Key in keyof CookieCutterParameters]: CookieCutterParameters[Key] extends number ? Key : never
}[keyof CookieCutterParameters], undefined>

const NUMBER_RANGES: Record<NumericParameter, readonly [number, number]> = {
  scale: [0.1, 10],
  outerOffset: [-50, 50],
  outerHeight: [0.1, 100],
  innerOffset: [-50, 50],
  innerHeight: [0.1, 100],
  chamfer: [0, 20],
  cornerRadius: [0, 20],
  angleThreshold: [0, 180]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readNumber(
  value: unknown,
  name: NumericParameter,
  fallback: number
): number {
  const candidate = value === undefined ? fallback : value
  const [minimum, maximum] = NUMBER_RANGES[name]
  if (
    typeof candidate !== 'number'
    || !Number.isFinite(candidate)
    || candidate < minimum
    || candidate > maximum
  ) {
    throw new RangeError(`${name} must be a finite number from ${minimum} to ${maximum}`)
  }
  return candidate
}

function readBoolean(value: unknown, name: string, fallback: boolean): boolean {
  const candidate = value === undefined ? fallback : value
  if (typeof candidate !== 'boolean') throw new TypeError(`${name} must be a boolean`)
  return candidate
}

/**
 * Validates untrusted project JSON and returns a complete parameter set.
 * Missing fields use the supplied defaults so older project files can migrate.
 */
export function normalizeCookieCutterParameters(
  value: unknown,
  defaults: Readonly<CookieCutterParameters> = DEFAULT_COOKIE_CUTTER_PARAMETERS
): CookieCutterParameters {
  if (!isRecord(value)) throw new TypeError('Project parameters must be an object')

  const profileType = value.profileType === undefined ? defaults.profileType : value.profileType
  if (typeof profileType !== 'string' || !PROFILE_TYPES.has(profileType)) {
    throw new RangeError(`profileType must be one of: ${Array.from(PROFILE_TYPES).join(', ')}`)
  }

  return {
    scale: readNumber(value.scale, 'scale', defaults.scale),
    profileType,
    outerOffset: readNumber(value.outerOffset, 'outerOffset', defaults.outerOffset),
    outerHeight: readNumber(value.outerHeight, 'outerHeight', defaults.outerHeight),
    innerOffset: readNumber(value.innerOffset, 'innerOffset', defaults.innerOffset),
    innerHeight: readNumber(value.innerHeight, 'innerHeight', defaults.innerHeight),
    chamfer: readNumber(value.chamfer, 'chamfer', defaults.chamfer),
    optimizePrinting: readBoolean(
      value.optimizePrinting,
      'optimizePrinting',
      defaults.optimizePrinting
    ),
    smoothCorners: readBoolean(value.smoothCorners, 'smoothCorners', defaults.smoothCorners),
    cornerRadius: readNumber(value.cornerRadius, 'cornerRadius', defaults.cornerRadius),
    angleThreshold: readNumber(value.angleThreshold, 'angleThreshold', defaults.angleThreshold)
  }
}
