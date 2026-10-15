import type { DecoratorFontStyle } from '@/lib/project/decoratorProfile'
import {
  validateAIRecognitionPlan,
  type AIDecorationRecognitionPlan,
} from './decorationRecognition'
import {
  validateDecorationVisualEvaluation,
  type AIDecorationVisualEvaluation,
} from './decorationVisualEvaluation'

export const AI_COLOR_SLOTS = ['base', 'outline', 'accent', 'detail', 'neutral'] as const
export type AIColorSlot = typeof AI_COLOR_SLOTS[number]

export const AI_DECORATION_TECHNIQUES = ['flood', 'wet-on-wet', 'piped-detail'] as const
export type AIDecorationTechnique = typeof AI_DECORATION_TECHNIQUES[number]

export const AI_SEMANTIC_ROLES = ['signature', 'supporting', 'accent'] as const
export type AISemanticRole = typeof AI_SEMANTIC_ROLES[number]

export interface AINormalizedPoint {
  x: number
  y: number
}

export interface AIPaletteColor {
  slot: AIColorSlot
  name: string
  hex: string
}

export interface AIDecorationRegionDraft {
  id: string
  name: string
  kind: 'ellipse' | 'polygon'
  centerX: number
  centerY: number
  radiusX: number
  radiusY: number
  points: AINormalizedPoint[]
  colorSlot: AIColorSlot
  technique: AIDecorationTechnique
  layer: number
  landmarkId?: string
  landmarkInstance?: number
}

export interface AIDecorationStrokeDraft {
  id: string
  name: string
  points: AINormalizedPoint[]
  widthMm: number
  colorSlot: AIColorSlot
  closed: boolean
  technique: 'wet-on-wet' | 'piped-detail'
  layer: number
  landmarkId?: string
  landmarkInstance?: number
}

export interface AIDecorationLetteringDraft {
  id: string
  name: string
  text: string
  position: AINormalizedPoint
  maxWidthRatio: number
  fontSizeMm: number
  strokeWidthMm: number
  colorSlot: AIColorSlot
  style: DecoratorFontStyle
  technique: 'piped' | 'transfer' | 'marker'
  align: 'start' | 'middle' | 'end'
  rotationDegrees: number
  layer: number
  landmarkId?: string
  landmarkInstance?: number
}

export interface AISemanticFeatureBinding {
  id: string
  name: string
  description: string
  role: AISemanticRole
  geometryIds: string[]
  landmarkId?: string
}

export interface AIDecorationCandidateDraft {
  id: string
  name: string
  concept: string
  subject: string
  recognitionStrategy: string
  difficulty: 'easy' | 'detailed'
  estimatedMinutes: number
  paletteName: string
  palette: AIPaletteColor[]
  regions: AIDecorationRegionDraft[]
  strokes: AIDecorationStrokeDraft[]
  lettering: AIDecorationLetteringDraft[]
  semanticFeatures: AISemanticFeatureBinding[]
}

export interface AIDecorationModelResult {
  candidates: AIDecorationCandidateDraft[]
}

export interface AIDecorationGeneration {
  generationId: string
  model: string
  createdAt: string
  candidates: AIDecorationCandidateDraft[]
  recognitionPlan?: AIDecorationRecognitionPlan
  visualEvaluation?: AIDecorationVisualEvaluation
  usage?: {
    inputTokens?: number
    outputTokens?: number
    totalTokens?: number
  }
}

const pointSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    x: { type: 'number', minimum: 0.04, maximum: 0.96 },
    y: { type: 'number', minimum: 0.04, maximum: 0.96 },
  },
  required: ['x', 'y'],
} as const

const colorSlotSchema = { type: 'string', enum: AI_COLOR_SLOTS } as const

