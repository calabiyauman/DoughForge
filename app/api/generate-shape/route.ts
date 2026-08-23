import OpenAI from 'openai'
import { createHash } from 'crypto'
import {
  closeOutline,
  cleanClosedOutline,
  hasOffsetSelfIntersections,
  hasSelfIntersections,
  normalizeOutline,
  signedArea
} from '@/lib/geometry/outline'

export const runtime = 'nodejs'

const categories = [
  'animal',
  'nature',
  'object',
  'food',
  'holiday',
  'abstract',
  'vehicle',
  'character'
] as const

type Category = typeof categories[number]
type Point = { x: number; y: number }
type ShapeResponse = {
  points: Point[]
  reasoning: string
  category: Category
}

type RateLimitEntry = { count: number; resetAt: number }

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000
const RATE_LIMIT_MAX_REQUESTS = 10
const MAX_BODY_BYTES = 2_048
const MAX_DESCRIPTION_LENGTH = 200
const MAX_GENERATION_ATTEMPTS = 3
const PROFESSIONAL_PROFILE_OFFSETS_MM = [6.35, -2.79] as const

const globalForRateLimit = globalThis as typeof globalThis & {
  doughForgeRateLimits?: Map<string, RateLimitEntry>
}

const rateLimits = globalForRateLimit.doughForgeRateLimits ?? new Map<string, RateLimitEntry>()
globalForRateLimit.doughForgeRateLimits = rateLimits

const shapeSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    points: {
      type: 'array',
      minItems: 6,
      maxItems: 49,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          x: { type: 'number', minimum: -30, maximum: 30 },
          y: { type: 'number', minimum: -30, maximum: 30 }
        },
        required: ['x', 'y']
      }
    },
    reasoning: { type: 'string', minLength: 1, maxLength: 240 },
    category: { type: 'string', enum: categories }
  },
  required: ['points', 'reasoning', 'category']
} as const

function getClientIp(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown'
}

function checkRateLimit(key: string): { allowed: boolean; retryAfter: number } {
  const now = Date.now()
  const existing = rateLimits.get(key)

  if (!existing || existing.resetAt <= now) {
    rateLimits.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    return { allowed: true, retryAfter: 0 }
  }

  if (existing.count >= RATE_LIMIT_MAX_REQUESTS) {
    return {
      allowed: false,
      retryAfter: Math.max(1, Math.ceil((existing.resetAt - now) / 1000))
    }
  }

  existing.count += 1
  return { allowed: true, retryAfter: 0 }
}

function getSubjectHint(description: string): string {
  if (/\bbutterfl(?:y|ies)\b/i.test(description)) {
    return [
      'For a butterfly, use bilateral left-right symmetry.',
      'Show two large rounded upper wings and two smaller rounded lower wings.',
      'Separate the four wing lobes with shallow exterior clefts and keep the center broad.',
      'Do not create an interior body loop or a bow-tie polygon.'
    ].join(' ')
  }

  return ''
}

