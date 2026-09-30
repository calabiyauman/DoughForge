import type { AIDecorationCandidateDraft, AIDecorationGeneration, AIColorSlot } from '@/lib/ai/decorationPlan'
import { evaluateDecorationSemantics } from '@/lib/ai/decorationSemantics'
import type { ClosedContour, DesignSpec, Point2D } from '@/lib/design/types'
import { evaluateDecorationCandidate, rankDecorationCandidates, type DecorationCandidateEvaluation } from './candidateEvaluation'
import { nearestTrustedColor } from './colorCatalog'
import { PROFESSIONAL_DECORATOR_PROFILE } from './decoratorProfile'
import { sealCookieProjectRevision } from './hash'
import { createPrototypeCookieProject, type PrototypeProjectOptions } from './planner'
import {
  DECORATION_SPEC_SCHEMA,
  DECORATION_SPEC_VERSION,
  PALETTE_SPEC_SCHEMA,
  PALETTE_SPEC_VERSION,
  PREVIEW_ARTIFACT_SCHEMA,
  PREVIEW_ARTIFACT_VERSION,
  type CookieProjectRevision,
  type DecorationLettering,
  type DecorationRegion,
  type DecorationSpec,
  type DecorationStep,
  type DecorationStroke,
  type GelColorSku,
  type PaletteColor,
  type PaletteSpec,
  type PreviewArtifact,
} from './types'
import { assertValidCookieProjectRevision } from './validation'

interface Bounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
  width: number
  height: number
}

interface CandidateParts {
  candidate: AIDecorationCandidateDraft
  palette: PaletteSpec
  decoration: DecorationSpec
  preview: PreviewArtifact
  evaluation: DecorationCandidateEvaluation
}

function slug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'ai-decoration'
}

function outerContour(design: DesignSpec): ClosedContour {
  const contour = design.contours.find((candidate) => candidate.role === 'cut' && candidate.relationship.kind === 'outer')
    ?? design.contours.find((candidate) => candidate.relationship.kind === 'outer')
  if (!contour) throw new Error('AI decoration requires an outer design contour')
  return contour
}

function contourHoles(design: DesignSpec, outerContourId: string): Point2D[][] {
  return design.contours
    .filter((contour) => contour.relationship.kind === 'hole' && contour.relationship.outerContourId === outerContourId)
    .map((contour) => contour.points.map((point) => ({ ...point })))
}

function getBounds(points: readonly Point2D[]): Bounds {
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY }
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

function distanceToSegment(point: Point2D, first: Point2D, second: Point2D): number {
  const dx = second.x - first.x
  const dy = second.y - first.y
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared === 0) return Math.hypot(point.x - first.x, point.y - first.y)
  const projection = Math.max(0, Math.min(1, ((point.x - first.x) * dx + (point.y - first.y) * dy) / lengthSquared))
  return Math.hypot(point.x - (first.x + projection * dx), point.y - (first.y + projection * dy))
}

function distanceToPolygon(point: Point2D, polygon: readonly Point2D[]): number {
  let minimum = Number.POSITIVE_INFINITY
  for (let index = 0; index < polygon.length; index += 1) {
    minimum = Math.min(minimum, distanceToSegment(point, polygon[index], polygon[(index + 1) % polygon.length]))
  }
  return minimum
}

function isSafe(point: Point2D, outer: readonly Point2D[], holes: readonly Point2D[][], keepout: number): boolean {
  if (!pointInPolygon(point, outer) || holes.some((hole) => pointInPolygon(point, hole))) return false
  if (distanceToPolygon(point, outer) < keepout) return false
  return holes.every((hole) => distanceToPolygon(point, hole) >= keepout)
}

