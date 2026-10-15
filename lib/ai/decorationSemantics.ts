import type {
  AIDecorationCandidateDraft,
  AINormalizedPoint,
  AISemanticFeatureBinding,
} from './decorationPlan'
import type {
  AIDecorationRecognitionPlan,
  AIRecognitionLandmark,
  AIRecognitionRelationship,
} from './decorationRecognition'

export interface AIDecorationSemanticFinding {
  code: string
  severity: 'warning' | 'error'
  message: string
  featureIds: string[]
}

export interface AIDecorationSemanticAssessment {
  score: number
  disposition: 'eligible' | 'repair' | 'reject'
  findings: AIDecorationSemanticFinding[]
  coveredFeatureIds: string[]
  requiredFeatureNames: string[]
}

interface PrimitiveGeometry {
  id: string
  kind: 'ellipse' | 'polygon' | 'stroke' | 'lettering'
  points: AINormalizedPoint[]
  landmarkId?: string
  text?: string
}

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'cookie', 'cookies', 'custom', 'decorated', 'design',
  'for', 'icing', 'of', 'royal', 'shape', 'sugar', 'theme', 'themed', 'with',
])

const GENERIC_FEATURE_WORDS = new Set([
  'accent', 'border', 'circle', 'decoration', 'detail', 'line', 'medallion',
  'outline', 'shape', 'spot', 'stripe', 'trim',
])

const SUBJECT_NOISE_WORDS = new Set([
  'adorable', 'baby', 'birthday', 'black', 'blue', 'brown', 'cheerful', 'classic',
  'cream', 'cute', 'detailed', 'easter', 'fun', 'gold', 'green', 'halloween',
  'holiday', 'orange', 'party', 'pastel', 'pink', 'playful', 'purple', 'red',
  'rustic', 'simple', 'silver', 'storybook', 'valentine', 'white', 'wedding',
  'yellow',
])

const SUBJECT_CONCEPTS: ReadonlyArray<readonly string[]> = [
  ['barn'],
  ['butterfly'],
  ['bee', 'bumblebee'],
  ['ladybug', 'ladybird'],
  ['heart'],
  ['star'],
  ['flower', 'floral', 'rose', 'sunflower', 'daisy'],
  ['rainbow'],
  ['snowflake'],
  ['moon'],
  ['sun'],
  ['cloud'],
  ['tree'],
  ['pumpkin'],
  ['ghost'],
  ['bat'],
  ['skull'],
  ['house', 'home'],
  ['castle'],
  ['school'],
  ['shop', 'store'],
  ['cabin'],
  ['cat', 'kitten', 'kitty'],
  ['dog', 'puppy'],
  ['bear'],
  ['rabbit', 'bunny'],
  ['cow'],
  ['pig'],
  ['horse'],
  ['chicken', 'hen', 'rooster', 'chick'],
  ['duck'],
  ['unicorn'],
  ['dinosaur'],
  ['mermaid'],
  ['princess'],
  ['monster'],
  ['car', 'automobile'],
  ['truck', 'pickup'],
  ['tractor'],
  ['train', 'locomotive'],
  ['bus'],
  ['airplane', 'plane'],
  ['boat', 'ship'],
  ['cake'],
  ['cupcake'],
  ['donut', 'doughnut'],
  ['pizza'],
  ['apple'],
  ['strawberry'],
]

function words(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((word) => word && !STOP_WORDS.has(word))
}

function featureText(feature: AISemanticFeatureBinding): string {
  return `${feature.name} ${feature.description}`.toLowerCase()
}

function subjectWords(value: string): string[] {
  return words(value).filter((word) => !SUBJECT_NOISE_WORDS.has(word) && !/^\d+$/.test(word))
}

function normalizedPhrase(value: string): string {
  return ` ${value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `
}

function containsWholePhrase(value: string, phrase: string): boolean {
  return normalizedPhrase(value).includes(` ${phrase} `)
}

function requestSubjectCore(description: string): string {
  return description.split(/\b(?:with|for|named|saying|text|lettered)\b/i, 1)[0]
}

function requestedSubjectConcepts(description: string): ReadonlyArray<readonly string[]> {
  const core = requestSubjectCore(description)
  return SUBJECT_CONCEPTS.filter((aliases) => aliases.some((alias) => containsWholePhrase(core, alias)))
}

function candidateNamesRequestedSubject(description: string, candidateSubject: string): boolean {
  const concepts = requestedSubjectConcepts(description)
  if (concepts.length) {
    return concepts.some((aliases) => aliases.some((alias) => containsWholePhrase(candidateSubject, alias)))
  }
  const requested = new Set(subjectWords(requestSubjectCore(description)))
  const candidate = subjectWords(candidateSubject)
  return !requested.size || (candidate.length > 0 && candidate.every((word) => requested.has(word)))
}

function polygonArea(points: readonly AINormalizedPoint[]): number {
  if (points.length < 3) return 0
  let area = 0
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]
    const next = points[(index + 1) % points.length]
    area += current.x * next.y - next.x * current.y
  }
  return Math.abs(area) / 2
}

