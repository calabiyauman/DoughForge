import assert from 'node:assert/strict'
import test from 'node:test'
import { analyzeMesh } from '../lib/geometry/meshValidation'
import {
  sliceProfileIntoBands,
  sweepProfileOverPlanarOutline
} from '../lib/geometry/profiledPlanarSweep'
import { referenceV3Profile } from '../lib/profiles/measuredReferenceV3'

test('measured V3 profile bands retain physical breakpoints within bounded error', () => {
  const bands = sliceProfileIntoBands(referenceV3Profile(), 0.05)

  assert.equal(bands[0].bottom, 0)
  assert.equal(bands[0].top, 2.032)
  assert.deepEqual(bands[0].intervals, [{
    minimumOffset: -1.27,
    maximumOffset: 5.51
  }])
  assert.equal(bands.at(-1)?.top, 25.4)
  assert.ok(bands.length > 2)
  assert.ok(bands.every((band) => band.maximumLateralError <= 0.05))
})

test('concave acute outlines produce only closed manifold profile bands', () => {
  const outline = [
    { x: 0, y: 0 },
    { x: 20, y: 0 },
    { x: 20, y: 20 },
    { x: 11, y: 20 },
    { x: 10, y: 4 },
    { x: 9, y: 20 },
    { x: 0, y: 20 }
  ]
  const result = sweepProfileOverPlanarOutline({
    outline,
    profile: referenceV3Profile(),
    maximumProfileError: 0.05
  })
  const report = analyzeMesh(result.geometry)
  if (!report.isWatertight) {
    console.log(JSON.stringify({
      components: report.connectedComponentCount,
      boundary: report.boundaryEdges.length,
      nonManifold: report.nonManifoldEdges.length,
      winding: report.inconsistentlyOrientedEdges.length,
      duplicate: report.duplicateTriangles.length,
      degenerate: report.degenerateTriangleIndices.length
    }))
  }

  assert.equal(report.isWatertight, true)
  assert.equal(report.connectedComponentCount, 1)
  assert.equal(report.boundaryEdges.length, 0)
  assert.equal(report.nonManifoldEdges.length, 0)
  assert.equal(report.inconsistentlyOrientedEdges.length, 0)
  assert.ok(result.maximumLateralError <= 0.05)
})
