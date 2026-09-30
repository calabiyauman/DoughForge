import type { ClosedContour, DesignSpec, JsonObject, Point2D } from '../design/types'
import { sealCookieProjectRevision } from './hash'
import { assertValidCookieProjectRevision } from './validation'
import {
  DEFAULT_PROJECT_PALETTES,
  TRUSTED_COLOR_CATALOG,
  requestedColorKeys
} from './colorCatalog'
import {
  COOKIE_DESIGN_REVISION_SCHEMA,
  COOKIE_DESIGN_REVISION_VERSION,
  COOKIE_PROJECT_REVISION_SCHEMA,
  COOKIE_PROJECT_REVISION_VERSION,
  DECORATION_SPEC_SCHEMA,
  DECORATION_SPEC_VERSION,
  KIT_BOM_SCHEMA,
  KIT_BOM_VERSION,
  PALETTE_SPEC_SCHEMA,
  PALETTE_SPEC_VERSION,
  PREVIEW_ARTIFACT_SCHEMA,
  PREVIEW_ARTIFACT_VERSION,
  PROJECT_BRIEF_SCHEMA,
  PROJECT_BRIEF_VERSION,
  type CookieProjectRevision,
  type DecorationDifficulty,
  type DecorationRegion,
  type DecorationStep,
  type DecorationStroke,
  type GelColorSku,
  type PaletteColor,
  type ProjectBrief
} from './types'

export interface PrototypeProjectOptions {
  prompt?: string
  title?: string
  difficulty?: DecorationDifficulty
  requestedColors?: string[]
  createdAt?: string
  projectId?: string
  revisionNumber?: number
  physicalScale?: number
  metadata?: JsonObject
}

type Bounds = {
  minX: number
  minY: number
  maxX: number
  maxY: number
  width: number
  height: number
  center: Point2D
}

function slug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'cookie-project'
}

function classifySubject(value: string): keyof typeof DEFAULT_PROJECT_PALETTES {
  const normalized = value.toLowerCase()
  if (/butterfl(?:y|ies)/.test(normalized)) return 'butterfly'
  if (/heart|valentine|love/.test(normalized)) return 'heart'
  if (/star|celestial/.test(normalized)) return 'star'
  if (/cat|kitten|feline/.test(normalized)) return 'cat'
  if (/circle|round|ornament|plaque/.test(normalized)) return 'circle'
  return 'generic'
}

function outerContour(design: DesignSpec): ClosedContour {
  const contour = design.contours.find((candidate) => (
    candidate.role === 'cut' && candidate.relationship.kind === 'outer'
  )) ?? design.contours.find((candidate) => candidate.relationship.kind === 'outer')
  if (!contour || contour.points.length < 3) {
    throw new Error('A cookie project requires at least one closed outer contour')
  }
  return contour
}

function contourHoles(design: DesignSpec, outerContourId: string): Point2D[][] {
  return design.contours
    .filter((contour) => (
      contour.relationship.kind === 'hole'
      && contour.relationship.outerContourId === outerContourId
    ))
    .map((contour) => contour.points.map((point) => ({ ...point })))
}

function getBounds(points: readonly Point2D[]): Bounds {
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
    center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }
  }
}

function scalePoints(points: readonly Point2D[], center: Point2D, scale: number): Point2D[] {
  return points.map((point) => ({
    x: center.x + (point.x - center.x) * scale,
    y: center.y + (point.y - center.y) * scale
  }))
}

function ellipse(center: Point2D, radiusX: number, radiusY: number, segments = 20): Point2D[] {
  return Array.from({ length: segments }, (_, index) => {
    const angle = (index / segments) * Math.PI * 2
    return {
      x: center.x + Math.cos(angle) * radiusX,
      y: center.y + Math.sin(angle) * radiusY
    }
  })
}

function point(bounds: Bounds, x: number, y: number): Point2D {
  return {
    x: bounds.minX + bounds.width * x,
    y: bounds.minY + bounds.height * y
  }
}

function paletteDefinitions(subject: keyof typeof DEFAULT_PROJECT_PALETTES, prompt: string, explicit: readonly string[]) {
  const requested = requestedColorKeys(prompt, explicit)
  const keys = [...requested, ...DEFAULT_PROJECT_PALETTES[subject], 'white']
  return [...new Set(keys)].slice(0, 4).map((key) => TRUSTED_COLOR_CATALOG[key])
}