function geometryMap(candidate: AIDecorationCandidateDraft): Map<string, PrimitiveGeometry> {
  const result = new Map<string, PrimitiveGeometry>()
  candidate.regions.forEach((region) => {
    const points = region.kind === 'ellipse'
      ? [
          { x: region.centerX - region.radiusX, y: region.centerY },
          { x: region.centerX, y: region.centerY + region.radiusY },
          { x: region.centerX + region.radiusX, y: region.centerY },
          { x: region.centerX, y: region.centerY - region.radiusY },
        ]
      : region.points
    result.set(region.id, { id: region.id, kind: region.kind, points, landmarkId: region.landmarkId })
  })
  candidate.strokes.forEach((stroke) => {
    result.set(stroke.id, { id: stroke.id, kind: 'stroke', points: stroke.points, landmarkId: stroke.landmarkId })
  })
  candidate.lettering.forEach((lettering) => {
    const halfWidth = lettering.maxWidthRatio / 2
    const halfHeight = Math.max(0.025, lettering.fontSizeMm / 150)
    result.set(lettering.id, {
      id: lettering.id,
      kind: 'lettering',
      landmarkId: lettering.landmarkId,
      text: lettering.text,
      points: [
        { x: lettering.position.x - halfWidth, y: lettering.position.y - halfHeight },
        { x: lettering.position.x + halfWidth, y: lettering.position.y + halfHeight },
      ],
    })
  })
  return result
}

function bounds(primitives: readonly PrimitiveGeometry[]) {
  const points = primitives.flatMap((primitive) => primitive.points)
  if (!points.length) return null
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  return {
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
  }
}

function matchingFeature(
  features: readonly AISemanticFeatureBinding[],
  tokens: readonly string[],
  excludedNameTokens: readonly string[] = []
): AISemanticFeatureBinding | undefined {
  let best: { feature: AISemanticFeatureBinding; score: number } | undefined
  features.forEach((feature) => {
    const name = feature.name.toLowerCase()
    if (excludedNameTokens.some((token) => name.includes(token))) return
    const text = featureText(feature)
    const score = tokens.reduce((total, token) => (
      total + (name.includes(token) ? 3 : text.includes(token) ? 1 : 0)
    ), 0)
    if (score <= 0 || (best && best.score >= score)) return
    best = { feature, score }
  })
  return best?.feature
}

function primitivesForFeature(
  feature: AISemanticFeatureBinding | undefined,
  geometry: Map<string, PrimitiveGeometry>
): PrimitiveGeometry[] {
  return feature?.geometryIds
    .map((id) => geometry.get(id))
    .filter((item): item is PrimitiveGeometry => Boolean(item)) ?? []
}

function hasPeakedRoof(primitives: readonly PrimitiveGeometry[]): boolean {
  return primitives.some((primitive) => {
    if (primitive.points.length < 3) return false
    const primitiveBounds = bounds([primitive])
    if (!primitiveBounds || primitiveBounds.width < 0.35) return false
    const peak = primitive.points.reduce((highest, point) => point.y > highest.y ? point : highest)
    const left = primitive.points.reduce((lowest, point) => point.x < lowest.x ? point : lowest)
    const right = primitive.points.reduce((highest, point) => point.x > highest.x ? point : highest)
    const centeredPeak = Math.abs(peak.x - primitiveBounds.centerX) <= primitiveBounds.width * 0.3
    return centeredPeak && peak.y - Math.max(left.y, right.y) >= 0.06
  })
}

interface Segment {
  start: AINormalizedPoint
  end: AINormalizedPoint
}

function primitiveSegments(primitive: PrimitiveGeometry): Segment[] {
  const segments: Segment[] = []
  for (let index = 1; index < primitive.points.length; index += 1) {
    segments.push({ start: primitive.points[index - 1], end: primitive.points[index] })
  }
  if (primitive.kind === 'polygon' && primitive.points.length > 2) {
    segments.push({ start: primitive.points[primitive.points.length - 1], end: primitive.points[0] })
  }
  return segments
}

function interiorIntersection(first: Segment, second: Segment): AINormalizedPoint | null {
  const firstX = first.end.x - first.start.x
  const firstY = first.end.y - first.start.y
  const secondX = second.end.x - second.start.x
  const secondY = second.end.y - second.start.y
  const denominator = firstX * secondY - firstY * secondX
  if (Math.abs(denominator) < 1e-8) return null
  const offsetX = second.start.x - first.start.x
  const offsetY = second.start.y - first.start.y
  const firstRatio = (offsetX * secondY - offsetY * secondX) / denominator
  const secondRatio = (offsetX * firstY - offsetY * firstX) / denominator
  if (firstRatio <= 0.08 || firstRatio >= 0.92 || secondRatio <= 0.08 || secondRatio >= 0.92) return null
  return {
    x: first.start.x + firstRatio * firstX,
    y: first.start.y + firstRatio * firstY,
  }
}

