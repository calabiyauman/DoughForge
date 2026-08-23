import type { ProfileReference } from '../design'
import type { Profile } from '../generators/ProfileGenerator'
import { REFERENCE_V3_PROFILE } from './measuredReferenceV3'

const PROFILE_NAMES: Record<string, string> = {
  'reference-v3': 'Reference V3 (Measured)',
  professional: 'Legacy Professional',
  classic: 'Classic Straight',
  bella: 'Bella Style',
  ergonomic: 'Ergonomic',
  custom: 'Custom'
}

/** Captures the exact generated cross-section in the persisted DesignSpec. */
export function profileReferenceFromProfile(profile: Profile): ProfileReference {
  const measurements: Record<string, number> = {}
  for (const [name, value] of Object.entries(profile.metadata)) {
    if (typeof value === 'number' && Number.isFinite(value)) measurements[name] = value
  }

  if (profile.type === REFERENCE_V3_PROFILE.id) {
    Object.assign(measurements, {
      overallHeight: REFERENCE_V3_PROFILE.overallHeight,
      flangeHeight: REFERENCE_V3_PROFILE.flangeHeight,
      wallThickness: REFERENCE_V3_PROFILE.wallThickness,
      cuttingLipThickness: REFERENCE_V3_PROFILE.cuttingLipThickness,
      flangeWidth: REFERENCE_V3_PROFILE.flangeWidth
    })
  }

  if (Object.keys(measurements).length === 0) {
    const xs = profile.points.map((point) => point.x)
    const ys = profile.points.map((point) => point.y)
    measurements.profileWidth = Math.max(...xs) - Math.min(...xs)
    measurements.profileHeight = Math.max(...ys) - Math.min(...ys)
  }

  return {
    id: `doughforge:${profile.type}`,
    name: PROFILE_NAMES[profile.type] ?? profile.type,
    ...(profile.type === REFERENCE_V3_PROFILE.id ? { revision: 'measured-v3' } : {}),
    measurements,
    parameters: {
      crossSectionPoints: profile.points.map(({ x, y }) => ({ x, y }))
    }
  }
}
