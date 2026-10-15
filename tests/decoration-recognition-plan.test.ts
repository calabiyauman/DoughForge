import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createAIDecorationResultSchema,
  validateAIDecorationModelResult,
  type AIDecorationCandidateDraft,
  type AIDecorationGeneration,
} from '../lib/ai/decorationPlan'
import {
  validateAIRecognitionPlan,
  type AIDecorationRecognitionPlan,
} from '../lib/ai/decorationRecognition'
import { evaluateDecorationSemantics } from '../lib/ai/decorationSemantics'
import {
  decorationRelationshipVisualId,
  validateDecorationVisualEvaluation,
} from '../lib/ai/decorationVisualEvaluation'
import { designSpecFromLegacyOutline } from '../lib/design'
import { createAIEnhancedCookieProject } from '../lib/project'

const palette: AIDecorationCandidateDraft['palette'] = [
  { slot: 'base', name: 'Blush', hex: '#F2B8C6' },
  { slot: 'outline', name: 'Cream', hex: '#FFF2D8' },
  { slot: 'accent', name: 'Berry', hex: '#A93A68' },
  { slot: 'detail', name: 'Cocoa', hex: '#51372F' },
]

function cameraPlan(): AIDecorationRecognitionPlan {
  return validateAIRecognitionPlan({
    subject: 'camera',
    subjectType: 'object',
    visualThesis: 'A broad camera body, dominant centered lens, and controls above the lens must read immediately as a camera.',
    landmarks: [
      {
        id: 'camera-body',
        name: 'Camera body',
        description: 'Broad rounded rectangular camera housing.',
        role: 'signature',
        required: true,
        zone: 'center',
        geometryKind: 'region',
        distribution: 'single',
        minimumInstances: 1,
        maximumInstances: 1,
        minimumWidthRatio: 0.5,
        minimumHeightRatio: 0.35,
        requiredText: '',
      },
      {
        id: 'camera-lens',
        name: 'Dominant camera lens',
        description: 'Large circular lens centered inside the camera body.',
        role: 'signature',
        required: true,
        zone: 'center',
        geometryKind: 'region',
        distribution: 'single',
        minimumInstances: 1,
        maximumInstances: 1,
        minimumWidthRatio: 0.22,
        minimumHeightRatio: 0.22,
        requiredText: '',
      },
      {
        id: 'top-controls',
        name: 'Top shutter controls',
        description: 'A visible shutter button or flash detail above the lens.',
        role: 'supporting',
        required: true,
        zone: 'upper',
        geometryKind: 'stroke',
        distribution: 'single',
        minimumInstances: 1,
        maximumInstances: 1,
        minimumWidthRatio: 0.1,
        minimumHeightRatio: 0,
        requiredText: '',
      },
      {
        id: 'lens-shine',
        name: 'Lens shine',
        description: 'Small curved highlight inside the lens.',
        role: 'accent',
        required: false,
        zone: 'center',
        geometryKind: 'stroke',
        distribution: 'single',
        minimumInstances: 1,
        maximumInstances: 1,
        minimumWidthRatio: 0.04,
        minimumHeightRatio: 0.04,
        requiredText: '',
      },
    ],
    relationships: [
      { fromLandmarkId: 'camera-lens', toLandmarkId: 'camera-body', relation: 'inside', required: true },
      { fromLandmarkId: 'top-controls', toLandmarkId: 'camera-lens', relation: 'above', required: true },
      { fromLandmarkId: 'lens-shine', toLandmarkId: 'camera-lens', relation: 'inside', required: false },
    ],
    negativeCues: ['Do not substitute a lone central circle without a camera housing or top controls.'],
    decoratorDirection: 'Use sectioned floods and broad rounded piping that a custom cookie decorator can reproduce.',
  }, 'cute camera cookie')
}

