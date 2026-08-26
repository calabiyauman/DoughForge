import assert from 'node:assert/strict'
import test from 'node:test'
import {
  measuredCutterProfileToProfile,
  REFERENCE_V3_PROFILE,
  referenceV3Profile,
  validateMeasuredCutterProfile
} from '../lib/profiles/measuredReferenceV3'

test('reference v3 preserves its measured physical dimensions', () => {
  const profile = referenceV3Profile()
  const xs = profile.points.map(({ x }) => x)
  const ys = profile.points.map(({ y }) => y)
  const flangeOutsideX = Math.max(...xs)
  const wallInsideX = -REFERENCE_V3_PROFILE.wallThickness
  const top = profile.points.filter(({ y }) => y === REFERENCE_V3_PROFILE.overallHeight)

  assert.deepEqual(REFERENCE_V3_PROFILE, {
    id: 'reference-v3',
    units: 'mm',
    overallHeight: 25.4,
    flangeHeight: 2.032,
    wallThickness: 1.27,
    cuttingLipThickness: 0.99,
    flangeWidth: 6.78
  })
  assert.equal(Math.max(...ys) - Math.min(...ys), REFERENCE_V3_PROFILE.overallHeight)
  assert.ok(
    Math.abs(flangeOutsideX - wallInsideX - REFERENCE_V3_PROFILE.flangeWidth) < 1e-12
  )
  assert.equal(Math.abs(top[0].x - top[1].x), REFERENCE_V3_PROFILE.cuttingLipThickness)
  assert.deepEqual(profile.points[0], profile.points.at(-1))
  assert.equal(profile.metadata.outerHeight, REFERENCE_V3_PROFILE.flangeHeight)
  assert.equal(profile.metadata.wallThickness, REFERENCE_V3_PROFILE.wallThickness)
  assert.equal(profile.metadata.cutterThickness, REFERENCE_V3_PROFILE.cuttingLipThickness)
})

test('measured profile validation reports unsafe dimensions before conversion', () => {
  const invalid = {
    ...REFERENCE_V3_PROFILE,
    overallHeight: 2,
    flangeHeight: 3,
    wallThickness: 1,
    cuttingLipThickness: 1.5,
    flangeWidth: 1
  }
  const errors = validateMeasuredCutterProfile(invalid)

  assert.deepEqual(errors, [
    'flangeHeight must be less than overallHeight',
    'cuttingLipThickness must not exceed wallThickness',
    'flangeWidth must be greater than wallThickness'
  ])
  assert.throws(
    () => measuredCutterProfileToProfile(invalid),
    /Invalid measured cutter profile/
  )
})