function hasCrossbuck(
  primitives: readonly PrimitiveGeometry[],
  doorBounds: ReturnType<typeof bounds>
): boolean {
  if (!doorBounds) return false
  const segments = primitives
    .flatMap(primitiveSegments)
    .filter((segment) => {
      const deltaX = segment.end.x - segment.start.x
      const deltaY = segment.end.y - segment.start.y
      return Math.abs(deltaX) >= doorBounds.width * 0.45
        && Math.abs(deltaY) >= doorBounds.height * 0.45
    })
  for (let firstIndex = 0; firstIndex < segments.length; firstIndex += 1) {
    const first = segments[firstIndex]
    const firstSlopeSign = Math.sign((first.end.x - first.start.x) * (first.end.y - first.start.y))
    for (let secondIndex = firstIndex + 1; secondIndex < segments.length; secondIndex += 1) {
      const second = segments[secondIndex]
      const secondSlopeSign = Math.sign((second.end.x - second.start.x) * (second.end.y - second.start.y))
      if (!firstSlopeSign || firstSlopeSign === secondSlopeSign) continue
      const intersection = interiorIntersection(first, second)
      if (!intersection) continue
      if (
        intersection.x >= doorBounds.minX
        && intersection.x <= doorBounds.maxX
        && intersection.y >= doorBounds.minY
        && intersection.y <= doorBounds.maxY
      ) return true
    }
  }
  return false
}

function barnFindings(
  candidate: AIDecorationCandidateDraft,
  geometry: Map<string, PrimitiveGeometry>
): { findings: AIDecorationSemanticFinding[]; requiredFeatureNames: string[] } {
  const findings: AIDecorationSemanticFinding[] = []
  const required = [
    { name: 'roof or eave line', tokens: ['roof', 'eave'] },
    { name: 'large centered barn door', tokens: ['door', 'gate'] },
    { name: 'crossbuck or X door braces', tokens: ['crossbuck', 'brace', 'braces'] },
  ]
  const matches = new Map<string, AISemanticFeatureBinding>()
  required.forEach((requirement) => {
    const feature = matchingFeature(
      candidate.semanticFeatures,
      requirement.tokens,
      requirement.name === 'large centered barn door' ? ['brace', 'crossbuck'] : []
    )
    if (!feature) {
      findings.push({
        code: 'missing_required_feature',
        severity: 'error',
        message: `Barn decoration is missing ${requirement.name}.`,
        featureIds: [],
      })
    } else {
      matches.set(requirement.name, feature)
    }
  })

  const roofFeature = matches.get('roof or eave line')
  const roofPrimitives = primitivesForFeature(roofFeature, geometry)
  const roofBounds = bounds(roofPrimitives)
  if (roofFeature && (
    !roofBounds
    || roofBounds.centerY < 0.58
    || roofBounds.width < 0.35
    || !hasPeakedRoof(roofPrimitives)
  )) {
    findings.push({
      code: 'roof_geometry_mismatch',
      severity: 'error',
      message: 'The barn roof must be a broad peaked feature in the upper portion of the cookie.',
      featureIds: [roofFeature.id],
    })
  }

  const doorFeature = matches.get('large centered barn door')
  const doorPrimitives = primitivesForFeature(doorFeature, geometry)
  const doorBounds = bounds(doorPrimitives)
  const hasDoorPlane = doorPrimitives.some((primitive) => primitive.kind === 'polygon')
  if (doorFeature && (
    !doorBounds
    || !hasDoorPlane
    || doorBounds.centerX < 0.34
    || doorBounds.centerX > 0.66
    || doorBounds.centerY > 0.58
    || doorBounds.width < 0.24
    || doorBounds.height < 0.2
  )) {
    findings.push({
      code: 'door_geometry_mismatch',
      severity: 'error',
      message: 'The barn door must be a large polygonal feature centered in the lower half.',
      featureIds: [doorFeature.id],
    })
  }

  const braceFeature = matches.get('crossbuck or X door braces')
  const bracePrimitives = primitivesForFeature(braceFeature, geometry)
  if (braceFeature && !hasCrossbuck(bracePrimitives, doorBounds)) {
    findings.push({
      code: 'crossbuck_geometry_mismatch',
      severity: 'error',
      message: 'Barn door braces must form a real intersecting X inside the door, not a chevron.',
      featureIds: [braceFeature.id],
    })
  }

  const loftFeature = matchingFeature(candidate.semanticFeatures, ['loft', 'window', 'hay opening'])
  if (!loftFeature) {
    findings.push({
      code: 'missing_story_accent',
      severity: 'warning',
      message: 'Add a small upper loft opening, window, hay detail, flowers, or a farm-animal accent.',
      featureIds: [],
    })
  } else {
    const loftBounds = bounds(primitivesForFeature(loftFeature, geometry))
    if (!loftBounds || loftBounds.centerY < 0.57) {
      findings.push({
        code: 'loft_wrong_zone',
        severity: 'warning',
        message: 'The loft or upper story accent should sit beneath the roof peak.',
        featureIds: [loftFeature.id],
      })
    }
  }

  return { findings, requiredFeatureNames: required.map((item) => item.name) }
}

interface SubjectRequirement {
  name: string
  tokens: string[]
  severity: 'warning' | 'error'
}

