import assert from 'node:assert/strict'
import test from 'node:test'
import {
  COOKIE_DESIGN_REVISION_SCHEMA,
  COOKIE_DESIGN_REVISION_VERSION,
  COOKIE_PROJECT_REVISION_SCHEMA,
  COOKIE_PROJECT_REVISION_VERSION,
  DECORATION_SPEC_SCHEMA,
  DECORATION_SPEC_VERSION,
  KIT_BOM_SCHEMA,
  KIT_BOM_VERSION,
  PALETTE_SPEC_SCHEMA,
  PALETTE_SPEC_VERSION,
  PREVIEW_ARTIFACT_SCHEMA,
  PREVIEW_ARTIFACT_VERSION,
  PROJECT_BRIEF_SCHEMA,
  PROJECT_BRIEF_VERSION,
  CanonicalJsonError,
  CookieProjectValidationError,
  allowedProjectLifecycleTransitions,
  assertValidCookieProjectRevision,
  canTransitionProjectLifecycle,
  canonicalJsonStringify,
  computeCookieProjectRevisionHash,
  sealCookieProjectRevision,
  sha256Hex,
  stableContentHash,
  validateCookieProjectRevision,
  type CookieProjectRevision,
  type UnsealedCookieProjectRevision
} from '../lib/project'
import {
  DESIGN_SPEC_SCHEMA,
  DESIGN_SPEC_UNITS,
  DESIGN_SPEC_VERSION,
  type DesignSpec
} from '../lib/design'

function designSpec(): DesignSpec {
  return {
    schema: DESIGN_SPEC_SCHEMA,
    version: DESIGN_SPEC_VERSION,
    units: DESIGN_SPEC_UNITS,
    id: 'butterfly-spec',
    name: 'Butterfly',
    canvas: { origin: { x: 0, y: 0 }, size: { width: 80, height: 60 } },
    target: { size: { width: 80, height: 60 }, fit: 'contain' },
    contours: [
      {
        id: 'cut-outline',
        kind: 'closed-contour',
        role: 'cut',
        relationship: { kind: 'outer' },
        points: [
          { x: 0, y: 30 },
          { x: 20, y: 55 },
          { x: 40, y: 35 },
          { x: 60, y: 55 },
          { x: 80, y: 30 },
          { x: 60, y: 5 },
          { x: 40, y: 25 },
          { x: 20, y: 5 }
        ]
      }
    ],
    strokes: [{
      id: 'stamp-detail',
      kind: 'open-stroke',
      role: 'stamp',
      points: [{ x: 40, y: 12 }, { x: 40, y: 48 }],
      width: 1.2,
      lineCap: 'round',
      lineJoin: 'round'
    }],
    parts: [{
      id: 'butterfly-tool',
      name: 'Butterfly cutter and stamp',
      geometryIds: ['cut-outline', 'stamp-detail']
    }],
    assemblies: [{
      id: 'butterfly-assembly',
      name: 'Butterfly tooling',
      partIds: ['butterfly-tool']
    }],
    profile: {
      id: 'professional-v1',
      name: 'Professional',
      revision: '1',
      measurements: { wallHeight: 17.78, wallThickness: 1.2 }
    },
    constraints: {
      process: 'fdm',
      nozzleDiameter: 0.4,
      layerHeight: 0.2,
      minimumWallThickness: 0.8,
      minimumFeatureSize: 0.8,
      minimumClearance: 0.4
    },
    provenance: {
      createdAt: '2026-09-26T12:00:00.000Z',
      generator: { name: 'DoughForge test fixture', version: '1' },
      sources: [{ id: 'prompt', kind: 'prompt', rights: { owner: 'user' } }],
      transformations: []
    }
  }
}

