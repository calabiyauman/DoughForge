import assert from 'node:assert/strict'
import test from 'node:test'
import { analyzeMesh } from '../lib/geometry/meshValidation'
import {
  extrudePlanarRegion,
  extrudeStackedPlanarRegions,
  normalizePlanarRegionSlabs
} from '../lib/geometry/planarExtrusion'
import {
  createPlanarRegion,
  subtractPlanarRegions,
  unionPlanarRegions
} from '../lib/geometry/planarKernel'

function square(x: number, y: number, size: number) {
  return rectangle(x, y, size, size)
}

function rectangle(x: number, y: number, width: number, height: number) {
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height }
  ]
}

test('extrudes a polygon into one consistently wound watertight component', () => {
  const region = createPlanarRegion([{ points: square(0, 0, 10) }])
  const geometry = extrudePlanarRegion(region, { bottom: 2, top: 5 })
  const report = analyzeMesh(geometry)

  assert.equal(report.isWatertight, true)
  assert.equal(report.connectedComponentCount, 1)
  assert.equal(report.boundaryEdges.length, 0)
  assert.equal(report.nonManifoldEdges.length, 0)
  assert.equal(report.inconsistentlyOrientedEdges.length, 0)
  assert.equal(Math.min(...geometry.vertices.filter((_, index) => index % 3 === 1)), 2)
  assert.equal(Math.max(...geometry.vertices.filter((_, index) => index % 3 === 1)), 5)
})

test('extrudes a compound polygon with a hole as one watertight shell', () => {
  const outer = createPlanarRegion([{ points: square(0, 0, 10) }])
  const hole = createPlanarRegion([{ points: square(2, 2, 6) }])
  const geometry = extrudePlanarRegion(
    subtractPlanarRegions(outer, hole),
    { top: 2 }
  )
  const report = analyzeMesh(geometry)

  assert.equal(report.isWatertight, true)
  assert.equal(report.connectedComponentCount, 1)
  assert.equal(report.boundaryEdges.length, 0)
  assert.equal(report.inconsistentlyOrientedEdges.length, 0)
})

test('preserves intentionally disconnected planar components', () => {
  const first = createPlanarRegion([{ points: square(0, 0, 4) }])
  const second = createPlanarRegion([{ points: square(8, 0, 4) }])
  const geometry = extrudePlanarRegion(
    unionPlanarRegions([first, second]),
    { top: 2 }
  )

  const report = analyzeMesh(geometry)
  assert.equal(report.isWatertight, true)
  assert.equal(report.connectedComponentCount, 2)
})

test('meshes nested slabs as one boundary without internal transition caps', () => {
  const flange = createPlanarRegion([{ points: square(0, 0, 20) }])
  const wall = createPlanarRegion([{ points: square(4, 4, 12) }])
  const geometry = extrudeStackedPlanarRegions([
    { bottom: 0, top: 2, region: flange },
    { bottom: 2, top: 10, region: wall }
  ])
  const report = analyzeMesh(geometry)

  assert.equal(report.isWatertight, true)
  assert.equal(report.connectedComponentCount, 1)
  assert.equal(report.boundaryEdges.length, 0)
  assert.equal(report.nonManifoldEdges.length, 0)
  assert.equal(report.inconsistentlyOrientedEdges.length, 0)
})

test('normalizes overlapping role-like prisms into one clean union boundary', () => {
  const support = createPlanarRegion([{ points: square(0, 0, 20) }])
  const raisedDetail = createPlanarRegion([{ points: square(8, 8, 4) }])
  const slabs = normalizePlanarRegionSlabs([
    { bottom: 0, top: 8, region: raisedDetail },
    { bottom: 0, top: 2, region: support }
  ])

  assert.deepEqual(
    slabs.map(({ bottom, top }) => ({ bottom, top })),
    [
      { bottom: 0, top: 2 },
      { bottom: 2, top: 8 }
    ]
  )

  const geometry = extrudeStackedPlanarRegions(slabs)
  const report = analyzeMesh(geometry)

  assert.equal(report.isWatertight, true)
  assert.equal(report.connectedComponentCount, 1)
  assert.equal(report.boundaryEdges.length, 0)
  assert.equal(report.nonManifoldEdges.length, 0)
  assert.equal(report.inconsistentlyOrientedEdges.length, 0)
  assert.equal(report.duplicateTriangles.length, 0)
})

test('nodes partial-overlap transitions without wall-cap T-junctions', () => {
  const support = createPlanarRegion([{ points: square(0, 0, 10) }])
  const raisedDetail = createPlanarRegion([{ points: square(8, 8, 4) }])
  const slabs = normalizePlanarRegionSlabs([
    { bottom: 0, top: 8, region: raisedDetail },
    { bottom: 0, top: 2, region: support }
  ])
  const geometry = extrudeStackedPlanarRegions(slabs)
  const report = analyzeMesh(geometry)

  assert.equal(report.isWatertight, true)
  assert.equal(report.connectedComponentCount, 1)
  assert.equal(report.boundaryEdges.length, 0)
  assert.equal(report.nonManifoldEdges.length, 0)
  assert.equal(report.inconsistentlyOrientedEdges.length, 0)
  assert.equal(report.duplicateTriangles.length, 0)
})

test('nodes collinear cap boundaries shared by multiple height transitions', () => {
  const center = createPlanarRegion([{ points: rectangle(2, 7, 7, 10) }])
  const leftTab = createPlanarRegion([{ points: rectangle(0, 7, 2, 5) }])
  const raisedRight = createPlanarRegion([{ points: rectangle(6, 9, 8, 6) }])
  const geometry = extrudeStackedPlanarRegions(normalizePlanarRegionSlabs([
    { bottom: 0, top: 5, region: center },
    { bottom: 0, top: 6, region: leftTab },
    { bottom: 0, top: 7, region: raisedRight }
  ]))
  const report = analyzeMesh(geometry)

  assert.equal(report.isWatertight, true)
  assert.equal(report.connectedComponentCount, 1)
  assert.equal(report.boundaryEdges.length, 0)
  assert.equal(report.nonManifoldEdges.length, 0)
  assert.equal(report.inconsistentlyOrientedEdges.length, 0)
  assert.equal(report.duplicateTriangles.length, 0)
})

test('coalesces adjacent normalized intervals with identical footprints', () => {
  const region = createPlanarRegion([{ points: square(0, 0, 10) }])
  const slabs = normalizePlanarRegionSlabs([
    { bottom: 2, top: 4, region },
    { bottom: 0, top: 2, region }
  ])

  assert.equal(slabs.length, 1)
  assert.equal(slabs[0].bottom, 0)
  assert.equal(slabs[0].top, 4)
})
