export const AI_LANDMARK_ROLES = ['signature', 'supporting', 'accent'] as const
export type AILandmarkRole = typeof AI_LANDMARK_ROLES[number]

export const AI_LANDMARK_ZONES = [
  'any',
  'full',
  'center',
  'upper',
  'lower',
  'left',
  'right',
  'upper-left',
  'upper-right',
  'lower-left',
  'lower-right',
] as const
export type AILandmarkZone = typeof AI_LANDMARK_ZONES[number]

export const AI_LANDMARK_GEOMETRY_KINDS = ['region', 'stroke', 'lettering', 'either'] as const
export type AILandmarkGeometryKind = typeof AI_LANDMARK_GEOMETRY_KINDS[number]

export const AI_LANDMARK_DISTRIBUTIONS = [
  'single',
  'horizontal-pair',
  'vertical-pair',
  'horizontal-row',
  'vertical-stack',
  'cluster',
  'radial',
  'free',
] as const
export type AILandmarkDistribution = typeof AI_LANDMARK_DISTRIBUTIONS[number]

export const AI_LANDMARK_RELATIONS = [
  'above',
  'below',
  'left-of',
  'right-of',
  'inside',
  'surrounds',
  'overlaps',
  'crosses',
  'centered-with',
  'mirrors',
] as const
export type AILandmarkRelationType = typeof AI_LANDMARK_RELATIONS[number]

export const AI_SUBJECT_TYPES = [
  'object',
  'character',
  'animal',
  'architecture',
  'vehicle',
  'food',
  'plant',
  'symbol',
  'lettering-logo',
  'scene',
  'abstract',
] as const
export type AISubjectType = typeof AI_SUBJECT_TYPES[number]

export interface AIRecognitionLandmark {
  id: string
  name: string
  description: string
  role: AILandmarkRole
  required: boolean
  zone: AILandmarkZone
  geometryKind: AILandmarkGeometryKind
  distribution: AILandmarkDistribution
  minimumInstances: number
  maximumInstances: number
  minimumWidthRatio: number
  minimumHeightRatio: number
  requiredText: string
}

export interface AIRecognitionRelationship {
  fromLandmarkId: string
  toLandmarkId: string
  relation: AILandmarkRelationType
  required: boolean
}

export interface AIDecorationRecognitionPlan {
  subject: string
  subjectType: AISubjectType
  visualThesis: string
  landmarks: AIRecognitionLandmark[]
  relationships: AIRecognitionRelationship[]
  negativeCues: string[]
  decoratorDirection: string
}

const landmarkIdSchema = {
  type: 'string',
  minLength: 2,
  maxLength: 36,
  pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
} as const