function unsealedProject(): UnsealedCookieProjectRevision {
  return {
    schema: COOKIE_PROJECT_REVISION_SCHEMA,
    version: COOKIE_PROJECT_REVISION_VERSION,
    id: 'revision-1',
    projectId: 'project-butterfly-party',
    revisionNumber: 1,
    createdAt: '2026-09-26T12:00:00.000Z',
    lifecycle: 'concept',
    brief: {
      schema: PROJECT_BRIEF_SCHEMA,
      version: PROJECT_BRIEF_VERSION,
      id: 'brief-1',
      title: 'Butterfly birthday set',
      prompt: 'A friendly blue butterfly for a child birthday party',
      createdAt: '2026-09-26T12:00:00.000Z',
      requestedDesignCount: 1,
      difficulty: 'easy',
      occasion: 'birthday',
      audience: 'children',
      styles: ['friendly', 'clean'],
      requestedColors: ['sky blue', 'white'],
      avoid: ['tiny isolated details'],
      personalization: [{ label: 'age', value: '6' }],
      inspirationAssets: [],
      targetCookieSize: { width: 80, height: 60 },
      preferredTooling: ['cutter', 'stamp', 'transfer-template'],
      rightsAttestation: { userOwnsOrMayUseInputs: true }
    },
    designs: [{
      schema: COOKIE_DESIGN_REVISION_SCHEMA,
      version: COOKIE_DESIGN_REVISION_VERSION,
      id: 'design-1',
      name: 'Butterfly',
      createdAt: '2026-09-26T12:01:00.000Z',
      sourceBriefId: 'brief-1',
      ordinal: 1,
      designSpec: designSpec()
    }],
    palettes: [{
      schema: PALETTE_SPEC_SCHEMA,
      version: PALETTE_SPEC_VERSION,
      id: 'palette-1',
      name: 'Sky blue birthday',
      colors: [
        {
          id: 'sky-blue',
          name: 'Sky blue',
          target: { hex: '#5BBCEB', lab: { l: 72, a: -13, b: -28, illuminant: 'D65' } },
          role: 'base',
          recipeId: 'recipe-sky-blue'
        },
        { id: 'white', name: 'White', target: { hex: '#FFFFFF' }, role: 'detail' }
      ],
      gelSkus: [{
        id: 'gel-sky-blue',
        brand: 'Example Gel',
        sku: 'EG-SKY-075',
        name: 'Sky Blue',
        packageGrams: 21
      }],
      recipes: [{
        id: 'recipe-sky-blue',
        colorId: 'sky-blue',
        baseIcingGrams: 100,
        additions: [{ gelSkuId: 'gel-sky-blue', amount: 2, unit: 'drop' }],
        restMinutes: 30
      }],
      disclaimer: 'Final color varies with icing ingredients, lighting, and rest time.'
    }],
    decorations: [{
      schema: DECORATION_SPEC_SCHEMA,
      version: DECORATION_SPEC_VERSION,
      id: 'decoration-1',
      name: 'Easy butterfly icing plan',
      designRevisionId: 'design-1',
      paletteSpecId: 'palette-1',
      difficulty: 'easy',
      estimatedMinutes: 25,
      registration: {
        designSpecId: 'butterfly-spec',
        coordinateSpace: 'design-canvas',
        transform: [1, 0, 0, 1, 0, 0]
      },
      regions: [{
        id: 'wing-base',
        name: 'Wing base',
        outer: [
          { x: 0, y: 30 },
          { x: 20, y: 55 },
          { x: 40, y: 35 },
          { x: 60, y: 55 },
          { x: 80, y: 30 },
          { x: 60, y: 5 },
          { x: 40, y: 25 },
          { x: 20, y: 5 }
        ],
        holes: [],
        sourceGeometryIds: ['cut-outline'],
        fillColorId: 'sky-blue'
      }],
      strokes: [{
        id: 'body-detail',
        name: 'Body detail',
        points: [{ x: 40, y: 12 }, { x: 40, y: 48 }],
        width: 1.2,
        closed: false,
        sourceGeometryIds: ['stamp-detail'],
        colorId: 'white',
        lineCap: 'round',
        lineJoin: 'round'
      }],
      steps: [
        {
          id: 'step-flood',
          sequence: 1,
          title: 'Flood the wings',
          instructions: 'Outline and flood the full wing base.',
          technique: 'flood',
          regionIds: ['wing-base'],
          strokeIds: [],
          colorIds: ['sky-blue'],
          dependsOnStepIds: [],
          icingConsistency: 'flood',
          dryTimeMinutes: 20
        },
        {
          id: 'step-body',
          sequence: 2,
          title: 'Pipe the body',
          instructions: 'Pipe the white body over the dry base.',
          technique: 'piped-detail',
          regionIds: [],
          strokeIds: ['body-detail'],
          colorIds: ['white'],
          dependsOnStepIds: ['step-flood'],
          icingConsistency: 'piping',
          dryTimeMinutes: 5
        }
      ]
    }],
    previews: [{
      schema: PREVIEW_ARTIFACT_SCHEMA,
      version: PREVIEW_ARTIFACT_VERSION,
      id: 'preview-1',
      kind: 'decorated-cookie',
      fidelity: 'production-faithful',
      uri: '/generated/project-butterfly-party/revision-1/decorated-cookie.png',
      mimeType: 'image/png',
      widthPixels: 1024,
      heightPixels: 1024,
      altText: 'Blue butterfly cookie with a white piped body',
      createdAt: '2026-09-26T12:02:00.000Z',
      designRevisionIds: ['design-1'],
      decorationSpecIds: ['decoration-1'],
      paletteSpecIds: ['palette-1'],
      generator: { name: 'DoughForge renderer', version: '1' }
    }],
    kits: [{
      schema: KIT_BOM_SCHEMA,
      version: KIT_BOM_VERSION,
      id: 'complete-kit',
      name: 'Complete butterfly project kit',
      status: 'draft',
      currency: 'USD',
      components: [
        {
          id: 'cutter-component',
          kind: 'printed-tool',
          name: 'Butterfly cutter and stamp',
          quantity: 1,
          unit: 'set',
          required: true,
          designRevisionId: 'design-1',
          sellableSku: 'DF-BUTTERFLY-80',
          unitPriceMinor: 1800
        },
        {
          id: 'guide-component',
          kind: 'digital-guide',
          name: 'Butterfly decorating guide',
          quantity: 1,
          unit: 'download',
          required: true,
          previewArtifactId: 'preview-1',
          unitPriceMinor: 0
        },
        {
          id: 'gel-component',
          kind: 'gel-color',
          name: 'Sky blue gel color',
          quantity: 1,
          unit: 'bottle',
          required: false,
          paletteSpecId: 'palette-1',
          gelSkuId: 'gel-sky-blue',
          sellableSku: 'EG-SKY-075',
          unitPriceMinor: 399
        }
      ]
    }]
  }
}

