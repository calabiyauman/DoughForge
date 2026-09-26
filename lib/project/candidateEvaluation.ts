import type { JsonObject, Point2D, Transform2D } from '@/lib/design/types'
import { stableContentHash } from './hash'
import { PROFESSIONAL_DECORATOR_PROFILE } from './decoratorProfile'
import type { CookieDesignRevision, DecorationSpec, PaletteSpec } from './types'

export type EvaluationMetricId =
  | 'geometry-containment'
  | 'stroke-width'
  | 'region-overlap'
  | 'feature-legibility'
  | 'palette-contrast'
  | 'step-complexity'
  | 'reproducibility'

export interface CandidateFinding {
  code: string
  metric: EvaluationMetricId
  severity: 'info' | 'warning' | 'error'
  path: string
  message: string
  relatedIds: string[]
  measurements?: JsonObject
}

export interface CandidateMetricResult {
  id: EvaluationMetricId
  score: number
  weight: number
  status: 'pass' | 'warning' | 'fail'
  hardFailure: boolean
  measurements: JsonObject
  findings: CandidateFinding[]
}

export interface DecorationCandidateEvaluation {
  schema: 'doughforge.decoration-candidate-evaluation'
  version: 1
  candidateId: string
  designRevisionId: string
  decorationSpecId: string
  paletteSpecId: string
  policyId: string
  inputHash: string
  score: number
  disposition: 'eligible' | 'repair' | 'reject'
  metrics: CandidateMetricResult[]
  findings: CandidateFinding[]
  rankKey: string
}

export interface CandidateEvaluationInput {
  design: CookieDesignRevision
  decoration: DecorationSpec
  palette: PaletteSpec
  physicalScale?: number
}

const WEIGHTS: Record<EvaluationMetricId, number> = {
  'geometry-containment': 25,
  'stroke-width': 15,
  'region-overlap': 12,
  'feature-legibility': 18,
  'palette-contrast': 10,
  'step-complexity': 8,
  reproducibility: 12,
}

function round(value: number, places = 3): number {
  const scale = 10 ** places
  return Math.round(value * scale) / scale
}

function applyTransform(point: Point2D, transform: Transform2D, scale: number): Point2D {
  const [a, b, c, d, e, f] = transform
  return {
    x: (a * point.x + c * point.y + e) * scale,
    y: (b * point.x + d * point.y + f) * scale,
  }
}

function pointInPolygon(point: Point2D, polygon: readonly Point2D[]): boolean {
  let inside = false
  for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current, current += 1) {
    const a = polygon[current]
    const b = polygon[previous]
    const intersects = ((a.y > point.y) !== (b.y > point.y))
      && point.x < ((b.x - a.x) * (point.y - a.y)) / ((b.y - a.y) || Number.EPSILON) + a.x
    if (intersects) inside = !inside
  }
  return inside
}

function isInsideCookie(point: Point2D, outer: readonly Point2D[], holes: readonly Point2D[][]): boolean {
  return pointInPolygon(point, outer) && !holes.some((hole) => pointInPolygon(point, hole))
}

function polygonArea(points: readonly Point2D[]): number {
  let area = 0
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]
    const next = points[(index + 1) % points.length]
    area += current.x * next.y - next.x * current.y
  }
  return Math.abs(area) / 2
}

function bounds(points: readonly Point2D[]) {
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  return { minX, maxX, minY, maxY, area: Math.max(0, maxX - minX) * Math.max(0, maxY - minY) }
}

function overlapRatio(first: ReturnType<typeof bounds>, second: ReturnType<typeof bounds>): number {
  const width = Math.max(0, Math.min(first.maxX, second.maxX) - Math.max(first.minX, second.minX))
  const height = Math.max(0, Math.min(first.maxY, second.maxY) - Math.max(first.minY, second.minY))
  const overlap = width * height
  return overlap / Math.max(1, Math.min(first.area, second.area))
}

