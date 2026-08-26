import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DESIGN_SPEC_SCHEMA,
  DESIGN_SPEC_UNITS,
  DESIGN_SPEC_VERSION,
  DesignSpecValidationError,
  assertValidDesignSpec,
  designSpecFromLegacyOutline,
  isDesignSpec,
  parseDesignSpec,
  serializeDesignSpec,
  validateDesignSpec,
  type DesignSpec
} from '../lib/design'

function completeDesign(): DesignSpec {
  return {
    schema: DESIGN_SPEC_SCHEMA,
    version: DESIGN_SPEC_VERSION,
    units: DESIGN_SPEC_UNITS,
    id: 'mitt-with-details',
    name: 'Mitt with details',
    canvas: {
      origin: { x: -40, y: -30 },
      size: { width: 80, height: 60 }
    },
    target: {
      size: { width: 100, height: 75 },
      fit: 'contain'
    },
    contours: [
      {
        id: 'cut-outer',
        kind: 'closed-contour',
        role: 'cut',
        relationship: { kind: 'outer' },
        points: [
          { x: -40, y: -30 },
          { x: 40, y: -30 },
          { x: 40, y: 30 },
          { x: -40, y: 30 }
        ]
      },
      {
        id: 'cut-hole',
        kind: 'closed-contour',
        role: 'cut',
        relationship: { kind: 'hole', outerContourId: 'cut-outer' },
        fillRule: 'evenodd',
        points: [
          { x: -6, y: -5 },
          { x: 6, y: -5 },
          { x: 6, y: 5 },
          { x: -6, y: 5 }
        ]
      },
      {
        id: 'emboss-glyph',
        kind: 'closed-contour',
        role: 'emboss',
        relationship: { kind: 'outer' },
        points: [
          { x: -2, y: 10 },
          { x: 2, y: 10 },
          { x: 2, y: 16 },
          { x: -2, y: 16 }
        ]
      },
      {
        id: 'support-pad',
        kind: 'closed-contour',
        role: 'support',
        relationship: { kind: 'outer' },
        points: [
          { x: -15, y: -20 },
          { x: -10, y: -20 },
          { x: -10, y: -15 },
          { x: -15, y: -15 }
        ]
      },
      {
        id: 'handle-pad',
        kind: 'closed-contour',
        role: 'handle',
        relationship: { kind: 'outer' },
        points: [
          { x: 10, y: -20 },
          { x: 20, y: -20 },
          { x: 20, y: -15 },
          { x: 10, y: -15 }
        ]
      }
    ],
    strokes: [{
      id: 'stamp-seam',
      kind: 'open-stroke',
      role: 'stamp',
      points: [
        { x: -20, y: 0 },
        { x: 0, y: 12 },
        { x: 20, y: 0 }
      ],
      width: 1.2,
      lineCap: 'round',
      lineJoin: 'round'
    }],
    parts: [
      {
        id: 'cutter-and-stamp',
        name: 'Cutter and stamp',
        geometryIds: ['cut-outer', 'cut-hole', 'emboss-glyph', 'stamp-seam']
      },
      {
        id: 'print-aids',
        name: 'Print aids',
        geometryIds: ['support-pad', 'handle-pad'],
        transform: [1, 0, 0, 1, 0, 0]
      }
    ],
    assemblies: [{
      id: 'complete-tool',
      name: 'Complete tool',
      partIds: ['cutter-and-stamp', 'print-aids']
    }],
    profile: {
      id: 'clean-v3',
      name: 'Clean v3',
      revision: '3.0',
      measurements: {
        outerOffset: 6.35,
        outerHeight: 10.16,
        innerOffset: -2.79,
        innerHeight: 17.78,
        chamfer: 2.29
      },
      parameters: {
        chamferAngleDegrees: 80
      }
    },
    constraints: {
      process: 'fdm',
      nozzleDiameter: 0.4,
      layerHeight: 0.2,
      minimumWallThickness: 0.8,
      minimumFeatureSize: 0.8,
      minimumClearance: 0.4,
      maximumOverhangAngleDegrees: 55,
      buildVolume: { width: 220, depth: 220, height: 250 }
    },
    provenance: {
      generator: {
        name: 'DoughForge',
        version: '0.1.0',
        model: 'reference-guided',
        prompt: 'baseball mitt cookie cutter with seam details'
      },
      sources: [{
        id: 'prompt-1',
        kind: 'prompt',
        name: 'User prompt',
        rights: { owner: 'user' }
      }],
      transformations: [{
        kind: 'vectorize',
        description: 'Resolved candidate artwork into role-separated paths'
      }]
    },
    text: [{
      id: 'initial',
      text: 'D',
      fontFamily: 'sans-serif',
      resolvedContourIds: ['emboss-glyph']
    }],
    metadata: {
      mode: 'outline+stamp',
      labels: ['gold-candidate', 'paired-reference']
    }
  }
}