function findInteriorAnchor(outer: readonly Point2D[], holes: readonly Point2D[][], bounds: Bounds): Point2D {
  let best = { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 }
  let bestDistance = -1
  for (let xIndex = 1; xIndex < 10; xIndex += 1) {
    for (let yIndex = 1; yIndex < 10; yIndex += 1) {
      const point = {
        x: bounds.minX + bounds.width * (xIndex / 10),
        y: bounds.minY + bounds.height * (yIndex / 10),
      }
      if (!pointInPolygon(point, outer) || holes.some((hole) => pointInPolygon(point, hole))) continue
      const distance = Math.min(distanceToPolygon(point, outer), ...holes.map((hole) => distanceToPolygon(point, hole)))
      if (distance > bestDistance) {
        best = point
        bestDistance = distance
      }
    }
  }
  return best
}

function projectInside(
  point: Point2D,
  anchor: Point2D,
  outer: readonly Point2D[],
  holes: readonly Point2D[][],
  keepout: number
): Point2D {
  if (isSafe(point, outer, holes, keepout)) return point
  let low = 0
  let high = 1
  let best = anchor
  for (let iteration = 0; iteration < 24; iteration += 1) {
    const ratio = (low + high) / 2
    const candidate = {
      x: anchor.x + (point.x - anchor.x) * ratio,
      y: anchor.y + (point.y - anchor.y) * ratio,
    }
    if (isSafe(candidate, outer, holes, keepout)) {
      best = candidate
      low = ratio
    } else {
      high = ratio
    }
  }
  return best
}

function normalizedPoint(point: Point2D, bounds: Bounds): Point2D {
  return {
    x: bounds.minX + bounds.width * point.x,
    y: bounds.minY + bounds.height * point.y,
  }
}

function ellipse(center: Point2D, radiusX: number, radiusY: number, segments = 24): Point2D[] {
  return Array.from({ length: segments }, (_, index) => {
    const angle = (index / segments) * Math.PI * 2
    return {
      x: center.x + Math.cos(angle) * radiusX,
      y: center.y + Math.sin(angle) * radiusY,
    }
  })
}

function colorRole(slot: AIColorSlot): PaletteColor['role'] {
  switch (slot) {
    case 'base': return 'base'
    case 'outline': return 'outline'
    case 'accent': return 'accent'
    case 'detail': return 'detail'
    case 'neutral': return 'neutral'
  }
}

function buildPalette(candidate: AIDecorationCandidateDraft, prefix: string): PaletteSpec {
  const colors: PaletteColor[] = candidate.palette.map((color, index) => ({
    id: `${prefix}:color:${slug(color.slot)}:${index + 1}`,
    name: color.name,
    target: { hex: color.hex },
    role: colorRole(color.slot),
    recipeId: `${prefix}:recipe:${index + 1}`,
    metadata: { aiSlot: color.slot, displayOnly: true },
  }))
  const trustedByColor = new Map(colors.map((color) => [color.id, nearestTrustedColor(color.target.hex)]))
  const gels = new Map<string, GelColorSku>()
  trustedByColor.forEach((trusted) => {
    if (!trusted.gelName) return
    const id = `${prefix}:gel:${slug(trusted.key)}`
    gels.set(id, {
      id,
      brand: 'AmeriColor — prototype mapping',
      sku: `prototype:${slug(trusted.gelName)}`,
      name: `${trusted.gelName} Soft Gel Paste`,
      metadata: { verificationStatus: 'prototype-unverified', nearestDisplaySwatch: trusted.hex },
    })
  })
  const gelSkus = [...gels.values()]
  return {
    schema: PALETTE_SPEC_SCHEMA,
    version: PALETTE_SPEC_VERSION,
    id: `${prefix}:palette`,
    name: candidate.paletteName,
    colors,
    gelSkus,
    recipes: colors.map((color, index) => {
      const trusted = trustedByColor.get(color.id)
      const gel = trusted?.gelName ? gelSkus.find((item) => item.id.endsWith(`:${slug(trusted.key)}`)) : undefined
      return {
        id: `${prefix}:recipe:${index + 1}`,
        colorId: color.id,
        baseIcingGrams: color.role === 'base' ? 120 : 45,
        additions: gel ? [{ gelSkuId: gel.id, amount: 1, unit: 'drop' as const }] : [],
        restMinutes: gel ? (/black|navy|red/i.test(trusted?.key ?? '') ? 480 : 30) : 0,
        notes: gel
          ? 'Prototype nearest-swatch starting point only. Mix one canonical batch, reserve 10–15% surplus, and verify the cured swatch before production.'
          : 'Use untinted royal icing.',
        metadata: { verificationStatus: 'prototype-unverified' },
      }
    }),
    disclaimer: 'AI-selected screen colors are display targets. Gel matches and ratios require test-kitchen calibration against fully cured icing.',
    metadata: { verificationStatus: 'prototype-unverified', generatedByAI: true },
  }
}

