import assert from 'node:assert/strict'
import test from 'node:test'
import type { AIDecorationCandidateDraft, AIDecorationGeneration } from '../lib/ai/decorationPlan'
import { validateAIDecorationModelResult } from '../lib/ai/decorationPlan'
import { evaluateDecorationSemantics, getDecorationSubjectGuidance } from '../lib/ai/decorationSemantics'
import { designSpecFromLegacyOutline } from '../lib/design'
import { createAIEnhancedCookieProject } from '../lib/project'

const palette: AIDecorationCandidateDraft['palette'] = [
  { slot: 'base', name: 'Barn Red', hex: '#B94A48' },
  { slot: 'outline', name: 'Warm Cream', hex: '#FFF1D6' },
  { slot: 'accent', name: 'Hay Gold', hex: '#E7B84B' },
  { slot: 'detail', name: 'Cocoa Brown', hex: '#5C3828' },
  { slot: 'neutral', name: 'Soft Sage', hex: '#8BA878' },
]

function goodBarn(id = 'barn-good'): AIDecorationCandidateDraft {
  return {
    id,
    name: 'Cheerful crossbuck barn',
    concept: 'A classic red barn cookie with cream trim, double doors, a loft window, and a tiny flower accent.',
    subject: 'barn',
    recognitionStrategy: 'The peaked roof, large centered double door, opposing crossbuck braces, and upper loft window make the icing read as a barn.',
    difficulty: 'detailed',
    estimatedMinutes: 70,
    paletteName: 'Cheerful farm palette',
    palette,
    regions: [
      {
        id: `${id}-door`,
        name: 'Double barn door',
        kind: 'polygon',
        centerX: 0.5,
        centerY: 0.3,
        radiusX: 0,
        radiusY: 0,
        points: [
          { x: 0.28, y: 0.1 },
          { x: 0.72, y: 0.1 },
          { x: 0.72, y: 0.5 },
          { x: 0.28, y: 0.5 },
        ],
        colorSlot: 'detail',
        technique: 'flood',
        layer: 1,
      },
      {
        id: `${id}-loft`,
        name: 'Loft window',
        kind: 'ellipse',
        centerX: 0.5,
        centerY: 0.69,
        radiusX: 0.08,
        radiusY: 0.07,
        points: [{ x: 0.42, y: 0.69 }, { x: 0.5, y: 0.76 }, { x: 0.58, y: 0.69 }],
        colorSlot: 'accent',
        technique: 'flood',
        layer: 1,
      },
      {
        id: `${id}-flower`,
        name: 'Tiny farm flower',
        kind: 'ellipse',
        centerX: 0.18,
        centerY: 0.18,
        radiusX: 0.035,
        radiusY: 0.035,
        points: [{ x: 0.145, y: 0.18 }, { x: 0.18, y: 0.215 }, { x: 0.215, y: 0.18 }],
        colorSlot: 'accent',
        technique: 'wet-on-wet',
        layer: 1,
      },
    ],
    strokes: [
      {
        id: `${id}-roof`,
        name: 'Peaked cream roof trim',
        points: [{ x: 0.16, y: 0.61 }, { x: 0.5, y: 0.9 }, { x: 0.84, y: 0.61 }],
        widthMm: 1.8,
        colorSlot: 'outline',
        closed: false,
        technique: 'piped-detail',
        layer: 2,
      },
      {
        id: `${id}-brace-a`,
        name: 'First crossbuck brace',
        points: [{ x: 0.31, y: 0.15 }, { x: 0.69, y: 0.45 }],
        widthMm: 1.6,
        colorSlot: 'outline',
        closed: false,
        technique: 'piped-detail',
        layer: 2,
      },
      {
        id: `${id}-brace-b`,
        name: 'Second crossbuck brace',
        points: [{ x: 0.69, y: 0.15 }, { x: 0.31, y: 0.45 }],
        widthMm: 1.6,
        colorSlot: 'outline',
        closed: false,
        technique: 'piped-detail',
        layer: 2,
      },
      {
        id: `${id}-door-seam`,
        name: 'Double-door center seam',
        points: [{ x: 0.5, y: 0.1 }, { x: 0.5, y: 0.5 }],
        widthMm: 1.5,
        colorSlot: 'outline',
        closed: false,
        technique: 'piped-detail',
        layer: 2,
      },
    ],
    lettering: [],
    semanticFeatures: [
      {
        id: `${id}-feature-roof`,
        name: 'Peaked barn roof',
        description: 'Broad cream roof and eave line above the facade.',
        role: 'signature',
        geometryIds: [`${id}-roof`],
      },
      {
        id: `${id}-feature-door`,
        name: 'Large double barn door',
        description: 'Centered lower double door and center seam.',
        role: 'signature',
        geometryIds: [`${id}-door`, `${id}-door-seam`],
      },
      {
        id: `${id}-feature-braces`,
        name: 'Crossbuck door braces',
        description: 'Two opposing diagonal braces form the barn-door X.',
        role: 'signature',
        geometryIds: [`${id}-brace-a`, `${id}-brace-b`],
      },
      {
        id: `${id}-feature-loft`,
        name: 'Upper loft window',
        description: 'Small golden loft opening centered beneath the roof peak.',
        role: 'supporting',
        geometryIds: [`${id}-loft`],
      },
      {
        id: `${id}-feature-flower`,
        name: 'Playful farm flower',
        description: 'Tiny cheerful flower near the base.',
        role: 'accent',
        geometryIds: [`${id}-flower`],
      },
    ],
  }
}

