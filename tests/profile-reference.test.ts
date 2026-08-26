import assert from 'node:assert/strict'
import test from 'node:test'
import { ProfileGenerator } from '../lib/generators/ProfileGenerator'
import { profileReferenceFromProfile } from '../lib/profiles/profileReference'

test('measured V3 geometry is captured by the persisted profile reference', () => {
  const profile = ProfileGenerator.generate('reference-v3')
  const reference = profileReferenceFromProfile(profile)

  assert.equal(reference.id, 'doughforge:reference-v3')
  assert.equal(reference.revision, 'measured-v3')
  assert.equal(reference.measurements.overallHeight, 25.4)
  assert.equal(reference.measurements.flangeWidth, 6.78)
  assert.deepEqual(reference.parameters?.crossSectionPoints, profile.points)
})

test('editable professional settings are captured instead of leaving a stale profile', () => {
  const profile = ProfileGenerator.professional({
    outerOffset: 7,
    outerHeight: 11,
    innerOffset: -3,
    innerHeight: 19,
    chamfer: 2
  })
  const reference = profileReferenceFromProfile(profile)

  assert.equal(reference.id, 'doughforge:professional')
  assert.equal(reference.measurements.outerOffset, 7)
  assert.equal(reference.measurements.innerHeight, 19)
  assert.deepEqual(reference.parameters?.crossSectionPoints, profile.points)
})