function buildSteps(
  prefix: string,
  regions: DecorationRegion[],
  strokes: DecorationStroke[],
  lettering: DecorationLettering[]
): DecorationStep[] {
  const base = regions[0]
  const wetRegions = regions.slice(1).filter((item) => item.metadata?.technique === 'wet-on-wet')
  const raisedRegions = regions.slice(1).filter((item) => item.metadata?.technique !== 'wet-on-wet')
  const wetStrokes = strokes.filter((item) => item.metadata?.technique === 'wet-on-wet')
  const detailStrokes = strokes.filter((item) => item.metadata?.technique !== 'wet-on-wet')
  const steps: DecorationStep[] = [{
    id: `${prefix}:step:base`,
    sequence: 1,
    title: wetRegions.length || wetStrokes.length ? 'Outline, flood, and add wet-on-wet details' : 'Outline and flood the base',
    instructions: wetRegions.length || wetStrokes.length
      ? 'Outline and flood continuously, then add every wet-on-wet mark immediately before the surface crusts. Settle bubbles with a scribe.'
      : 'Pipe a medium-consistency dam, flood continuously, and settle bubbles with a scribe.',
    technique: wetRegions.length || wetStrokes.length ? 'wet-on-wet' : 'flood',
    regionIds: [base.id, ...wetRegions.map((item) => item.id)],
    strokeIds: wetStrokes.map((item) => item.id),
    letteringIds: [],
    colorIds: [...new Set([base.fillColorId, ...wetRegions.map((item) => item.fillColorId), ...wetStrokes.map((item) => item.colorId)])],
    dependsOnStepIds: [],
    icingConsistency: 'flood',
    dryTimeMinutes: raisedRegions.length || detailStrokes.length || lettering.length
      ? PROFESSIONAL_DECORATOR_PROFILE.hardDryMinutes
      : 0,
    tool: 'Tipless flood bag, medium-outline bag, and scribe',
  }]

  if (raisedRegions.length) {
    steps.push({
      id: `${prefix}:step:raised-regions`,
      sequence: steps.length + 1,
      title: 'Build the raised icing sections',
      instructions: 'Pipe alternating non-touching sections first. Let them crust before filling neighboring sections to preserve clean separation.',
      technique: 'piped-detail',
      regionIds: raisedRegions.map((item) => item.id),
      strokeIds: [],
      letteringIds: [],
      colorIds: [...new Set(raisedRegions.map((item) => item.fillColorId))],
      dependsOnStepIds: [steps[steps.length - 1].id],
      icingConsistency: 'medium',
      dryTimeMinutes: PROFESSIONAL_DECORATOR_PROFILE.adjacentSectionCrustMinutes,
      tool: 'Detail or flood bag sized for each section',
    })
  }

  if (detailStrokes.length || lettering.length) {
    steps.push({
      id: `${prefix}:step:linework`,
      sequence: steps.length + 1,
      title: lettering.length ? 'Pipe the line-work and registered lettering' : 'Pipe the finishing line-work',
      instructions: 'Use steady pressure and follow the registered transfer. Lift the bead between natural stroke breaks so fine lines do not spread together.',
      technique: lettering.some((item) => item.technique === 'transfer') ? 'transfer' : 'piped-detail',
      regionIds: [],
      strokeIds: detailStrokes.map((item) => item.id),
      letteringIds: lettering.map((item) => item.id),
      colorIds: [...new Set([...detailStrokes.map((item) => item.colorId), ...lettering.map((item) => item.colorId)])],
      dependsOnStepIds: [steps[steps.length - 1].id],
      icingConsistency: 'piping',
      dryTimeMinutes: 120,
      tool: 'Fine tipless bag or PME 1.5-style detail tip; use the transfer sheet for lettering',
    })
  }

  steps.push({
    id: `${prefix}:step:finish`,
    sequence: steps.length + 1,
    title: 'Dry uncovered and quality-check',
    instructions: 'Dry in a cool, low-humidity area until fully firm. Compare line spacing, color separation, and registration with the project guide before packaging.',
    technique: 'finish',
    regionIds: [],
    strokeIds: [],
    letteringIds: [],
    colorIds: [],
    dependsOnStepIds: [steps[steps.length - 1].id],
    dryTimeMinutes: PROFESSIONAL_DECORATOR_PROFILE.hardDryMinutes,
    tool: 'Level drying tray; fan if humidity is high',
  })
  return steps
}

