import type {
  AIDecorationRecognitionPlan,
  AIRecognitionRelationship,
} from './decorationRecognition'

export interface AILandmarkVisualCheck {
  landmarkId: string
  present: boolean
  observedInstances: number
  geometryRecognizable: boolean
  placementCorrect: boolean
  distributionCorrect: boolean
  exactTextVisible: boolean
  confidence: number
  notes: string
}

export interface AIRelationshipVisualCheck {
  relationshipId: string
  satisfied: boolean
  confidence: number
  notes: string
}

export interface AICandidateVisualAssessment {
  candidateId: string
  subjectRecognizable: boolean
  subjectConfidence: number
  requestFidelityScore: number
  layoutScore: number
  decoratorFidelityScore: number
  allRequestedElementsVisible: boolean
  genericSubstitutionDetected: boolean
  landmarkChecks: AILandmarkVisualCheck[]
  relationshipChecks: AIRelationshipVisualCheck[]
  repairFeedback: string
  passed: boolean
}

export interface AIDecorationVisualEvaluation {
  assessments: AICandidateVisualAssessment[]
}

interface VisualCandidateIdentity {
  id: string
}

export function decorationRelationshipVisualId(
  relationship: AIRecognitionRelationship,
  index: number
): string {
  return `relationship-${index + 1}-${relationship.fromLandmarkId}-${relationship.relation}-${relationship.toLandmarkId}`
}

export function createDecorationVisualEvaluationSchema(
  candidateIds: readonly string[],
  recognitionPlan: AIDecorationRecognitionPlan
): Record<string, unknown> {
  const landmarkIds = recognitionPlan.landmarks.map((landmark) => landmark.id)
  const relationshipIds = recognitionPlan.relationships.map(decorationRelationshipVisualId)
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      assessments: {
        type: 'array',
        minItems: candidateIds.length,
        maxItems: candidateIds.length,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            candidateId: { type: 'string', enum: candidateIds },
            subjectRecognizable: { type: 'boolean' },
            subjectConfidence: { type: 'integer', minimum: 0, maximum: 100 },
            requestFidelityScore: { type: 'integer', minimum: 0, maximum: 100 },
            layoutScore: { type: 'integer', minimum: 0, maximum: 100 },
            decoratorFidelityScore: { type: 'integer', minimum: 0, maximum: 100 },
            allRequestedElementsVisible: { type: 'boolean' },
            genericSubstitutionDetected: { type: 'boolean' },
            landmarkChecks: {
              type: 'array',
              minItems: landmarkIds.length,
              maxItems: landmarkIds.length,
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  landmarkId: { type: 'string', enum: landmarkIds },
                  present: { type: 'boolean' },
                  observedInstances: { type: 'integer', minimum: 0, maximum: 12 },
                  geometryRecognizable: { type: 'boolean' },
                  placementCorrect: { type: 'boolean' },
                  distributionCorrect: { type: 'boolean' },
                  exactTextVisible: { type: 'boolean' },
                  confidence: { type: 'integer', minimum: 0, maximum: 100 },
                  notes: { type: 'string', minLength: 1, maxLength: 180 },
                },
                required: [
                  'landmarkId', 'present', 'observedInstances', 'geometryRecognizable',
                  'placementCorrect', 'distributionCorrect', 'exactTextVisible',
                  'confidence', 'notes',
                ],
              },
            },
            relationshipChecks: {
              type: 'array',
              minItems: relationshipIds.length,
              maxItems: relationshipIds.length,
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  relationshipId: { type: 'string', enum: relationshipIds },
                  satisfied: { type: 'boolean' },
                  confidence: { type: 'integer', minimum: 0, maximum: 100 },
                  notes: { type: 'string', minLength: 1, maxLength: 180 },
                },
                required: ['relationshipId', 'satisfied', 'confidence', 'notes'],
              },
            },
            repairFeedback: { type: 'string', minLength: 1, maxLength: 360 },
          },
          required: [
            'candidateId', 'subjectRecognizable', 'subjectConfidence',
            'requestFidelityScore', 'layoutScore',
            'decoratorFidelityScore', 'allRequestedElementsVisible', 'genericSubstitutionDetected',
            'landmarkChecks', 'relationshipChecks', 'repairFeedback',
          ],
        },
      },
    },
    required: ['assessments'],
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function assertString(value: unknown, path: string, maximum: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) {
    throw new Error(`${path} must be a non-empty string of at most ${maximum} characters`)
  }
  return value.trim()
}