function subjectBundleFindings(
  label: string,
  candidate: AIDecorationCandidateDraft,
  geometry: Map<string, PrimitiveGeometry>,
  requirements: readonly SubjectRequirement[]
): { findings: AIDecorationSemanticFinding[]; requiredFeatureNames: string[] } {
  const findings: AIDecorationSemanticFinding[] = []
  const matched = new Map<string, AISemanticFeatureBinding>()
  requirements.forEach((requirement) => {
    const feature = matchingFeature(candidate.semanticFeatures, requirement.tokens)
    if (feature) {
      matched.set(requirement.name, feature)
      return
    }
    findings.push({
      code: 'missing_subject_landmark',
      severity: requirement.severity,
      message: `${label} decoration is missing ${requirement.name}.`,
      featureIds: [],
    })
  })

  const upperFeature = matched.get('an upper defining feature')
  if (upperFeature) {
    const upperBounds = bounds(primitivesForFeature(upperFeature, geometry))
    if (!upperBounds || upperBounds.centerY < 0.48) {
      findings.push({
        code: 'upper_landmark_wrong_zone',
        severity: 'error',
        message: `${label}'s upper defining feature must sit in the upper portion of the cookie.`,
        featureIds: [upperFeature.id],
      })
    }
  }

  const lowerFeature = matched.get('a lower defining feature')
  if (lowerFeature) {
    const lowerPrimitives = primitivesForFeature(lowerFeature, geometry)
    const lowerBounds = bounds(lowerPrimitives)
    if (!lowerBounds || lowerBounds.centerY > 0.58) {
      findings.push({
        code: 'lower_landmark_wrong_zone',
        severity: 'error',
        message: `${label}'s lower defining feature must sit in the lower portion of the cookie.`,
        featureIds: [lowerFeature.id],
      })
    }
    if (label === 'Vehicle' && lowerPrimitives.length < 2) {
      findings.push({
        code: 'insufficient_wheel_geometry',
        severity: 'warning',
        message: 'Show at least two distinct wheels or tires for a stable vehicle read.',
        featureIds: [lowerFeature.id],
      })
    }
  }

  return { findings, requiredFeatureNames: requirements.map((requirement) => requirement.name) }
}

function categorizedSubjectFindings(
  description: string,
  candidate: AIDecorationCandidateDraft,
  geometry: Map<string, PrimitiveGeometry>
): { findings: AIDecorationSemanticFinding[]; requiredFeatureNames: string[] } {
  const normalized = description.toLowerCase()
  if (/\b(butterfly|bee|bumblebee|ladybug|ladybird|insect)\b/.test(normalized)) {
    const result = subjectBundleFindings('Insect', candidate, geometry, [
      { name: 'a centered body', tokens: ['body', 'thorax', 'abdomen'], severity: 'error' },
      { name: 'paired wings', tokens: ['wing', 'wings'], severity: 'error' },
      { name: 'an insect-specific detail', tokens: ['antenna', 'antennae', 'spot', 'stripe'], severity: 'warning' },
    ])
    const bodyFeature = matchingFeature(candidate.semanticFeatures, ['body', 'thorax', 'abdomen'])
    const bodyBounds = bounds(primitivesForFeature(bodyFeature, geometry))
    if (bodyFeature && (
      !bodyBounds
      || bodyBounds.centerX < 0.35
      || bodyBounds.centerX > 0.65
      || bodyBounds.height < 0.18
    )) {
      result.findings.push({
        code: 'insect_body_geometry_mismatch',
        severity: 'error',
        message: 'The insect body must be a clearly centered vertical anchor.',
        featureIds: [bodyFeature.id],
      })
    }
    const wingFeature = matchingFeature(candidate.semanticFeatures, ['wing', 'wings'])
    const wingBounds = bounds(primitivesForFeature(wingFeature, geometry))
    if (wingFeature && (
      !wingBounds
      || wingBounds.centerX < 0.35
      || wingBounds.centerX > 0.65
      || wingBounds.width < 0.28
    )) {
      result.findings.push({
        code: 'insect_wing_geometry_mismatch',
        severity: 'error',
        message: 'Paired wings must visibly span both sides of the centered insect body.',
        featureIds: [wingFeature.id],
      })
    }
    return result
  }
  if (/\b(house|building|castle|school|shop|store|cabin)\b/.test(normalized)) {
    return subjectBundleFindings('Architectural', candidate, geometry, [
      { name: 'an upper defining feature', tokens: ['roof', 'eave', 'tower', 'turret'], severity: 'error' },
      { name: 'a lower defining feature', tokens: ['door', 'entry', 'gate'], severity: 'error' },
      { name: 'a facade detail', tokens: ['window', 'facade', 'brick', 'panel'], severity: 'warning' },
    ])
  }
  if (/\b(cat|dog|bear|bunny|rabbit|cow|pig|horse|chicken|duck|animal|character|person|princess|mermaid|unicorn|monster|dinosaur)\b/.test(normalized)) {
    return subjectBundleFindings('Character or animal', candidate, geometry, [
      { name: 'an upper defining feature', tokens: ['eye', 'eyes', 'ear', 'ears', 'horn', 'crown'], severity: 'error' },
      { name: 'a centered face feature', tokens: ['nose', 'beak', 'muzzle', 'mouth', 'snout'], severity: 'error' },
      { name: 'a species or character detail', tokens: ['whisker', 'mane', 'spot', 'stripe', 'wing', 'tail', 'accessory'], severity: 'warning' },
    ])
  }
  if (/\b(car|truck|tractor|train|bus|vehicle)\b/.test(normalized)) {
    return subjectBundleFindings('Vehicle', candidate, geometry, [
      { name: 'a main body or cab', tokens: ['body', 'cab', 'chassis', 'engine'], severity: 'error' },
      { name: 'a lower defining feature', tokens: ['wheel', 'wheels', 'tire', 'tires'], severity: 'error' },
      { name: 'a vehicle-specific detail', tokens: ['window', 'grille', 'smokestack', 'loader', 'headlight'], severity: 'warning' },
    ])
  }
  if (/\b(cake|cupcake|donut|pizza|fruit|food)\b/.test(normalized)) {
    return subjectBundleFindings('Food', candidate, geometry, [
      { name: 'a recognizable main form', tokens: ['base', 'body', 'crust', 'layer', 'wrapper'], severity: 'error' },
      { name: 'an upper defining feature', tokens: ['topping', 'frosting', 'fruit', 'cheese', 'candle', 'sprinkle'], severity: 'error' },
      { name: 'an appetizing detail', tokens: ['drizzle', 'shine', 'crumb', 'slice', 'seed'], severity: 'warning' },
    ])
  }
  return { findings: [], requiredFeatureNames: [] }
}

