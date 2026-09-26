import type { DecoratorFontStyle } from '@/lib/project/decoratorProfile'

export const AI_COLOR_SLOTS = ['base', 'outline', 'accent', 'detail', 'neutral'] as const
export type AIColorSlot = typeof AI_COLOR_SLOTS[number]

export const AI_DECORATION_TECHNIQUES = ['flood', 'wet-on-wet', 'piped-detail'] as const
export type AIDecorationTechnique = typeof AI_DECORATION_TECHNIQUES[number]

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
}

export interface AIDecorationCandidateDraft {
  id: string
  name: string
  concept: string
  difficulty: 'easy' | 'detailed'
  estimatedMinutes: number
  paletteName: string
  palette: AIPaletteColor[]
  regions: AIDecorationRegionDraft[]
  strokes: AIDecorationStrokeDraft[]
  lettering: AIDecorationLetteringDraft[]
}

export interface AIDecorationModelResult {
  candidates: AIDecorationCandidateDraft[]
}

export interface AIDecorationGeneration {
  generationId: string
  model: string
  createdAt: string
  candidates: AIDecorationCandidateDraft[]
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
                points: { type: 'array', minItems: 0, maxItems: 20, items: pointSchema },
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
        },
        required: [
          'id', 'name', 'concept', 'difficulty', 'estimatedMinutes', 'paletteName',
          'palette', 'regions', 'strokes', 'lettering',
        ],
      },
    },
  },
  required: ['candidates'],
} as const

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

export function validateAIDecorationModelResult(value: unknown): AIDecorationModelResult {
  if (!isRecord(value)) throw new Error('AI decoration output must be an object')
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
      const points = assertArray(rawRegion.points, `${regionPath}.points`, 0, 20)
        .map((point, pointIndex) => parsePoint(point, `${regionPath}.points[${pointIndex}]`))
      if (kind === 'polygon' && points.length < 3) throw new Error(`${regionPath}.points requires at least three points`)
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
      }
    })

    uniqueIds(regions, `${path}.regions`)
    uniqueIds(strokes, `${path}.strokes`)
    uniqueIds(lettering, `${path}.lettering`)

    return {
      id: assertString(rawCandidate.id, `${path}.id`, 40),
      name: assertString(rawCandidate.name, `${path}.name`, 80),
      concept: assertString(rawCandidate.concept, `${path}.concept`, 240),
      difficulty: assertEnum(rawCandidate.difficulty, ['easy', 'detailed'] as const, `${path}.difficulty`),
      estimatedMinutes: assertInteger(rawCandidate.estimatedMinutes, `${path}.estimatedMinutes`, 15, 240),
      paletteName: assertString(rawCandidate.paletteName, `${path}.paletteName`, 80),
      palette,
      regions,
      strokes,
      lettering,
    }
  })
  uniqueIds(candidates, 'candidates')
  return { candidates }
}

export function validateAIDecorationGeneration(value: unknown): AIDecorationGeneration {
  if (!isRecord(value)) throw new Error('AI decoration generation must be an object')
  const result = validateAIDecorationModelResult({ candidates: value.candidates })
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
    ...(Object.keys(usage).length ? { usage } : {}),
  }
}