function genericBarn(id = 'barn-generic'): AIDecorationCandidateDraft {
  return {
    id,
    name: 'Abstract badge',
    concept: 'A blue inset cookie with a dark central medallion and white chevron.',
    subject: 'barn',
    recognitionStrategy: 'Use abstract decoration inside a barn cutter.',
    difficulty: 'easy',
    estimatedMinutes: 30,
    paletteName: 'Generic blue palette',
    palette,
    regions: [
      {
        id: `${id}-circle`,
        name: 'Central circle',
        kind: 'ellipse',
        centerX: 0.5,
        centerY: 0.5,
        radiusX: 0.23,
        radiusY: 0.23,
        points: [{ x: 0.27, y: 0.5 }, { x: 0.5, y: 0.73 }, { x: 0.73, y: 0.5 }],
        colorSlot: 'detail',
        technique: 'flood',
        layer: 1,
      },
      {
        id: `${id}-dot`,
        name: 'Accent spot',
        kind: 'ellipse',
        centerX: 0.2,
        centerY: 0.2,
        radiusX: 0.04,
        radiusY: 0.04,
        points: [{ x: 0.16, y: 0.2 }, { x: 0.2, y: 0.24 }, { x: 0.24, y: 0.2 }],
        colorSlot: 'accent',
        technique: 'wet-on-wet',
        layer: 1,
      },
    ],
    strokes: [{
      id: `${id}-chevron`,
      name: 'White chevron',
      points: [{ x: 0.38, y: 0.45 }, { x: 0.5, y: 0.58 }, { x: 0.65, y: 0.54 }],
      widthMm: 1.7,
      colorSlot: 'outline',
      closed: false,
      technique: 'piped-detail',
      layer: 2,
    }],
    lettering: [],
    semanticFeatures: [
      {
        id: `${id}-feature-circle`,
        name: 'Central circle',
        description: 'Large decorative medallion.',
        role: 'signature',
        geometryIds: [`${id}-circle`],
      },
      {
        id: `${id}-feature-chevron`,
        name: 'Abstract chevron',
        description: 'Decorative white line.',
        role: 'signature',
        geometryIds: [`${id}-chevron`],
      },
      {
        id: `${id}-feature-dot`,
        name: 'Accent spot',
        description: 'Small playful dot.',
        role: 'accent',
        geometryIds: [`${id}-dot`],
      },
    ],
  }
}

test('barn art direction names the visual landmarks used by real decorated cookies', () => {
  const guidance = getDecorationSubjectGuidance('cute barn themed cookie')
  assert.match(guidance, /double door/i)
  assert.match(guidance, /crossbuck/i)
  assert.match(guidance, /loft/i)
  assert.match(guidance, /unrelated central circle/i)
})

test('semantic evaluator accepts a recognizable barn and rejects the generic medallion output', () => {
  const good = evaluateDecorationSemantics('cute barn themed cookie', goodBarn())
  const bad = evaluateDecorationSemantics('cute barn themed cookie', genericBarn())

  assert.equal(good.disposition, 'eligible')
  assert.ok(good.score >= 90)
  assert.equal(bad.disposition, 'reject')
  assert.ok(bad.score <= 40)
  assert.ok(bad.findings.some((finding) => finding.code === 'missing_required_feature'))
})

test('barn landmark matching is independent of feature order', () => {
  const candidate = goodBarn('barn-reordered')
  const braces = candidate.semanticFeatures.splice(2, 1)[0]
  candidate.semanticFeatures.unshift(braces)

  const assessment = evaluateDecorationSemantics('cute barn themed cookie', candidate)
  assert.equal(assessment.disposition, 'eligible')
  assert.ok(!assessment.findings.some((finding) => finding.code === 'door_geometry_mismatch'))
})

test('a chevron cannot masquerade as intersecting barn-door crossbuck braces', () => {
  const candidate = goodBarn('barn-chevron')
  candidate.strokes.find((stroke) => stroke.id.endsWith('brace-a'))!.points = [
    { x: 0.31, y: 0.15 },
    { x: 0.5, y: 0.45 },
  ]
  candidate.strokes.find((stroke) => stroke.id.endsWith('brace-b'))!.points = [
    { x: 0.5, y: 0.45 },
    { x: 0.69, y: 0.15 },
  ]

  const assessment = evaluateDecorationSemantics('cute barn themed cookie', candidate)
  assert.equal(assessment.disposition, 'reject')
  assert.ok(assessment.findings.some((finding) => finding.code === 'crossbuck_geometry_mismatch'))
})