function cameraCandidate(id: string): AIDecorationCandidateDraft {
  return {
    id,
    name: 'Cute instant camera',
    concept: 'A blush camera with a large berry lens and cream top controls.',
    subject: 'camera',
    recognitionStrategy: 'The broad housing, enclosed dominant lens, and upper controls create the camera read.',
    difficulty: 'easy',
    estimatedMinutes: 45,
    paletteName: 'Blush camera palette',
    palette,
    regions: [
      {
        id: `${id}-body`,
        name: 'Camera body flood',
        kind: 'polygon',
        centerX: 0.5,
        centerY: 0.47,
        radiusX: 0,
        radiusY: 0,
        points: [
          { x: 0.12, y: 0.18 },
          { x: 0.88, y: 0.18 },
          { x: 0.88, y: 0.75 },
          { x: 0.12, y: 0.75 },
        ],
        colorSlot: 'accent',
        technique: 'flood',
        layer: 1,
        landmarkId: 'camera-body',
        landmarkInstance: 1,
      },
      {
        id: `${id}-lens`,
        name: 'Large camera lens',
        kind: 'ellipse',
        centerX: 0.5,
        centerY: 0.45,
        radiusX: 0.17,
        radiusY: 0.17,
        points: [{ x: 0.33, y: 0.45 }, { x: 0.5, y: 0.62 }, { x: 0.67, y: 0.45 }],
        colorSlot: 'detail',
        technique: 'flood',
        layer: 2,
        landmarkId: 'camera-lens',
        landmarkInstance: 1,
      },
    ],
    strokes: [
      {
        id: `${id}-controls`,
        name: 'Top shutter controls',
        points: [{ x: 0.3, y: 0.8 }, { x: 0.48, y: 0.8 }],
        widthMm: 1.8,
        colorSlot: 'outline',
        closed: false,
        technique: 'piped-detail',
        layer: 3,
        landmarkId: 'top-controls',
        landmarkInstance: 1,
      },
      {
        id: `${id}-shine`,
        name: 'Lens shine',
        points: [{ x: 0.43, y: 0.49 }, { x: 0.48, y: 0.55 }],
        widthMm: 1.5,
        colorSlot: 'outline',
        closed: false,
        technique: 'piped-detail',
        layer: 3,
        landmarkId: 'lens-shine',
        landmarkInstance: 1,
      },
    ],
    lettering: [],
    // Deliberately false self-description: plan-bound parsing must ignore it.
    semanticFeatures: [{
      id: 'fake-barn-feature',
      name: 'Barn roof',
      description: 'This candidate-provided claim must not drive recognition.',
      role: 'signature',
      geometryIds: [`${id}-body`],
    }],
  }
}

function wordmarkPlan(): AIDecorationRecognitionPlan {
  return validateAIRecognitionPlan({
    subject: 'Barbie logo',
    subjectType: 'lettering-logo',
    visualThesis: 'The exact Barbie wordmark is the dominant identity, supported by its sweeping underline flourish.',
    landmarks: [
      {
        id: 'barbie-wordmark',
        name: 'Barbie wordmark',
        description: 'Large exact Barbie lettering across the cookie.',
        role: 'signature',
        required: true,
        zone: 'center',
        geometryKind: 'lettering',
        distribution: 'single',
        minimumInstances: 1,
        maximumInstances: 1,
        minimumWidthRatio: 0.42,
        minimumHeightRatio: 0.06,
        requiredText: 'Barbie',
      },
      {
        id: 'script-flourish',
        name: 'Script underline flourish',
        description: 'Long upward finishing sweep below the wordmark.',
        role: 'signature',
        required: true,
        zone: 'lower',
        geometryKind: 'stroke',
        distribution: 'single',
        minimumInstances: 1,
        maximumInstances: 1,
        minimumWidthRatio: 0.28,
        minimumHeightRatio: 0.02,
        requiredText: '',
      },
      {
        id: 'sparkle-accent',
        name: 'Small sparkle accent',
        description: 'One restrained sparkle away from the letter counters.',
        role: 'accent',
        required: false,
        zone: 'upper-right',
        geometryKind: 'stroke',
        distribution: 'single',
        minimumInstances: 1,
        maximumInstances: 1,
        minimumWidthRatio: 0.05,
        minimumHeightRatio: 0.05,
        requiredText: '',
      },
    ],
    relationships: [
      { fromLandmarkId: 'script-flourish', toLandmarkId: 'barbie-wordmark', relation: 'below', required: true },
      { fromLandmarkId: 'sparkle-accent', toLandmarkId: 'script-flourish', relation: 'above', required: false },
    ],
    negativeCues: ['Do not replace the exact wordmark with a generic monogram or misspelled text.'],
    decoratorDirection: 'Use a registered transfer or open monoline script with a broad reproducible sweep.',
  }, 'Barbie logo cookie')
}