function buildPalette(
  prefix: string,
  subject: keyof typeof DEFAULT_PROJECT_PALETTES,
  prompt: string,
  requestedColors: readonly string[]
) {
  const definitions = paletteDefinitions(subject, prompt, requestedColors)
  const colors: PaletteColor[] = definitions.map((definition, index) => ({
    id: `${prefix}:color:${slug(definition.key)}`,
    name: definition.name,
    target: { hex: definition.hex },
    role: index === 0 ? 'base' : index === 1 ? 'outline' : index === 2 ? 'accent' : 'neutral',
    recipeId: `${prefix}:recipe:${slug(definition.key)}`
  }))
  const gelSkus: GelColorSku[] = definitions
    .filter((definition) => definition.gelName)
    .map((definition) => ({
      id: `${prefix}:gel:${slug(definition.key)}`,
      brand: 'AmeriColor — prototype mapping',
      sku: `prototype:${slug(definition.gelName ?? definition.key)}`,
      name: `${definition.gelName} Soft Gel Paste`,
      metadata: { verificationStatus: 'prototype-unverified' }
    }))

  return {
    schema: PALETTE_SPEC_SCHEMA,
    version: PALETTE_SPEC_VERSION,
    id: `${prefix}:palette`,
    name: 'Matched project palette',
    colors,
    gelSkus,
    recipes: definitions.map((definition, index) => {
      const gel = gelSkus.find((candidate) => candidate.id.endsWith(`:${slug(definition.key)}`))
      return {
        id: `${prefix}:recipe:${slug(definition.key)}`,
        colorId: colors[index].id,
        baseIcingGrams: index === 0 ? 120 : 45,
        additions: gel ? [{ gelSkuId: gel.id, amount: 1, unit: 'drop' as const }] : [],
        restMinutes: gel ? 30 : 0,
        notes: gel
          ? 'Prototype starting ratio only. Verify against a cured icing swatch before production.'
          : 'Use untinted royal icing.'
      }
    }),
    disclaimer: 'Prototype palette. Screen color and icing color vary; recipes require test-kitchen verification before sale.',
    metadata: { verificationStatus: 'prototype-unverified', supportedBrandCount: 1 }
  }
}

function addRegion(
  regions: DecorationRegion[],
  id: string,
  name: string,
  outer: Point2D[],
  fillColorId: string
) {
  regions.push({
    id,
    name,
    outer,
    holes: [],
    sourceGeometryIds: [],
    fillColorId
  })
}

function addStroke(
  strokes: DecorationStroke[],
  id: string,
  name: string,
  points: Point2D[],
  colorId: string,
  width: number,
  closed = false
) {
  strokes.push({
    id,
    name,
    points,
    width,
    closed,
    sourceGeometryIds: [],
    colorId,
    lineCap: 'round',
    lineJoin: 'round'
  })
}