export const AI_DECORATION_RESULT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    candidates: {
      type: 'array',
      minItems: 3,
      maxItems: 3,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string', minLength: 1, maxLength: 40 },
          name: { type: 'string', minLength: 1, maxLength: 80 },
          concept: { type: 'string', minLength: 1, maxLength: 240 },
          difficulty: { type: 'string', enum: ['easy', 'detailed'] },
          estimatedMinutes: { type: 'integer', minimum: 15, maximum: 240 },
          paletteName: { type: 'string', minLength: 1, maxLength: 80 },
          palette: {
            type: 'array',
            minItems: 4,
            maxItems: 6,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                slot: colorSlotSchema,
                name: { type: 'string', minLength: 1, maxLength: 48 },
                hex: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' },
              },
              required: ['slot', 'name', 'hex'],
            },
          },
          regions: {
            type: 'array',
            minItems: 0,
            maxItems: 10,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                id: { type: 'string', minLength: 1, maxLength: 40 },
                name: { type: 'string', minLength: 1, maxLength: 80 },
                kind: { type: 'string', enum: ['ellipse', 'polygon'] },
                centerX: { type: 'number', minimum: 0.04, maximum: 0.96 },
                centerY: { type: 'number', minimum: 0.04, maximum: 0.96 },
                radiusX: { type: 'number', minimum: 0, maximum: 0.4 },
                radiusY: { type: 'number', minimum: 0, maximum: 0.4 },
                points: { type: 'array', minItems: 3, maxItems: 20, items: pointSchema },
                colorSlot: colorSlotSchema,
                technique: { type: 'string', enum: AI_DECORATION_TECHNIQUES },
                layer: { type: 'integer', minimum: 0, maximum: 5 },
              },
              required: [
                'id', 'name', 'kind', 'centerX', 'centerY', 'radiusX', 'radiusY',
                'points', 'colorSlot', 'technique', 'layer',
              ],
            },
          },
          strokes: {
            type: 'array',
            minItems: 0,
            maxItems: 12,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                id: { type: 'string', minLength: 1, maxLength: 40 },
                name: { type: 'string', minLength: 1, maxLength: 80 },
                points: { type: 'array', minItems: 2, maxItems: 24, items: pointSchema },
                widthMm: { type: 'number', minimum: 0.7, maximum: 3 },
                colorSlot: colorSlotSchema,
                closed: { type: 'boolean' },
                technique: { type: 'string', enum: ['wet-on-wet', 'piped-detail'] },
                layer: { type: 'integer', minimum: 0, maximum: 5 },
              },
              required: ['id', 'name', 'points', 'widthMm', 'colorSlot', 'closed', 'technique', 'layer'],
            },
          },
          lettering: {
            type: 'array',
            minItems: 0,
            maxItems: 3,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                id: { type: 'string', minLength: 1, maxLength: 40 },
                name: { type: 'string', minLength: 1, maxLength: 80 },
                text: { type: 'string', minLength: 1, maxLength: 24 },
                position: pointSchema,
                maxWidthRatio: { type: 'number', minimum: 0.15, maximum: 0.82 },
                fontSizeMm: { type: 'number', minimum: 6, maximum: 22 },
                strokeWidthMm: { type: 'number', minimum: 0.7, maximum: 2.5 },
                colorSlot: colorSlotSchema,
                style: {
                  type: 'string',
                  enum: ['monoline-sans', 'monoline-script', 'rounded-block', 'faux-calligraphy'],
                },
                technique: { type: 'string', enum: ['piped', 'transfer', 'marker'] },
                align: { type: 'string', enum: ['start', 'middle', 'end'] },
                rotationDegrees: { type: 'number', minimum: -30, maximum: 30 },
                layer: { type: 'integer', minimum: 0, maximum: 5 },
              },
              required: [
                'id', 'name', 'text', 'position', 'maxWidthRatio', 'fontSizeMm',
                'strokeWidthMm', 'colorSlot', 'style', 'technique', 'align',
                'rotationDegrees', 'layer',
              ],
            },
          },
          subject: { type: 'string', minLength: 1, maxLength: 80 },
          recognitionStrategy: { type: 'string', minLength: 1, maxLength: 320 },
          semanticFeatures: {
            type: 'array',
            minItems: 3,
            maxItems: 8,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                id: { type: 'string', minLength: 1, maxLength: 40 },
                name: { type: 'string', minLength: 1, maxLength: 80 },
                description: { type: 'string', minLength: 1, maxLength: 180 },
                role: { type: 'string', enum: AI_SEMANTIC_ROLES },
                geometryIds: {
                  type: 'array',
                  minItems: 1,
                  maxItems: 6,
                  items: { type: 'string', minLength: 1, maxLength: 40 },
                },
              },
              required: ['id', 'name', 'description', 'role', 'geometryIds'],
            },
          },
        },
        required: [
          'id', 'name', 'concept', 'subject', 'recognitionStrategy', 'difficulty',
          'estimatedMinutes', 'paletteName', 'palette', 'regions', 'strokes',
          'lettering', 'semanticFeatures',
        ],
      },
    },
  },
  required: ['candidates'],
} as const