function candidateParts(
  base: CookieProjectRevision,
  candidate: AIDecorationCandidateDraft,
  generation: AIDecorationGeneration,
  candidateIndex: number,
  physicalScale: number,
  requestedDescription: string
): CandidateParts {
  const designRevision = base.designs[0]
  const design = designRevision.designSpec
  const outline = outerContour(design)
  const holes = contourHoles(design, outline.id)
  const outlineBounds = getBounds(outline.points)
  const anchor = findInteriorAnchor(outline.points, holes, outlineBounds)
  const prefix = `${slug(base.id)}:ai:${candidateIndex + 1}:${slug(candidate.id)}`
  const semanticAssessment = evaluateDecorationSemantics(requestedDescription, candidate)
  const palette = buildPalette(candidate, prefix)
  const colorsBySlot = new Map<AIColorSlot, string>()
  candidate.palette.forEach((color, index) => {
    if (!colorsBySlot.has(color.slot)) colorsBySlot.set(color.slot, palette.colors[index].id)
  })
  const baseColorId = colorsBySlot.get('base') ?? palette.colors[0].id
  const colorId = (slot: AIColorSlot) => colorsBySlot.get(slot) ?? colorsBySlot.get('detail') ?? baseColorId
  const keepout = PROFESSIONAL_DECORATOR_PROFILE.edgeKeepoutMm / Math.max(physicalScale, 0.1)

  const regions: DecorationRegion[] = [{
    id: `${prefix}:region:base`,
    name: 'Base flood',
    outer: outline.points.map((point) => ({ ...point })),
    holes,
    sourceGeometryIds: [outline.id],
    fillColorId: baseColorId,
    metadata: { technique: 'flood', layer: 0 },
  }]
  candidate.regions.forEach((region) => {
    const rawPoints = region.kind === 'ellipse'
      ? ellipse(
          normalizedPoint({ x: region.centerX, y: region.centerY }, outlineBounds),
          region.radiusX * outlineBounds.width,
          region.radiusY * outlineBounds.height
        )
      : region.points.map((point) => normalizedPoint(point, outlineBounds))
    const safePoints = rawPoints.map((point) => projectInside(point, anchor, outline.points, holes, keepout))
    regions.push({
      id: `${prefix}:region:${slug(region.id)}`,
      name: region.name,
      outer: safePoints,
      holes: [],
      sourceGeometryIds: [],
      fillColorId: colorId(region.colorSlot),
      metadata: { technique: region.technique, layer: region.layer, aiSourceId: region.id },
    })
  })

  const strokes: DecorationStroke[] = candidate.strokes.map((stroke) => ({
    id: `${prefix}:stroke:${slug(stroke.id)}`,
    name: stroke.name,
    points: stroke.points
      .map((point) => normalizedPoint(point, outlineBounds))
      .map((point) => projectInside(point, anchor, outline.points, holes, keepout)),
    width: stroke.widthMm,
    closed: stroke.closed,
    sourceGeometryIds: [],
    colorId: colorId(stroke.colorSlot),
    lineCap: 'round',
    lineJoin: 'round',
    metadata: { technique: stroke.technique, layer: stroke.layer, aiSourceId: stroke.id },
  }))

  const lettering: DecorationLettering[] = candidate.lettering.map((item) => ({
    id: `${prefix}:lettering:${slug(item.id)}`,
    name: item.name,
    text: item.text,
    position: projectInside(normalizedPoint(item.position, outlineBounds), anchor, outline.points, holes, keepout),
    maxWidth: item.maxWidthRatio * outlineBounds.width,
    fontSize: item.fontSizeMm,
    strokeWidth: item.strokeWidthMm,
    colorId: colorId(item.colorSlot),
    style: item.style,
    technique: item.technique,
    align: item.align,
    rotationDegrees: item.rotationDegrees,
    sourceGeometryIds: [],
    metadata: { layer: item.layer, aiSourceId: item.id },
  }))
  const decoration: DecorationSpec = {
    schema: DECORATION_SPEC_SCHEMA,
    version: DECORATION_SPEC_VERSION,
    id: `${prefix}:decoration`,
    name: candidate.name,
    designRevisionId: designRevision.id,
    paletteSpecId: palette.id,
    difficulty: candidate.difficulty,
    estimatedMinutes: candidate.estimatedMinutes,
    registration: {
      designSpecId: design.id,
      coordinateSpace: 'design-canvas',
      transform: [1, 0, 0, 1, 0, 0],
    },
    regions,
    strokes,
    lettering,
    steps: buildSteps(prefix, regions, strokes, lettering),
    metadata: {
      generatedByAI: true,
      generationId: generation.generationId,
      candidateId: candidate.id,
      concept: candidate.concept,
      requestedDescription,
      semanticSubject: candidate.subject,
      recognitionStrategy: candidate.recognitionStrategy,
      semanticFeatures: candidate.semanticFeatures.map((feature) => ({
        id: feature.id,
        name: feature.name,
        description: feature.description,
        role: feature.role,
        geometryIds: [...feature.geometryIds],
      })),
      semanticScore: semanticAssessment.score,
      semanticDisposition: semanticAssessment.disposition,
      semanticFindings: semanticAssessment.findings.map((finding) => ({
        code: finding.code,
        severity: finding.severity,
        message: finding.message,
        featureIds: [...finding.featureIds],
      })),
      coveredSemanticFeatureIds: semanticAssessment.coveredFeatureIds,
      model: generation.model,
      decoratorProfileId: PROFESSIONAL_DECORATOR_PROFILE.id,
    },
  }
  const preview: PreviewArtifact = {
    schema: PREVIEW_ARTIFACT_SCHEMA,
    version: PREVIEW_ARTIFACT_VERSION,
    id: `${prefix}:preview`,
    kind: 'decorated-cookie',
    fidelity: 'concept',
    uri: `urn:doughforge:${prefix}:registered-preview`,
    mimeType: 'image/svg+xml',
    altText: `Registered AI decoration preview for ${design.name}: ${candidate.name}`,
    createdAt: generation.createdAt,
    designRevisionIds: [designRevision.id],
    decorationSpecIds: [decoration.id],
    paletteSpecIds: [palette.id],
    generator: { name: 'doughforge-structured-decoration', version: '1', model: generation.model },
    metadata: { generationId: generation.generationId, candidateId: candidate.id },
  }
  const evaluation = evaluateDecorationCandidate({ design: designRevision, decoration, palette, physicalScale })
  decoration.metadata = {
    ...decoration.metadata,
    evaluationScore: evaluation.score,
    evaluationDisposition: evaluation.disposition,
    evaluationFindingCount: evaluation.findings.length,
  }
  return { candidate, palette, decoration, preview, evaluation }
}