export const AI_RECOGNITION_PLAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    subject: { type: 'string', minLength: 1, maxLength: 80 },
    subjectType: { type: 'string', enum: AI_SUBJECT_TYPES },
    visualThesis: { type: 'string', minLength: 1, maxLength: 320 },
    landmarks: {
      type: 'array',
      minItems: 3,
      maxItems: 7,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: landmarkIdSchema,
          name: { type: 'string', minLength: 1, maxLength: 80 },
          description: { type: 'string', minLength: 1, maxLength: 220 },
          role: { type: 'string', enum: AI_LANDMARK_ROLES },
          required: { type: 'boolean' },
          zone: { type: 'string', enum: AI_LANDMARK_ZONES },
          geometryKind: { type: 'string', enum: AI_LANDMARK_GEOMETRY_KINDS },
          distribution: { type: 'string', enum: AI_LANDMARK_DISTRIBUTIONS },
          minimumInstances: { type: 'integer', minimum: 1, maximum: 12 },
          maximumInstances: { type: 'integer', minimum: 1, maximum: 12 },
          minimumWidthRatio: { type: 'number', minimum: 0, maximum: 0.8 },
          minimumHeightRatio: { type: 'number', minimum: 0, maximum: 0.8 },
          requiredText: { type: 'string', maxLength: 24 },
        },
        required: [
          'id', 'name', 'description', 'role', 'required', 'zone', 'geometryKind',
          'distribution', 'minimumInstances', 'maximumInstances', 'minimumWidthRatio',
          'minimumHeightRatio', 'requiredText',
        ],
      },
    },
    relationships: {
      type: 'array',
      minItems: 1,
      maxItems: 10,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          fromLandmarkId: landmarkIdSchema,
          toLandmarkId: landmarkIdSchema,
          relation: { type: 'string', enum: AI_LANDMARK_RELATIONS },
          required: { type: 'boolean' },
        },
        required: ['fromLandmarkId', 'toLandmarkId', 'relation', 'required'],
      },
    },
    negativeCues: {
      type: 'array',
      minItems: 1,
      maxItems: 5,
      items: { type: 'string', minLength: 1, maxLength: 140 },
    },
    decoratorDirection: { type: 'string', minLength: 1, maxLength: 320 },
  },
  required: [
    'subject', 'subjectType', 'visualThesis', 'landmarks', 'relationships',
    'negativeCues', 'decoratorDirection',
  ],
} as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function assertString(value: unknown, path: string, maxLength: number, allowEmpty = false): string {
  if (typeof value !== 'string' || (!allowEmpty && !value.trim()) || value.length > maxLength) {
    const qualifier = allowEmpty ? 'a string' : 'a non-empty string'
    throw new Error(`${path} must be ${qualifier} of at most ${maxLength} characters`)
  }
  return value.trim()
}

function assertArray(value: unknown, path: string, minimum: number, maximum: number): unknown[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
    throw new Error(`${path} must contain between ${minimum} and ${maximum} items`)
  }
  return value
}

function assertEnum<T extends readonly string[]>(value: unknown, values: T, path: string): T[number] {
  if (typeof value !== 'string' || !values.includes(value)) {
    throw new Error(`${path} must be one of ${values.join(', ')}`)
  }
  return value as T[number]
}

function assertRatio(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 0.8) {
    throw new Error(`${path} must be a finite number between 0 and 0.8`)
  }
  return value
}

function normalizedWords(value: string): string[] {
  const ignored = new Set([
    'a', 'an', 'and', 'cookie', 'cookies', 'cutter', 'custom', 'decorated', 'design', 'for',
    'icing', 'of', 'royal', 'shape', 'sugar', 'the', 'theme', 'themed', 'with',
    'abstract', 'animal', 'character', 'food', 'icon', 'logo', 'object', 'plant',
    'scene', 'symbol', 'vehicle', 'create', 'give', 'like', 'looking', 'make',
    'me', 'my', 'please', 'some', 'something', 'style', 'styled', 'use', 'using',
    'want', 'would', 'lettered', 'lettering', 'message', 'named', 'phrase', 'reading',
    'reads', 'saying', 'text', 'word', 'wording',
    'adorable', 'baby', 'birthday', 'cheerful', 'classic', 'cute', 'detailed',
    'fun', 'playful', 'simple', 'storybook',
  ])
  const numberWords: Record<string, string> = {
    one: '1', two: '2', three: '3', four: '4', five: '5', six: '6',
    seven: '7', eight: '8', nine: '9', ten: '10', eleven: '11', twelve: '12',
    thirteen: '13', fourteen: '14', fifteen: '15', sixteen: '16', seventeen: '17',
    eighteen: '18', nineteen: '19', twenty: '20', couple: '2', pair: '2', trio: '3',
    quartet: '4', dozen: '12',
  }
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((word) => (word.length > 1 || /^\d+$/.test(word)) && !ignored.has(word))
    .map((word) => numberWords[word]
      ?? (word.endsWith('ies') ? `${word.slice(0, -3)}y` : word.endsWith('s') ? word.slice(0, -1) : word))
}

const SUBJECT_MODIFIER_WORDS = new Set([
  'aqua', 'beige', 'black', 'blue', 'brown', 'cream', 'gold', 'golden', 'gray',
  'green', 'grey', 'lavender', 'navy', 'orange', 'pastel', 'pink', 'purple',
  'red', 'rose', 'silver', 'teal', 'turquoise', 'white', 'yellow',
  'cartoon', 'elegant', 'kawaii', 'minimal', 'minimalist', 'modern', 'realistic',
  'retro', 'rustic', 'vintage', 'whimsical',
])