type MutableObjectSchema = {
  properties: Record<string, unknown>
  required: string[]
}

type MutableDecorationSchema = MutableObjectSchema & {
  properties: {
    candidates: {
      items: MutableObjectSchema
    }
  }
}

/**
 * Build the candidate schema from a frozen recognition plan. Every visible
 * primitive names one server-approved landmark directly; semantic feature
 * bindings are then derived locally instead of being self-certified by the
 * generation model.
 */
export function createAIDecorationResultSchema(
  recognitionPlan: AIDecorationRecognitionPlan
): Record<string, unknown> {
  const schema = JSON.parse(JSON.stringify(AI_DECORATION_RESULT_SCHEMA)) as MutableDecorationSchema
  const candidate = schema.properties.candidates.items
  const landmarkIds = recognitionPlan.landmarks.map((landmark) => landmark.id)

  delete candidate.properties.semanticFeatures
  candidate.required = candidate.required.filter((name) => name !== 'semanticFeatures')
  candidate.properties.subject = { type: 'string', enum: [recognitionPlan.subject] }

  for (const collectionName of ['regions', 'strokes', 'lettering']) {
    const collection = candidate.properties[collectionName] as { items: MutableObjectSchema }
    collection.items.properties.landmarkId = {
      type: 'string',
      enum: landmarkIds,
    }
    collection.items.properties.landmarkInstance = {
      type: 'integer',
      minimum: 1,
      maximum: 12,
    }
    collection.items.required.push('landmarkId', 'landmarkInstance')
  }

  return schema as unknown as Record<string, unknown>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function assertString(value: unknown, path: string, maxLength: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength) {
    throw new Error(`${path} must be a non-empty string of at most ${maxLength} characters`)
  }
  return value.trim()
}