function wordmarkCandidate(text: string): AIDecorationCandidateDraft {
  return {
    id: `wordmark-${text.toLowerCase()}`,
    name: 'Pink script wordmark',
    concept: 'Large pink script with a clean underline and tiny sparkle.',
    subject: 'Barbie logo',
    recognitionStrategy: 'Exact lettering and its signature sweep carry the identity.',
    difficulty: 'detailed',
    estimatedMinutes: 60,
    paletteName: 'Pink wordmark palette',
    palette,
    regions: [],
    strokes: [
      {
        id: 'wordmark-flourish',
        name: 'Underline flourish',
        points: [{ x: 0.3, y: 0.3 }, { x: 0.5, y: 0.25 }, { x: 0.68, y: 0.34 }],
        widthMm: 1.6,
        colorSlot: 'accent',
        closed: false,
        technique: 'piped-detail',
        layer: 2,
        landmarkId: 'script-flourish',
        landmarkInstance: 1,
      },
      {
        id: 'wordmark-sparkle',
        name: 'Sparkle accent',
        points: [{ x: 0.78, y: 0.72 }, { x: 0.84, y: 0.8 }, { x: 0.78, y: 0.88 }],
        widthMm: 1.2,
        colorSlot: 'outline',
        closed: false,
        technique: 'piped-detail',
        layer: 2,
        landmarkId: 'sparkle-accent',
        landmarkInstance: 1,
      },
    ],
    lettering: [{
      id: 'wordmark-text',
      name: 'Barbie script',
      text,
      position: { x: 0.5, y: 0.56 },
      maxWidthRatio: 0.62,
      fontSizeMm: 10,
      strokeWidthMm: 1.4,
      colorSlot: 'accent',
      style: 'monoline-script',
      technique: 'transfer',
      align: 'middle',
      rotationDegrees: 0,
      layer: 3,
      landmarkId: 'barbie-wordmark',
      landmarkInstance: 1,
    }],
    semanticFeatures: [],
  }
}

test('recognition plan opens subject validation beyond hard-coded categories', () => {
  const plan = cameraPlan()
  const candidates = [cameraCandidate('camera-1'), cameraCandidate('camera-2'), cameraCandidate('camera-3')]
  const parsed = validateAIDecorationModelResult({ candidates }, plan)
  const assessment = evaluateDecorationSemantics('cute camera cookie', parsed.candidates[0], plan)

  assert.equal(assessment.disposition, 'eligible')
  assert.equal(assessment.score, 100)
  assert.deepEqual(
    parsed.candidates[0].semanticFeatures.map((feature) => feature.landmarkId).sort(),
    ['camera-body', 'camera-lens', 'lens-shine', 'top-controls']
  )
  assert.ok(!parsed.candidates[0].semanticFeatures.some((feature) => feature.id === 'fake-barn-feature'))
})

test('generic or wrong-layout geometry cannot self-certify with convincing labels', () => {
  const plan = cameraPlan()
  const candidate = cameraCandidate('camera-wrong-layout')
  const lens = candidate.regions.find((region) => region.landmarkId === 'camera-lens')!
  lens.centerX = 0.84
  lens.centerY = 0.84
  lens.radiusX = 0.05
  lens.radiusY = 0.05
  const controls = candidate.strokes.find((stroke) => stroke.landmarkId === 'top-controls')!
  controls.points = [{ x: 0.3, y: 0.25 }, { x: 0.4, y: 0.25 }]

  const parsed = validateAIDecorationModelResult({
    candidates: [candidate, cameraCandidate('camera-ok-2'), cameraCandidate('camera-ok-3')],
  }, plan)
  const assessment = evaluateDecorationSemantics('cute camera cookie', parsed.candidates[0], plan)

  assert.equal(assessment.disposition, 'reject')
  assert.ok(assessment.findings.some((finding) => finding.code === 'landmark_scale_mismatch'))
  assert.ok(assessment.findings.some((finding) => finding.code === 'landmark_relationship_mismatch'))
})