function assertScore(value: unknown, path: string): number {
  if (!Number.isInteger(value) || Number(value) < 0 || Number(value) > 100) {
    throw new Error(`${path} must be an integer between 0 and 100`)
  }
  return Number(value)
}

function assertBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${path} must be a boolean`)
  return value
}

export function validateDecorationVisualEvaluation(
  value: unknown,
  candidates: readonly VisualCandidateIdentity[],
  recognitionPlan: AIDecorationRecognitionPlan
): AIDecorationVisualEvaluation {
  if (!isRecord(value) || !Array.isArray(value.assessments)) {
    throw new Error('Visual evaluation must contain assessments')
  }
  if (value.assessments.length !== candidates.length) {
    throw new Error(`Visual evaluation must assess exactly ${candidates.length} candidates`)
  }
  const candidateIds = new Set(candidates.map((candidate) => candidate.id))
  const landmarkIds = new Set(recognitionPlan.landmarks.map((landmark) => landmark.id))
  const landmarksById = new Map(recognitionPlan.landmarks.map((landmark) => [landmark.id, landmark]))
  const relationshipsById = new Map(recognitionPlan.relationships.map((relationship, index) => (
    [decorationRelationshipVisualId(relationship, index), relationship]
  )))
  const requiredIdentityIds = new Set(
    recognitionPlan.landmarks
      .filter((landmark) => landmark.required || landmark.role === 'signature')
      .map((landmark) => landmark.id)
  )
  const seenCandidates = new Set<string>()
  const assessments = value.assessments.map((rawAssessment, assessmentIndex): AICandidateVisualAssessment => {
    const path = `assessments[${assessmentIndex}]`
    if (!isRecord(rawAssessment)) throw new Error(`${path} must be an object`)
    const candidateId = assertString(rawAssessment.candidateId, `${path}.candidateId`, 40)
    if (!candidateIds.has(candidateId) || seenCandidates.has(candidateId)) {
      throw new Error(`${path}.candidateId must uniquely reference a generated candidate`)
    }
    seenCandidates.add(candidateId)
    if (!Array.isArray(rawAssessment.landmarkChecks) || rawAssessment.landmarkChecks.length !== landmarkIds.size) {
      throw new Error(`${path}.landmarkChecks must assess every frozen landmark exactly once`)
    }
    const seenLandmarks = new Set<string>()
    const landmarkChecks = rawAssessment.landmarkChecks.map((rawCheck, checkIndex): AILandmarkVisualCheck => {
      const checkPath = `${path}.landmarkChecks[${checkIndex}]`
      if (!isRecord(rawCheck)) throw new Error(`${checkPath} must be an object`)
      const landmarkId = assertString(rawCheck.landmarkId, `${checkPath}.landmarkId`, 36)
      if (!landmarkIds.has(landmarkId) || seenLandmarks.has(landmarkId)) {
        throw new Error(`${checkPath}.landmarkId must uniquely reference a frozen landmark`)
      }
      seenLandmarks.add(landmarkId)
      const observedInstances = rawCheck.observedInstances
      if (!Number.isInteger(observedInstances) || Number(observedInstances) < 0 || Number(observedInstances) > 12) {
        throw new Error(`${checkPath}.observedInstances must be an integer between 0 and 12`)
      }
      return {
        landmarkId,
        present: assertBoolean(rawCheck.present, `${checkPath}.present`),
        observedInstances: Number(observedInstances),
        geometryRecognizable: assertBoolean(rawCheck.geometryRecognizable, `${checkPath}.geometryRecognizable`),
        placementCorrect: assertBoolean(rawCheck.placementCorrect, `${checkPath}.placementCorrect`),
        distributionCorrect: assertBoolean(rawCheck.distributionCorrect, `${checkPath}.distributionCorrect`),
        exactTextVisible: assertBoolean(rawCheck.exactTextVisible, `${checkPath}.exactTextVisible`),
        confidence: assertScore(rawCheck.confidence, `${checkPath}.confidence`),
        notes: assertString(rawCheck.notes, `${checkPath}.notes`, 180),
      }
    })
    if (
      !Array.isArray(rawAssessment.relationshipChecks)
      || rawAssessment.relationshipChecks.length !== relationshipsById.size
    ) {
      throw new Error(`${path}.relationshipChecks must assess every frozen relationship exactly once`)
    }
    const seenRelationships = new Set<string>()
    const relationshipChecks = rawAssessment.relationshipChecks.map((rawCheck, checkIndex): AIRelationshipVisualCheck => {
      const checkPath = `${path}.relationshipChecks[${checkIndex}]`
      if (!isRecord(rawCheck)) throw new Error(`${checkPath} must be an object`)
      const relationshipId = assertString(rawCheck.relationshipId, `${checkPath}.relationshipId`, 160)
      if (!relationshipsById.has(relationshipId) || seenRelationships.has(relationshipId)) {
        throw new Error(`${checkPath}.relationshipId must uniquely reference a frozen relationship`)
      }
      seenRelationships.add(relationshipId)
      if (typeof rawCheck.satisfied !== 'boolean') throw new Error(`${checkPath}.satisfied must be a boolean`)
      return {
        relationshipId,
        satisfied: rawCheck.satisfied,
        confidence: assertScore(rawCheck.confidence, `${checkPath}.confidence`),
        notes: assertString(rawCheck.notes, `${checkPath}.notes`, 180),
      }
    })
    if (typeof rawAssessment.subjectRecognizable !== 'boolean') {
      throw new Error(`${path}.subjectRecognizable must be a boolean`)
    }
    if (typeof rawAssessment.genericSubstitutionDetected !== 'boolean') {
      throw new Error(`${path}.genericSubstitutionDetected must be a boolean`)
    }
    if (typeof rawAssessment.allRequestedElementsVisible !== 'boolean') {
      throw new Error(`${path}.allRequestedElementsVisible must be a boolean`)
    }
    const subjectConfidence = assertScore(rawAssessment.subjectConfidence, `${path}.subjectConfidence`)
    const requestFidelityScore = assertScore(rawAssessment.requestFidelityScore, `${path}.requestFidelityScore`)
    const layoutScore = assertScore(rawAssessment.layoutScore, `${path}.layoutScore`)
    const decoratorFidelityScore = assertScore(
      rawAssessment.decoratorFidelityScore,
      `${path}.decoratorFidelityScore`
    )
    const requiredIdentityChecksPass = landmarkChecks
      .filter((check) => requiredIdentityIds.has(check.landmarkId))
      .every((check) => {
        const landmark = landmarksById.get(check.landmarkId)
        return Boolean(landmark)
          && check.present
          && check.observedInstances >= landmark!.minimumInstances
          && check.observedInstances <= landmark!.maximumInstances
          && check.geometryRecognizable
          && check.placementCorrect
          && check.distributionCorrect
          && (!landmark!.requiredText || check.exactTextVisible)
          && check.confidence >= 65
      })
    const requiredRelationshipChecksPass = relationshipChecks.every((check) => {
      const relationship = relationshipsById.get(check.relationshipId)
      return !relationship?.required || (check.satisfied && check.confidence >= 65)
    })
    const passed = rawAssessment.subjectRecognizable
      && subjectConfidence >= 72
      && requestFidelityScore >= 80
      && layoutScore >= 65
      && decoratorFidelityScore >= 70
      && rawAssessment.allRequestedElementsVisible
      && requiredIdentityChecksPass
      && requiredRelationshipChecksPass
      && !rawAssessment.genericSubstitutionDetected
    return {
      candidateId,
      subjectRecognizable: rawAssessment.subjectRecognizable,
      subjectConfidence,
      requestFidelityScore,
      layoutScore,
      decoratorFidelityScore,
      allRequestedElementsVisible: rawAssessment.allRequestedElementsVisible,
      genericSubstitutionDetected: rawAssessment.genericSubstitutionDetected,
      landmarkChecks,
      relationshipChecks,
      repairFeedback: assertString(rawAssessment.repairFeedback, `${path}.repairFeedback`, 360),
      passed,
    }
  })
  return { assessments }
}
