import assert from 'node:assert/strict'
import test from 'node:test'
import type { Geometry } from '../lib/generators/CookieCutterGenerator'
import { analyzeMesh, validateMesh } from '../lib/geometry/meshValidation'

const tetrahedron: Geometry = {
  vertices: new Float32Array([
    0, 0, 0,
    1, 0, 0,
    0, 1, 0,
    0, 0, 1
  ]),
  faces: new Uint32Array([
    0, 2, 1,
    0, 1, 3,
    0, 3, 2,
    1, 2, 3
  ])
}

test('recognizes a consistently wound closed tetrahedron as watertight', () => {
  const report = analyzeMesh(tetrahedron)

  assert.equal(report.vertexCount, 4)
  assert.equal(report.weldedVertexCount, 4)
  assert.equal(report.triangleCount, 4)
  assert.equal(report.validTriangleCount, 4)
  assert.equal(report.connectedComponentCount, 1)
  assert.deepEqual(report.connectedComponents[0].triangleIndices, [0, 1, 2, 3])
  assert.deepEqual(report.boundaryEdges, [])
  assert.deepEqual(report.nonManifoldEdges, [])
  assert.deepEqual(report.inconsistentlyOrientedEdges, [])
  assert.equal(report.isWatertight, true)
  assert.deepEqual(validateMesh(tetrahedron), report)
})

test('reports boundary edges on an open surface', () => {
  const report = analyzeMesh({
    vertices: new Float32Array([
      0, 0, 0,
      1, 0, 0,
      0, 1, 0
    ]),
    faces: new Uint32Array([0, 1, 2])
  })

  assert.deepEqual(
    report.boundaryEdges.map((edge) => edge.vertices),
    [[0, 1], [1, 2], [0, 2]]
  )
  assert.ok(report.boundaryEdges.every((edge) => edge.incidentTriangles[0] === 0))
  assert.equal(report.connectedComponentCount, 1)
  assert.equal(report.isWatertight, false)
})

test('welds coincident triangle-soup vertices using the configured tolerance', () => {
  const triangleSoup: Geometry = {
    vertices: new Float32Array([
      0, 0, 0, 0, 1, 0, 1, 0, 0,
      0.000004, 0, 0, 1, 0, 0, 0, 0, 1,
      0, 0, 0, 0, 0, 1, 0, 1, 0,
      1, 0, 0, 0, 1, 0, 0, 0, 1
    ]),
    faces: new Uint32Array([
      0, 1, 2,
      3, 4, 5,
      6, 7, 8,
      9, 10, 11
    ])
  }

  const welded = analyzeMesh(triangleSoup)
  assert.equal(welded.weldedVertexCount, 4)
  assert.deepEqual(welded.boundaryEdges, [])
  assert.equal(welded.connectedComponentCount, 1)
  assert.equal(welded.isWatertight, true)

  const unwelded = analyzeMesh(triangleSoup, { vertexWeldTolerance: 1e-7 })
  assert.equal(unwelded.weldedVertexCount, 5)
  assert.ok(unwelded.boundaryEdges.length > 0)
  assert.equal(unwelded.isWatertight, false)
})

test('reports non-finite vertices and out-of-range face indices without throwing', () => {
  const report = analyzeMesh({
    vertices: new Float32Array([
      0, 0, 0,
      1, 0, 0,
      0, 1, 0,
      Number.NaN, 0, 0
    ]),
    faces: new Uint32Array([
      0, 1, 4,
      0, 1, 3,
      0, 1, 2
    ])
  })

  assert.deepEqual(report.nonFiniteCoordinateIndices, [9])
  assert.deepEqual(report.nonFiniteVertexIndices, [3])
  assert.deepEqual(report.invalidFaceIndices, [
    { triangleIndex: 0, corner: 2, vertexIndex: 4 }
  ])
  assert.deepEqual(report.trianglesWithNonFiniteVertices, [1])
  assert.equal(report.validTriangleCount, 1)
  assert.equal(report.isWatertight, false)
})