test('dynamic candidate schema requires direct bindings to frozen landmark ids', () => {
  const schemaText = JSON.stringify(createAIDecorationResultSchema(cameraPlan()))
  assert.match(schemaText, /landmarkId/)
  assert.match(schemaText, /landmarkInstance/)
  assert.match(schemaText, /camera-lens/)
  assert.doesNotMatch(schemaText, /semanticFeatures/)

  const candidate = cameraCandidate('camera-unknown-binding')
  candidate.regions[0].landmarkId = 'barn-door'
  assert.throws(
    () => validateAIDecorationModelResult({
      candidates: [candidate, cameraCandidate('camera-valid-2'), cameraCandidate('camera-valid-3')],
    }, cameraPlan()),
    /frozen recognition plan/
  )
})

test('exact requested logo text is a hard recognition requirement', () => {
  const plan = wordmarkPlan()
  const correct = evaluateDecorationSemantics('Barbie logo cookie', wordmarkCandidate('Barbie'), plan)
  const typo = evaluateDecorationSemantics('Barbie logo cookie', wordmarkCandidate('Barby'), plan)

  assert.equal(correct.disposition, 'eligible')
  assert.equal(typo.disposition, 'reject')
  assert.ok(typo.findings.some((finding) => finding.code === 'required_text_mismatch'))

  const planWithoutText = structuredClone(plan)
  planWithoutText.landmarks.find((landmark) => landmark.id === 'barbie-wordmark')!.requiredText = ''
  assert.throws(
    () => validateAIRecognitionPlan(planWithoutText, 'Barbie logo cookie'),
    /lettering-logo subjects require exact visible requiredText/
  )
})

test('recognition plans preserve a literal unknown subject instead of accepting a generic category', () => {
  const plan = cameraPlan()
  const generic = structuredClone(plan)
  generic.subject = 'object'
  assert.throws(
    () => validateAIRecognitionPlan(generic, 'cute camera cookie'),
    /literal subject/
  )

  const genericLogo = wordmarkPlan()
  genericLogo.subject = 'logo'
  assert.throws(
    () => validateAIRecognitionPlan(genericLogo, 'Barbie logo cookie'),
    /literal subject/
  )

  const incompleteComposite = cameraPlan()
  incompleteComposite.subject = 'cat'
  assert.throws(
    () => validateAIRecognitionPlan(incompleteComposite, 'cat riding a tractor cookie'),
    /literal subject/
  )
})

test('subject identity cannot be satisfied by a color adjective', () => {
  const adjectiveSubject = structuredClone(cameraPlan())
  adjectiveSubject.subject = 'red'
  assert.throws(
    () => validateAIRecognitionPlan(adjectiveSubject, 'red butterfly cookie with Mia'),
    /literal subject/
  )
})

test('request preservation cannot be gamed by repeating an omitted element outside required landmarks', () => {
  const omittedAccessory = structuredClone(cameraPlan())
  omittedAccessory.subject = 'camera with tractor'
  omittedAccessory.visualThesis = 'A camera with tractor styling.'
  omittedAccessory.landmarks.find((landmark) => landmark.id === 'lens-shine')!.description = 'Optional tractor-inspired shine.'
  omittedAccessory.negativeCues.push('Do not omit the tractor.')
  assert.throws(
    () => validateAIRecognitionPlan(omittedAccessory, 'camera with tractor cookie'),
    /preserve requested elements in required landmarks:.*tractor/
  )
})

