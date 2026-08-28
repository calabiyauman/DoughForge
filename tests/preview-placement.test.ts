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

test('keeps cap and wall normals separated at intentional profile creases', () => {
  const preview = createPreviewBufferGeometry({
    vertices: new Float32Array([
      0, 1, 0,
      1, 1, 0,
      0, 1, 1,
      0, 0, 0
    ]),
    faces: new Uint32Array([
      0, 2, 1,
      0, 1, 3
    ])
  })
  const normals = preview.getAttribute('normal')

  assert.equal(preview.index, null)
  assert.equal(normals.count, 6)
  for (let index = 0; index < normals.count; index += 1) {
    const x = normals.getX(index)
    const y = normals.getY(index)
    const z = normals.getZ(index)
    assert.ok(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z))
    assert.ok(Math.abs(Math.hypot(x, y, z) - 1) < 1e-6)
    if (index < 3) {
      assert.ok(Math.abs(x) < 1e-6)
      assert.ok(Math.abs(y - 1) < 1e-6)
      assert.ok(Math.abs(z) < 1e-6)
    } else {
      assert.ok(Math.abs(x) < 1e-6)
      assert.ok(Math.abs(y) < 1e-6)
      assert.ok(Math.abs(z + 1) < 1e-6)
    }
  }
  preview.dispose()
})

test('angle-weights curved wall normals without triangle-diagonal bias', () => {
  const squareRootThree = Math.sqrt(3)
  const preview = createPreviewBufferGeometry({
    vertices: new Float32Array([
      0, 0, 0,
      1, 0, 0,
      1, 1, 0,
      0, 1, 0,
      0, 0, 0,
      squareRootThree / 2, 0, -0.5,
      squareRootThree / 2, 1, -0.5,
      0, 1, 0
    ]),
    faces: new Uint32Array([
      0, 1, 2,
      0, 2, 3,
      4, 5, 7,
      5, 6, 7
    ])
  })
  const normals = preview.getAttribute('normal')
  const expectedX = (Math.sqrt(6) - Math.sqrt(2)) / 4
  const expectedZ = (Math.sqrt(6) + Math.sqrt(2)) / 4

  for (const index of [0, 3, 5, 6, 8, 11]) {
    assert.ok(Math.abs(normals.getX(index) - expectedX) < 1e-6)
    assert.ok(Math.abs(normals.getY(index)) < 1e-6)
    assert.ok(Math.abs(normals.getZ(index) - expectedZ) < 1e-6)
  }
  preview.dispose()
})

test('keeps an exact 45-degree profile boundary hard', () => {
  const diagonal = Math.SQRT1_2
  const preview = createPreviewBufferGeometry({
    vertices: new Float32Array([
      0, 0, 0,
      0, 1, 0,
      1, 0, 0,
      diagonal, 0, -diagonal
    ]),
    faces: new Uint32Array([
      0, 2, 1,
      0, 3, 1
    ])
  })
  const normals = preview.getAttribute('normal')

  for (const index of [0, 1, 2]) {
    assert.ok(Math.abs(normals.getX(index)) < 1e-6)
    assert.ok(Math.abs(normals.getY(index)) < 1e-6)
    assert.ok(Math.abs(normals.getZ(index) - 1) < 1e-6)
  }
  for (const index of [3, 4, 5]) {
    assert.ok(Math.abs(normals.getX(index) - diagonal) < 1e-6)
    assert.ok(Math.abs(normals.getY(index)) < 1e-6)
    assert.ok(Math.abs(normals.getZ(index) - diagonal) < 1e-6)
  }
  preview.dispose()
})

test('filters degenerate faces without dropping valid preview triangles', () => {
  const preview = createPreviewBufferGeometry({
    vertices: new Float32Array([
      0, 0, 0,
      1, 0, 0,
      0, 1, 0,
      2, 0, 0
    ]),
    faces: new Uint32Array([
      0, 1, 2,
      0, 0, 1,
      0, 1, 3
    ])
  })
  const normals = preview.getAttribute('normal')

  assert.equal(preview.getAttribute('position').count, 3)
  assert.equal(normals.count, 3)
  for (let index = 0; index < normals.count; index += 1) {
    assert.ok(Math.abs(normals.getZ(index) - 1) < 1e-6)
  }
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