test('excludes repeated-vertex and zero-area triangles from topology', () => {
  const report = analyzeMesh({
    vertices: new Float32Array([
      0, 0, 0,
      1, 0, 0,
      2, 0, 0,
      0, 1, 0,
      0.000001, 0, 0
    ]),
    faces: new Uint32Array([
      0, 1, 2,
      0, 1, 4,
      0, 1, 3
    ])
  })

  assert.deepEqual(report.degenerateTriangleIndices, [0, 1])
  assert.equal(report.validTriangleCount, 1)
  assert.equal(report.boundaryEdges.length, 3)
  assert.equal(report.isWatertight, false)
})

test('reports an edge shared by more than two triangles as non-manifold', () => {
  const report = analyzeMesh({
    vertices: new Float32Array([
      0, 0, 0,
      1, 0, 0,
      0, 1, 0,
      0, -1, 0,
      0, 0, 1
    ]),
    faces: new Uint32Array([
      0, 1, 2,
      1, 0, 3,
      0, 1, 4
    ])
  })

  assert.deepEqual(report.nonManifoldEdges, [{
    vertices: [0, 1],
    incidentTriangles: [0, 1, 2]
  }])
  assert.equal(report.connectedComponentCount, 1)
  assert.equal(report.isWatertight, false)
})

test('duplicate faces and inconsistent winding cannot pass as watertight', () => {
  const duplicateReport = analyzeMesh({
    vertices: new Float32Array([
      0, 0, 0,
      1, 0, 0,
      0, 1, 0
    ]),
    faces: new Uint32Array([
      0, 1, 2,
      2, 1, 0
    ])
  })

  assert.deepEqual(duplicateReport.boundaryEdges, [])
  assert.deepEqual(duplicateReport.nonManifoldEdges, [])
  assert.deepEqual(duplicateReport.duplicateTriangles, [
    { triangleIndex: 1, duplicateOf: 0 }
  ])
  assert.equal(duplicateReport.isWatertight, false)

  const windingReport = analyzeMesh({
    vertices: new Float32Array([
      0, 0, 0,
      1, 0, 0,
      1, 1, 0,
      0, 1, 0
    ]),
    faces: new Uint32Array([
      0, 1, 2,
      0, 3, 2
    ])
  })

  assert.deepEqual(windingReport.inconsistentlyOrientedEdges, [{
    vertices: [0, 2],
    incidentTriangles: [0, 1]
  }])
  assert.equal(windingReport.isWatertight, false)
})

test('counts disconnected closed shells independently without treating them as leaks', () => {
  const report = analyzeMesh({
    vertices: new Float32Array([
      ...tetrahedron.vertices,
      3, 0, 0,
      4, 0, 0,
      3, 1, 0,
      3, 0, 1
    ]),
    faces: new Uint32Array([
      ...tetrahedron.faces,
      4, 6, 5,
      4, 5, 7,
      4, 7, 6,
      5, 6, 7
    ])
  })

  assert.equal(report.connectedComponentCount, 2)
  assert.deepEqual(
    report.connectedComponents.map((component) => component.triangleIndices),
    [[0, 1, 2, 3], [4, 5, 6, 7]]
  )
  assert.equal(report.isWatertight, true)
})

test('reports incomplete tuples and validates tolerance options', () => {
  const report = analyzeMesh({
    vertices: new Float32Array([0, 0, 0, 1]),
    faces: new Uint32Array([0, 0, 0, 0])
  })

  assert.equal(report.trailingVertexCoordinateCount, 1)
  assert.equal(report.trailingFaceIndexCount, 1)
  assert.deepEqual(report.degenerateTriangleIndices, [0])
  assert.equal(report.isWatertight, false)

  assert.throws(
    () => analyzeMesh(tetrahedron, { vertexWeldTolerance: 0 }),
    /greater than zero/
  )
  assert.throws(
    () => analyzeMesh(tetrahedron, { degenerateTriangleAreaTolerance: -1 }),
    /non-negative/
  )
})
