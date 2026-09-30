import OpenAI from 'openai'
import { createHash, randomUUID } from 'crypto'
import {
  AI_DECORATION_RESULT_SCHEMA,
  validateAIDecorationModelResult,
  type AIDecorationGeneration
} from '@/lib/ai/decorationPlan'
import {
  evaluateDecorationSemantics,
  getDecorationSubjectGuidance
} from '@/lib/ai/decorationSemantics'
import {
  closeOutline,
  cleanClosedOutline,
  hasOffsetSelfIntersections,
  hasSelfIntersections,
  normalizeOutline,
  signedArea
} from '@/lib/geometry/outline'
import { tracePngSilhouette } from '@/lib/geometry/pngSilhouette'

export const runtime = 'nodejs'
export const maxDuration = 120

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
const MAX_GENERATION_ATTEMPTS = 2
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
  if (!Array.isArray(candidate.points) || candidate.points.length < 3 || candidate.points.length > 400) {
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

function normalizedOutlineForDecoration(points: readonly Point[]): Point[] {
  const openPoints = points.length > 1
    && Math.abs(points[0].x - points[points.length - 1].x) < 0.001
    && Math.abs(points[0].y - points[points.length - 1].y) < 0.001
    ? points.slice(0, -1)
    : [...points]
  const xs = openPoints.map((point) => point.x)
  const ys = openPoints.map((point) => point.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const width = Math.max(0.001, maxX - minX)
  const height = Math.max(0.001, maxY - minY)
  const sampleEvery = Math.max(1, Math.ceil(openPoints.length / 48))
  return openPoints
    .filter((_, index) => index % sampleEvery === 0)
    .map((point) => ({
      x: Number(((point.x - minX) / width).toFixed(4)),
      y: Number(((point.y - minY) / height).toFixed(4))
    }))
}

async function generateDecorationCandidates(
  openai: OpenAI,
  model: string,
  description: string,
  shape: ShapeResponse,
  safetyIdentifier: string
): Promise<AIDecorationGeneration> {
  const generationId = randomUUID()
  const createdAt = new Date().toISOString()
  const outline = normalizedOutlineForDecoration(shape.points)
  const subjectGuidance = getDecorationSubjectGuidance(description)
  let repairFeedback = ''
  let lastError: unknown
  let inputTokens = 0
  let outputTokens = 0
  let totalTokens = 0

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await openai.responses.create({
        model,
        store: false,
        safety_identifier: safetyIdentifier,
        instructions: [
          'You are a senior custom sugar-cookie decorator and production design planner.',
          'Create exactly three distinct royal-icing decoration candidates registered to the supplied normalized exterior outline.',
          'The normalized design canvas uses x=0..1 left-to-right and y=0..1 bottom-to-top.',
          'The icing alone must identify the customer request. Do not rely on the cutter edge to provide the subject meaning.',
          'Treat the cutter outline as authoritative. Keep every detail comfortably inside it and preserve recognizable subject anatomy.',
          'For every visible region, stroke, or lettering item, create a semanticFeatures binding that names what it depicts.',
          'Set candidate.subject to the concise literal subject noun from the customer request; do not use a color, style, event, or generic cookie label as the subject.',
          'Each candidate needs at least two signature landmarks, at least three distinct bound geometries, and one restrained playful accent.',
          'Never substitute a generic inset border, medallion, large unrelated circle, badge, or abstract chevron for subject landmarks.',
          'Use 4 to 6 coordinated colors. The base color slot is required. Never invent brands, product SKUs, prices, recipes, or safety claims.',
          'Use flood regions for large areas, wet-on-wet for small flat marks, and piped-detail for raised line-work.',
          'Prefer practical custom-cookie techniques: sectioned floods, wet-on-wet accents, rounded monoline details, simplified florals, and registered transfers.',
          'Use standard deposited line widths near 1.5 to 2 mm. Reserve 0.7 to 1 mm lines for a genuinely detailed candidate.',
          'Avoid isolated flooded islands narrower than roughly 4 mm, cramped negative spaces, acute cusps, excessive micro-dots, and overlapping same-layer shapes.',
          'Lettering must use short user-requested copy only. Prefer monoline sans, monoline script, rounded block, or simplified faux calligraphy.',
          'Keep piped lettering at least 7 mm high when space permits, with open counters and no hairline strokes.',
          'Use transfers or edible marker lettering when the requested copy is too dense for direct piping.',
          'Every region must include at least three valid points. For an ellipse, supply three harmless in-bounds placeholder points; its center and radii remain authoritative.',
          'Candidate one should be commercially clean and classic, candidate two cute and playful, and candidate three a polished storybook alternative.',
          'Return geometry and design intent only. DoughForge will build steps, color recipes, scoring, and commerce data deterministically.'
        ].join(' '),
        input: [
          `Customer request: ${description}`,
          `Validated cutter category: ${shape.category}`,
          `Subject-specific art direction: ${subjectGuidance}`,
          `Normalized exterior outline (${outline.length} points): ${JSON.stringify(outline)}`,
          'All candidate point coordinates and centers must lie between 0.04 and 0.96.',
          repairFeedback
        ].filter(Boolean).join('\n'),
        max_output_tokens: 10_000,
        text: {
          format: {
            type: 'json_schema',
            name: 'cookie_decoration_candidates',
            strict: true,
            schema: AI_DECORATION_RESULT_SCHEMA
          }
        }
      })
      if (response.usage) {
        inputTokens += response.usage.input_tokens
        outputTokens += response.usage.output_tokens
        totalTokens += response.usage.total_tokens
      }
      if (!response.output_text) throw new Error('OpenAI returned no structured decoration output')
      const result = validateAIDecorationModelResult(JSON.parse(response.output_text))
      const assessments = result.candidates.map((candidate) => evaluateDecorationSemantics(description, candidate))
      if (assessments.every((assessment) => assessment.disposition === 'reject')) {
        const issueCodes = [...new Set(assessments.flatMap((assessment) => (
          assessment.findings.filter((finding) => finding.severity === 'error').map((finding) => finding.code)
        )))].slice(0, 8)
        throw new Error(`All decoration candidates failed subject recognition: ${issueCodes.join(', ')}`)
      }
      return {
        generationId,
        model,
        createdAt,
        candidates: result.candidates,
        usage: totalTokens ? { inputTokens, outputTokens, totalTokens } : undefined
      }
    } catch (error) {
      lastError = error
      const message = error instanceof Error ? error.message : 'unknown structured-output error'
      repairFeedback = [
        'The previous decoration response was rejected.',
        `Repair every candidate and return a completely new valid response. Validation feedback: ${message.slice(0, 600)}`,
      ].join(' ')
    }
  }

  throw lastError ?? new Error('OpenAI returned no usable decoration candidates')
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

  const model = process.env.OPENAI_MODEL || 'gpt-4.1-mini'
  const imageModel = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2'
  const decorationModel = process.env.OPENAI_DECORATION_MODEL || model
  const subjectHint = getSubjectHint(description)

  try {
    const openai = new OpenAI({ apiKey })
    let lastError: unknown
    let shape: ShapeResponse | undefined
    let generator = 'structured-vector'
    let outlineModel = model
    const safetyIdentifier = createHash('sha256').update(clientIp).digest('hex').slice(0, 64)

    try {
      const result = await openai.images.generate({
        model: imageModel,
        quality: 'low',
        size: '1024x1024',
        prompt: [
          `Create a manufacturing-ready cookie-cutter silhouette of: ${description}.`,
          'One solid, completely filled black shape centered on a pure white background.',
          'Show the subject from its most recognizable angle and exaggerate its iconic exterior features.',
          'Use one connected exterior silhouette only: no holes, internal lines, shading, texture, border, lettering, floor, or shadow.',
          'Keep limbs, stems, antennae, and other narrow connections thick and keep inward notches broad and shallow.',
          'Leave generous white margin on every side. Crisp flat vector-icon edges.'
        ].join(' ')
      })
      const encodedImage = result.data?.[0]?.b64_json
      if (!encodedImage) throw new Error('OpenAI returned no silhouette image')

      const imageBuffer = Buffer.from(encodedImage, 'base64')
      let traceError: unknown
      for (const closingRadius of [0, 4, 8, 12, 18, 24, 30]) {
        try {
          // Keep traced coordinates inside the structured-vector validator's
          // input range; validateShape performs the single final 75 mm scale.
          const tracedPoints = tracePngSilhouette(imageBuffer, 55, closingRadius)
          shape = validateShape({
            points: tracedPoints,
            reasoning: 'Generated as a high-resolution silhouette, then traced and print-validated.',
            category: 'abstract'
          })
          console.info('Image silhouette accepted', {
            model: imageModel,
            closingRadius,
            pointCount: shape.points.length
          })
          break
        } catch (error) {
          traceError = error
        }
      }
      if (!shape) throw traceError ?? new Error('Generated silhouette could not be made printable')
      generator = 'image-trace'
      outlineModel = imageModel
    } catch (error) {
      lastError = error
      console.warn('Image silhouette generation was rejected; trying vector fallback', error)
    }

    for (let attempt = 0; !shape && attempt < MAX_GENERATION_ATTEMPTS; attempt += 1) {
      try {
        const response = await openai.responses.create({
          model,
          store: false,
          safety_identifier: safetyIdentifier,
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

        shape = validateShape(JSON.parse(response.output_text))
      } catch (error) {
        lastError = error
      }
    }

    if (!shape) throw lastError ?? new Error('OpenAI returned no printable outline')

    let decorationGeneration: AIDecorationGeneration | undefined
    let decorationWarning: string | undefined
    try {
      decorationGeneration = await generateDecorationCandidates(
        openai,
        decorationModel,
        description,
        shape,
        safetyIdentifier
      )
    } catch (error) {
      decorationWarning = 'The cutter was generated, but high-fidelity decoration planning fell back to the local planner.'
      console.warn('Structured decoration generation failed; returning printable outline fallback', error)
    }

    return Response.json(
      {
        ...shape,
        model: outlineModel,
        generator,
        decorationGeneration,
        decorationWarning
      },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (error) {
    console.error('OpenAI shape generation failed', error)
    return Response.json({ error: 'AI generation failed. Please try again.' }, { status: 502 })
  }
}

