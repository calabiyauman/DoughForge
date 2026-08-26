import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEFAULT_COOKIE_CUTTER_PARAMETERS,
  normalizeCookieCutterParameters
} from '../lib/context/cookieCutterParameters'

test('parameter normalization migrates partial legacy settings onto safe defaults', () => {
  const parameters = normalizeCookieCutterParameters({
    scale: 2,
    profileType: 'professional',
    smoothCorners: true
  })

  assert.equal(parameters.scale, 2)
  assert.equal(parameters.profileType, 'professional')
  assert.equal(parameters.smoothCorners, true)
  assert.equal(parameters.outerOffset, DEFAULT_COOKIE_CUTTER_PARAMETERS.outerOffset)
})

test('exact corners are preserved by default', () => {
  assert.equal(DEFAULT_COOKIE_CUTTER_PARAMETERS.smoothCorners, false)
})

test('parameter normalization rejects malformed or unsafe project values', () => {
  assert.throws(() => normalizeCookieCutterParameters(null), /must be an object/)
  assert.throws(() => normalizeCookieCutterParameters({ scale: '3' }), /scale/)
  assert.throws(() => normalizeCookieCutterParameters({ scale: Number.NaN }), /scale/)
  assert.throws(() => normalizeCookieCutterParameters({ scale: 1000 }), /scale/)
  assert.throws(() => normalizeCookieCutterParameters({ profileType: 'unknown' }), /profileType/)
  assert.throws(
    () => normalizeCookieCutterParameters({ optimizePrinting: 'yes' }),
    /optimizePrinting/
  )
})
