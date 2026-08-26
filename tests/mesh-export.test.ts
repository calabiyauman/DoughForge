import assert from 'node:assert/strict'
import test from 'node:test'
import type { Geometry } from '../lib/generators/CookieCutterGenerator'
import {
  MAX_MESH_NAME_LENGTH,
  MeshExportError,
  serializeAsciiSTL,
  serializeOBJ
} from '../lib/exporters/meshExport'

const slopedTriangle: Geometry = {
  vertices: new Float32Array([
    0, 0, 0,
    1, 0, 0,
    0, 1, 1
  ]),
  faces: new Uint32Array([0, 1, 2])
}

test('ASCII STL contains a real unit normal derived from triangle winding', () => {
  const stl = serializeAsciiSTL(slopedTriangle, { solidName: 'sloped-test' })
  const normalMatch = stl.match(/facet normal (\S+) (\S+) (\S+)/)

  assert.ok(normalMatch)
  const normal = normalMatch.slice(1).map(Number)
  assert.ok(Math.abs(normal[0]) < 1e-12)
  assert.ok(Math.abs(normal[1] + Math.SQRT1_2) < 1e-12)
  assert.ok(Math.abs(normal[2] - Math.SQRT1_2) < 1e-12)
  assert.ok(Math.abs(Math.hypot(...normal) - 1) < 1e-12)
  assert.match(stl, /^solid sloped-test\n/)
  assert.match(stl, /      vertex 0 1 1\n/)
  assert.match(stl, /\nendsolid sloped-test\n$/)
})

test('OBJ vertices retain geometry coordinates and faces use one-based indices', () => {
  const obj = serializeOBJ({
    vertices: new Float32Array([
      -1, 0, 2,
      3, 4, 5,
      6, 7, 8,
      9, 10, 11
    ]),
    faces: new Uint32Array([0, 2, 3])
  }, { objectName: 'index-test' })

  assert.match(obj, /^# Dough Forge OBJ export\no index-test\n/)
  assert.match(obj, /^v -1 0 2$/m)
  assert.match(obj, /^v 9 10 11$/m)
  assert.match(obj, /^f 1 3 4$/m)
  assert.doesNotMatch(obj, /^f 0 /m)
})

test('serializers reject malformed vertex and face tuple arrays', () => {
  assert.throws(
    () => serializeAsciiSTL({
      vertices: new Float32Array([0, 0, 0, 1]),
      faces: new Uint32Array([0, 0, 0])
    }),
    (error: unknown) => (
      error instanceof MeshExportError
      && /three complete XYZ coordinates/.test(error.message)
    )
  )

  assert.throws(
    () => serializeOBJ({
      vertices: slopedTriangle.vertices,
      faces: new Uint32Array([0, 1])
    }),
    /at least one complete triangle/
  )
})

test('serializers reject non-finite coordinates and out-of-range face indices', () => {
  assert.throws(
    () => serializeAsciiSTL({
      vertices: new Float32Array([0, 0, 0, 1, 0, 0, 0, Number.NaN, 1]),
      faces: new Uint32Array([0, 1, 2])
    }),
    /coordinate 7 must be finite/
  )

  assert.throws(
    () => serializeOBJ({
      vertices: slopedTriangle.vertices,
      faces: new Uint32Array([0, 1, 3])
    }),
    /out-of-range vertex 3/
  )
})

test('degenerate triangles are rejected by default or explicitly skipped', () => {
  const geometry: Geometry = {
    vertices: new Float32Array([
      0, 0, 0,
      1, 0, 0,
      2, 0, 0,
      0, 1, 0
    ]),
    faces: new Uint32Array([
      0, 1, 2,
      0, 1, 3
    ])
  }

  assert.throws(() => serializeAsciiSTL(geometry), /Triangle 0 is degenerate/)
  assert.throws(() => serializeOBJ(geometry), /Triangle 0 is degenerate/)

  const stl = serializeAsciiSTL(geometry, { degenerateTriangles: 'skip' })
  const obj = serializeOBJ(geometry, { degenerateTriangles: 'skip' })
  assert.equal((stl.match(/facet normal/g) ?? []).length, 1)
  assert.equal((obj.match(/^f /gm) ?? []).length, 1)
  assert.match(obj, /^f 1 2 4$/m)
})

test('skip policy rejects an export when every triangle is degenerate', () => {
  const allDegenerate: Geometry = {
    vertices: new Float32Array([
      0, 0, 0,
      1, 0, 0,
      2, 0, 0
    ]),
    faces: new Uint32Array([0, 1, 2])
  }

  assert.throws(
    () => serializeAsciiSTL(allDegenerate, { degenerateTriangles: 'skip' }),
    /no non-degenerate triangles after filtering/
  )
  assert.throws(
    () => serializeOBJ(allDegenerate, { degenerateTriangles: 'skip' }),
    /no non-degenerate triangles after filtering/
  )
})

test('mesh names are printable ASCII and no more than 80 characters', () => {
  const maximumLengthName = 'a'.repeat(MAX_MESH_NAME_LENGTH)

  assert.match(
    serializeAsciiSTL(slopedTriangle, { solidName: maximumLengthName }),
    new RegExp(`^solid ${maximumLengthName}\\n`)
  )
  assert.match(
    serializeOBJ(slopedTriangle, { objectName: maximumLengthName }),
    new RegExp(`^# Dough Forge OBJ export\\no ${maximumLengthName}\\n`)
  )

  for (const invalidName of [
    'tab\tinside',
    'non-ascii-☃',
    'a'.repeat(MAX_MESH_NAME_LENGTH + 1)
  ]) {
    assert.throws(
      () => serializeAsciiSTL(slopedTriangle, { solidName: invalidName }),
      /printable ASCII|80 characters or fewer/
    )
    assert.throws(
      () => serializeOBJ(slopedTriangle, { objectName: invalidName }),
      /printable ASCII|80 characters or fewer/
    )
  }
})

test('runtime validation enforces the typed-array Geometry contract', () => {
  const invalid = {
    vertices: [0, 0, 0, 1, 0, 0, 0, 1, 0],
    faces: [0, 1, 2]
  } as unknown as Geometry

  assert.throws(() => serializeAsciiSTL(invalid), /vertices must be a Float32Array/)
})