function buildDecorationGeometry(
  prefix: string,
  subject: keyof typeof DEFAULT_PROJECT_PALETTES,
  outline: ClosedContour,
  design: DesignSpec,
  colorIds: string[]
): { regions: DecorationRegion[]; strokes: DecorationStroke[] } {
  const bounds = getBounds(outline.points)
  const minimumDimension = Math.max(1, Math.min(bounds.width, bounds.height))
  const regions: DecorationRegion[] = [{
    id: `${prefix}:region:base`,
    name: 'Base flood',
    outer: outline.points.map((item) => ({ ...item })),
    holes: contourHoles(design, outline.id),
    sourceGeometryIds: [outline.id],
    fillColorId: colorIds[0]
  }]
  const strokes: DecorationStroke[] = []
  const borderId = `${prefix}:stroke:border`
  addStroke(
    strokes,
    borderId,
    'Inset piped border',
    scalePoints(outline.points, bounds.center, 0.88),
    colorIds[1] ?? colorIds[0],
    Math.max(0.65, minimumDimension * 0.018),
    true
  )

  const accent = colorIds[2] ?? colorIds[1] ?? colorIds[0]
  const neutral = colorIds[3] ?? colorIds[1] ?? colorIds[0]
  const thin = Math.max(0.55, minimumDimension * 0.014)

  if (subject === 'butterfly') {
    addRegion(regions, `${prefix}:region:body`, 'Butterfly body', ellipse(bounds.center, bounds.width * 0.045, bounds.height * 0.28), accent)
    for (const [index, position] of [
      [0.31, 0.64], [0.69, 0.64], [0.34, 0.36], [0.66, 0.36]
    ].entries()) {
      addRegion(
        regions,
        `${prefix}:region:wing-dot-${index + 1}`,
        `Wing accent ${index + 1}`,
        ellipse(point(bounds, position[0], position[1]), bounds.width * 0.055, bounds.height * 0.045, 16),
        neutral
      )
    }
    addStroke(strokes, `${prefix}:stroke:antenna-left`, 'Left antenna', [
      point(bounds, 0.48, 0.69), point(bounds, 0.42, 0.8), point(bounds, 0.36, 0.84)
    ], accent, thin)
    addStroke(strokes, `${prefix}:stroke:antenna-right`, 'Right antenna', [
      point(bounds, 0.52, 0.69), point(bounds, 0.58, 0.8), point(bounds, 0.64, 0.84)
    ], accent, thin)
  } else if (subject === 'cat') {
    addRegion(regions, `${prefix}:region:left-eye`, 'Left eye', ellipse(point(bounds, 0.39, 0.58), bounds.width * 0.035, bounds.height * 0.045, 14), accent)
    addRegion(regions, `${prefix}:region:right-eye`, 'Right eye', ellipse(point(bounds, 0.61, 0.58), bounds.width * 0.035, bounds.height * 0.045, 14), accent)
    addRegion(regions, `${prefix}:region:nose`, 'Nose', [
      point(bounds, 0.46, 0.46), point(bounds, 0.54, 0.46), point(bounds, 0.5, 0.4)
    ], neutral)
    addStroke(strokes, `${prefix}:stroke:mouth`, 'Mouth', [
      point(bounds, 0.5, 0.4), point(bounds, 0.46, 0.34), point(bounds, 0.42, 0.36),
      point(bounds, 0.5, 0.4), point(bounds, 0.54, 0.34), point(bounds, 0.58, 0.36)
    ], accent, thin)
    for (const [index, y] of [0.41, 0.35].entries()) {
      addStroke(strokes, `${prefix}:stroke:whiskers-${index + 1}`, 'Whiskers', [
        point(bounds, 0.45, y), point(bounds, 0.24, y + 0.03),
        point(bounds, 0.55, y), point(bounds, 0.76, y + 0.03)
      ], accent, thin)
    }
  } else if (subject === 'heart') {
    addStroke(strokes, `${prefix}:stroke:heart-highlight`, 'Heart highlight', [
      point(bounds, 0.32, 0.63), point(bounds, 0.39, 0.72), point(bounds, 0.49, 0.69)
    ], neutral, thin * 1.25)
    for (const [index, position] of [[0.38, 0.43], [0.5, 0.32], [0.62, 0.43]].entries()) {
      addRegion(regions, `${prefix}:region:dot-${index + 1}`, `Pearl ${index + 1}`,
        ellipse(point(bounds, position[0], position[1]), minimumDimension * 0.024, minimumDimension * 0.024, 12), accent)
    }
  } else if (subject === 'star') {
    addRegion(
      regions,
      `${prefix}:region:center-star`,
      'Center star',
      scalePoints(outline.points, bounds.center, 0.38),
      accent
    )
    for (const [index, position] of [[0.35, 0.54], [0.65, 0.54], [0.5, 0.7]].entries()) {
      addRegion(regions, `${prefix}:region:sparkle-${index + 1}`, `Sparkle ${index + 1}`,
        ellipse(point(bounds, position[0], position[1]), minimumDimension * 0.018, minimumDimension * 0.018, 10), neutral)
    }
  } else {
    addRegion(
      regions,
      `${prefix}:region:center-medallion`,
      'Center medallion',
      ellipse(bounds.center, bounds.width * 0.2, bounds.height * 0.2, 24),
      accent
    )
    addStroke(strokes, `${prefix}:stroke:center-highlight`, 'Center highlight', [
      point(bounds, 0.4, 0.5), point(bounds, 0.47, 0.58), point(bounds, 0.56, 0.56), point(bounds, 0.62, 0.49)
    ], neutral, thin * 1.2)
  }

  return { regions, strokes }
}