function primitivesForLandmark(
  geometry: Map<string, PrimitiveGeometry>,
  landmarkId: string
): PrimitiveGeometry[] {
  return [...geometry.values()].filter((primitive) => primitive.landmarkId === landmarkId)
}

function landmarkSeverity(landmark: AIRecognitionLandmark): 'warning' | 'error' {
  return landmark.required || landmark.role === 'signature' || Boolean(landmark.requiredText)
    ? 'error'
    : 'warning'
}

function zoneContains(
  zone: AIRecognitionLandmark['zone'],
  primitiveBounds: NonNullable<ReturnType<typeof bounds>>
): boolean {
  const upper = primitiveBounds.centerY >= 0.55
  const lower = primitiveBounds.centerY <= 0.45
  const left = primitiveBounds.centerX <= 0.45
  const right = primitiveBounds.centerX >= 0.55
  switch (zone) {
    case 'any': return true
    case 'full': return primitiveBounds.width >= 0.45 || primitiveBounds.height >= 0.45
    case 'center': return (
      primitiveBounds.centerX >= 0.3
      && primitiveBounds.centerX <= 0.7
      && primitiveBounds.centerY >= 0.3
      && primitiveBounds.centerY <= 0.7
    )
    case 'upper': return upper
    case 'lower': return lower
    case 'left': return left
    case 'right': return right
    case 'upper-left': return upper && left
    case 'upper-right': return upper && right
    case 'lower-left': return lower && left
    case 'lower-right': return lower && right
  }
}

function distributionMatches(
  landmark: AIRecognitionLandmark,
  primitives: readonly PrimitiveGeometry[]
): boolean {
  if (landmark.distribution === 'free' || landmark.distribution === 'single') return true
  const primitiveBounds = primitives
    .map((primitive) => bounds([primitive]))
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
  if (landmark.distribution === 'horizontal-pair') {
    return primitiveBounds.length >= 2
      && primitiveBounds.some((item) => item.centerX <= 0.45)
      && primitiveBounds.some((item) => item.centerX >= 0.55)
      && Math.max(...primitiveBounds.map((item) => item.centerY))
        - Math.min(...primitiveBounds.map((item) => item.centerY)) <= 0.24
  }
  if (landmark.distribution === 'vertical-pair') {
    return primitiveBounds.length >= 2
      && primitiveBounds.some((item) => item.centerY <= 0.45)
      && primitiveBounds.some((item) => item.centerY >= 0.55)
      && Math.max(...primitiveBounds.map((item) => item.centerX))
        - Math.min(...primitiveBounds.map((item) => item.centerX)) <= 0.24
  }
  if (landmark.distribution === 'horizontal-row') {
    const xSpan = Math.max(...primitiveBounds.map((item) => item.centerX))
      - Math.min(...primitiveBounds.map((item) => item.centerX))
    const ySpan = Math.max(...primitiveBounds.map((item) => item.centerY))
      - Math.min(...primitiveBounds.map((item) => item.centerY))
    return primitiveBounds.length >= 2 && xSpan >= 0.18 && ySpan <= 0.24
  }
  if (landmark.distribution === 'vertical-stack') {
    const xSpan = Math.max(...primitiveBounds.map((item) => item.centerX))
      - Math.min(...primitiveBounds.map((item) => item.centerX))
    const ySpan = Math.max(...primitiveBounds.map((item) => item.centerY))
      - Math.min(...primitiveBounds.map((item) => item.centerY))
    return primitiveBounds.length >= 2 && ySpan >= 0.18 && xSpan <= 0.24
  }
  if (landmark.distribution === 'cluster') {
    const xSpan = Math.max(...primitiveBounds.map((item) => item.centerX))
      - Math.min(...primitiveBounds.map((item) => item.centerX))
    const ySpan = Math.max(...primitiveBounds.map((item) => item.centerY))
      - Math.min(...primitiveBounds.map((item) => item.centerY))
    return primitiveBounds.length >= 2 && Math.max(xSpan, ySpan) >= 0.08
  }
  if (landmark.distribution === 'radial') {
    if (primitiveBounds.length < 3) return false
    const xSpan = Math.max(...primitiveBounds.map((item) => item.centerX))
      - Math.min(...primitiveBounds.map((item) => item.centerX))
    const ySpan = Math.max(...primitiveBounds.map((item) => item.centerY))
      - Math.min(...primitiveBounds.map((item) => item.centerY))
    return xSpan >= 0.18 && ySpan >= 0.18
  }
  return true
}