function completeProject(): CookieProjectRevision {
  return sealCookieProjectRevision(unsealedProject())
}

test('a complete cross-artifact cookie project validates and is JSON serializable', () => {
  const project = completeProject()
  const report = validateCookieProjectRevision(project)

  assert.equal(report.status, 'pass')
  assert.deepEqual(report.issues, [])
  assert.doesNotThrow(() => assertValidCookieProjectRevision(project))
  assert.deepEqual(JSON.parse(JSON.stringify(project)), project)
  assert.equal(report.projectRevisionId, project.id)
  assert.equal(report.evaluatedAt, project.createdAt)
})

test('cross-artifact validation reports missing design, geometry, palette, preview, and gel references', () => {
  const project = completeProject()
  project.decorations[0].designRevisionId = 'missing-design'
  project.decorations[0].regions[0].sourceGeometryIds = ['missing-geometry']
  project.decorations[0].steps[0].regionIds = ['missing-region']
  project.previews[0].paletteSpecIds = ['missing-palette']
  project.kits[0].components[1].previewArtifactId = 'missing-preview'
  project.kits[0].components[2].gelSkuId = 'missing-gel'

  const report = validateCookieProjectRevision(sealCookieProjectRevision(project))
  const codes = new Set(report.issues.map((issue) => issue.code))

  assert.equal(report.status, 'fail')
  assert.ok(codes.has('unknown_design_revision'))
  assert.ok(codes.has('unknown_geometry'))
  assert.ok(codes.has('unknown_region'))
  assert.ok(codes.has('unknown_palette'))
  assert.ok(codes.has('unknown_preview'))
  assert.ok(codes.has('unknown_gel_sku'))
  assert.throws(
    () => assertValidCookieProjectRevision(sealCookieProjectRevision(project)),
    CookieProjectValidationError
  )
})

test('decoration steps must be contiguous and only depend on earlier steps', () => {
  const project = completeProject()
  project.decorations[0].steps[0].sequence = 2
  project.decorations[0].steps[0].dependsOnStepIds = ['step-body']

  const report = validateCookieProjectRevision(sealCookieProjectRevision(project))
  const codes = report.issues.map((issue) => issue.code)

  assert.ok(codes.includes('step_sequence'))
  assert.ok(codes.includes('forward_step_dependency'))
})