test('required and signature landmarks must have concrete subject-specific constraints', () => {
  const vacuous = structuredClone(cameraPlan())
  vacuous.landmarks[0].zone = 'any'
  assert.throws(
    () => validateAIRecognitionPlan(vacuous, 'cute camera cookie'),
    /concrete placement/
  )

  const smallSupportingDetail = structuredClone(cameraPlan())
  const shutter = smallSupportingDetail.landmarks.find((landmark) => landmark.id === 'top-controls')!
  shutter.minimumWidthRatio = 0.04
  shutter.minimumHeightRatio = 0
  assert.doesNotThrow(() => validateAIRecognitionPlan(smallSupportingDetail, 'cute camera cookie'))
  shutter.minimumWidthRatio = 0.01
  assert.throws(
    () => validateAIRecognitionPlan(smallSupportingDetail, 'cute camera cookie'),
    /concrete placement/
  )

  const generic = structuredClone(cameraPlan())
  generic.subject = 'red circle'
  generic.visualThesis = 'A red circle centered on the cookie.'
  generic.landmarks[0].name = 'Large red circle'
  generic.landmarks[1].name = 'Centered round circle'
  assert.throws(
    () => validateAIRecognitionPlan(generic, 'red circle cookie'),
    /subject-specific/
  )

  const genericWithSubjectPrefix = structuredClone(cameraPlan())
  genericWithSubjectPrefix.landmarks[0].name = 'Camera circle'
  assert.throws(
    () => validateAIRecognitionPlan(genericWithSubjectPrefix, 'cute camera cookie'),
    /subject-specific/
  )
})

test('missing required supporting geometry and its relationship reject the candidate', () => {
  const plan = cameraPlan()
  const candidate = cameraCandidate('camera-missing-controls')
  candidate.strokes = candidate.strokes.filter((stroke) => stroke.landmarkId !== 'top-controls')

  const assessment = evaluateDecorationSemantics('cute camera cookie', candidate, plan)
  assert.equal(assessment.disposition, 'reject')
  assert.ok(assessment.findings.some((finding) => finding.code === 'missing_required_landmark'))
  assert.ok(assessment.findings.some((finding) => finding.code === 'required_relationship_endpoint_missing'))
})

test('exact landmark counts reject extra geometry instead of accepting at least one', () => {
  const plan = cameraPlan()
  const candidate = cameraCandidate('camera-extra-lens')
  const lens = structuredClone(candidate.regions.find((region) => region.landmarkId === 'camera-lens')!)
  lens.id = 'camera-extra-lens-second-lens'
  lens.centerX = 0.64
  lens.landmarkInstance = 2
  candidate.regions.push(lens)

  const assessment = evaluateDecorationSemantics('cute camera cookie', candidate, plan)
  assert.equal(assessment.disposition, 'reject')
  assert.ok(assessment.findings.some((finding) => (
    finding.code === 'landmark_instance_count_mismatch'
    && /exactly 1.*found 2/.test(finding.message)
  )))
})

test('multiple icing primitives can form one conceptual landmark instance', () => {
  const plan = cameraPlan()
  const candidate = cameraCandidate('camera-compound-lens')
  candidate.strokes.push({
    id: 'camera-compound-lens-ring',
    name: 'Lens ring detail',
    points: [
      { x: 0.36, y: 0.45 },
      { x: 0.5, y: 0.59 },
      { x: 0.64, y: 0.45 },
      { x: 0.5, y: 0.31 },
      { x: 0.36, y: 0.45 },
    ],
    widthMm: 1.4,
    colorSlot: 'outline',
    closed: true,
    technique: 'piped-detail',
    layer: 3,
    landmarkId: 'camera-lens',
    landmarkInstance: 1,
  })

  const parsed = validateAIDecorationModelResult({
    candidates: [candidate, cameraCandidate('camera-compound-2'), cameraCandidate('camera-compound-3')],
  }, plan)
  const assessment = evaluateDecorationSemantics('cute camera cookie', parsed.candidates[0], plan)

  assert.equal(assessment.disposition, 'eligible')
  assert.ok(!assessment.findings.some((finding) => finding.code === 'landmark_instance_count_mismatch'))
})