function geometryKindMatches(
  landmark: AIRecognitionLandmark,
  primitives: readonly PrimitiveGeometry[]
): boolean {
  if (landmark.geometryKind === 'either') return true
  if (landmark.geometryKind === 'region') {
    return primitives.some((primitive) => primitive.kind === 'ellipse' || primitive.kind === 'polygon')
  }
  return primitives.some((primitive) => primitive.kind === landmark.geometryKind)
}

function boxesOverlap(
  first: NonNullable<ReturnType<typeof bounds>>,
  second: NonNullable<ReturnType<typeof bounds>>
): boolean {
  return first.minX <= second.maxX
    && first.maxX >= second.minX
    && first.minY <= second.maxY
    && first.maxY >= second.minY
}

function relationMatches(
  relationship: AIRecognitionRelationship,
  fromPrimitives: readonly PrimitiveGeometry[],
  toPrimitives: readonly PrimitiveGeometry[]
): boolean {
  const from = bounds(fromPrimitives)
  const to = bounds(toPrimitives)
  if (!from || !to) return false
  switch (relationship.relation) {
    case 'above': return from.centerY >= to.centerY + 0.06
    case 'below': return from.centerY <= to.centerY - 0.06
    case 'left-of': return from.centerX <= to.centerX - 0.06
    case 'right-of': return from.centerX >= to.centerX + 0.06
    case 'inside': return (
      from.minX >= to.minX - 0.03
      && from.maxX <= to.maxX + 0.03
      && from.minY >= to.minY - 0.03
      && from.maxY <= to.maxY + 0.03
    )
    case 'surrounds': return (
      to.minX >= from.minX - 0.03
      && to.maxX <= from.maxX + 0.03
      && to.minY >= from.minY - 0.03
      && to.maxY <= from.maxY + 0.03
    )
    case 'overlaps': return boxesOverlap(from, to)
    case 'centered-with': return Math.abs(from.centerX - to.centerX) <= 0.1
      && Math.abs(from.centerY - to.centerY) <= 0.14
    case 'mirrors': return (
      Math.abs((from.centerX + to.centerX) - 1) <= 0.16
      && Math.abs(from.centerY - to.centerY) <= 0.16
      && Math.abs(from.width - to.width) <= 0.2
      && Math.abs(from.height - to.height) <= 0.2
    )
    case 'crosses': {
      const fromSegments = fromPrimitives.flatMap(primitiveSegments)
      const toSegments = toPrimitives.flatMap(primitiveSegments)
      return fromSegments.some((first) => toSegments.some((second) => Boolean(interiorIntersection(first, second))))
    }
  }
}

function normalizedText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim()
}