test('concept revisions may be incomplete, but later lifecycle stages enforce order readiness', () => {
  const concept = completeProject()
  concept.brief.requestedDesignCount = 2
  let report = validateCookieProjectRevision(sealCookieProjectRevision(concept))
  assert.equal(report.status, 'warning')
  assert.equal(report.issues[0].code, 'requested_design_count_mismatch')

  const ready = completeProject()
  ready.lifecycle = 'ready-to-order'
  ready.brief.rightsAttestation.userOwnsOrMayUseInputs = false
  ready.previews[0].fidelity = 'concept'
  report = validateCookieProjectRevision(sealCookieProjectRevision(ready))
  const blockedCodes = new Set(report.issues.map((issue) => issue.code))
  assert.equal(report.status, 'fail')
  assert.ok(blockedCodes.has('rights_not_attested'))
  assert.ok(blockedCodes.has('production_preview_required'))
  assert.ok(blockedCodes.has('orderable_kit_required'))

  ready.brief.rightsAttestation.userOwnsOrMayUseInputs = true
  ready.previews[0].fidelity = 'production-faithful'
  ready.kits[0].status = 'orderable'
  report = validateCookieProjectRevision(sealCookieProjectRevision(ready))
  assert.equal(report.status, 'pass')
})

test('nested DesignSpec validation is surfaced with a stable project path', () => {
  const project = completeProject()
  project.designs[0].designSpec.contours[0].points = [{ x: 0, y: 0 }]

  const report = validateCookieProjectRevision(sealCookieProjectRevision(project))
  const issue = report.issues.find((candidate) => candidate.code === 'design_spec.point_count')

  assert.ok(issue)
  assert.equal(issue.path, 'designs[0].designSpec.contours[0].points')
})

test('canonical JSON and SHA-256 are stable across object insertion order and Unicode', () => {
  const first = { b: 2, nested: { z: '🦋', a: true }, a: 1 }
  const second = { a: 1, nested: { a: true, z: '🦋' }, b: 2 }

  assert.equal(canonicalJsonStringify(first), canonicalJsonStringify(second))
  assert.equal(stableContentHash(first), stableContentHash(second))
  assert.equal(
    sha256Hex('{"a":1,"b":2}'),
    '43258cff783fe7036d8a43033f830adfc60ec037382473548ac742b888292777'
  )
})

test('sealing is immutable, ignores a stale hash, and detects later content mutations', () => {
  const draft = unsealedProject()
  const snapshot = structuredClone(draft)
  const sealed = sealCookieProjectRevision(draft)

  assert.deepEqual(draft, snapshot)
  assert.match(sealed.contentHash, /^sha256:[0-9a-f]{64}$/)
  assert.equal(computeCookieProjectRevisionHash(sealed), sealed.contentHash)
  assert.equal(sealCookieProjectRevision({ ...sealed, contentHash: 'stale' }).contentHash, sealed.contentHash)

  sealed.brief.prompt = 'A changed prompt'
  const report = validateCookieProjectRevision(sealed)
  assert.ok(report.issues.some((issue) => issue.code === 'content_hash_mismatch'))
})

test('canonical hashing rejects non-JSON values and cycles instead of producing ambiguous hashes', () => {
  assert.throws(() => canonicalJsonStringify({ value: Number.NaN }), CanonicalJsonError)
  assert.throws(() => canonicalJsonStringify({ value: undefined }), CanonicalJsonError)

  const cyclic: Record<string, unknown> = {}
  cyclic.self = cyclic
  assert.throws(() => stableContentHash(cyclic), /cyclic references/)
})

test('lifecycle transitions make validation and approval gates explicit', () => {
  assert.deepEqual(allowedProjectLifecycleTransitions('concept'), ['production-validation', 'archived'])
  assert.equal(canTransitionProjectLifecycle('concept', 'production-validation'), true)
  assert.equal(canTransitionProjectLifecycle('production-validation', 'concept'), true)
  assert.equal(canTransitionProjectLifecycle('ready-to-order', 'approved'), true)
  assert.equal(canTransitionProjectLifecycle('approved', 'ordered'), true)
  assert.equal(canTransitionProjectLifecycle('ordered', 'concept'), false)
  assert.equal(canTransitionProjectLifecycle('archived', 'approved'), false)
  assert.equal(canTransitionProjectLifecycle('approved', 'approved'), true)
})
