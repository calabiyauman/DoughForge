import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createPlanarRegion,
  fingerprintPlanarRegion,
  groupPlanarRegion,
  inspectPlanarRegion,
  intersectPlanarRegions,
  offsetPlanarRegion,
  PlanarKernelError,
  simplifyPlanarRegion,
  strokePlanarPaths,
  subtractPlanarRegions,
  unionPlanarRegions
} from '../lib/geometry/planarKernel'

function square(x: number, y: number, size: number) {
  return [
    { x, y },
    { x: x + size, y },
    { x: x + size, y: y + size },
    { x, y: y + size }
  ]
}

test('canonicalizes equivalent rings across start point and winding', () => {
  const first = createPlanarRegion([{ points: square(0, 0, 10) }])
  const shiftedAndReversed = square(0, 0, 10).reverse()
  shiftedAndReversed.push(shiftedAndReversed.shift()!)
  const second = createPlanarRegion([{ points: shiftedAndReversed }])

  assert.equal(fingerprintPlanarRegion(first), fingerprintPlanarRegion(second))
  assert.deepEqual(inspectPlanarRegion(first), {
    rings: 1,
    components: 1,
    holes: 0,
    area: 100,
    bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10, width: 10, height: 10 }
  })
})

test('unions overlapping regions into one deterministic component', () => {
  const first = createPlanarRegion([{ points: square(0, 0, 10) }])
  const second = createPlanarRegion([{ points: square(5, 0, 10) }])
  const merged = unionPlanarRegions([first, second])

  assert.equal(inspectPlanarRegion(merged).components, 1)
  assert.equal(inspectPlanarRegion(merged).area, 150)
  assert.equal(
    fingerprintPlanarRegion(merged),
    fingerprintPlanarRegion(unionPlanarRegions([second, first]))
  )
})

test('subtracts and groups holes without losing their topology', () => {
  const outer = createPlanarRegion([{ points: square(0, 0, 10) }])
  const inner = createPlanarRegion([{ points: square(2, 2, 6) }])
  const result = subtractPlanarRegions(outer, inner)
  const report = inspectPlanarRegion(result)
  const polygons = groupPlanarRegion(result)

  assert.equal(report.area, 64)
  assert.equal(report.components, 1)
  assert.equal(report.holes, 1)
  assert.equal(polygons.length, 1)
  assert.equal(polygons[0].holes.length, 1)
})

test('intersects regions at the configured micron precision', () => {
  const first = createPlanarRegion([{ points: square(0, 0, 10) }])
  const second = createPlanarRegion([{ points: square(9.9994, 0, 10) }])
  const overlap = intersectPlanarRegions(first, second)

  assert.equal(inspectPlanarRegion(overlap).area, 0.01)
  assert.equal(inspectPlanarRegion(overlap).bounds?.width, 0.001)
})

test('offsets closed regions with exact mitered square corners', () => {
  const source = createPlanarRegion([{ points: square(0, 0, 10) }])
  const result = offsetPlanarRegion(source, 1, { join: 'miter' })

  assert.deepEqual(inspectPlanarRegion(result), {
    rings: 1,
    components: 1,
    holes: 0,
    area: 144,
    bounds: { minX: -1, minY: -1, maxX: 11, maxY: 11, width: 12, height: 12 }
  })
})

test('buffers and merges open paths with explicit joins and end caps', () => {
  const result = strokePlanarPaths(
    [[{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]],
    2,
    { join: 'round', endCap: 'round', arcTolerance: 0.02 }
  )
  const report = inspectPlanarRegion(result)

  assert.equal(report.components, 1)
  assert.equal(report.holes, 0)
  assert.ok(report.area > 40)
  assert.ok(report.area < 44)
  assert.ok(report.bounds)
  assert.ok(Math.abs(report.bounds.minX + 1) <= 0.002)
  assert.ok(Math.abs(report.bounds.minY + 1) <= 0.002)
  assert.ok(Math.abs(report.bounds.maxX - 11) <= 0.002)
  assert.ok(Math.abs(report.bounds.maxY - 11) <= 0.002)
})

test('rejects invalid coordinates and self-intersecting inputs before clipping', () => {
  assert.throws(
    () => createPlanarRegion([{ points: [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
      { x: 10, y: 0 }
    ] }]),
    (error: unknown) => error instanceof PlanarKernelError
      && /self-intersects/.test(error.message)
  )

  assert.throws(
    () => createPlanarRegion([{ points: [
      { x: 0, y: 0 },
      { x: Number.NaN, y: 0 },
      { x: 0, y: 1 }
    ] }]),
    /must be finite/
  )
})

test('can explicitly repair fill-rule self-crossings while validating the output', () => {
  const repaired = createPlanarRegion([{ points: [
    { x: 0, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
    { x: 10, y: 0 }
  ] }], {
    fillRule: 'evenodd',
    repairSelfIntersections: true
  })

  assert.equal(inspectPlanarRegion(repaired).components, 2)
  assert.equal(inspectPlanarRegion(repaired).area, 50)
})

test('splits point-touching union output into separate canonical components', () => {
  const repaired = createPlanarRegion([
    { points: square(0, 0, 10) },
    { points: square(10, 10, 10) }
  ], { repairSelfIntersections: true })

  assert.equal(inspectPlanarRegion(repaired).components, 2)
  assert.equal(inspectPlanarRegion(repaired).area, 200)
})

test('simplifies oversampled curves within an explicit geometric tolerance', () => {
  const points = Array.from({ length: 4_000 }, (_, index) => {
    const angle = index / 4_000 * Math.PI * 2
    return { x: Math.cos(angle) * 20, y: Math.sin(angle) * 20 }
  })
  const source = createPlanarRegion([{ points }])
  const simplified = simplifyPlanarRegion(source, 0.01)
  const sourceArea = inspectPlanarRegion(source).area
  const simplifiedArea = inspectPlanarRegion(simplified).area

  assert.ok(
    simplified.paths[0].length < source.paths[0].length / 4,
    `expected ${simplified.paths[0].length} points to be less than a quarter of ${source.paths[0].length}`
  )
  assert.ok(
    Math.abs(sourceArea - simplifiedArea) / sourceArea < 0.001,
    `area changed from ${sourceArea} to ${simplifiedArea}`
  )
})
