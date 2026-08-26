import assert from 'node:assert/strict'
import test from 'node:test'
import {
  SvgPathDataError,
  flattenSvgPathData,
  parseSvgPathData,
  tokenizeSvgPathData
} from '../lib/parsers/svgPathData'

test('tokenizer accepts compact SVG numbers and retains their source offsets', () => {
  const tokens = tokenizeSvgPathData('M.5-.5L1e1,2E+1z')

  assert.deepEqual(
    tokens.map((token) => token.type === 'number' ? token.value : token.value),
    ['M', 0.5, -0.5, 'L', 10, 20, 'z']
  )
  assert.equal(tokens[1].offset, 1)
  assert.equal(tokens[2].offset, 3)
})

test('parser expands repetitions and turns additional moveto pairs into lineto', () => {
  const commands = parseSvgPathData(
    'M0 0 10 0 10 10 H5 0 V5 0 C0 1 1 2 2 3 3 4 4 5 5 6 ' +
    'S6 7 7 8 8 9 9 10 Q10 11 11 12 12 13 13 14 T14 15 15 16 ' +
    'A2 3 0 0 1 16 17 3 4 45 1 0 18 19z'
  )

  assert.deepEqual(
    commands.map((command) => command.type),
    ['M', 'L', 'L', 'H', 'H', 'V', 'V', 'C', 'C', 'S', 'S',
      'Q', 'Q', 'T', 'T', 'A', 'A', 'z']
  )
})

test('relative line commands and multiple subpaths flatten with exact closure', () => {
  const subpaths = flattenSvgPathData(
    'm0 0 l10 0 0 10 h-10 v-10 z m20 0 h10 10 v10 -10 z'
  )

  assert.equal(subpaths.length, 2)
  assert.ok(subpaths.every((subpath) => subpath.closed))
  assert.deepEqual(subpaths[0].points[0], { x: 0, y: 0 })
  assert.deepEqual(subpaths[0].points.at(-1), subpaths[0].points[0])
  assert.deepEqual(subpaths[1].points[0], { x: 20, y: 0 })
  assert.deepEqual(subpaths[1].points.at(-1), subpaths[1].points[0])
})

test('cubic, smooth cubic, quadratic, and smooth quadratic curves flatten adaptively', () => {
  const path = 'M0 0 C0 10 10 10 10 0 S20 -10 20 0 q5 10 10 0 t10 0'
  const coarse = flattenSvgPathData(path, { tolerance: 2 })[0]
  const fine = flattenSvgPathData(path, { tolerance: 0.05 })[0]

  assert.ok(fine.points.length > coarse.points.length)
  assert.deepEqual(fine.points[0], { x: 0, y: 0 })
  assert.deepEqual(fine.points.at(-1), { x: 40, y: 0 })
  assert.ok(fine.points.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y)))
})

test('elliptical arcs support compact flags, rotations, and relative endpoints', () => {
  const compact = parseSvgPathData('M0 0A10 10 0 0110 10')
  assert.deepEqual(compact[1].values, [10, 10, 0, 0, 1, 10, 10])

  const path = 'M0 0 A10 10 0 0 1 20 0 a5 10 45 1 0 10 0'
  const coarse = flattenSvgPathData(path, { tolerance: 2 })[0]
  const fine = flattenSvgPathData(path, { tolerance: 0.05 })[0]

  assert.ok(fine.points.length > coarse.points.length)
  assert.deepEqual(fine.points.at(-1), { x: 30, y: 0 })
  assert.ok(fine.points.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y)))
})

test('all lowercase drawing commands resolve relative to the current point', () => {
  const subpath = flattenSvgPathData(
    'm10 10 l5 0 h5 v5 c0 5 5 5 5 0 s5 -5 5 0 q5 5 10 0 t10 0 a5 5 0 0 1 5 5 z',
    { tolerance: 0.2 }
  )[0]

  assert.equal(subpath.closed, true)
  assert.deepEqual(subpath.points[0], { x: 10, y: 10 })
  assert.deepEqual(subpath.points.at(-1), subpath.points[0])
})

test('malformed path data fails with source-aware errors', () => {
  const invalidPaths = [
    'L0 0',
    'M0',
    'M0 0 C1 2 3',
    'M0 0 A10 10 0 2 0 20 20',
    'M0,,1',
    'M0 0 R1 1',
    'M0 0 L1e 2'
  ]

  for (const path of invalidPaths) {
    assert.throws(() => parseSvgPathData(path), SvgPathDataError)
  }
})

test('flattening options reject unsafe or meaningless limits', () => {
  assert.throws(() => flattenSvgPathData('M0 0L1 1', { tolerance: 0 }), RangeError)
  assert.throws(() => flattenSvgPathData('M0 0L1 1', { maxCurveDepth: -1 }), RangeError)
  assert.throws(() => flattenSvgPathData('M0 0L1 1', { maxSegments: 0 }), RangeError)
})