test('a pair is evaluated relative to its planned zone instead of forced across the canvas', () => {
  const plan = cameraPlan()
  const controls = plan.landmarks.find((landmark) => landmark.id === 'top-controls')!
  controls.zone = 'upper-left'
  controls.distribution = 'horizontal-pair'
  controls.minimumInstances = 2
  controls.maximumInstances = 2
  const candidate = cameraCandidate('camera-local-pair')
  const first = candidate.strokes.find((stroke) => stroke.landmarkId === 'top-controls')!
  first.points = [{ x: 0.16, y: 0.8 }, { x: 0.24, y: 0.8 }]
  candidate.strokes.push({
    ...structuredClone(first),
    id: 'camera-local-pair-second-control',
    name: 'Second top control',
    points: [{ x: 0.32, y: 0.8 }, { x: 0.4, y: 0.8 }],
    landmarkInstance: 2,
  })

  const assessment = evaluateDecorationSemantics('cute camera cookie', candidate, plan)

  assert.equal(assessment.disposition, 'eligible')
  assert.ok(!assessment.findings.some((finding) => (
    finding.code === 'landmark_distribution_mismatch' || finding.code === 'landmark_zone_mismatch'
  )))
})

test('directional relationships can address different conceptual instances in a pair', () => {
  const plan = cameraPlan()
  const controls = plan.landmarks.find((landmark) => landmark.id === 'top-controls')!
  controls.distribution = 'horizontal-pair'
  controls.minimumInstances = 2
  controls.maximumInstances = 2
  const candidate = cameraCandidate('camera-directional-pair')
  const first = candidate.strokes.find((stroke) => stroke.landmarkId === 'top-controls')!
  first.points = [{ x: 0.16, y: 0.8 }, { x: 0.24, y: 0.8 }]
  candidate.strokes.push({
    ...structuredClone(first),
    id: 'camera-directional-pair-second-control',
    name: 'Right top control',
    points: [{ x: 0.76, y: 0.8 }, { x: 0.84, y: 0.8 }],
    landmarkInstance: 2,
  })
  plan.relationships = [
    { fromLandmarkId: 'camera-lens', toLandmarkId: 'camera-body', relation: 'inside', required: true },
    { fromLandmarkId: 'top-controls', toLandmarkId: 'camera-lens', relation: 'left-of', required: true },
    { fromLandmarkId: 'top-controls', toLandmarkId: 'camera-lens', relation: 'right-of', required: true },
    { fromLandmarkId: 'lens-shine', toLandmarkId: 'camera-lens', relation: 'inside', required: false },
  ]

  const assessment = evaluateDecorationSemantics('cute camera cookie', candidate, plan)

  assert.equal(assessment.disposition, 'eligible')
  assert.ok(!assessment.findings.some((finding) => finding.code === 'landmark_relationship_mismatch'))
})

test('pair distributions require an exact pair in the frozen plan', () => {
  const invalidPair = structuredClone(cameraPlan())
  const controls = invalidPair.landmarks.find((landmark) => landmark.id === 'top-controls')!
  controls.distribution = 'horizontal-pair'
  controls.minimumInstances = 1
  controls.maximumInstances = 2
  assert.throws(
    () => validateAIRecognitionPlan(invalidPair, 'cute camera cookie'),
    /counts must agree/
  )

  const ambiguousDirection = structuredClone(cameraPlan())
  const ambiguousControls = ambiguousDirection.landmarks.find((landmark) => landmark.id === 'top-controls')!
  ambiguousControls.distribution = 'vertical-pair'
  ambiguousControls.minimumInstances = 2
  ambiguousControls.maximumInstances = 2
  ambiguousControls.description = 'Two paired shutter controls near the lens.'
  assert.throws(
    () => validateAIRecognitionPlan(ambiguousDirection, 'cute camera cookie'),
    /explicit side-by-side or stacked description/
  )

  ambiguousControls.distribution = 'horizontal-pair'
  ambiguousControls.description = 'Two side-by-side left and right shutter controls.'
  assert.doesNotThrow(() => validateAIRecognitionPlan(ambiguousDirection, 'cute camera cookie'))
})

