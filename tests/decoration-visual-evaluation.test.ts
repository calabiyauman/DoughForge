import assert from 'node:assert/strict'
import test from 'node:test'
import { validateAIRecognitionPlan } from '../lib/ai/decorationRecognition'
import {
  createDecorationVisualEvaluationSchema,
  decorationRelationshipVisualId,
  validateDecorationVisualEvaluation,
} from '../lib/ai/decorationVisualEvaluation'

const plan = validateAIRecognitionPlan({
  subject: 'rocket',
  subjectType: 'vehicle',
  visualThesis: 'A tall rocket body, pointed nose, and visible flame make the design readable.',
  landmarks: [
    {
      id: 'rocket-body', name: 'Rocket body', description: 'Tall central fuselage.', role: 'signature',
      required: true, zone: 'center', geometryKind: 'region', distribution: 'single', minimumInstances: 1,
      maximumInstances: 1,
      minimumWidthRatio: 0.2, minimumHeightRatio: 0.45, requiredText: '',
    },
    {
      id: 'pointed-nose', name: 'Pointed nose cone', description: 'Tapered cone above the body.', role: 'signature',
      required: true, zone: 'upper', geometryKind: 'region', distribution: 'single', minimumInstances: 1,
      maximumInstances: 1,
      minimumWidthRatio: 0.15, minimumHeightRatio: 0.12, requiredText: '',
    },
    {
      id: 'launch-flame', name: 'Launch flame', description: 'Bright flame below the body.', role: 'accent',
      required: true, zone: 'lower', geometryKind: 'region', distribution: 'single', minimumInstances: 1,
      maximumInstances: 1,
      minimumWidthRatio: 0.12, minimumHeightRatio: 0.12, requiredText: '',
    },
  ],
  relationships: [
    { fromLandmarkId: 'pointed-nose', toLandmarkId: 'rocket-body', relation: 'above', required: true },
    { fromLandmarkId: 'launch-flame', toLandmarkId: 'rocket-body', relation: 'below', required: true },
  ],
  negativeCues: ['Do not replace the rocket with a generic vertical badge.'],
  decoratorDirection: 'Use broad flood sections and a simple high-contrast flame.',
}, 'cute rocket cookie')

function assessment(candidateId: string) {
  return {
    candidateId,
    subjectRecognizable: true,
    subjectConfidence: 88,
    requestFidelityScore: 87,
    layoutScore: 84,
    decoratorFidelityScore: 86,
    allRequestedElementsVisible: true,
    genericSubstitutionDetected: false,
    landmarkChecks: plan.landmarks.map((landmark) => ({
      landmarkId: landmark.id,
      present: true,
      observedInstances: landmark.minimumInstances,
      geometryRecognizable: true,
      placementCorrect: true,
      distributionCorrect: true,
      exactTextVisible: true,
      confidence: 85,
      notes: `${landmark.name} is clearly visible.`,
    })),
    relationshipChecks: plan.relationships.map((relationship, index) => ({
      relationshipId: decorationRelationshipVisualId(relationship, index),
      satisfied: true,
      confidence: 85,
      notes: 'The planned relationship is clearly visible.',
    })),
    repairFeedback: 'No repair needed; retain the large readable landmarks.',
  }
}

test('visual gate requires recognizable subject and every required identity landmark', () => {
  const candidates = [{ id: 'one' }, { id: 'two' }, { id: 'three' }]
  const raw = { assessments: candidates.map((candidate) => assessment(candidate.id)) }
  raw.assessments[1].landmarkChecks[0].confidence = 60
  raw.assessments[2].genericSubstitutionDetected = true

  const parsed = validateDecorationVisualEvaluation(raw, candidates, plan)
  assert.equal(parsed.assessments[0].passed, true)
  assert.equal(parsed.assessments[1].passed, false)
  assert.equal(parsed.assessments[2].passed, false)
})

test('visual gate rejects a missing required supporting or accent landmark', () => {
  const candidates = [{ id: 'one' }, { id: 'two' }, { id: 'three' }]
  const raw = { assessments: candidates.map((candidate) => assessment(candidate.id)) }
  const flameCheck = raw.assessments[0].landmarkChecks.find((check) => check.landmarkId === 'launch-flame')!
  flameCheck.present = false
  flameCheck.confidence = 20

  const parsed = validateDecorationVisualEvaluation(raw, candidates, plan)
  assert.equal(parsed.assessments[0].passed, false)
  assert.equal(parsed.assessments[1].passed, true)
})

test('visual gate rejects incomplete requests and frosting below commercial quality', () => {
  const candidates = [{ id: 'one' }, { id: 'two' }, { id: 'three' }]
  const raw = { assessments: candidates.map((candidate) => assessment(candidate.id)) }
  raw.assessments[0].allRequestedElementsVisible = false
  raw.assessments[1].decoratorFidelityScore = 0

  const parsed = validateDecorationVisualEvaluation(raw, candidates, plan)
  assert.equal(parsed.assessments[0].passed, false)
  assert.equal(parsed.assessments[1].passed, false)
  assert.equal(parsed.assessments[2].passed, true)
})

test('visual gate independently verifies counts, geometry, exact text, and relationships', () => {
  const candidates = [{ id: 'one' }, { id: 'two' }, { id: 'three' }]
  const raw = { assessments: candidates.map((candidate) => assessment(candidate.id)) }
  raw.assessments[0].landmarkChecks[0].observedInstances = 2
  raw.assessments[1].landmarkChecks[1].geometryRecognizable = false
  raw.assessments[2].relationshipChecks[0].satisfied = false

  const parsed = validateDecorationVisualEvaluation(raw, candidates, plan)
  assert.equal(parsed.assessments[0].passed, false)
  assert.equal(parsed.assessments[1].passed, false)
  assert.equal(parsed.assessments[2].passed, false)
})

test('visual gate schema is frozen to generated candidates and recognition landmarks', () => {
  const schema = JSON.stringify(createDecorationVisualEvaluationSchema(['one', 'two', 'three'], plan))
  assert.match(schema, /rocket-body/)
  assert.match(schema, /candidateId/)

  const candidates = [{ id: 'one' }, { id: 'two' }, { id: 'three' }]
  const raw = { assessments: candidates.map((candidate) => assessment(candidate.id)) }
  raw.assessments[0].landmarkChecks[1].landmarkId = 'rocket-body'
  assert.throws(
    () => validateDecorationVisualEvaluation(raw, candidates, plan),
    /uniquely reference a frozen landmark/
  )
})