function recognitionPlanFindings(
  candidate: AIDecorationCandidateDraft,
  geometry: Map<string, PrimitiveGeometry>,
  recognitionPlan: AIDecorationRecognitionPlan
): {
  findings: AIDecorationSemanticFinding[]
  requiredFeatureNames: string[]
  coveredFeatureIds: string[]
} {
  const findings: AIDecorationSemanticFinding[] = []
  const declaredLandmarkIds = new Set(recognitionPlan.landmarks.map((landmark) => landmark.id))
  const coveredFeatureIds: string[] = []

  if (normalizedText(candidate.subject) !== normalizedText(recognitionPlan.subject)) {
    findings.push({
      code: 'recognition_subject_mismatch',
      severity: 'error',
      message: `The decoration must depict the frozen subject "${recognitionPlan.subject}".`,
      featureIds: [],
    })
  }

  const unassigned = [...geometry.values()].filter((primitive) => !primitive.landmarkId)
  if (unassigned.length) {
    findings.push({
      code: 'unassigned_landmark_geometry',
      severity: 'error',
      message: `Every visible icing element must bind directly to a recognition landmark: ${unassigned.map((item) => item.id).join(', ')}.`,
      featureIds: [],
    })
  }
  const unknown = [...geometry.values()].filter((primitive) => (
    primitive.landmarkId && !declaredLandmarkIds.has(primitive.landmarkId)
  ))
  if (unknown.length) {
    findings.push({
      code: 'unknown_landmark_geometry',
      severity: 'error',
      message: `Icing geometry references landmarks outside the frozen plan: ${unknown.map((item) => item.id).join(', ')}.`,
      featureIds: [],
    })
  }

  recognitionPlan.landmarks.forEach((landmark) => {
    const primitives = primitivesForLandmark(geometry, landmark.id)
    if (!primitives.length) {
      findings.push({
        code: landmark.required
          ? 'missing_required_landmark'
          : landmark.role === 'signature'
            ? 'missing_signature_landmark'
            : 'missing_planned_landmark',
        severity: landmarkSeverity(landmark),
        message: `The frosting is missing ${landmark.name}: ${landmark.description}`,
        featureIds: [landmark.id],
      })
      return
    }
    coveredFeatureIds.push(landmark.id)
    const primitiveBounds = bounds(primitives)
    const severity = landmarkSeverity(landmark)
    if (
      primitives.length < landmark.minimumInstances
      || primitives.length > landmark.maximumInstances
    ) {
      const requiredCount = landmark.minimumInstances === landmark.maximumInstances
        ? `exactly ${landmark.minimumInstances}`
        : `between ${landmark.minimumInstances} and ${landmark.maximumInstances}`
      findings.push({
        code: 'landmark_instance_count_mismatch',
        severity,
        message: `${landmark.name} requires ${requiredCount} distinct visible icing elements; found ${primitives.length}.`,
        featureIds: [landmark.id],
      })
    }
    if (!primitiveBounds || !zoneContains(landmark.zone, primitiveBounds)) {
      findings.push({
        code: 'landmark_zone_mismatch',
        severity,
        message: `${landmark.name} must appear in the ${landmark.zone} area of the cookie.`,
        featureIds: [landmark.id],
      })
    }
    if (
      !primitiveBounds
      || primitiveBounds.width + 0.01 < landmark.minimumWidthRatio
      || primitiveBounds.height + 0.01 < landmark.minimumHeightRatio
    ) {
      findings.push({
        code: 'landmark_scale_mismatch',
        severity,
        message: `${landmark.name} is too small to carry its planned recognition role.`,
        featureIds: [landmark.id],
      })
    }
    if (!geometryKindMatches(landmark, primitives)) {
      findings.push({
        code: 'landmark_geometry_kind_mismatch',
        severity,
        message: `${landmark.name} requires ${landmark.geometryKind} icing geometry.`,
        featureIds: [landmark.id],
      })
    }
    if (!distributionMatches(landmark, primitives)) {
      findings.push({
        code: 'landmark_distribution_mismatch',
        severity,
        message: `${landmark.name} must use a ${landmark.distribution} layout.`,
        featureIds: [landmark.id],
      })
    }
    if (landmark.requiredText) {
      const exactTextPresent = primitives.some((primitive) => (
        primitive.kind === 'lettering'
        && normalizedText(primitive.text ?? '') === normalizedText(landmark.requiredText)
      ))
      if (!exactTextPresent) {
        findings.push({
          code: 'required_text_mismatch',
          severity: 'error',
          message: `${landmark.name} must show the exact requested text "${landmark.requiredText}".`,
          featureIds: [landmark.id],
        })
      }
    }
  })

  recognitionPlan.relationships.forEach((relationship) => {
    const from = primitivesForLandmark(geometry, relationship.fromLandmarkId)
    const to = primitivesForLandmark(geometry, relationship.toLandmarkId)
    if (!from.length || !to.length) {
      if (relationship.required) {
        findings.push({
          code: 'required_relationship_endpoint_missing',
          severity: 'error',
          message: `${relationship.fromLandmarkId} must be ${relationship.relation} ${relationship.toLandmarkId}, but one or both landmarks are missing.`,
          featureIds: [relationship.fromLandmarkId, relationship.toLandmarkId],
        })
      }
      return
    }
    if (relationMatches(relationship, from, to)) return
    findings.push({
      code: 'landmark_relationship_mismatch',
      severity: relationship.required ? 'error' : 'warning',
      message: `${relationship.fromLandmarkId} must be ${relationship.relation} ${relationship.toLandmarkId}.`,
      featureIds: [relationship.fromLandmarkId, relationship.toLandmarkId],
    })
  })

  return {
    findings,
    requiredFeatureNames: recognitionPlan.landmarks
      .filter((landmark) => landmark.required || landmark.role === 'signature')
      .map((landmark) => landmark.name),
    coveredFeatureIds: coveredFeatureIds.sort(),
  }
}

export function getDecorationSubjectGuidance(description: string): string {
  const normalized = description.toLowerCase()
  if (/\bbarn(?:yard)?\b/.test(normalized)) {
    return [
      'Make the icing unmistakably read as a cheerful farm barn, even without seeing the cutter edge.',
      'Every candidate must include a broad peaked roof or eave line, a large centered lower double door, and two opposing diagonal crossbuck braces.',
      'Add an upper loft opening or window plus one playful farm accent such as hay, grass, flowers, or a peeking chick.',
      'Use a classic barn-red or cute pastel facade with high-contrast cream trim, a dark neutral, hay gold, and optional soft green.',
      'Never use a large unrelated central circle, badge, clock face, or abstract chevron.',
    ].join(' ')
  }
  if (/\b(house|building|castle|school|shop|store|cabin)\b/.test(normalized)) {
    return 'Use recognizable architecture: distinct roof/eaves, a dominant entry, windows or facade panels, and one charming story accent. Avoid a generic medallion.'
  }
  if (/\b(butterfly|bee|bumblebee|ladybug|ladybird|insect)\b/.test(normalized)) {
    return 'Use a centered body, clearly paired left and right wings, and an insect-specific detail such as antennae, spots, or stripes. Preserve bilateral balance and avoid a generic badge.'
  }
  if (/\b(cat|dog|bear|bunny|rabbit|cow|pig|horse|chicken|duck|animal)\b/.test(normalized)) {
    return 'Prioritize a cute expressive face: paired eyes, centered nose or beak, mouth or muzzle, ears, and one species-specific marking or accessory.'
  }
  if (/\b(car|truck|tractor|train|bus|vehicle)\b/.test(normalized)) {
    return 'Use a clear vehicle body, two or more wheels low on the cookie, windows or cab, and one subject-specific feature such as a grille, smokestack, or loader.'
  }
  if (/\b(cake|cupcake|donut|pizza|fruit|food)\b/.test(normalized)) {
    return 'Use recognizable food layers, toppings, and color blocking. Prefer a few large appetizing features over an abstract badge.'
  }
  return 'Choose at least three distinct subject-specific landmarks and bind every visible icing geometry to the landmark it depicts. The decorated surface must identify the request without relying on the cutter outline.'
}