test('requested counts and visible wording must be encoded as enforceable requirements', () => {
  const omittedCount = structuredClone(cameraPlan())
  omittedCount.subject = 'three cats saying MIA under a moon'
  const body = omittedCount.landmarks.find((landmark) => landmark.id === 'camera-body')!
  body.name = 'Three cats'
  body.description = 'Three cats saying MIA under a moon.'
  assert.throws(
    () => validateAIRecognitionPlan(omittedCount, 'three cats saying MIA under a moon'),
    /encode exact requested counts.*3 cat/
  )

  body.distribution = 'horizontal-row'
  body.minimumInstances = 3
  body.maximumInstances = 3
  assert.throws(
    () => validateAIRecognitionPlan(omittedCount, 'three cats saying MIA under a moon'),
    /encode exact requested lettering: mia/
  )
})

test('composite entities require distinct named landmarks and a required relationship', () => {
  const composite = structuredClone(cameraPlan())
  composite.subject = 'three cats saying MIA under a moon'
  const cats = composite.landmarks.find((landmark) => landmark.id === 'camera-body')!
  cats.name = 'Three cats'
  cats.description = 'Three cats under a moon.'
  cats.distribution = 'horizontal-row'
  cats.minimumInstances = 3
  cats.maximumInstances = 3
  const moon = composite.landmarks.find((landmark) => landmark.id === 'camera-lens')!
  moon.name = 'Moon'
  moon.description = 'A moon visibly above the three cats.'
  const wording = composite.landmarks.find((landmark) => landmark.id === 'top-controls')!
  wording.name = 'MIA lettering'
  wording.description = 'Exact MIA lettering spoken by the cats.'
  wording.geometryKind = 'lettering'
  wording.requiredText = 'MIA'
  composite.relationships = [
    { fromLandmarkId: 'camera-body', toLandmarkId: 'camera-lens', relation: 'below', required: true },
    { fromLandmarkId: 'top-controls', toLandmarkId: 'camera-lens', relation: 'below', required: true },
  ]

  assert.doesNotThrow(() => validateAIRecognitionPlan(
    composite,
    'three cats saying MIA under a moon'
  ))

  const omittedMoon = structuredClone(composite)
  omittedMoon.landmarks.find((landmark) => landmark.id === 'camera-lens')!.name = 'Night circle'
  assert.throws(
    () => validateAIRecognitionPlan(omittedMoon, 'three cats saying MIA under a moon'),
    /each requested entity.*moon/
  )

  const collapsed = structuredClone(omittedMoon)
  collapsed.landmarks.find((landmark) => landmark.id === 'camera-body')!.name = 'Three cats and moon'
  assert.throws(
    () => validateAIRecognitionPlan(collapsed, 'three cats saying MIA under a moon'),
    /cannot collapse distinct requested entities/
  )
})

test('apostrophes, wording cues, and named quantities cannot silently lose requirements', () => {
  const apostrophe = structuredClone(cameraPlan())
  apostrophe.subject = 'cat'
  apostrophe.landmarks[0].name = 'Cat face'
  apostrophe.landmarks[0].description = 'Cat face personalized with DOUG lettering.'
  const lettering = apostrophe.landmarks.find((landmark) => landmark.id === 'top-controls')!
  lettering.name = 'DOUG lettering'
  lettering.description = 'Exact DOUG lettering.'
  lettering.geometryKind = 'lettering'
  lettering.requiredText = 'DOUG'
  assert.throws(
    () => validateAIRecognitionPlan(apostrophe, `cat cookie "DOUG'S"`),
    /encode exact requested lettering: doug's/
  )

  const wordingCue = structuredClone(apostrophe)
  wordingCue.landmarks[0].description = 'Cat face with GO TEAM wording.'
  lettering.name = 'GO TEAM lettering'
  const wordingLettering = wordingCue.landmarks.find((landmark) => landmark.id === 'top-controls')!
  wordingLettering.name = 'GO TEAM lettering'
  wordingLettering.description = 'GO TEAM wording area.'
  wordingLettering.requiredText = ''
  assert.throws(
    () => validateAIRecognitionPlan(wordingCue, 'cat with wording GO TEAM'),
    /encode exact requested lettering: go team/
  )

  const dozen = structuredClone(cameraPlan())
  dozen.subject = 'balloons'
  dozen.landmarks[0].name = 'Balloon cluster'
  dozen.landmarks[0].description = 'A dozen balloons grouped together.'
  assert.throws(
    () => validateAIRecognitionPlan(dozen, 'a dozen balloons'),
    /encode exact requested counts.*12 balloon/
  )

  const numberCookie = structuredClone(apostrophe)
  numberCookie.subject = 'number 5 cat'
  numberCookie.landmarks[0].description = 'Cat face with a visible number 5.'
  lettering.name = 'Number 5 lettering'
  const numberLettering = numberCookie.landmarks.find((landmark) => landmark.id === 'top-controls')!
  numberLettering.name = 'Number 5 lettering'
  numberLettering.description = 'Visible number 5 area.'
  numberLettering.requiredText = ''
  assert.throws(
    () => validateAIRecognitionPlan(numberCookie, 'cat cookie with number 5'),
    /encode exact requested lettering: 5/
  )
})