export interface AIProjectOptions extends PrototypeProjectOptions {
  physicalScale?: number
}

export function createAIEnhancedCookieProject(
  design: DesignSpec,
  generation: AIDecorationGeneration,
  options: AIProjectOptions = {}
): CookieProjectRevision {
  if (!generation.candidates.length) throw new Error('AI decoration generation did not contain candidates')
  const physicalScale = options.physicalScale ?? 1
  const base = createPrototypeCookieProject(design, { ...options, physicalScale })
  const requestedDescription = options.prompt ?? design.name
  const parts = generation.candidates.map((candidate, index) => (
    candidateParts(base, candidate, generation, index, physicalScale, requestedDescription)
  ))
  const ranked = rankDecorationCandidates(parts.map((item) => item.evaluation))
  const selectedEvaluation = ranked[0]
  if (!selectedEvaluation || selectedEvaluation.disposition === 'reject') {
    const issueCodes = selectedEvaluation?.findings
      .filter((finding) => finding.severity === 'error')
      .map((finding) => finding.code)
      .slice(0, 6)
      .join(', ')
    throw new Error(
      `No AI decoration candidate passed subject-recognition and production checks${issueCodes ? `: ${issueCodes}` : ''}`
    )
  }
  const selected = parts.find((item) => item.decoration.id === selectedEvaluation.decorationSpecId) ?? parts[0]
  const ordered = [selected, ...parts.filter((item) => item !== selected)]
  const selectedGelComponents = selected.palette.gelSkus.map((gel) => ({
    id: `${slug(base.id)}:component:${slug(gel.name)}`,
    kind: 'gel-color' as const,
    name: gel.name,
    quantity: 1,
    unit: 'bottle' as const,
    required: true,
    paletteSpecId: selected.palette.id,
    gelSkuId: gel.id,
    metadata: { verificationStatus: 'prototype-unverified' },
  }))
  const selectedPreview = selected.preview
  const baseKit = base.kits[0]
  const project = sealCookieProjectRevision({
    ...base,
    decorations: ordered.map((item) => item.decoration),
    palettes: ordered.map((item) => item.palette),
    previews: ordered.map((item) => item.preview),
    kits: [{
      ...baseKit,
      components: [
        ...baseKit.components.filter((component) => component.kind === 'printed-tool'),
        {
          id: `${slug(base.id)}:component:guide`,
          kind: 'digital-guide',
          name: 'AI decoration guide and true-size transfer sheet',
          quantity: 1,
          unit: 'download',
          required: true,
          previewArtifactId: selectedPreview.id,
        },
        ...selectedGelComponents,
      ],
      metadata: {
        checkoutLockedReason: 'AI decoration, palette, and deposited-width rules require physical calibration and approval.',
      },
    }],
    metadata: {
      ...base.metadata,
      prototype: false,
      generatedByAI: true,
      physicalScale,
      generationId: generation.generationId,
      generationModel: generation.model,
      generationCreatedAt: generation.createdAt,
      selectedCandidateId: selected.candidate.id,
      candidateCount: parts.length,
      selectedCandidateScore: selected.evaluation.score,
      selectedCandidateDisposition: selected.evaluation.disposition,
      candidateEvaluations: ranked.map((evaluation) => ({
        candidateId: evaluation.candidateId,
        score: evaluation.score,
        disposition: evaluation.disposition,
        findingCount: evaluation.findings.length,
      })),
      tokenUsage: generation.usage ?? null,
      checkoutLocked: true,
    },
  })
  assertValidCookieProjectRevision(project)
  return project
}

function registeredGeometryFingerprint(design: DesignSpec): string {
  return JSON.stringify({ contours: design.contours, strokes: design.strokes, target: design.target })
}

/** Preserves authored decoration when cutter-only parameters change. */
export function rebaseCookieProjectDesign(
  project: CookieProjectRevision,
  design: DesignSpec,
  physicalScale: number
): CookieProjectRevision | null {
  const current = project.designs[0]
  if (!current || registeredGeometryFingerprint(current.designSpec) !== registeredGeometryFingerprint(design)) return null
  const cloned = JSON.parse(JSON.stringify(project)) as CookieProjectRevision
  cloned.designs[0].designSpec = design
  cloned.decorations.forEach((decoration) => {
    decoration.registration.designSpecId = design.id
  })
  cloned.metadata = { ...(cloned.metadata ?? {}), physicalScale }
  const sealed = sealCookieProjectRevision(cloned)
  assertValidCookieProjectRevision(sealed)
  return sealed
}