function metric(
  id: EvaluationMetricId,
  score: number,
  findings: CandidateFinding[],
  measurements: JsonObject,
  hardFailure = findings.some((finding) => finding.severity === 'error')
): CandidateMetricResult {
  const normalizedScore = Math.max(0, Math.min(100, Math.round(score)))
  return {
    id,
    score: normalizedScore,
    weight: WEIGHTS[id],
    status: hardFailure ? 'fail' : findings.some((finding) => finding.severity === 'warning') ? 'warning' : 'pass',
    hardFailure,
    measurements,
    findings,
  }
}

function finding(
  metricId: EvaluationMetricId,
  code: string,
  severity: CandidateFinding['severity'],
  path: string,
  message: string,
  relatedIds: string[] = [],
  measurements?: JsonObject
): CandidateFinding {
  return { code, metric: metricId, severity, path, message, relatedIds, measurements }
}

function relativeLuminance(hex: string): number {
  const value = Number.parseInt(hex.slice(1), 16)
  const channels = [(value >> 16) & 255, (value >> 8) & 255, value & 255].map((channel) => {
    const normalized = channel / 255
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

function contrast(first: string, second: string): number {
  const a = relativeLuminance(first)
  const b = relativeLuminance(second)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

function geometryContainment(input: CandidateEvaluationInput, outer: Point2D[], holes: Point2D[][]): CandidateMetricResult {
  const id: EvaluationMetricId = 'geometry-containment'
  const findings: CandidateFinding[] = []
  const scale = input.physicalScale ?? 1
  const transform = input.decoration.registration.transform
  let testedPoints = 0
  let outsidePoints = 0
  input.decoration.regions.slice(1).forEach((region, regionIndex) => {
    region.outer.forEach((point) => {
      testedPoints += 1
      if (!isInsideCookie(applyTransform(point, transform, scale), outer, holes)) outsidePoints += 1
    })
    if (region.outer.length >= 3 && polygonArea(region.outer.map((point) => applyTransform(point, transform, scale))) < 0.5) {
      findings.push(finding(id, 'collapsed_region', 'error', `regions[${regionIndex + 1}]`, `${region.name} collapsed during registration`, [region.id]))
    }
  })
  input.decoration.strokes.forEach((stroke, strokeIndex) => {
    stroke.points.forEach((point) => {
      testedPoints += 1
      if (!isInsideCookie(applyTransform(point, transform, scale), outer, holes)) outsidePoints += 1
    })
    if (stroke.points.length < 2) {
      findings.push(finding(id, 'empty_stroke', 'error', `strokes[${strokeIndex}]`, `${stroke.name} has no usable path`, [stroke.id]))
    }
  })
  ;(input.decoration.lettering ?? []).forEach((lettering, letteringIndex) => {
    testedPoints += 1
    if (!isInsideCookie(applyTransform(lettering.position, transform, scale), outer, holes)) {
      outsidePoints += 1
      findings.push(finding(id, 'lettering_anchor_outside', 'error', `lettering[${letteringIndex}]`, `${lettering.name} is anchored outside the cookie`, [lettering.id]))
    }
  })
  if (outsidePoints > 0) {
    findings.push(finding(
      id,
      'geometry_outside_cookie',
      outsidePoints / Math.max(1, testedPoints) > 0.08 ? 'error' : 'warning',
      'decoration',
      `${outsidePoints} of ${testedPoints} sampled decoration points fall outside the baked-cookie boundary`,
      [],
      { outsidePoints, testedPoints }
    ))
  }
  const ratio = outsidePoints / Math.max(1, testedPoints)
  return metric(id, 100 - ratio * 180, findings, { outsidePoints, testedPoints, outsideRatio: round(ratio) })
}

function strokeWidth(input: CandidateEvaluationInput): CandidateMetricResult {
  const id: EvaluationMetricId = 'stroke-width'
  const scale = input.physicalScale ?? 1
  const widths = [
    ...input.decoration.strokes.map((stroke) => ({ id: stroke.id, name: stroke.name, width: stroke.width * scale })),
    ...(input.decoration.lettering ?? []).map((lettering) => ({ id: lettering.id, name: lettering.name, width: lettering.strokeWidth * scale })),
  ]
  const findings: CandidateFinding[] = []
  widths.forEach((item, index) => {
    if (item.width < PROFESSIONAL_DECORATOR_PROFILE.hardMinimumStrokeWidthMm) {
      findings.push(finding(id, 'stroke_too_thin', 'error', `features[${index}]`, `${item.name} is thinner than the provisional pipeable minimum`, [item.id], { widthMm: round(item.width) }))
    } else if (item.width < PROFESSIONAL_DECORATOR_PROFILE.minimumStrokeWidthMm) {
      findings.push(finding(id, 'stroke_precision_only', 'warning', `features[${index}]`, `${item.name} requires advanced fine-line control`, [item.id], { widthMm: round(item.width) }))
    }
  })
  const minimum = widths.length ? Math.min(...widths.map((item) => item.width)) : 0
  const thinCount = widths.filter((item) => item.width < PROFESSIONAL_DECORATOR_PROFILE.minimumStrokeWidthMm).length
  return metric(id, widths.length ? 100 - thinCount * 22 : 95, findings, { featureCount: widths.length, minimumWidthMm: round(minimum) })
}

function regionOverlap(input: CandidateEvaluationInput): CandidateMetricResult {
  const id: EvaluationMetricId = 'region-overlap'
  const findings: CandidateFinding[] = []
  const details = input.decoration.regions.slice(1)
  let conflictingPairs = 0
  for (let first = 0; first < details.length; first += 1) {
    for (let second = first + 1; second < details.length; second += 1) {
      const firstLayer = Number(details[first].metadata?.layer ?? 1)
      const secondLayer = Number(details[second].metadata?.layer ?? 1)
      if (firstLayer !== secondLayer) continue
      const ratio = overlapRatio(bounds(details[first].outer), bounds(details[second].outer))
      if (ratio > 0.5) {
        conflictingPairs += 1
        findings.push(finding(
          id,
          'same_layer_overlap',
          ratio > 0.8 ? 'error' : 'warning',
          `regions[${first}]`,
          `${details[first].name} and ${details[second].name} materially overlap in the same icing layer`,
          [details[first].id, details[second].id],
          { boundingBoxOverlapRatio: round(ratio) }
        ))
      }
    }
  }
  return metric(id, 100 - conflictingPairs * 24, findings, { conflictingPairs })
}

function featureLegibility(input: CandidateEvaluationInput): CandidateMetricResult {
  const id: EvaluationMetricId = 'feature-legibility'
  const scale = input.physicalScale ?? 1
  const findings: CandidateFinding[] = []
  let tinyRegions = 0
  input.decoration.regions.slice(1).forEach((region, index) => {
    const area = polygonArea(region.outer) * scale * scale
    if (area < PROFESSIONAL_DECORATOR_PROFILE.minimumFloodIslandAreaMm2 && region.metadata?.technique === 'flood') {
      tinyRegions += 1
      findings.push(finding(id, 'tiny_flood_island', 'warning', `regions[${index + 1}]`, `${region.name} is vulnerable to cratering; use wet-on-wet, a dot, or a transfer`, [region.id], { areaMm2: round(area) }))
    }
  })
  let undersizedLettering = 0
  ;(input.decoration.lettering ?? []).forEach((lettering, index) => {
    const height = lettering.fontSize * scale
    if (height < PROFESSIONAL_DECORATOR_PROFILE.minimumLetterHeightMm) {
      undersizedLettering += 1
      findings.push(finding(id, 'undersized_lettering', height < PROFESSIONAL_DECORATOR_PROFILE.expertMinimumLetterHeightMm ? 'error' : 'warning', `lettering[${index}]`, `${lettering.name} is below the preferred piped-letter height`, [lettering.id], { heightMm: round(height) }))
    }
  })
  return metric(id, 100 - tinyRegions * 10 - undersizedLettering * 18, findings, { tinyRegions, undersizedLettering })
}

function paletteContrast(input: CandidateEvaluationInput): CandidateMetricResult {
  const id: EvaluationMetricId = 'palette-contrast'
  const findings: CandidateFinding[] = []
  const colorById = new Map(input.palette.colors.map((color) => [color.id, color]))
  const baseRegion = input.decoration.regions[0]
  const baseHex = colorById.get(baseRegion?.fillColorId)?.target.hex
  const detailColorIds = new Set([
    ...input.decoration.regions.slice(1).map((region) => region.fillColorId),
    ...input.decoration.strokes.map((stroke) => stroke.colorId),
    ...(input.decoration.lettering ?? []).map((lettering) => lettering.colorId),
  ])
  const ratios = baseHex
    ? [...detailColorIds].map((colorId) => ({ colorId, ratio: contrast(baseHex, colorById.get(colorId)?.target.hex ?? baseHex) }))
    : []
  ratios.forEach(({ colorId, ratio }, index) => {
    if (ratio < 1.5) {
      findings.push(finding(id, 'low_detail_contrast', ratio < 1.25 ? 'error' : 'warning', `detailColors[${index}]`, 'A detail color may disappear against the base icing', [colorId], { contrastRatio: round(ratio, 2) }))
    }
  })
  const average = ratios.length ? ratios.reduce((sum, item) => sum + item.ratio, 0) / ratios.length : 1
  return metric(id, Math.min(100, 45 + average * 18), findings, { averageContrastRatio: round(average, 2), comparedColors: ratios.length })
}

function stepComplexity(input: CandidateEvaluationInput): CandidateMetricResult {
  const id: EvaluationMetricId = 'step-complexity'
  const featureCount = input.decoration.regions.length - 1
    + input.decoration.strokes.length
    + (input.decoration.lettering?.length ?? 0)
  const budget = input.decoration.difficulty === 'easy'
    ? PROFESSIONAL_DECORATOR_PROFILE.maximumEasyFeatures
    : PROFESSIONAL_DECORATOR_PROFILE.maximumDetailedFeatures
  const findings: CandidateFinding[] = []
  if (featureCount > budget) {
    findings.push(finding(id, 'feature_budget_exceeded', 'warning', 'decoration', `The plan has ${featureCount} features; the ${input.decoration.difficulty} profile targets at most ${budget}`, [], { featureCount, budget }))
  }
  if (input.decoration.steps.length > 6) {
    findings.push(finding(id, 'too_many_steps', 'warning', 'steps', 'More than six decorating passes increases project friction', [], { stepCount: input.decoration.steps.length }))
  }
  const excess = Math.max(0, featureCount - budget) + Math.max(0, input.decoration.steps.length - 6) * 2
  return metric(id, 100 - excess * 6, findings, { featureCount, budget, stepCount: input.decoration.steps.length })
}

function reproducibility(input: CandidateEvaluationInput): CandidateMetricResult {
  const id: EvaluationMetricId = 'reproducibility'
  const findings: CandidateFinding[] = []
  const assignedRegions = new Set(input.decoration.steps.flatMap((step) => step.regionIds))
  const assignedStrokes = new Set(input.decoration.steps.flatMap((step) => step.strokeIds))
  const assignedLettering = new Set(input.decoration.steps.flatMap((step) => step.letteringIds ?? []))
  const missing = [
    ...input.decoration.regions.filter((region) => !assignedRegions.has(region.id)).map((region) => region.id),
    ...input.decoration.strokes.filter((stroke) => !assignedStrokes.has(stroke.id)).map((stroke) => stroke.id),
    ...(input.decoration.lettering ?? []).filter((lettering) => !assignedLettering.has(lettering.id)).map((lettering) => lettering.id),
  ]
  if (missing.length) {
    findings.push(finding(id, 'unassigned_features', 'error', 'steps', 'Every visible feature must belong to an explicit decorating step', missing, { missingCount: missing.length }))
  }
  const incompleteSteps = input.decoration.steps.filter((step) => !step.tool || !step.technique)
  if (incompleteSteps.length) {
    findings.push(finding(id, 'incomplete_step_instructions', 'warning', 'steps', 'Each decorating pass should specify a tool and technique', incompleteSteps.map((step) => step.id)))
  }
  const usedColors = new Set([
    ...input.decoration.regions.map((region) => region.fillColorId),
    ...input.decoration.strokes.map((stroke) => stroke.colorId),
    ...(input.decoration.lettering ?? []).map((lettering) => lettering.colorId),
  ])
  const recipeColors = new Set(input.palette.recipes.map((recipe) => recipe.colorId))
  const missingRecipes = [...usedColors].filter((colorId) => !recipeColors.has(colorId))
  if (missingRecipes.length) {
    findings.push(finding(id, 'missing_color_recipe', 'warning', 'palette.recipes', 'Used colors need an explicit verified or untinted recipe', missingRecipes))
  }
  return metric(id, 100 - missing.length * 20 - incompleteSteps.length * 6 - missingRecipes.length * 5, findings, {
    missingFeatureAssignments: missing.length,
    incompleteSteps: incompleteSteps.length,
    missingRecipes: missingRecipes.length,
  })
}

export function evaluateDecorationCandidate(input: CandidateEvaluationInput): DecorationCandidateEvaluation {
  const scale = input.physicalScale ?? 1
  const cutOuter = input.design.designSpec.contours.find((contour) => contour.role === 'cut' && contour.relationship.kind === 'outer')
    ?? input.design.designSpec.contours.find((contour) => contour.relationship.kind === 'outer')
  if (!cutOuter) throw new Error('Candidate evaluation requires an outer design contour')
  const outer = cutOuter.points.map((point) => ({ x: point.x * scale, y: point.y * scale }))
  const holes = input.design.designSpec.contours
    .filter((contour) => contour.relationship.kind === 'hole' && contour.relationship.outerContourId === cutOuter.id)
    .map((contour) => contour.points.map((point) => ({ x: point.x * scale, y: point.y * scale })))
  const metrics = [
    geometryContainment(input, outer, holes),
    strokeWidth(input),
    regionOverlap(input),
    featureLegibility(input),
    paletteContrast(input),
    stepComplexity(input),
    reproducibility(input),
  ]
  const findings = metrics.flatMap((item) => item.findings)
    .sort((first, second) => `${first.metric}:${first.path}:${first.code}`.localeCompare(`${second.metric}:${second.path}:${second.code}`))
  const score = Math.round(metrics.reduce((sum, item) => sum + item.score * item.weight, 0) / 100)
  const hardFailureCount = metrics.filter((item) => item.hardFailure).length
  const warningCount = findings.filter((item) => item.severity === 'warning').length
  const disposition = hardFailureCount > 0 ? 'reject' : warningCount > 0 ? 'repair' : 'eligible'
  const candidateId = String(input.decoration.metadata?.candidateId ?? input.decoration.id)
  const inputHash = stableContentHash({
    design: input.design.designSpec,
    decoration: input.decoration,
    palette: input.palette,
    physicalScale: scale,
    policyId: PROFESSIONAL_DECORATOR_PROFILE.id,
  })
  const dispositionRank = disposition === 'eligible' ? 0 : disposition === 'repair' ? 1 : 2
  const rankKey = [
    dispositionRank,
    String(100 - score).padStart(3, '0'),
    String(hardFailureCount).padStart(2, '0'),
    String(warningCount).padStart(2, '0'),
    input.decoration.id,
  ].join(':')
  return {
    schema: 'doughforge.decoration-candidate-evaluation',
    version: 1,
    candidateId,
    designRevisionId: input.design.id,
    decorationSpecId: input.decoration.id,
    paletteSpecId: input.palette.id,
    policyId: PROFESSIONAL_DECORATOR_PROFILE.id,
    inputHash,
    score,
    disposition,
    metrics,
    findings,
    rankKey,
  }
}

export function rankDecorationCandidates(
  results: readonly DecorationCandidateEvaluation[]
): DecorationCandidateEvaluation[] {
  return [...results].sort((first, second) => first.rankKey.localeCompare(second.rankKey))
}