function assertNumber(value: unknown, path: string, minimum: number, maximum: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${path} must be a finite number between ${minimum} and ${maximum}`)
  }
  return value
}

function assertInteger(value: unknown, path: string, minimum: number, maximum: number): number {
  const result = assertNumber(value, path, minimum, maximum)
  if (!Number.isInteger(result)) throw new Error(`${path} must be an integer`)
  return result
}

function assertEnum<T extends readonly string[]>(value: unknown, values: T, path: string): T[number] {
  if (typeof value !== 'string' || !values.includes(value)) {
    throw new Error(`${path} must be one of ${values.join(', ')}`)
  }
  return value as T[number]
}

function parsePoint(value: unknown, path: string): AINormalizedPoint {
  if (!isRecord(value)) throw new Error(`${path} must be a point`)
  return {
    x: assertNumber(value.x, `${path}.x`, 0.04, 0.96),
    y: assertNumber(value.y, `${path}.y`, 0.04, 0.96),
  }
}

function assertArray(value: unknown, path: string, minimum: number, maximum: number): unknown[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
    throw new Error(`${path} must contain between ${minimum} and ${maximum} items`)
  }
  return value
}

function uniqueIds(items: Array<{ id: string }>, path: string): void {
  const ids = new Set<string>()
  for (const item of items) {
    if (ids.has(item.id)) throw new Error(`${path} contains duplicate id "${item.id}"`)
    ids.add(item.id)
  }
}

function bindingTokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 1 && !['the', 'and', 'with', 'detail', 'stroke', 'region'].includes(token))
}

function bindingMatchScore(
  feature: Pick<AISemanticFeatureBinding, 'name' | 'description'>,
  rawReferences: readonly string[],
  geometry: { id: string; name: string }
): number {
  const featureTokens = new Set(bindingTokens(`${feature.name} ${feature.description} ${rawReferences.join(' ')}`))
  const geometryTokens = new Set(bindingTokens(`${geometry.id} ${geometry.name}`))
  let score = 0
  geometryTokens.forEach((token) => {
    if (featureTokens.has(token)) score += 3
  })
  const normalizedGeometryId = geometry.id.toLowerCase().replace(/[^a-z0-9]/g, '')
  rawReferences.forEach((reference) => {
    const normalizedReference = reference.toLowerCase().replace(/[^a-z0-9]/g, '')
    if (
      normalizedReference
      && normalizedGeometryId
      && (
        normalizedReference === normalizedGeometryId
        || (
          Math.min(normalizedReference.length, normalizedGeometryId.length) >= 4
          && (normalizedReference.includes(normalizedGeometryId) || normalizedGeometryId.includes(normalizedReference))
        )
      )
    ) score += 8
  })
  return score
}

function bestBindingGeometry(
  feature: Pick<AISemanticFeatureBinding, 'name' | 'description'>,
  rawReferences: readonly string[],
  geometry: Array<{ id: string; name: string }>,
  excludedIds: ReadonlySet<string>
): { id: string; score: number } | undefined {
  const matches = geometry
    .filter((item) => !excludedIds.has(item.id))
    .map((item) => ({ id: item.id, score: bindingMatchScore(feature, rawReferences, item) }))
    .sort((first, second) => second.score - first.score || first.id.localeCompare(second.id))
  const best = matches[0]
  const runnerUp = matches[1]
  if (!best || best.score < 6) return undefined
  if (runnerUp && best.score - runnerUp.score < 3) return undefined
  return best
}

function autoFeatureId(geometryId: string, existingIds: ReadonlySet<string>): string {
  const base = `auto-${geometryId}`
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 36) || 'auto-detail'
  let candidate = base
  let suffix = 2
  while (existingIds.has(candidate)) {
    candidate = `${base.slice(0, 35)}-${suffix}`.slice(0, 40)
    suffix += 1
  }
  return candidate
}

export function validateAIDecorationModelResult(
  value: unknown,
  recognitionPlan?: AIDecorationRecognitionPlan
): AIDecorationModelResult {
  if (!isRecord(value)) throw new Error('AI decoration output must be an object')
  const recognitionLandmarkIds = new Set(recognitionPlan?.landmarks.map((landmark) => landmark.id) ?? [])
  const landmarkId = (rawValue: unknown, path: string): string | undefined => {
    if (!recognitionPlan && rawValue === undefined) return undefined
    const parsed = assertString(rawValue, path, 36)
    if (recognitionPlan && !recognitionLandmarkIds.has(parsed)) {
      throw new Error(`${path} must reference a landmark in the frozen recognition plan`)
    }
    return parsed
  }
  const landmarkInstance = (rawValue: unknown, path: string): number | undefined => {
    if (!recognitionPlan && rawValue === undefined) return undefined
    return assertInteger(rawValue, path, 1, 12)
  }
  const candidates = assertArray(value.candidates, 'candidates', 3, 3).map((rawCandidate, candidateIndex) => {
    const path = `candidates[${candidateIndex}]`
    if (!isRecord(rawCandidate)) throw new Error(`${path} must be an object`)
    const palette = assertArray(rawCandidate.palette, `${path}.palette`, 4, 6).map((rawColor, colorIndex) => {
      if (!isRecord(rawColor)) throw new Error(`${path}.palette[${colorIndex}] must be an object`)
      const hex = assertString(rawColor.hex, `${path}.palette[${colorIndex}].hex`, 7)
      if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error(`${path}.palette[${colorIndex}].hex must be six-digit sRGB`)
      return {
        slot: assertEnum(rawColor.slot, AI_COLOR_SLOTS, `${path}.palette[${colorIndex}].slot`),
        name: assertString(rawColor.name, `${path}.palette[${colorIndex}].name`, 48),
        hex: hex.toUpperCase(),
      }
    })
    if (!palette.some((color) => color.slot === 'base')) throw new Error(`${path}.palette requires a base color`)

    const regions = assertArray(rawCandidate.regions, `${path}.regions`, 0, 10).map((rawRegion, regionIndex) => {
      const regionPath = `${path}.regions[${regionIndex}]`
      if (!isRecord(rawRegion)) throw new Error(`${regionPath} must be an object`)
      const kind = assertEnum(rawRegion.kind, ['ellipse', 'polygon'] as const, `${regionPath}.kind`)
      const points = assertArray(rawRegion.points, `${regionPath}.points`, 3, 20)
        .map((point, pointIndex) => parsePoint(point, `${regionPath}.points[${pointIndex}]`))
      return {
        id: assertString(rawRegion.id, `${regionPath}.id`, 40),
        name: assertString(rawRegion.name, `${regionPath}.name`, 80),
        kind,
        centerX: assertNumber(rawRegion.centerX, `${regionPath}.centerX`, 0.04, 0.96),
        centerY: assertNumber(rawRegion.centerY, `${regionPath}.centerY`, 0.04, 0.96),
        radiusX: assertNumber(rawRegion.radiusX, `${regionPath}.radiusX`, 0, 0.4),
        radiusY: assertNumber(rawRegion.radiusY, `${regionPath}.radiusY`, 0, 0.4),
        points,
        colorSlot: assertEnum(rawRegion.colorSlot, AI_COLOR_SLOTS, `${regionPath}.colorSlot`),
        technique: assertEnum(rawRegion.technique, AI_DECORATION_TECHNIQUES, `${regionPath}.technique`),
        layer: assertInteger(rawRegion.layer, `${regionPath}.layer`, 0, 5),
        landmarkId: landmarkId(rawRegion.landmarkId, `${regionPath}.landmarkId`),
        landmarkInstance: landmarkInstance(rawRegion.landmarkInstance, `${regionPath}.landmarkInstance`),
      }
    })

    const strokes = assertArray(rawCandidate.strokes, `${path}.strokes`, 0, 12).map((rawStroke, strokeIndex) => {
      const strokePath = `${path}.strokes[${strokeIndex}]`
      if (!isRecord(rawStroke)) throw new Error(`${strokePath} must be an object`)
      return {
        id: assertString(rawStroke.id, `${strokePath}.id`, 40),
        name: assertString(rawStroke.name, `${strokePath}.name`, 80),
        points: assertArray(rawStroke.points, `${strokePath}.points`, 2, 24)
          .map((point, pointIndex) => parsePoint(point, `${strokePath}.points[${pointIndex}]`)),
        widthMm: assertNumber(rawStroke.widthMm, `${strokePath}.widthMm`, 0.7, 3),
        colorSlot: assertEnum(rawStroke.colorSlot, AI_COLOR_SLOTS, `${strokePath}.colorSlot`),
        closed: Boolean(rawStroke.closed),
        technique: assertEnum(rawStroke.technique, ['wet-on-wet', 'piped-detail'] as const, `${strokePath}.technique`),
        layer: assertInteger(rawStroke.layer, `${strokePath}.layer`, 0, 5),
        landmarkId: landmarkId(rawStroke.landmarkId, `${strokePath}.landmarkId`),
        landmarkInstance: landmarkInstance(rawStroke.landmarkInstance, `${strokePath}.landmarkInstance`),
      }
    })

    const lettering = assertArray(rawCandidate.lettering, `${path}.lettering`, 0, 3).map((rawLettering, letteringIndex) => {
      const letteringPath = `${path}.lettering[${letteringIndex}]`
      if (!isRecord(rawLettering)) throw new Error(`${letteringPath} must be an object`)
      return {
        id: assertString(rawLettering.id, `${letteringPath}.id`, 40),
        name: assertString(rawLettering.name, `${letteringPath}.name`, 80),
        text: assertString(rawLettering.text, `${letteringPath}.text`, 24),
        position: parsePoint(rawLettering.position, `${letteringPath}.position`),
        maxWidthRatio: assertNumber(rawLettering.maxWidthRatio, `${letteringPath}.maxWidthRatio`, 0.15, 0.82),
        fontSizeMm: assertNumber(rawLettering.fontSizeMm, `${letteringPath}.fontSizeMm`, 6, 22),
        strokeWidthMm: assertNumber(rawLettering.strokeWidthMm, `${letteringPath}.strokeWidthMm`, 0.7, 2.5),
        colorSlot: assertEnum(rawLettering.colorSlot, AI_COLOR_SLOTS, `${letteringPath}.colorSlot`),
        style: assertEnum(
          rawLettering.style,
          ['monoline-sans', 'monoline-script', 'rounded-block', 'faux-calligraphy'] as const,
          `${letteringPath}.style`
        ),
        technique: assertEnum(rawLettering.technique, ['piped', 'transfer', 'marker'] as const, `${letteringPath}.technique`),
        align: assertEnum(rawLettering.align, ['start', 'middle', 'end'] as const, `${letteringPath}.align`),
        rotationDegrees: assertNumber(rawLettering.rotationDegrees, `${letteringPath}.rotationDegrees`, -30, 30),
        layer: assertInteger(rawLettering.layer, `${letteringPath}.layer`, 0, 5),
        landmarkId: landmarkId(rawLettering.landmarkId, `${letteringPath}.landmarkId`),
        landmarkInstance: landmarkInstance(rawLettering.landmarkInstance, `${letteringPath}.landmarkInstance`),
      }
    })

    uniqueIds(regions, `${path}.regions`)
    uniqueIds(strokes, `${path}.strokes`)
    uniqueIds(lettering, `${path}.lettering`)
    const geometry = [...regions, ...strokes, ...lettering]
    uniqueIds(geometry, `${path}.geometry`)
    if (recognitionPlan) {
      recognitionPlan.landmarks.forEach((landmark) => {
        const instances = [...new Set(geometry
          .filter((item) => item.landmarkId === landmark.id)
          .map((item) => item.landmarkInstance))]
          .filter((instance): instance is number => instance !== undefined)
          .sort((first, second) => first - second)
        instances.forEach((instance, index) => {
          if (instance !== index + 1 || instance > landmark.maximumInstances) {
            throw new Error(`${path} must number ${landmark.id} instances consecutively from 1 through ${landmark.maximumInstances}`)
          }
        })
      })
    }
    const geometryIds = new Set(geometry.map((item) => item.id))
    let semanticFeatures: AISemanticFeatureBinding[]
    if (recognitionPlan) {
      semanticFeatures = recognitionPlan.landmarks.flatMap((landmark) => {
        const geometryIdsForLandmark = geometry
          .filter((item) => item.landmarkId === landmark.id)
          .map((item) => item.id)
        if (!geometryIdsForLandmark.length) return []
        return [{
          id: landmark.id,
          landmarkId: landmark.id,
          name: landmark.name,
          description: landmark.description,
          role: landmark.role,
          geometryIds: geometryIdsForLandmark,
        }]
      })
    } else {
      semanticFeatures = assertArray(rawCandidate.semanticFeatures, `${path}.semanticFeatures`, 3, 8)
        .map((rawFeature, featureIndex) => {
          const featurePath = `${path}.semanticFeatures[${featureIndex}]`
          if (!isRecord(rawFeature)) throw new Error(`${featurePath} must be an object`)
          const boundIds = assertArray(rawFeature.geometryIds, `${featurePath}.geometryIds`, 1, 6)
            .map((id, idIndex) => assertString(id, `${featurePath}.geometryIds[${idIndex}]`, 40))
          return {
            id: assertString(rawFeature.id, `${featurePath}.id`, 40),
            name: assertString(rawFeature.name, `${featurePath}.name`, 80),
            description: assertString(rawFeature.description, `${featurePath}.description`, 180),
            role: assertEnum(rawFeature.role, AI_SEMANTIC_ROLES, `${featurePath}.role`),
            geometryIds: [...new Set(boundIds)],
          }
        })
      uniqueIds(semanticFeatures, `${path}.semanticFeatures`)
      if (semanticFeatures.filter((feature) => feature.role === 'signature').length < 2) {
        throw new Error(`${path}.semanticFeatures requires at least two signature features`)
      }

      const claimedGeometryIds = new Set<string>()
      semanticFeatures.forEach((feature) => {
        const rawReferences = [...feature.geometryIds]
        const resolved = feature.geometryIds.filter((id) => geometryIds.has(id))
        const resolvedIds = new Set(resolved)
        rawReferences.filter((id) => !geometryIds.has(id)).forEach((unknownId) => {
          const match = bestBindingGeometry(feature, [unknownId], geometry, resolvedIds)
          if (match && match.score > 0 && resolvedIds.size < 6) resolvedIds.add(match.id)
        })
        if (!resolvedIds.size) {
          const match = bestBindingGeometry(feature, rawReferences, geometry, resolvedIds)
          if (match && match.score > 0) resolvedIds.add(match.id)
        }
        feature.geometryIds = [...resolvedIds]
        feature.geometryIds.forEach((id) => claimedGeometryIds.add(id))
      })

      const unresolvedSignatures = semanticFeatures.filter((feature) => (
        feature.role === 'signature' && !feature.geometryIds.length
      ))
      if (unresolvedSignatures.length) {
        throw new Error(`${path}.semanticFeatures could not resolve geometry for signature features: ${unresolvedSignatures.map((feature) => feature.id).join(', ')}`)
      }

      for (let index = semanticFeatures.length - 1; index >= 0; index -= 1) {
        const feature = semanticFeatures[index]
        if (!feature.geometryIds.length && feature.role !== 'signature' && semanticFeatures.length > 3) {
          semanticFeatures.splice(index, 1)
        }
      }

      const featureIds = new Set(semanticFeatures.map((feature) => feature.id))
      geometry.filter((item) => !claimedGeometryIds.has(item.id)).forEach((item) => {
        const availableFeatures = semanticFeatures.filter((feature) => feature.geometryIds.length < 6)
        const featureMatches = availableFeatures
          .map((feature) => ({ feature, score: bindingMatchScore(feature, [], item) }))
          .sort((first, second) => second.score - first.score || first.feature.id.localeCompare(second.feature.id))
        const bestFeature = featureMatches[0]
        const runnerUp = featureMatches[1]
        const selected = bestFeature?.score >= 3
          && (!runnerUp || bestFeature.score - runnerUp.score >= 3)
          ? bestFeature.feature
          : undefined
        if (selected) {
          selected.geometryIds.push(item.id)
        } else if (semanticFeatures.length < 8) {
          const id = autoFeatureId(item.id, featureIds)
          featureIds.add(id)
          semanticFeatures.push({
            id,
            name: item.name,
            description: `Additional generated icing detail: ${item.name}.`,
            role: 'supporting',
            geometryIds: [item.id],
          })
        }
        claimedGeometryIds.add(item.id)
      })

      const emptyFeatures = semanticFeatures.filter((feature) => !feature.geometryIds.length)
      if (emptyFeatures.length) {
        throw new Error(`${path}.semanticFeatures could not resolve geometry for: ${emptyFeatures.map((feature) => feature.id).join(', ')}`)
      }
      const boundGeometryIds = new Set(semanticFeatures.flatMap((feature) => feature.geometryIds))
      if (boundGeometryIds.size < 3) {
        throw new Error(`${path}.semanticFeatures must bind at least three distinct decoration geometries`)
      }
      const unboundGeometryIds = [...geometryIds].filter((id) => !boundGeometryIds.has(id))
      if (unboundGeometryIds.length) {
        throw new Error(`${path}.semanticFeatures leaves geometry unbound: ${unboundGeometryIds.join(', ')}`)
      }
    }

    const subject = assertString(rawCandidate.subject, `${path}.subject`, 80)
    if (recognitionPlan && subject.toLowerCase() !== recognitionPlan.subject.toLowerCase()) {
      throw new Error(`${path}.subject must exactly match the frozen recognition subject`)
    }

    return {
      id: assertString(rawCandidate.id, `${path}.id`, 40),
      name: assertString(rawCandidate.name, `${path}.name`, 80),
      concept: assertString(rawCandidate.concept, `${path}.concept`, 240),
      subject,
      recognitionStrategy: assertString(rawCandidate.recognitionStrategy, `${path}.recognitionStrategy`, 320),
      difficulty: assertEnum(rawCandidate.difficulty, ['easy', 'detailed'] as const, `${path}.difficulty`),
      estimatedMinutes: assertInteger(rawCandidate.estimatedMinutes, `${path}.estimatedMinutes`, 15, 240),
      paletteName: assertString(rawCandidate.paletteName, `${path}.paletteName`, 80),
      palette,
      regions,
      strokes,
      lettering,
      semanticFeatures,
    }
  })
  uniqueIds(candidates, 'candidates')
  return { candidates }
}

export function validateAIDecorationGeneration(
  value: unknown,
  options: { allowUnverifiedLegacy?: boolean } = {}
): AIDecorationGeneration {
  if (!isRecord(value)) throw new Error('AI decoration generation must be an object')
  const recognitionPlan = value.recognitionPlan === undefined
    ? undefined
    : validateAIRecognitionPlan(value.recognitionPlan)
  if (!recognitionPlan && !options.allowUnverifiedLegacy) {
    throw new Error('AI decoration generation requires a frozen recognitionPlan')
  }
  const result = validateAIDecorationModelResult({ candidates: value.candidates }, recognitionPlan)
  let visualEvaluation: AIDecorationVisualEvaluation | undefined
  if (value.visualEvaluation !== undefined) {
    if (!recognitionPlan) throw new Error('visualEvaluation requires a recognitionPlan')
    visualEvaluation = validateDecorationVisualEvaluation(value.visualEvaluation, result.candidates, recognitionPlan)
  }
  if (!visualEvaluation && !options.allowUnverifiedLegacy) {
    throw new Error('AI decoration generation requires an independent visualEvaluation')
  }
  const usage: NonNullable<AIDecorationGeneration['usage']> = {}
  if (isRecord(value.usage)) {
    if (typeof value.usage.inputTokens === 'number') usage.inputTokens = value.usage.inputTokens
    if (typeof value.usage.outputTokens === 'number') usage.outputTokens = value.usage.outputTokens
    if (typeof value.usage.totalTokens === 'number') usage.totalTokens = value.usage.totalTokens
  }
  return {
    generationId: assertString(value.generationId, 'generationId', 128),
    model: assertString(value.model, 'model', 128),
    createdAt: assertString(value.createdAt, 'createdAt', 64),
    candidates: result.candidates,
    ...(recognitionPlan ? { recognitionPlan } : {}),
    ...(visualEvaluation ? { visualEvaluation } : {}),
    ...(Object.keys(usage).length ? { usage } : {}),
  }
}