test('a visually rejected candidate cannot win project ranking', () => {
  const plan = cameraPlan()
  const parsed = validateAIDecorationModelResult({
    candidates: [cameraCandidate('camera-visual-fail'), cameraCandidate('camera-pass-2'), cameraCandidate('camera-pass-3')],
  }, plan)
  const assessments = parsed.candidates.map((candidate, index) => ({
    candidateId: candidate.id,
    subjectRecognizable: index > 0,
    subjectConfidence: index > 0 ? 90 : 30,
    requestFidelityScore: index > 0 ? 88 : 35,
    layoutScore: index > 0 ? 86 : 40,
    decoratorFidelityScore: 85,
    allRequestedElementsVisible: index > 0,
    genericSubstitutionDetected: index === 0,
    landmarkChecks: plan.landmarks.map((landmark) => ({
      landmarkId: landmark.id,
      present: index > 0,
      observedInstances: index > 0 ? landmark.minimumInstances : 0,
      geometryRecognizable: index > 0,
      placementCorrect: index > 0,
      distributionCorrect: index > 0,
      exactTextVisible: index > 0,
      confidence: index > 0 ? 88 : 35,
      notes: index > 0 ? `${landmark.name} is visible.` : `${landmark.name} is not readable.`,
    })),
    relationshipChecks: plan.relationships.map((relationship, relationshipIndex) => ({
      relationshipId: decorationRelationshipVisualId(relationship, relationshipIndex),
      satisfied: index > 0,
      confidence: index > 0 ? 88 : 35,
      notes: index > 0 ? 'The planned relationship is visible.' : 'The relationship is not visible.',
    })),
    repairFeedback: index > 0
      ? 'Preserve the camera landmarks and spacing.'
      : 'Replace the generic badge with a visible camera body and lens.',
  }))
  const generation: AIDecorationGeneration = {
    generationId: 'generation:test:camera-visual-ranking',
    model: 'test-model',
    createdAt: '2026-09-30T12:00:00.000Z',
    recognitionPlan: plan,
    candidates: parsed.candidates,
    visualEvaluation: validateDecorationVisualEvaluation({ assessments }, parsed.candidates, plan),
  }
  const design = designSpecFromLegacyOutline({
    type: 'camera-test-outline',
    points: [
      { x: -40, y: -35 },
      { x: 40, y: -35 },
      { x: 40, y: 35 },
      { x: -40, y: 35 },
      { x: -40, y: -35 },
    ],
  }, { name: 'Camera cookie' })
  const project = createAIEnhancedCookieProject(design, generation, { prompt: 'cute camera cookie' })

  assert.notEqual(project.metadata?.selectedCandidateId, 'camera-visual-fail')
  const failedDecoration = project.decorations.find((decoration) => (
    decoration.metadata?.candidateId === 'camera-visual-fail'
  ))
  assert.equal(failedDecoration?.metadata?.semanticDisposition, 'reject')
  assert.equal(failedDecoration?.metadata?.visualRecognitionPassed, false)
})