function subjectIdentityWords(value: string): string[] {
  return normalizedWords(value).filter((word) => !SUBJECT_MODIFIER_WORDS.has(word))
}

function requestedCounts(description: string): Array<{ count: number; noun: string }> {
  const tokens = normalizedWords(description)
  const results: Array<{ count: number; noun: string }> = []
  tokens.forEach((token, index) => {
    if (!/^\d+$/.test(token)) return
    const count = Number(token)
    if (!Number.isInteger(count) || count < 1) return
    const noun = tokens.slice(index + 1).find((candidate) => (
      !SUBJECT_MODIFIER_WORDS.has(candidate) && !/^\d+$/.test(candidate)
    ))
    if (noun) results.push({ count, noun })
  })
  return results
}

function requestedExactTexts(description: string): string[] {
  const results = new Set<string>()
  const addText = (value: string | undefined) => {
    const normalized = value?.trim().replace(/^["“”'‘’]+|["“”'‘’]+$/g, '').trim().toLowerCase()
    if (normalized) results.add(normalized)
  }
  for (const match of description.matchAll(/["“]([^"”]{1,24})["”]/g)) {
    addText(match[1])
  }
  for (const match of description.matchAll(/(?:^|\s)['‘]([^,\r\n]{1,24})['’](?=\s|[,.!?]|$)/g)) {
    addText(match[1])
  }
  const cuePattern = /\b(?:saying|named|text(?:\s+of)?|lettered(?:\s+with)?|wording|words?|reads?|reading|message|phrase)\s+(.{1,24}?)(?=\s+\b(?:under|above|below|beside|inside|on|with|and)\b|[,.!?]|$)/gi
  for (const match of description.matchAll(cuePattern)) {
    addText(match[1])
  }
  for (const match of description.matchAll(/\b(?:number|digit)\s+([a-z0-9]{1,24})\b/gi)) {
    addText(match[1])
  }
  return [...results]
}

const ENTITY_CUE_WORDS = new Set([
  'above', 'and', 'based', 'below', 'beside', 'carrying', 'depicting', 'featuring',
  'holding', 'inside', 'inspired', 'lettered', 'named', 'next', 'on', 'riding',
  'saying', 'text', 'under', 'wearing',
])

interface RequestedCompositionCue {
  cue: string
  target: string
}

const TEXT_CUE_WORDS = new Set([
  'lettered', 'lettering', 'message', 'phrase', 'reading', 'reads', 'text', 'word', 'wording',
])

function requestedCompositionCues(description: string): RequestedCompositionCue[] {
  const modifierPattern = [
    'a', 'an', 'the', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight',
    'nine', 'ten', 'eleven', 'twelve', '\\d+',
    ...SUBJECT_MODIFIER_WORDS,
    'big', 'exact', 'large', 'little', 'small', 'tiny',
  ].join('|')
  const pattern = new RegExp(
    `\\b(next\\s+to|with|under|above|below|beside|inside|on|holding|wearing|riding|carrying|and)\\s+(?:(?:${modifierPattern})\\s+)*([a-z][a-z0-9-]*)`,
    'gi'
  )
  const results: RequestedCompositionCue[] = []
  for (const match of description.matchAll(pattern)) {
    const target = normalizedWords(match[2] ?? '')[0]
    if (target && !TEXT_CUE_WORDS.has(target)) {
      results.push({ cue: match[1].toLowerCase().replace(/\s+/g, '-'), target })
    }
  }
  return results
}

function requestedEntityTerms(description: string): string[] {
  const tokens = normalizedWords(description)
  const primary = tokens.find((word) => (
    !/^\d+$/.test(word)
    && !SUBJECT_MODIFIER_WORDS.has(word)
    && !ENTITY_CUE_WORDS.has(word)
  ))
  const terms = new Set<string>()
  if (primary) terms.add(primary)
  requestedCounts(description).forEach(({ noun }) => terms.add(noun))
  requestedCompositionCues(description).forEach(({ target }) => terms.add(target))
  return [...terms]
}

function hasDistinctLandmarkAssignment(options: readonly string[][], index = 0, used = new Set<string>()): boolean {
  if (index >= options.length) return true
  return options[index].some((landmarkId) => {
    if (used.has(landmarkId)) return false
    used.add(landmarkId)
    const matched = hasDistinctLandmarkAssignment(options, index + 1, used)
    used.delete(landmarkId)
    return matched
  })
}

function relationshipMatchesRequestedCue(
  relationship: AIRecognitionRelationship,
  cue: string,
  primaryLandmarkIds: ReadonlySet<string>,
  targetLandmarkIds: ReadonlySet<string>
): boolean {
  if (!relationship.required) return false
  const forward = primaryLandmarkIds.has(relationship.fromLandmarkId)
    && targetLandmarkIds.has(relationship.toLandmarkId)
  const reverse = targetLandmarkIds.has(relationship.fromLandmarkId)
    && primaryLandmarkIds.has(relationship.toLandmarkId)
  if (!forward && !reverse) return false
  if (cue === 'under' || cue === 'below') {
    return (forward && relationship.relation === 'below')
      || (reverse && relationship.relation === 'above')
  }
  if (cue === 'above') {
    return (forward && relationship.relation === 'above')
      || (reverse && relationship.relation === 'below')
  }
  if (cue === 'inside') {
    return (forward && relationship.relation === 'inside')
      || (reverse && relationship.relation === 'surrounds')
  }
  if (cue === 'beside' || cue === 'next-to') {
    return ['left-of', 'right-of'].includes(relationship.relation)
  }
  if (cue === 'on' || cue === 'riding') {
    return (forward && ['above', 'overlaps', 'centered-with'].includes(relationship.relation))
      || (reverse && ['below', 'overlaps', 'centered-with'].includes(relationship.relation))
  }
  return true
}

export function recognitionSubjectMatchesRequest(description: string, subject: string): boolean {
  const requestedEntities = requestedEntityTerms(description)
  const subjectWords = new Set(subjectIdentityWords(subject))
  return requestedEntities.length > 0
    && requestedEntities.every((entity) => subjectWords.has(entity))
}

const GENERIC_LANDMARK_WORDS = new Set([
  'accent', 'area', 'border', 'circle', 'decoration', 'detail', 'line', 'medallion',
  'outline', 'shape', 'spot', 'stripe', 'trim',
])

const GENERIC_LANDMARK_MODIFIERS = new Set([
  ...SUBJECT_MODIFIER_WORDS,
  'broad', 'center', 'centered', 'curved', 'dominant', 'large', 'lower', 'main',
  'round', 'rounded', 'small', 'upper',
])

export function validateAIRecognitionPlan(
  value: unknown,
  requestedDescription?: string
): AIDecorationRecognitionPlan {
  if (!isRecord(value)) throw new Error('AI recognition plan must be an object')
  const subject = assertString(value.subject, 'recognitionPlan.subject', 80)
  if (requestedDescription && !recognitionSubjectMatchesRequest(requestedDescription, subject)) {
    throw new Error('recognitionPlan.subject must name the literal subject in the customer request')
  }

  const landmarks = assertArray(value.landmarks, 'recognitionPlan.landmarks', 3, 7)
    .map((rawLandmark, index): AIRecognitionLandmark => {
      const path = `recognitionPlan.landmarks[${index}]`
      if (!isRecord(rawLandmark)) throw new Error(`${path} must be an object`)
      const id = assertString(rawLandmark.id, `${path}.id`, 36)
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
        throw new Error(`${path}.id must be lowercase kebab-case`)
      }
      const minimumInstances = Number(rawLandmark.minimumInstances)
      const maximumInstances = Number(rawLandmark.maximumInstances)
      if (!Number.isInteger(minimumInstances) || minimumInstances < 1 || minimumInstances > 12) {
        throw new Error(`${path}.minimumInstances must be an integer between 1 and 12`)
      }
      if (!Number.isInteger(maximumInstances) || maximumInstances < 1 || maximumInstances > 12) {
        throw new Error(`${path}.maximumInstances must be an integer between 1 and 12`)
      }
      if (minimumInstances > maximumInstances) {
        throw new Error(`${path}.minimumInstances cannot exceed maximumInstances`)
      }
      if (typeof rawLandmark.required !== 'boolean') throw new Error(`${path}.required must be a boolean`)
      return {
        id,
        name: assertString(rawLandmark.name, `${path}.name`, 80),
        description: assertString(rawLandmark.description, `${path}.description`, 220),
        role: assertEnum(rawLandmark.role, AI_LANDMARK_ROLES, `${path}.role`),
        required: rawLandmark.required,
        zone: assertEnum(rawLandmark.zone, AI_LANDMARK_ZONES, `${path}.zone`),
        geometryKind: assertEnum(
          rawLandmark.geometryKind,
          AI_LANDMARK_GEOMETRY_KINDS,
          `${path}.geometryKind`
        ),
        distribution: assertEnum(
          rawLandmark.distribution,
          AI_LANDMARK_DISTRIBUTIONS,
          `${path}.distribution`
        ),
        minimumInstances,
        maximumInstances,
        minimumWidthRatio: assertRatio(rawLandmark.minimumWidthRatio, `${path}.minimumWidthRatio`),
        minimumHeightRatio: assertRatio(rawLandmark.minimumHeightRatio, `${path}.minimumHeightRatio`),
        requiredText: assertString(rawLandmark.requiredText, `${path}.requiredText`, 24, true),
      }
    })

  const landmarkIds = new Set<string>()
  landmarks.forEach((landmark) => {
    if (landmarkIds.has(landmark.id)) throw new Error(`recognitionPlan contains duplicate landmark id "${landmark.id}"`)
    landmarkIds.add(landmark.id)
  })
  if (landmarks.filter((landmark) => landmark.role === 'signature').length < 2) {
    throw new Error('recognitionPlan requires at least two signature landmarks')
  }
  const invalidIdentityLandmarks = landmarks.filter((landmark) => (
    (landmark.required || landmark.role === 'signature')
    && (
      (landmark.role === 'signature' && !landmark.required)
      || landmark.zone === 'any'
      || landmark.geometryKind === 'either'
      || landmark.distribution === 'free'
      || Math.max(landmark.minimumWidthRatio, landmark.minimumHeightRatio) < 0.08
    )
  ))
  if (invalidIdentityLandmarks.length) {
    throw new Error(`recognitionPlan required and signature landmarks require concrete placement, geometry, scale, and distribution; signatures also require required=true: ${invalidIdentityLandmarks.map((item) => item.id).join(', ')}`)
  }
  const invalidDistributions = landmarks.filter((landmark) => (
    (landmark.distribution === 'single'
      && (landmark.minimumInstances !== 1 || landmark.maximumInstances !== 1))
    || ((landmark.distribution === 'horizontal-pair' || landmark.distribution === 'vertical-pair')
      && (landmark.minimumInstances !== 2 || landmark.maximumInstances !== 2))
    || ((landmark.distribution === 'horizontal-row' || landmark.distribution === 'vertical-stack')
      && landmark.minimumInstances < 2)
    || (landmark.distribution === 'cluster' && landmark.minimumInstances < 2)
    || (landmark.distribution === 'radial' && landmark.minimumInstances < 3)
  ))
  if (invalidDistributions.length) {
    throw new Error(`recognitionPlan landmark counts must agree with their distribution: ${invalidDistributions.map((item) => item.id).join(', ')}`)
  }
  const pairDirectionMismatch = landmarks.filter((landmark) => {
    const description = ` ${landmark.name} ${landmark.description} `.toLowerCase()
    if (landmark.distribution === 'horizontal-pair') {
      return !/(?:\bside[ -]by[ -]side\b|\bhorizontal(?:ly)?\b|\bleft\b.{0,40}\bright\b|\bright\b.{0,40}\bleft\b)/.test(description)
    }
    if (landmark.distribution === 'vertical-pair') {
      return !/(?:\bstacked\b|\bvertical(?:ly)?\b|\btop\b.{0,40}\bbottom\b|\bbottom\b.{0,40}\btop\b|\bupper\b.{0,40}\blower\b|\blower\b.{0,40}\bupper\b|\bone\b.{0,20}\b(?:above|below)\b)/.test(description)
    }
    return false
  })
  if (pairDirectionMismatch.length) {
    throw new Error(`recognitionPlan pair distributions require an explicit side-by-side or stacked description: ${pairDirectionMismatch.map((item) => item.id).join(', ')}`)
  }
  const invalidTextLandmarks = landmarks.filter((landmark) => (
    landmark.requiredText && (!landmark.required || landmark.geometryKind !== 'lettering')
  ))
  if (invalidTextLandmarks.length) {
    throw new Error(`recognitionPlan exact-text landmarks must be required lettering: ${invalidTextLandmarks.map((item) => item.id).join(', ')}`)
  }
  const genericIdentityLandmarks = landmarks.filter((landmark) => {
    if (!landmark.required && landmark.role !== 'signature') return false
    const subjectWords = new Set(subjectIdentityWords(subject))
    const nameWords = normalizedWords(landmark.name)
      .filter((word) => !GENERIC_LANDMARK_MODIFIERS.has(word))
    const distinguishingWords = nameWords.filter((word) => !subjectWords.has(word))
    if (distinguishingWords.length) {
      return distinguishingWords.every((word) => GENERIC_LANDMARK_WORDS.has(word))
    }
    return nameWords.length === 0 || nameWords.every((word) => GENERIC_LANDMARK_WORDS.has(word))
  })
  if (genericIdentityLandmarks.length) {
    throw new Error(`recognitionPlan required and signature landmarks must be subject-specific: ${genericIdentityLandmarks.map((item) => item.id).join(', ')}`)
  }

  const relationships = assertArray(value.relationships, 'recognitionPlan.relationships', 1, 10)
    .map((rawRelationship, index): AIRecognitionRelationship => {
      const path = `recognitionPlan.relationships[${index}]`
      if (!isRecord(rawRelationship)) throw new Error(`${path} must be an object`)
      const fromLandmarkId = assertString(rawRelationship.fromLandmarkId, `${path}.fromLandmarkId`, 36)
      const toLandmarkId = assertString(rawRelationship.toLandmarkId, `${path}.toLandmarkId`, 36)
      if (!landmarkIds.has(fromLandmarkId) || !landmarkIds.has(toLandmarkId)) {
        throw new Error(`${path} must reference declared landmark ids`)
      }
      if (fromLandmarkId === toLandmarkId) throw new Error(`${path} cannot relate a landmark to itself`)
      if (typeof rawRelationship.required !== 'boolean') throw new Error(`${path}.required must be a boolean`)
      return {
        fromLandmarkId,
        toLandmarkId,
        relation: assertEnum(rawRelationship.relation, AI_LANDMARK_RELATIONS, `${path}.relation`),
        required: rawRelationship.required,
      }
    })
  if (!relationships.some((relationship) => relationship.required)) {
    throw new Error('recognitionPlan requires at least one required spatial relationship')
  }

  const plan: AIDecorationRecognitionPlan = {
    subject,
    subjectType: assertEnum(value.subjectType, AI_SUBJECT_TYPES, 'recognitionPlan.subjectType'),
    visualThesis: assertString(value.visualThesis, 'recognitionPlan.visualThesis', 320),
    landmarks,
    relationships,
    negativeCues: assertArray(value.negativeCues, 'recognitionPlan.negativeCues', 1, 5)
      .map((cue, index) => assertString(cue, `recognitionPlan.negativeCues[${index}]`, 140)),
    decoratorDirection: assertString(value.decoratorDirection, 'recognitionPlan.decoratorDirection', 320),
  }
  if (
    plan.subjectType === 'lettering-logo'
    && !plan.landmarks.some((landmark) => landmark.required && Boolean(landmark.requiredText))
  ) {
    throw new Error('recognitionPlan lettering-logo subjects require exact visible requiredText')
  }
  if (requestedDescription) {
    const requiredLandmarkEvidence = plan.landmarks
      .filter((landmark) => landmark.required || landmark.role === 'signature')
      .flatMap((landmark) => [
        landmark.id,
        landmark.name,
        landmark.description,
        landmark.requiredText,
      ])
      .join(' ')
    const planWords = new Set(normalizedWords(requiredLandmarkEvidence))
    const missingRequestWords = [...new Set(normalizedWords(requestedDescription))]
      .filter((word) => !planWords.has(word))
    if (missingRequestWords.length) {
      throw new Error(`recognitionPlan must preserve requested elements in required landmarks: ${missingRequestWords.join(', ')}`)
    }
    const missingCounts = requestedCounts(requestedDescription).filter(({ count, noun }) => (
      !plan.landmarks.some((landmark) => {
        if (!landmark.required) return false
        const evidenceWords = normalizedWords(`${landmark.id} ${landmark.name} ${landmark.description}`)
        return evidenceWords.includes(noun)
          && landmark.minimumInstances === count
          && landmark.maximumInstances === count
      })
    ))
    if (missingCounts.length) {
      throw new Error(`recognitionPlan must encode exact requested counts in required landmarks: ${missingCounts.map(({ count, noun }) => `${count} ${noun}`).join(', ')}`)
    }
    const exactTexts = requestedExactTexts(requestedDescription)
    const declaredTexts = new Set(plan.landmarks
      .filter((landmark) => landmark.requiredText)
      .map((landmark) => landmark.requiredText.trim().toLowerCase()))
    const missingTexts = exactTexts.filter((text) => !declaredTexts.has(text))
    if (missingTexts.length) {
      throw new Error(`recognitionPlan must encode exact requested lettering: ${missingTexts.join(', ')}`)
    }
    const requiredLandmarks = plan.landmarks.filter((landmark) => landmark.required)
    const entityTerms = requestedEntityTerms(requestedDescription)
    const landmarkOptionsByEntity = new Map(entityTerms.map((entity) => [
      entity,
      requiredLandmarks
        .filter((landmark) => normalizedWords(`${landmark.id} ${landmark.name}`).includes(entity))
        .map((landmark) => landmark.id),
    ]))
    const missingEntities = entityTerms.filter((entity) => !landmarkOptionsByEntity.get(entity)?.length)
    if (missingEntities.length) {
      throw new Error(`recognitionPlan must give each requested entity its own named required landmark: ${missingEntities.join(', ')}`)
    }
    const entityOptions = entityTerms.map((entity) => landmarkOptionsByEntity.get(entity) ?? [])
    if (!hasDistinctLandmarkAssignment(entityOptions)) {
      throw new Error('recognitionPlan cannot collapse distinct requested entities into the same required landmark')
    }
    const primaryEntity = entityTerms[0]
    const primaryLandmarkIds = new Set(landmarkOptionsByEntity.get(primaryEntity) ?? [])
    const missingCompositionRelations = requestedCompositionCues(requestedDescription)
      .filter((cue) => cue.target !== primaryEntity)
      .filter((cue) => {
        const targetLandmarkIds = new Set(landmarkOptionsByEntity.get(cue.target) ?? [])
        return !plan.relationships.some((relationship) => relationshipMatchesRequestedCue(
          relationship,
          cue.cue,
          primaryLandmarkIds,
          targetLandmarkIds
        ))
      })
    if (missingCompositionRelations.length) {
      throw new Error(`recognitionPlan must encode requested composition relationships: ${missingCompositionRelations.map((cue) => `${primaryEntity} ${cue.cue} ${cue.target}`).join(', ')}`)
    }
  }
  return plan
}
