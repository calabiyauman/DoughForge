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

function meshVolume(
  vertices: Float32Array,
  faces: Uint32Array
): number {
  let signedVolume = 0
  for (let index = 0; index < faces.length; index += 3) {
    const first = faces[index] * 3
    const second = faces[index + 1] * 3
    const third = faces[index + 2] * 3
    const ax = vertices[first]
    const ay = vertices[first + 1]
    const az = vertices[first + 2]
    const bx = vertices[second]
    const by = vertices[second + 1]
    const bz = vertices[second + 2]
    const cx = vertices[third]
    const cy = vertices[third + 1]
    const cz = vertices[third + 2]
    signedVolume += ax * (by * cz - bz * cy)
      + ay * (bz * cx - bx * cz)
      + az * (bx * cy - by * cx)
  }
  return Math.abs(signedVolume / 6)
}

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
  assert.equal(result.metadata.meshQuality.watertight, true)
  assert.ok(result.metadata.meshQuality.connectedComponents >= 3)
  assert.equal(result.metadata.productionReadiness.ready, false)
  assert.ok(result.metadata.productionReadiness.reasons.some(
    (reason) => reason.code === 'disconnected-assembly'
  ))
  assert.deepEqual(
    result.metadata.elements.flatMap((element) => element.sourceIds),
    ['outer', 'hole', 'stamp-detail']
  )
  assert.deepEqual(
    result.sourceOutline.paths.map((path) => ({
      sourceId: path.sourceId,
      kind: path.kind,
      relationship: path.relationship,
      closed: path.closed,
      generated: path.generated
    })),
    [
      {
        sourceId: 'outer',
        kind: 'closed-contour',
        relationship: { kind: 'outer' },
        closed: true,
        generated: true
      },
      {
        sourceId: 'hole',
        kind: 'closed-contour',
        relationship: { kind: 'hole', outerContourId: 'outer' },
        closed: true,
        generated: true
      },
      {
        sourceId: 'stamp-detail',
        kind: 'closed-contour',
        relationship: { kind: 'outer' },
        closed: true,
        generated: true
      }
    ]
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

test('turns compound support contours into a filled plate with preserved holes', () => {
  const design = designWithGeometry([
    square('support-outer', 'support', 0, 0, 20),
    square(
      'support-hole',
      'support',
      6,
      6,
      8,
      { kind: 'hole', outerContourId: 'support-outer' }
    )
  ], {
    canvasWidth: 20,
    canvasHeight: 20,
    targetWidth: 40,
    targetHeight: 40
  })

  const result = StructuredCookieCutterGenerator.generate({ design, profile })

  assert.equal(result.metadata.generatedElements, 2)
  assert.equal(result.metadata.elements.length, 1)
  assert.deepEqual(result.metadata.elements[0].sourceIds, [
    'support-outer',
    'support-hole'
  ])
  assert.equal(result.metadata.roleCounts.support, 2)
  assert.equal(result.metadata.meshQuality.watertight, true)
  assert.equal(result.metadata.meshQuality.connectedComponents, 1)
  assert.equal(
    result.metadata.productionReadiness.ready,
    true,
    JSON.stringify(result.metadata.productionReadiness.reasons)
  )
})

test('unions cut, stamp, and support contributions into one assembly boundary', () => {
  const design = designWithGeometry([
    square('cut-wall', 'cut', 1, 1, 28),
    square('stamp-detail', 'stamp', 10, 10, 4),
    square('support-plate', 'support', 0, 0, 30)
  ], {
    canvasWidth: 30,
    canvasHeight: 30,
    targetWidth: 60,
    targetHeight: 60
  })

  const result = StructuredCookieCutterGenerator.generate({ design, profile })

  assert.equal(
    result.metadata.productionReadiness.ready,
    true,
    JSON.stringify(result.metadata.productionReadiness.reasons)
  )
  assert.equal(result.metadata.assemblies.length, 1)
  assert.equal(result.metadata.assemblies[0].meshQuality.watertight, true)
  assert.equal(result.metadata.assemblies[0].meshQuality.connectedComponents, 1)
  assert.equal(result.metadata.meshQuality.connectedComponents, 1)
  assert.equal(result.metadata.meshQuality.duplicateTriangles, 0)
})

test('unions outer-owned compounds without letting one hole cut another outer', () => {
  const design = designWithGeometry([
    square('outer-a', 'support', 0, 0, 20),
    square('outer-b', 'support', 15, 0, 20),
    square(
      'hole-a',
      'support',
      14,
      5,
      5,
      { kind: 'hole', outerContourId: 'outer-a' }
    )
  ], {
    canvasWidth: 35,
    canvasHeight: 20,
    targetWidth: 35,
    targetHeight: 20
  })

  const result = StructuredCookieCutterGenerator.generate({ design, profile })
  const planarArea = meshVolume(
    result.geometry.vertices,
    result.geometry.faces
  ) / result.metadata.roleHeights.support

  // The two outers union to 700 mm². Only the 5 mm² portion of hole-a
  // not covered by outer-b remains absent after the compounds are unioned.
  assert.ok(Math.abs(planarArea - 695) < 1e-3)
  assert.equal(result.metadata.meshQuality.watertight, true)
  assert.equal(result.metadata.meshQuality.connectedComponents, 1)
})

test('rejects a hole assigned to the wrong same-role outer', () => {
  const design = designWithGeometry([
    square('outer-a', 'support', 0, 0, 10),
    square('outer-b', 'support', 20, 0, 10),
    square(
      'wrong-hole',
      'support',
      22,
      2,
      4,
      { kind: 'hole', outerContourId: 'outer-a' }
    )
  ], {
    canvasWidth: 30,
    canvasHeight: 10,
    targetWidth: 30,
    targetHeight: 10
  })

  assert.throws(
    () => StructuredCookieCutterGenerator.generate({ design, profile }),
    /Hole "wrong-hole" lies outside or touches referenced outer contour "outer-a"/
  )
})

test('rejects a hole that touches its referenced outer boundary', () => {
  const design = designWithGeometry([
    square('outer', 'support', 0, 0, 20),
    square(
      'touching-hole',
      'support',
      0,
      6,
      5,
      { kind: 'hole', outerContourId: 'outer' }
    )
  ], {
    canvasWidth: 20,
    canvasHeight: 20,
    targetWidth: 20,
    targetHeight: 20
  })

  assert.throws(
    () => StructuredCookieCutterGenerator.generate({ design, profile }),
    /Hole "touching-hole" lies outside or touches referenced outer contour "outer"/
  )
})

test('preserves an explicit fill rule when building each contour', () => {
  const twiceWoundPoints = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 }
  ]
  const evenodd = square('evenodd', 'support', 0, 0, 10)
  evenodd.points = twiceWoundPoints
  evenodd.fillRule = 'evenodd'

  assert.throws(
    () => StructuredCookieCutterGenerator.generate({
      design: designWithGeometry([evenodd], {
        canvasWidth: 10,
        canvasHeight: 10,
        targetWidth: 10,
        targetHeight: 10
      }),
      profile
    }),
    /Contour "evenodd" produced no planar area/
  )

  const nonzero = { ...evenodd, id: 'nonzero', fillRule: 'nonzero' as const }
  const result = StructuredCookieCutterGenerator.generate({
    design: designWithGeometry([nonzero], {
      canvasWidth: 10,
      canvasHeight: 10,
      targetWidth: 10,
      targetHeight: 10
    }),
    profile
  })
  assert.equal(result.metadata.generatedElements, 1)
  assert.equal(result.metadata.meshQuality.watertight, true)
  assert.equal(result.metadata.productionReadiness.ready, true)
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
  assert.equal(result.metadata.productionReadiness.ready, false)
  assert.ok(result.metadata.productionReadiness.reasons.some(
    (reason) => reason.code === 'multipart-export-unsupported'
  ))
  const firstPath = result.sourceOutline.paths.find((path) => path.sourceId === 'first')
  const secondPath = result.sourceOutline.paths.find((path) => path.sourceId === 'second')
  assert.ok(firstPath)
  assert.ok(secondPath)
  assert.deepEqual(firstPath.points[0], { x: -35, y: -10 })
  assert.deepEqual(secondPath.points[0], { x: 15, y: -10 })
  assert.equal(JSON.stringify(design), authoredSnapshot)
})