function buildSteps(prefix: string, regions: DecorationRegion[], strokes: DecorationStroke[], colorIds: string[]): DecorationStep[] {
  const detailRegionIds = regions.slice(1).map((region) => region.id)
  const detailStrokeIds = strokes.filter((stroke) => !stroke.id.endsWith(':border')).map((stroke) => stroke.id)
  const steps: DecorationStep[] = [{
    id: `${prefix}:step:base`,
    sequence: 1,
    title: 'Outline and flood the base',
    instructions: 'Pipe the outside edge, immediately flood the interior, then settle bubbles with a scribe.',
    technique: 'flood',
    regionIds: [regions[0].id],
    strokeIds: [],
    colorIds: [colorIds[0]],
    dependsOnStepIds: [],
    icingConsistency: 'flood',
    dryTimeMinutes: 30,
    tool: 'Tipless piping bag and scribe'
  }, {
    id: `${prefix}:step:border`,
    sequence: 2,
    title: 'Pipe the registered border',
    instructions: 'Follow the inset guide with even pressure. The guide uses the same coordinates as the cutter outline.',
    technique: 'outline',
    regionIds: [],
    strokeIds: strokes.filter((stroke) => stroke.id.endsWith(':border')).map((stroke) => stroke.id),
    colorIds: [colorIds[1] ?? colorIds[0]],
    dependsOnStepIds: [`${prefix}:step:base`],
    icingConsistency: 'piping',
    dryTimeMinutes: 10,
    tool: 'Fine tipless piping bag'
  }]

  if (detailRegionIds.length || detailStrokeIds.length) {
    steps.push({
      id: `${prefix}:step:details`,
      sequence: 3,
      title: 'Add the focal details',
      instructions: 'Pipe the accent regions and lines in the numbered order shown. Keep the pressure light on fine details.',
      technique: 'piped-detail',
      regionIds: detailRegionIds,
      strokeIds: detailStrokeIds,
      colorIds: colorIds.slice(2).length ? colorIds.slice(2) : [colorIds[0]],
      dependsOnStepIds: [`${prefix}:step:border`],
      icingConsistency: 'medium',
      dryTimeMinutes: 20,
      tool: 'Detail bag or PME 1.5 tip'
    })
  }

  steps.push({
    id: `${prefix}:step:finish`,
    sequence: steps.length + 1,
    title: 'Dry and quality-check',
    instructions: 'Allow the cookie to dry uncovered until the icing is firm. Compare alignment and color with the project card.',
    technique: 'finish',
    regionIds: [],
    strokeIds: [],
    colorIds: [],
    dependsOnStepIds: [steps[steps.length - 1].id],
    dryTimeMinutes: 360,
    tool: 'Drying tray'
  })
  return steps
}

/**
 * Produces the first end-to-end project contract from a validated DesignSpec.
 * It is deliberately marked production-validation: palette recipes and the
 * generated guide must be physically verified before checkout can unlock.
 */