test('a compound multipart DesignSpec validates and survives a JSON round trip', () => {
  const design = completeDesign()

  assert.deepEqual(validateDesignSpec(design), { valid: true, issues: [] })
  assert.equal(isDesignSpec(design), true)

  const serialized = serializeDesignSpec(design, { space: 2 })
  const parsed = parseDesignSpec(serialized)

  assert.deepEqual(parsed, design)
  assert.equal(parsed.units, 'mm')
  assert.match(serialized, /"version": 1/)
})

test('validation reports actionable topology, reference, and path errors together', () => {
  const invalid = completeDesign() as unknown as Record<string, any>
  invalid.units = 'in'
  invalid.contours[1].relationship.outerContourId = 'missing-outer'
  invalid.contours[2].points.push({ ...invalid.contours[2].points[0] })
  invalid.strokes[0].id = 'cut-outer'
  invalid.strokes[0].points = [{ x: 0, y: 0 }]
  invalid.parts[1].geometryIds.push('does-not-exist')
  invalid.text[0].resolvedContourIds = ['missing-glyph']

  const result = validateDesignSpec(invalid)
  const codes = new Set(result.issues.map((issue) => issue.code))

  assert.equal(result.valid, false)
  assert.ok(codes.has('units'))
  assert.ok(codes.has('unknown_outer_contour'))
  assert.ok(codes.has('repeated_closure'))
  assert.ok(codes.has('duplicate_geometry_id'))
  assert.ok(codes.has('point_count'))
  assert.ok(codes.has('unknown_geometry'))
  assert.ok(codes.has('unknown_contour'))
  assert.throws(() => assertValidDesignSpec(invalid), DesignSpecValidationError)
})

test('legacy single-outline adapter preserves coordinates and removes seam duplicates', () => {
  const legacy = {
    type: 'Square',
    points: [
      { x: -25, y: -20 },
      { x: 25, y: -20 },
      { x: 25, y: 20 },
      { x: -25, y: 20 },
      { x: -25, y: -20 },
      { x: -25, y: -20 }
    ]
  }
  const original = structuredClone(legacy)

  const design = designSpecFromLegacyOutline(legacy, {
    id: 'legacy-square',
    target: {
      size: { width: 75, height: 60 },
      fit: 'contain'
    }
  })

  assert.equal(isDesignSpec(design), true)
  assert.equal(design.units, 'mm')
  assert.deepEqual(design.canvas, {
    origin: { x: -25, y: -20 },
    size: { width: 50, height: 40 }
  })
  assert.equal(design.contours[0].points.length, 4)
  assert.deepEqual(design.contours[0].relationship, { kind: 'outer' })
  assert.equal(design.contours[0].role, 'cut')
  assert.deepEqual(design.parts[0].geometryIds, ['legacy-square:outline'])
  assert.equal(design.provenance.sources[0].kind, 'legacy-outline')
  assert.deepEqual(legacy, original)
})

test('legacy adapter rejects degenerate outlines instead of emitting an invalid contract', () => {
  assert.throws(
    () => designSpecFromLegacyOutline({
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 0, y: 0 }
      ]
    }),
    DesignSpecValidationError
  )
})

test('serialization rejects cyclic or non-JSON metadata', () => {
  const design = completeDesign()
  const cyclic: Record<string, unknown> = {}
  cyclic.self = cyclic
  ;(design as unknown as { metadata: unknown }).metadata = cyclic

  const result = validateDesignSpec(design)

  assert.equal(result.valid, false)
  assert.ok(result.issues.some((issue) => issue.code === 'json_cycle'))
  assert.throws(() => serializeDesignSpec(design), DesignSpecValidationError)
})