test('colors and style words cannot hide a subject mismatch', () => {
  const candidate = goodBarn('barn-wrong-subject')
  candidate.subject = 'cute red tractor'

  const assessment = evaluateDecorationSemantics('cute red barn cookie', candidate)
  assert.equal(assessment.disposition, 'reject')
  assert.ok(assessment.findings.some((finding) => finding.code === 'subject_mismatch'))
})

test('personalization text cannot stand in for the requested subject', () => {
  const candidate = goodBarn('named-but-unrelated')
  candidate.subject = 'Mia'

  const assessment = evaluateDecorationSemantics('Lavender butterfly with Mia', candidate)
  assert.equal(assessment.disposition, 'reject')
  assert.ok(assessment.findings.some((finding) => finding.code === 'subject_mismatch'))
})

test('an accent named after with cannot replace the primary subject', () => {
  const candidate = goodBarn('accent-as-subject')
  candidate.subject = 'flower'

  const assessment = evaluateDecorationSemantics('butterfly with flower accents', candidate)
  assert.equal(assessment.disposition, 'reject')
  assert.ok(assessment.findings.some((finding) => finding.code === 'subject_mismatch'))
})

test('a natural subject label may include context while retaining the literal subject', () => {
  const candidate = goodBarn('farm-barn')
  candidate.subject = 'farm barn'

  const assessment = evaluateDecorationSemantics('cute barn cookie', candidate)
  assert.equal(assessment.disposition, 'eligible')
})

test('non-barn categories require their own recognizable landmark bundle', () => {
  const candidate = goodBarn('tractor-without-wheels')
  candidate.subject = 'tractor'

  const assessment = evaluateDecorationSemantics('cute red tractor cookie', candidate)
  assert.equal(assessment.disposition, 'reject')
  assert.ok(assessment.findings.some((finding) => finding.code === 'missing_subject_landmark'))
})

test('strict decoration parser rejects the polygon shape that caused the production fallback', () => {
  const candidates = [goodBarn('barn-1'), goodBarn('barn-2'), goodBarn('barn-3')]
  const malformed = structuredClone(candidates)
  malformed[0].regions[0].points = []
  assert.throws(
    () => validateAIDecorationModelResult({ candidates: malformed }),
    /between 3 and 20 items/
  )
})

test('semantic fidelity outranks a physically simple but unrelated barn decoration', () => {
  const outline = {
    type: 'test-barn',
    points: [
      { x: -28, y: -25 },
      { x: 28, y: -25 },
      { x: 28, y: 10 },
      { x: 36, y: 10 },
      { x: 20, y: 25 },
      { x: 8, y: 33 },
      { x: 0, y: 42 },
      { x: -8, y: 33 },
      { x: -20, y: 25 },
      { x: -36, y: 10 },
      { x: -28, y: 10 },
      { x: -28, y: -25 },
    ],
  }
  const design = designSpecFromLegacyOutline(outline, { name: 'Barn themed cookie' })
  const generation: AIDecorationGeneration = {
    generationId: 'generation:test:barn',
    model: 'test-model',
    createdAt: '2026-09-26T20:00:00.000Z',
    candidates: [genericBarn('generic-1'), goodBarn(), genericBarn('generic-2')],
  }
  const project = createAIEnhancedCookieProject(design, generation, {
    prompt: 'cute barn themed cookie',
    title: 'Barn themed cookie',
  })

  assert.equal(project.metadata?.selectedCandidateId, 'barn-good')
  assert.ok(Number(project.metadata?.selectedCandidateScore) >= 80)
  assert.equal(project.metadata?.selectedCandidateDisposition, 'eligible')
})

test('a fully rejected AI candidate set cannot be published as a matched project', () => {
  const design = designSpecFromLegacyOutline({
    type: 'test-barn',
    points: [
      { x: -40, y: -40 },
      { x: 40, y: -40 },
      { x: 40, y: 40 },
      { x: -40, y: 40 },
      { x: -40, y: -40 },
    ],
  }, { name: 'Barn themed cookie' })
  const generation: AIDecorationGeneration = {
    generationId: 'generation:test:rejected',
    model: 'test-model',
    createdAt: '2026-09-26T20:00:00.000Z',
    candidates: [genericBarn('reject-1'), genericBarn('reject-2'), genericBarn('reject-3')],
  }

  assert.throws(
    () => createAIEnhancedCookieProject(design, generation, { prompt: 'cute barn themed cookie' }),
    /No AI decoration candidate passed/
  )
})
