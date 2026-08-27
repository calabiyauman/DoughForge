import assert from 'node:assert/strict'
import test from 'node:test'
import {
  BUILD_PLANE_Y,
  calculatePreviewPlacement
} from '../lib/geometry/previewPlacement'
import { createPreviewBufferGeometry } from '../lib/geometry/previewGeometry'

test('places the cutter bottom on the build plane instead of centering its height', () => {
  const vertices = new Float32Array([
    -10, 0, -4,
    6, 12, 8,
    2, 3, -2
  ])

  const placement = calculatePreviewPlacement(vertices)

  assert.deepEqual(placement.translation, [2, 0, -2])
  assert.deepEqual(placement.dimensions, [16, 12, 12])
  assert.deepEqual(placement.target, [0, 6, 0])

  const transformedYs = [
    vertices[1] + placement.translation[1],
    vertices[4] + placement.translation[1],
    vertices[7] + placement.translation[1]
  ]
  assert.equal(Math.min(...transformedYs), BUILD_PLANE_Y)
})

test('raises geometry authored below zero and keeps the camera target centered', () => {
  const placement = calculatePreviewPlacement(new Float32Array([
    20, -5, 10,
    30, 15, 30
  ]))

  assert.deepEqual(placement.translation, [-25, 5, -20])
  assert.deepEqual(placement.target, [0, 10, 0])
})

test('builds an anchored preview without mutating export geometry', () => {
  const vertices = new Float32Array([
    -4, 0, -2,
    4, 10, -2,
    0, 0, 6
  ])
  const faces = new Uint32Array([0, 1, 2])
  const originalVertices = vertices.slice()
  const originalFaces = faces.slice()

  const preview = createPreviewBufferGeometry({ vertices, faces })

  assert.deepEqual(vertices, originalVertices)
  assert.deepEqual(faces, originalFaces)
  assert.equal(preview.boundingBox?.min.y, BUILD_PLANE_Y)
  assert.equal(preview.boundingBox?.max.y, 10)
  preview.dispose()
})

test('rejects incomplete or non-finite preview geometry', () => {
  assert.throws(
    () => calculatePreviewPlacement(new Float32Array([0, 1])),
    /complete vertex triples/
  )
  assert.throws(
    () => calculatePreviewPlacement([0, Number.NaN, 0]),
    /non-finite coordinate/
  )
})