test('uses collision-proof source path identities for arbitrary valid IDs', () => {
  const design = designWithGeometry(
    [
      square('d', 'stamp', 0, 0, 5),
      square('c/d', 'stamp', 0, 0, 5)
    ],
    {
      parts: [
        { id: 'c', name: 'First path', geometryIds: ['d'] },
        {
          id: 'b',
          name: 'Second path',
          geometryIds: ['c/d'],
          transform: [1, 0, 0, 1, 20, 0]
        }
      ],
      assemblies: [
        { id: 'a/b', name: 'First assembly', partIds: ['c'] },
        { id: 'a', name: 'Second assembly', partIds: ['b'] }
      ],
      canvasWidth: 25,
      canvasHeight: 5,
      targetWidth: 50,
      targetHeight: 10
    }
  )

  const result = StructuredCookieCutterGenerator.generate({ design, profile })
  const ids = result.sourceOutline.paths.map((path) => path.id)

  assert.equal(new Set(ids).size, 2)
  assert.ok(result.sourceOutline.paths.every((path) => path.generated))
})

test('marks a source path skipped when another path still produces a preview', () => {
  const design = designWithGeometry(
    [
      square('printable', 'cut', 0, 0, 10),
      square('collapsed', 'stamp', 0, 0, 10)
    ],
    {
      parts: [
        { id: 'printable-part', name: 'Printable', geometryIds: ['printable'] },
        {
          id: 'collapsed-part',
          name: 'Collapsed',
          geometryIds: ['collapsed'],
          transform: [0, 0, 0, 0, 30, 0]
        }
      ],
      assemblies: [{
        id: 'main-assembly',
        name: 'Main assembly',
        partIds: ['printable-part', 'collapsed-part']
      }],
      canvasWidth: 40,
      canvasHeight: 10,
      targetWidth: 80,
      targetHeight: 20
    }
  )

  const result = StructuredCookieCutterGenerator.generate({ design, profile })
  const generated = result.sourceOutline.paths.find((path) => path.sourceId === 'printable')
  const skipped = result.sourceOutline.paths.find((path) => path.sourceId === 'collapsed')

  assert.equal(result.metadata.generatedElements, 1)
  assert.equal(result.metadata.skippedElements, 1)
  assert.equal(generated?.generated, true)
  assert.equal(skipped?.generated, false)
})