export function evaluateDecorationSemantics(
  description: string,
  candidate: AIDecorationCandidateDraft,
  recognitionPlan?: AIDecorationRecognitionPlan
): AIDecorationSemanticAssessment {
  const findings: AIDecorationSemanticFinding[] = []
  const geometry = geometryMap(candidate)
  if (recognitionPlan) {
    const planned = recognitionPlanFindings(candidate, geometry, recognitionPlan)
    const errorCount = planned.findings.filter((finding) => finding.severity === 'error').length
    const warningCount = planned.findings.length - errorCount
    const score = Math.max(0, Math.min(100, 100 - errorCount * 22 - warningCount * 6))
    return {
      score,
      disposition: errorCount ? 'reject' : warningCount ? 'repair' : 'eligible',
      findings: planned.findings,
      coveredFeatureIds: planned.coveredFeatureIds,
      requiredFeatureNames: planned.requiredFeatureNames,
    }
  }
  const boundIds = new Set(candidate.semanticFeatures.flatMap((feature) => feature.geometryIds))
  if (!candidateNamesRequestedSubject(description, candidate.subject)) {
    findings.push({
      code: 'subject_mismatch',
      severity: 'error',
      message: 'The candidate subject does not name the customer-requested subject; shared colors or style words do not count.',
      featureIds: [],
    })
  }

  if (candidate.semanticFeatures.length < 3) {
    findings.push({
      code: 'insufficient_semantic_features',
      severity: 'error',
      message: 'Use at least three distinct subject-specific icing features.',
      featureIds: candidate.semanticFeatures.map((feature) => feature.id),
    })
  }
  if (candidate.semanticFeatures.filter((feature) => feature.role === 'signature').length < 2) {
    findings.push({
      code: 'insufficient_signature_features',
      severity: 'error',
      message: 'At least two icing features must be marked as essential for recognition.',
      featureIds: candidate.semanticFeatures.map((feature) => feature.id),
    })
  }
  if (boundIds.size < 3) {
    findings.push({
      code: 'insufficient_geometry_coverage',
      severity: 'error',
      message: 'Semantic features must map to at least three distinct icing geometries.',
      featureIds: candidate.semanticFeatures.map((feature) => feature.id),
    })
  }

  const unknownBindings = [...boundIds].filter((id) => !geometry.has(id))
  if (unknownBindings.length) {
    findings.push({
      code: 'unknown_geometry_binding',
      severity: 'error',
      message: `Semantic features reference missing geometry: ${unknownBindings.join(', ')}.`,
      featureIds: candidate.semanticFeatures
        .filter((feature) => feature.geometryIds.some((id) => unknownBindings.includes(id)))
        .map((feature) => feature.id),
    })
  }

  const unboundGeometry = [...geometry.keys()].filter((id) => !boundIds.has(id))
  if (unboundGeometry.length) {
    findings.push({
      code: 'unbound_visible_geometry',
      severity: 'error',
      message: `Every visible icing element needs a subject role; unbound: ${unboundGeometry.join(', ')}.`,
      featureIds: [],
    })
  }

  const genericFeatures = candidate.semanticFeatures.filter((feature) => {
    const tokens = words(feature.name)
    return tokens.length > 0 && tokens.every((token) => GENERIC_FEATURE_WORDS.has(token))
  })
  if (genericFeatures.length) {
    findings.push({
      code: 'generic_feature_labels',
      severity: 'warning',
      message: 'Replace generic accents with named subject landmarks.',
      featureIds: genericFeatures.map((feature) => feature.id),
    })
  }

  candidate.regions.forEach((region) => {
    const area = region.kind === 'ellipse'
      ? Math.PI * region.radiusX * region.radiusY
      : polygonArea(region.points)
    if (area >= 0.15 && !boundIds.has(region.id)) {
      findings.push({
        code: 'unmapped_dominant_feature',
        severity: 'error',
        message: `${region.name} dominates the cookie without depicting a declared subject feature.`,
        featureIds: [],
      })
    }
  })

  let requiredFeatureNames: string[] = []
  if (/\bbarn(?:yard)?\b/.test(description.toLowerCase())) {
    const barn = barnFindings(candidate, geometry)
    findings.push(...barn.findings)
    requiredFeatureNames = barn.requiredFeatureNames
  } else {
    const categorized = categorizedSubjectFindings(description, candidate, geometry)
    findings.push(...categorized.findings)
    requiredFeatureNames = categorized.requiredFeatureNames
  }

  if (!candidate.semanticFeatures.some((feature) => feature.role === 'accent')) {
    findings.push({
      code: 'missing_playful_accent',
      severity: 'warning',
      message: 'Add one restrained playful accent to make the design feel custom and celebratory.',
      featureIds: [],
    })
  }

  const errorCount = findings.filter((finding) => finding.severity === 'error').length
  const warningCount = findings.length - errorCount
  const score = Math.max(0, Math.min(100, 100 - errorCount * 24 - warningCount * 7))
  return {
    score,
    disposition: errorCount ? 'reject' : warningCount ? 'repair' : 'eligible',
    findings,
    coveredFeatureIds: candidate.semanticFeatures.map((feature) => feature.id).sort(),
    requiredFeatureNames,
  }
}
