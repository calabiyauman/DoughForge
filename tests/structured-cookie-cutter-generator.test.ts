import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DESIGN_SPEC_SCHEMA,
  DESIGN_SPEC_UNITS,
  DESIGN_SPEC_VERSION,
  type ClosedContour,
  type DesignAssembly,
  type DesignPart,
  type DesignSpec,
  type OpenStroke
} from '../lib/design'
import { ProfileGenerator } from '../lib/generators/ProfileGenerator'
import { StructuredCookieCutterGenerator } from '../lib/generators/StructuredCookieCutterGenerator'

type GeometryElement = ClosedContour | OpenStroke

function designWithGeometry(
  elements: GeometryElement[],
  options: {
    parts?: DesignPart[]
    assemblies?: DesignAssembly[]
    canvasWidth?: number
    canvasHeight?: number
    targetWidth?: number
    targetHeight?: number
  } = {}
): DesignSpec {
  const geometryIds = elements.map((element) => element.id)
  const parts = options.parts ?? [{
    id: 'main-part',
    name: 'Main part',
    geometryIds
  }]
  const assemblies = options.assemblies ?? [{
    id: 'main-assembly',
    name: 'Main assembly',
    partIds: parts.map((part) => part.id)
  }]

  return {
    schema: DESIGN_SPEC_SCHEMA,
    version: DESIGN_SPEC_VERSION,
    units: DESIGN_SPEC_UNITS,
    id: 'structured-test',
    name: 'Structured generator test',
    canvas: {
      origin: { x: 0, y: 0 },
      size: {
        width: options.canvasWidth ?? 40,
        height: options.canvasHeight ?? 30
      }
    },
    target: {
      size: {
        width: options.targetWidth ?? 80,
        height: options.targetHeight ?? 60
      },
      fit: 'contain'
    },
    contours: elements.filter(
      (element): element is ClosedContour => element.kind === 'closed-contour'
    ),
    strokes: elements.filter(
      (element): element is OpenStroke => element.kind === 'open-stroke'
    ),
    parts,
    assemblies,
    profile: {
      id: 'test-profile',
      name: 'Test profile',
      measurements: { height: 12 }
    },
    constraints: {
      process: 'fdm',
      nozzleDiameter: 0.4,
      minimumWallThickness: 0.8,
      minimumFeatureSize: 0.8,
      minimumClearance: 0.4
    },
    provenance: {
      sources: [{ id: 'test-source', kind: 'manual' }],
      transformations: []
    }
  }
}

function square(
  id: string,
  role: ClosedContour['role'],
  x: number,
  y: number,
  size: number,
  relationship: ClosedContour['relationship'] = { kind: 'outer' }
): ClosedContour {
  return {
    id,
    kind: 'closed-contour',
    role,
    relationship,
    points: [
      { x, y },
      { x: x + size, y },
      { x: x + size, y: y + size },
      { x, y: y + size }
    ]
  }
}

const profile = ProfileGenerator.classic({
  wallThickness: 1.2,
  height: 12,
  cutterThickness: 0.8
})

test('generates every outer, hole, and role-separated closed contour', () => {
  const design = designWithGeometry([
    square('outer', 'cut', 0, 0, 30),
    square('hole', 'cut', 10, 10, 8, { kind: 'hole', outerContourId: 'outer' }),
    square('stamp-detail', 'stamp', 4, 4, 4)
  ])

  const result = StructuredCookieCutterGenerator.generate({ design, profile })

  assert.ok(result.geometry.vertices.length > 0)
  assert.ok(result.geometry.faces.length > 0)
  assert.equal(result.metadata.generatedElements, 3)
  assert.equal(result.metadata.skippedElements, 0)
  assert.equal(result.metadata.roleCounts.cut, 2)
  assert.equal(result.metadata.roleCounts.stamp, 1)
  assert.deepEqual(
    result.metadata.elements.map((element) => element.id),
    ['outer', 'hole', 'stamp-detail']
  )
})

test('uses lower role-specific heights for emboss details than the cutting wall', () => {
  const design = designWithGeometry([
    square('cut-wall', 'cut', 0, 0, 20),
    square('emboss-detail', 'emboss', 25, 5, 5)
  ])

  const result = StructuredCookieCutterGenerator.generate({ design, profile })
  const cut = result.metadata.elements.find((element) => element.id === 'cut-wall')
  const emboss = result.metadata.elements.find((element) => element.id === 'emboss-detail')

  assert.ok(cut)
  assert.ok(emboss)
  assert.ok(cut.height > emboss.height)
  assert.ok(Math.abs(cut.height - result.metadata.roleHeights.cut) < 1e-5)
  assert.ok(Math.abs(emboss.height - result.metadata.roleHeights.emboss) < 1e-5)
})