test('caps an open round-ended stroke as a watertight indexed ribbon prism', () => {
  const stroke: OpenStroke = {
    id: 'open-stamp',
    kind: 'open-stroke',
    role: 'stamp',
    width: 1.2,
    lineCap: 'round',
    lineJoin: 'round',
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
  assert.equal(result.metadata.meshQuality.watertight, true)
  assert.equal(result.metadata.meshQuality.connectedComponents, 1)
  assert.equal(result.metadata.productionReadiness.ready, true)
  assert.deepEqual(
    result.sourceOutline.paths.map((path) => ({
      sourceId: path.sourceId,
      kind: path.kind,
      role: path.role,
      closed: path.closed,
      generated: path.generated,
      points: path.points
    })),
    [{
      sourceId: 'open-stamp',
      kind: 'open-stroke',
      role: 'stamp',
      closed: false,
      generated: true,
      points: [
        { x: -12, y: -10 },
        { x: 12, y: -10 },
        { x: 12, y: 10 }
      ]
    }]
  )
  assert.equal(
    result.metadata.warnings.some((warning) => /bounded miter approximation/.test(warning)),
    false
  )
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

test('blocks colliding physical assemblies instead of flattening their intent', () => {
  const first = square('first-object', 'support', 0, 0, 10)
  const second = square('second-object', 'support', 0, 0, 10)
  const parts: DesignPart[] = [
    { id: 'first-part', name: 'First part', geometryIds: [first.id] },
    { id: 'second-part', name: 'Second part', geometryIds: [second.id] }
  ]
  const design = designWithGeometry([first, second], {
    parts,
    assemblies: [
      { id: 'first-assembly', name: 'First assembly', partIds: ['first-part'] },
      { id: 'second-assembly', name: 'Second assembly', partIds: ['second-part'] }
    ],
    canvasWidth: 10,
    canvasHeight: 10,
    targetWidth: 20,
    targetHeight: 20
  })

  const result = StructuredCookieCutterGenerator.generate({ design, profile })

  assert.equal(result.metadata.productionReadiness.ready, false)
  assert.ok(result.metadata.productionReadiness.reasons.some(
    (reason) => reason.code === 'cross-assembly-collision'
  ))
})

test('requires contribution overlaps to meet the minimum printable feature width', () => {
  const generateWithOverlap = (overlap: number) => {
    const first = square('first-support', 'support', 0, 0, 10)
    const second = square('second-support', 'support', 10 - overlap, 0, 10)
    const width = 20 - overlap
    return StructuredCookieCutterGenerator.generate({
      design: designWithGeometry([first, second], {
        parts: [
          { id: 'first-part', name: 'First part', geometryIds: [first.id] },
          { id: 'second-part', name: 'Second part', geometryIds: [second.id] }
        ],
        assemblies: [{
          id: 'joined-assembly',
          name: 'Joined assembly',
          partIds: ['first-part', 'second-part']
        }],
        canvasWidth: width,
        canvasHeight: 10,
        targetWidth: width,
        targetHeight: 10
      }),
      profile
    })
  }

  const weak = generateWithOverlap(0.001)
  assert.equal(weak.metadata.meshQuality.connectedComponents, 1)
  assert.equal(weak.metadata.productionReadiness.ready, false)
  assert.ok(weak.metadata.productionReadiness.reasons.some(
    (reason) => reason.code === 'weak-attachment'
  ))

  const printable = generateWithOverlap(1)
  assert.equal(
    printable.metadata.productionReadiness.ready,
    true,
    JSON.stringify(printable.metadata.productionReadiness.reasons)
  )
})

test('blocks geometry that exceeds the authored printer build volume', () => {
  const design = designWithGeometry([square('large-support', 'support', 0, 0, 10)], {
    canvasWidth: 10,
    canvasHeight: 10,
    targetWidth: 20,
    targetHeight: 20
  })
  design.constraints.buildVolume = { width: 5, depth: 5, height: 5 }

  const result = StructuredCookieCutterGenerator.generate({ design, profile })

  assert.equal(result.metadata.productionReadiness.ready, false)
  assert.ok(result.metadata.productionReadiness.reasons.some(
    (reason) => reason.code === 'manufacturing-constraints'
  ))
})

test('blocks a cutter profile thinner than the authored nozzle and wall limits', () => {
  const thinProfile = ProfileGenerator.classic({
    wallThickness: 0.2,
    cutterThickness: 0.1,
    height: 12
  })
  const design = designWithGeometry([square('thin-cut', 'cut', 0, 0, 20)], {
    canvasWidth: 20,
    canvasHeight: 20,
    targetWidth: 40,
    targetHeight: 40
  })

  const result = StructuredCookieCutterGenerator.generate({
    design,
    profile: thinProfile
  })

  assert.equal(result.metadata.productionReadiness.ready, false)
  assert.ok(result.metadata.productionReadiness.reasons.some(
    (reason) => reason.code === 'manufacturing-constraints'
  ))
})

test('blocks a filled support with a sub-minimum internal neck', () => {
  const supportWithNeck = (id: string, neckWidth: number): ClosedContour => ({
    id,
    kind: 'closed-contour',
    role: 'support',
    relationship: { kind: 'outer' },
    points: [
      { x: 0, y: 0 },
      { x: 8, y: 0 },
      { x: 8, y: 4 - neckWidth / 2 },
      { x: 12, y: 4 - neckWidth / 2 },
      { x: 12, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 8 },
      { x: 12, y: 8 },
      { x: 12, y: 4 + neckWidth / 2 },
      { x: 8, y: 4 + neckWidth / 2 },
      { x: 8, y: 8 },
      { x: 0, y: 8 }
    ]
  })
  const narrowSupport = supportWithNeck('narrow-support', 0.1)
  const design = designWithGeometry([narrowSupport], {
    canvasWidth: 20,
    canvasHeight: 8,
    targetWidth: 20,
    targetHeight: 8
  })

  const result = StructuredCookieCutterGenerator.generate({ design, profile })

  assert.equal(result.metadata.meshQuality.watertight, true)
  assert.equal(result.metadata.meshQuality.connectedComponents, 1)
  assert.equal(result.metadata.elements[0].minimumCrossSectionWidth, undefined)
  assert.equal(result.metadata.productionReadiness.ready, false)
  assert.ok(result.metadata.productionReadiness.reasons.some(
    (reason) => reason.code === 'manufacturing-constraints'
      && /printable structural core/.test(reason.message)
  ))

  const wallLimitedDesign = designWithGeometry([
    supportWithNeck('wall-limited-support', 1)
  ], {
    canvasWidth: 20,
    canvasHeight: 8,
    targetWidth: 20,
    targetHeight: 8
  })
  wallLimitedDesign.constraints.minimumWallThickness = 2
  const wallLimited = StructuredCookieCutterGenerator.generate({
    design: wallLimitedDesign,
    profile
  })
  assert.equal(wallLimited.metadata.productionReadiness.ready, false)
  assert.ok(wallLimited.metadata.productionReadiness.reasons.some(
    (reason) => reason.code === 'manufacturing-constraints'
      && /2\.000 mm required cross-section/.test(reason.message)
  ))
})

test('reports optimization only when planar simplification is applied', () => {
  const pointCount = 256
  const curvedSupport: ClosedContour = {
    id: 'curved-support',
    kind: 'closed-contour',
    role: 'support',
    relationship: { kind: 'outer' },
    points: Array.from({ length: pointCount }, (_, index) => {
      const angle = index / pointCount * Math.PI * 2
      return {
        x: 10 + Math.cos(angle) * 9,
        y: 10 + Math.sin(angle) * 9
      }
    })
  }
  const design = designWithGeometry([curvedSupport], {
    canvasWidth: 20,
    canvasHeight: 20,
    targetWidth: 20,
    targetHeight: 20
  })

  const unoptimized = StructuredCookieCutterGenerator.generate({
    design,
    profile,
    optimize: false
  })
  const optimized = StructuredCookieCutterGenerator.generate({
    design,
    profile,
    optimize: true
  })

  assert.equal(unoptimized.metadata.optimized, false)
  assert.equal(optimized.metadata.optimized, true)
  assert.ok(optimized.metadata.vertices < unoptimized.metadata.vertices)
  assert.ok(optimized.metadata.faces < unoptimized.metadata.faces)
  assert.equal(optimized.metadata.productionReadiness.ready, true)
})

test('applies the authored corner radius before robust profile offsets', () => {
  const design = designWithGeometry([square('rounded-cut', 'cut', 0, 0, 20)], {
    canvasWidth: 20,
    canvasHeight: 20,
    targetWidth: 40,
    targetHeight: 40
  })
  const smallRadius = StructuredCookieCutterGenerator.generate({
    design,
    profile,
    smoothCorners: true,
    cornerRadius: 0.2,
    angleThreshold: 45
  })
  const largeRadius = StructuredCookieCutterGenerator.generate({
    design,
    profile,
    smoothCorners: true,
    cornerRadius: 2,
    angleThreshold: 45
  })

  assert.equal(smallRadius.metadata.productionReadiness.ready, true)
  assert.equal(largeRadius.metadata.productionReadiness.ready, true)
  assert.notDeepEqual(
    Array.from(smallRadius.geometry.vertices),
    Array.from(largeRadius.geometry.vertices)
  )
})

test('simplifies and generates a dense contour without overflowing typed buffers', () => {
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
  assert.ok(result.geometry.vertices.length > 0)
  assert.ok(result.geometry.vertices.length < 125_000)
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
      assert.match(error.message, /Skipped closed-contour group "collapsed-outline"/)
      return true
    }
  )
})