export function createPrototypeCookieProject(
  design: DesignSpec,
  options: PrototypeProjectOptions = {}
): CookieProjectRevision {
  const createdAt = options.createdAt ?? new Date().toISOString()
  const prompt = options.prompt?.trim() || design.name
  const title = options.title?.trim() || design.name
  const projectId = options.projectId ?? `project:${slug(title)}`
  const revisionNumber = options.revisionNumber ?? 1
  const revisionId = `${projectId}:revision:${revisionNumber}`
  const prefix = slug(revisionId)
  const physicalScale = options.physicalScale ?? 1
  const subject = classifySubject(`${prompt} ${design.name}`)
  const palette = buildPalette(prefix, subject, prompt, options.requestedColors ?? [])
  const designRevisionId = `${prefix}:design:1`
  const decorationId = `${prefix}:decoration:1`
  const outline = outerContour(design)
  const colorIds = palette.colors.map((color) => color.id)
  const { regions, strokes } = buildDecorationGeometry(prefix, subject, outline, design, colorIds)
  const brief: ProjectBrief = {
    schema: PROJECT_BRIEF_SCHEMA,
    version: PROJECT_BRIEF_VERSION,
    id: `${prefix}:brief`,
    title,
    prompt,
    createdAt,
    requestedDesignCount: 1,
    difficulty: options.difficulty ?? 'easy',
    styles: ['production-faithful', 'royal-icing'],
    requestedColors: requestedColorKeys(prompt, options.requestedColors ?? []),
    avoid: [],
    personalization: [],
    inspirationAssets: [],
    targetCookieSize: { ...design.target.size },
    preferredTooling: ['cutter', 'transfer-template'],
    rightsAttestation: { userOwnsOrMayUseInputs: false },
    metadata: { prototype: true, subject }
  }

  const gelComponents = palette.gelSkus.map((gel) => ({
    id: `${prefix}:component:${slug(gel.name)}`,
    kind: 'gel-color' as const,
    name: gel.name,
    quantity: 1,
    unit: 'bottle' as const,
    required: true,
    paletteSpecId: palette.id,
    gelSkuId: gel.id,
    metadata: { verificationStatus: 'prototype-unverified' }
  }))

  const project = sealCookieProjectRevision({
    schema: COOKIE_PROJECT_REVISION_SCHEMA,
    version: COOKIE_PROJECT_REVISION_VERSION,
    id: revisionId,
    projectId,
    revisionNumber,
    createdAt,
    lifecycle: 'production-validation',
    brief,
    designs: [{
      schema: COOKIE_DESIGN_REVISION_SCHEMA,
      version: COOKIE_DESIGN_REVISION_VERSION,
      id: designRevisionId,
      name: design.name,
      createdAt,
      sourceBriefId: brief.id,
      ordinal: 1,
      designSpec: design,
      metadata: { prototype: true }
    }],
    decorations: [{
      schema: DECORATION_SPEC_SCHEMA,
      version: DECORATION_SPEC_VERSION,
      id: decorationId,
      name: `${design.name} royal-icing plan`,
      designRevisionId,
      paletteSpecId: palette.id,
      difficulty: options.difficulty ?? 'easy',
      estimatedMinutes: 35,
      registration: {
        designSpecId: design.id,
        coordinateSpace: 'design-canvas',
        transform: [1, 0, 0, 1, 0, 0]
      },
      regions,
      strokes,
      steps: buildSteps(prefix, regions, strokes, colorIds),
      metadata: { prototype: true, subject }
    }],
    palettes: [palette],
    previews: [{
      schema: PREVIEW_ARTIFACT_SCHEMA,
      version: PREVIEW_ARTIFACT_VERSION,
      id: `${prefix}:preview:decorated`,
      kind: 'decorated-cookie',
      fidelity: 'production-faithful',
      uri: `urn:doughforge:${prefix}:decorated-cookie`,
      mimeType: 'image/svg+xml',
      altText: `Production preview of ${design.name} decorated with royal icing`,
      createdAt,
      designRevisionIds: [designRevisionId],
      decorationSpecIds: [decorationId],
      paletteSpecIds: [palette.id],
      generator: { name: 'doughforge-prototype-planner', version: '1' }
    }],
    kits: [{
      schema: KIT_BOM_SCHEMA,
      version: KIT_BOM_VERSION,
      id: `${prefix}:kit:complete`,
      name: `${design.name} complete project kit`,
      status: 'draft',
      currency: 'USD',
      components: [{
        id: `${prefix}:component:cutter`,
        kind: 'printed-tool',
        name: `${design.name} cutter`,
        quantity: 1,
        unit: 'piece',
        required: true,
        designRevisionId,
        metadata: { validationRequired: true }
      }, {
        id: `${prefix}:component:guide`,
        kind: 'digital-guide',
        name: 'Decoration guide and true-size transfer sheet',
        quantity: 1,
        unit: 'download',
        required: true,
        previewArtifactId: `${prefix}:preview:decorated`
      }, ...gelComponents],
      metadata: {
        checkoutLockedReason: 'Physical palette and manufacturing QA are not yet verified.'
      }
    }],
    metadata: {
      prototype: true,
      sharedCoordinateFrame: 'design-canvas',
      physicalScale,
      checkoutLocked: true,
      ...(options.metadata ?? {})
    }
  })
  assertValidCookieProjectRevision(project)
  return project
}