test('composes part and assembly transforms without mutating authored points', () => {
  const first = square('first', 'stamp', 0, 0, 10)
  const second = square('second', 'stamp', 0, 0, 10)
  const design = designWithGeometry(
    [first, second],
    {
      parts: [
        { id: 'part-a', name: 'Part A', geometryIds: ['first'] },
        {
          id: 'part-b',
          name: 'Part B',
          geometryIds: ['second'],
          transform: [1, 0, 0, 1, 10, 0]
        }
      ],
      assemblies: [
        { id: 'assembly-a', name: 'Assembly A', partIds: ['part-a'] },
        {
          id: 'assembly-b',
          name: 'Assembly B',
          partIds: ['part-b'],
          transform: [1, 0, 0, 1, 15, 0]
        }
      ],
      canvasWidth: 35,
      canvasHeight: 10,
      targetWidth: 70,
      targetHeight: 20
    }
  )
  const authoredSnapshot = JSON.stringify(design)

  const result = StructuredCookieCutterGenerator.generate({ design, profile })
  const firstMetadata = result.metadata.elements.find((element) => element.id === 'first')
  const secondMetadata = result.metadata.elements.find((element) => element.id === 'second')

  assert.ok(firstMetadata)
  assert.ok(secondMetadata)
  const firstCenterX = (firstMetadata.bounds.minX + firstMetadata.bounds.maxX) / 2
  const secondCenterX = (secondMetadata.bounds.minX + secondMetadata.bounds.maxX) / 2
  assert.ok(Math.abs(firstCenterX + 25) < 1e-5)
  assert.ok(Math.abs(secondCenterX - 25) < 1e-5)
  assert.equal(JSON.stringify(design), authoredSnapshot)
})

test('caps an open round-ended stroke as a watertight indexed ribbon prism', () => {
  const stroke: OpenStroke = {
    id: 'open-stamp',
    kind: 'open-stroke',
    role: 'stamp',
    width: 1.2,
    lineCap: 'round',
    lineJoin: 'miter',
    points: [
      { x: 0, y: 0 },
      { x: 12, y: 0 },
      { x: 12, y: 10 }
    ]
  }
  const design = designWithGeometry([stroke], {
    canvasWidth: 12,
    canvasHeight: 10,
    targetWidth: 24,
    targetHeight: 20
  })

  const result = StructuredCookieCutterGenerator.generate({ design, profile })
  const { vertices, faces } = result.geometry
  const vertexCount = vertices.length / 3

  assert.equal(result.metadata.generatedElements, 1)
  assert.equal(result.metadata.skippedElements, 0)
  assert.equal(result.metadata.roleCounts.stamp, 1)
  assert.ok(Array.from(vertices).every(Number.isFinite))

  const edgeUse = new Map<string, number>()
  for (let index = 0; index < faces.length; index += 3) {
    const triangle = [faces[index], faces[index + 1], faces[index + 2]]
    assert.ok(triangle.every((vertexIndex) => vertexIndex < vertexCount))
    assert.equal(new Set(triangle).size, 3)

    const [first, second, third] = triangle
    const ax = vertices[second * 3] - vertices[first * 3]
    const ay = vertices[second * 3 + 1] - vertices[first * 3 + 1]
    const az = vertices[second * 3 + 2] - vertices[first * 3 + 2]
    const bx = vertices[third * 3] - vertices[first * 3]
    const by = vertices[third * 3 + 1] - vertices[first * 3 + 1]
    const bz = vertices[third * 3 + 2] - vertices[first * 3 + 2]
    const crossMagnitude = Math.hypot(
      ay * bz - az * by,
      az * bx - ax * bz,
      ax * by - ay * bx
    )
    assert.ok(crossMagnitude > 1e-6)

    for (const [start, end] of [[first, second], [second, third], [third, first]]) {
      const key = start < end ? `${start}:${end}` : `${end}:${start}`
      edgeUse.set(key, (edgeUse.get(key) ?? 0) + 1)
    }
  }

  for (const count of edgeUse.values()) assert.equal(count, 2)
})

test('merges a dense contour without spreading its typed vertex buffer', () => {
  const segmentCount = 12_000
  const points = Array.from({ length: segmentCount }, (_, index) => {
    const angle = index / segmentCount * Math.PI * 2
    return {
      x: 20 + Math.cos(angle) * 18,
      y: 20 + Math.sin(angle) * 18
    }
  })
  const denseContour: ClosedContour = {
    id: 'dense-outline',
    kind: 'closed-contour',
    role: 'cut',
    relationship: { kind: 'outer' },
    points
  }
  const design = designWithGeometry([denseContour], {
    canvasWidth: 40,
    canvasHeight: 40,
    targetWidth: 80,
    targetHeight: 80
  })

  const result = StructuredCookieCutterGenerator.generate({ design, profile })

  assert.equal(result.metadata.generatedElements, 1)
  assert.equal(result.metadata.skippedElements, 0)
  assert.ok(result.geometry.vertices.length > 125_000)
  assert.ok(result.geometry.faces.length > 0)
})

test('rejects a valid design when every transformed element collapses', () => {
  const collapsed = square('collapsed-outline', 'cut', 0, 0, 10)
  const design = designWithGeometry(
    [collapsed],
    {
      parts: [{
        id: 'collapsed-part',
        name: 'Collapsed part',
        geometryIds: ['collapsed-outline'],
        transform: [0, 0, 0, 0, 0, 0]
      }],
      assemblies: [{
        id: 'collapsed-assembly',
        name: 'Collapsed assembly',
        partIds: ['collapsed-part']
      }]
    }
  )

  assert.throws(
    () => StructuredCookieCutterGenerator.generate({ design, profile }),
    (error: unknown) => {
      assert.ok(error instanceof Error)
      assert.match(error.message, /No printable geometry was produced \(1 of 1 elements skipped\)/)
      assert.match(error.message, /Skipped closed-contour "collapsed-outline"/)
      return true
    }
  )
})