function validateShape(value: unknown): ShapeResponse {
  if (!value || typeof value !== 'object') {
    throw new Error('Model returned an invalid shape')
  }

  const candidate = value as Partial<ShapeResponse>
  if (!Array.isArray(candidate.points) || candidate.points.length < 3 || candidate.points.length > 50) {
    throw new Error('Model returned an invalid point array')
  }

  const rawPoints = candidate.points.map((point) => {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      throw new Error('Model returned invalid coordinates')
    }
    return {
      x: Math.max(-30, Math.min(30, point.x)),
      y: Math.max(-30, Math.min(30, point.y))
    }
  })

  const distinctPoints = cleanClosedOutline(rawPoints, 0.01)
  if (distinctPoints.length < 3) {
    throw new Error('Model returned fewer than three distinct points')
  }

  if (hasSelfIntersections(distinctPoints)) {
    throw new Error('Model returned a self-intersecting outline')
  }

  if (Math.abs(signedArea(distinctPoints)) < 0.01) {
    throw new Error('Model returned an outline with no usable area')
  }

  const normalizedPoints = normalizeOutline(distinctPoints, 75)
  if (hasOffsetSelfIntersections(normalizedPoints, PROFESSIONAL_PROFILE_OFFSETS_MM)) {
    throw new Error('Model returned an outline without enough wall clearance')
  }
  const points = closeOutline(normalizedPoints)

  if (typeof candidate.reasoning !== 'string' || !candidate.reasoning.trim()) {
    throw new Error('Model returned invalid reasoning')
  }

  if (!categories.includes(candidate.category as Category)) {
    throw new Error('Model returned an invalid category')
  }

  return {
    points,
    reasoning: candidate.reasoning.trim().slice(0, 240),
    category: candidate.category as Category
  }
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get('content-length') || 0)
  if (contentLength > MAX_BODY_BYTES) {
    return Response.json({ error: 'Request is too large' }, { status: 413 })
  }

  const clientIp = getClientIp(request)
  const rateLimit = checkRateLimit(clientIp)
  if (!rateLimit.allowed) {
    return Response.json(
      { error: 'Too many shape requests. Please try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfter) } }
    )
  }

  let body: unknown
  try {
    const rawBody = await request.text()
    if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
      return Response.json({ error: 'Request is too large' }, { status: 413 })
    }
    body = JSON.parse(rawBody)
  } catch {
    return Response.json({ error: 'Request body must be valid JSON' }, { status: 400 })
  }

  const description = typeof (body as { description?: unknown })?.description === 'string'
    ? (body as { description: string }).description.trim()
    : ''

  if (description.length < 3 || description.length > MAX_DESCRIPTION_LENGTH) {
    return Response.json(
      { error: `Description must be between 3 and ${MAX_DESCRIPTION_LENGTH} characters` },
      { status: 400 }
    )
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    console.error('OPENAI_API_KEY is not configured')
    return Response.json({ error: 'Shape generation is temporarily unavailable' }, { status: 503 })
  }

  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini'
  const subjectHint = getSubjectHint(description)

  try {
    const openai = new OpenAI({ apiKey })
    let lastError: unknown

    for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt += 1) {
      try {
        const response = await openai.responses.create({
          model,
          store: false,
          safety_identifier: createHash('sha256').update(clientIp).digest('hex').slice(0, 64),
          instructions: [
            'You design simple cookie-cutter silhouettes.',
            'Return one recognizable closed clockwise outline centered near the origin.',
            'Avoid holes, internal details, self-intersections, narrow bridges, and tiny features.',
            'Trace only the single exterior silhouette; never draw interior body or wing details.',
            'The outline alone must unmistakably communicate the requested subject.',
            'Exaggerate two to four iconic silhouette features at a large printable scale.',
            'Never substitute a generic circle, box, polygon, or featureless blob.',
            'Make concave notches shallow and broad, with no pinched waist or sharp inward spike.',
            'Keep opposing non-adjacent boundary segments at least 14 coordinate units apart.',
            'Use 12 to 32 distinct boundary vertices and use most of the -25 to 25 coordinate range.',
            'Do not pad the result with duplicate vertices.',
            'The first and last points must be identical and no other consecutive points may repeat.'
          ].join(' '),
          input: [
            `Create a recognizable cookie-cutter outline for: ${description}`,
            subjectHint,
            attempt > 0
              ? 'The previous outline was rejected as physically unprintable. Make this version simpler, broader, and less concave.'
              : ''
          ].filter(Boolean).join(' '),
          max_output_tokens: 1_200,
          text: {
            format: {
              type: 'json_schema',
              name: 'cookie_cutter_outline',
              strict: true,
              schema: shapeSchema
            }
          }
        })

        if (!response.output_text) {
          throw new Error('OpenAI returned no structured output')
        }

        const shape = validateShape(JSON.parse(response.output_text))
        return Response.json(
          { ...shape, model },
          { headers: { 'Cache-Control': 'no-store' } }
        )
      } catch (error) {
        lastError = error
      }
    }

    throw lastError
  } catch (error) {
    console.error('OpenAI shape generation failed', error)
    return Response.json({ error: 'AI generation failed. Please try again.' }, { status: 502 })
  }
}

