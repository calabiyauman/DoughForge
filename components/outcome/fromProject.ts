import type { Point2D, Transform2D } from '@/lib/design/types'
import type {
  CookieProjectRevision,
  DecorationSpec,
  KitBOMComponent
} from '@/lib/project/types'
import type {
  CookieOutcomeDifficulty,
  CookieOutcomeViewModel,
  OutcomeColorRecipeAddition,
  OutcomeKitComponentKind
} from './types'

export interface OutcomeSelection {
  designRevisionId?: string
  decorationSpecId?: string
  kitId?: string
}

function applyTransform(point: Point2D, transform: Transform2D): Point2D {
  const [a, b, c, d, e, f] = transform
  return {
    x: a * point.x + c * point.y + e,
    y: b * point.x + d * point.y + f
  }
}

function scalePoint(point: Point2D, scale: number): Point2D {
  return { x: point.x * scale, y: point.y * scale }
}

function mapDifficulty(value: DecorationSpec['difficulty']): CookieOutcomeDifficulty {
  return value === 'detailed' ? 'intermediate' : 'easy'
}

function mapRecipeUnit(unit: 'drop' | 'gram'): OutcomeColorRecipeAddition['unit'] {
  return unit === 'drop' ? 'drops' : 'grams'
}

function mapComponentKind(component: KitBOMComponent): OutcomeKitComponentKind {
  switch (component.kind) {
    case 'printed-tool':
      return /stamp|emboss/i.test(component.name) ? 'stamp' : 'cutter'
    case 'stencil':
      return 'stencil'
    case 'digital-guide':
    case 'transfer-template':
      return 'guide'
    case 'gel-color':
      return 'gel'
    case 'supply':
    case 'packaging':
      return 'supply'
  }
}

function requireItem<T>(item: T | undefined, message: string): T {
  if (!item) throw new Error(message)
  return item
}

/** Selects a coherent registered outcome from a complete project revision. */
export function cookieProjectToOutcomeViewModel(
  project: CookieProjectRevision,
  selection: OutcomeSelection = {}
): CookieOutcomeViewModel {
  const decoration = requireItem(
    selection.decorationSpecId
      ? project.decorations.find((item) => item.id === selection.decorationSpecId)
      : selection.designRevisionId
        ? project.decorations.find((item) => item.designRevisionId === selection.designRevisionId)
        : project.decorations[0],
    'The project does not contain a decoration plan for this selection'
  )
  const designRevision = requireItem(
    project.designs.find((item) => item.id === (selection.designRevisionId ?? decoration.designRevisionId)),
    `Decoration plan references missing design revision "${decoration.designRevisionId}"`
  )
  const palette = requireItem(
    project.palettes.find((item) => item.id === decoration.paletteSpecId),
    `Decoration plan references missing palette "${decoration.paletteSpecId}"`
  )
  const kit = requireItem(
    selection.kitId
      ? project.kits.find((item) => item.id === selection.kitId)
      : project.kits.find((item) => (
        item.components.some((component) => component.designRevisionId === designRevision.id)
        || item.components.some((component) => component.paletteSpecId === palette.id)
      )) ?? project.kits[0],
    'The project does not contain a kit bill of materials'
  )
  const design = designRevision.designSpec
  const outer = requireItem(
    design.contours.find((contour) => (
      contour.role === 'cut' && contour.relationship.kind === 'outer'
    )) ?? design.contours.find((contour) => contour.relationship.kind === 'outer'),
    `Design "${design.id}" does not contain an outer contour`
  )
  const holes = design.contours
    .filter((contour) => (
      contour.relationship.kind === 'hole'
      && contour.relationship.outerContourId === outer.id
    ))
    .map((contour) => contour.points.map((point) => ({ ...point })))
  const gelComponentById = new Map(
    kit.components
      .filter((component) => component.gelSkuId)
      .map((component) => [component.gelSkuId as string, component])
  )
  const physicalScaleValue = Number(project.metadata?.physicalScale ?? 1)
  const physicalScale = Number.isFinite(physicalScaleValue) && physicalScaleValue > 0
    ? physicalScaleValue
    : 1
  const generationScore = Number(project.metadata?.selectedCandidateScore)
  const candidateCount = Number(project.metadata?.candidateCount)
  const disposition = project.metadata?.selectedCandidateDisposition
  const generationModel = project.metadata?.generationModel

  return {
    id: project.id,
    projectId: project.projectId,
    revisionNumber: project.revisionNumber,
    lifecycle: project.lifecycle,
    title: project.brief.title,
    description: project.brief.prompt,
    difficulty: mapDifficulty(decoration.difficulty),
    estimatedMinutes: decoration.estimatedMinutes,
    design: {
      id: designRevision.id,
      name: designRevision.name,
      outerContour: outer.points.map((point) => scalePoint(point, physicalScale)),
      holes: holes.map((hole) => hole.map((point) => scalePoint(point, physicalScale))),
      sizeMm: {
        width: design.target.size.width * physicalScale,
        height: design.target.size.height * physicalScale
      }
    },
    decoration: {
      name: decoration.name,
      regions: decoration.regions.map((region) => ({
        id: region.id,
        name: region.name,
        outer: region.outer.map((point) => scalePoint(applyTransform(point, decoration.registration.transform), physicalScale)),
        holes: region.holes.map((hole) => (
          hole.map((point) => scalePoint(applyTransform(point, decoration.registration.transform), physicalScale))
        )),
        fillColorId: region.fillColorId
      })),
      strokes: decoration.strokes.map((stroke) => ({
        id: stroke.id,
        name: stroke.name,
        points: stroke.points.map((point) => scalePoint(applyTransform(point, decoration.registration.transform), physicalScale)),
        width: stroke.width * physicalScale,
        colorId: stroke.colorId,
        closed: stroke.closed
      })),
      lettering: (decoration.lettering ?? []).map((lettering) => ({
        id: lettering.id,
        name: lettering.name,
        text: lettering.text,
        position: scalePoint(applyTransform(lettering.position, decoration.registration.transform), physicalScale),
        maxWidth: lettering.maxWidth * physicalScale,
        fontSize: lettering.fontSize * physicalScale,
        strokeWidth: lettering.strokeWidth * physicalScale,
        colorId: lettering.colorId,
        style: lettering.style,
        technique: lettering.technique,
        align: lettering.align,
        rotationDegrees: lettering.rotationDegrees
      })),
      steps: decoration.steps.map((step) => ({
        id: step.id,
        sequence: step.sequence,
        title: step.title,
        instructions: step.instructions,
        technique: step.technique,
        regionIds: [...step.regionIds],
        strokeIds: [...step.strokeIds],
        colorIds: [...step.colorIds],
        icingConsistency: step.icingConsistency,
        dryTimeMinutes: step.dryTimeMinutes
      }))
    },
    generation: {
      source: project.metadata?.generatedByAI === true ? 'ai' : 'prototype',
      ...(typeof generationModel === 'string' ? { model: generationModel } : {}),
      ...(Number.isFinite(generationScore) ? { score: generationScore } : {}),
      ...(disposition === 'eligible' || disposition === 'repair' || disposition === 'reject'
        ? { disposition }
        : {}),
      ...(Number.isInteger(candidateCount) && candidateCount > 0 ? { candidateCount } : {})
    },
    palette: {
      name: palette.name,
      colors: palette.colors.map((color) => ({
        id: color.id,
        name: color.name,
        hex: color.target.hex,
        role: color.role
      })),
      gelSkus: palette.gelSkus.map((gel) => {
        const component = gelComponentById.get(gel.id)
        return {
          id: gel.id,
          brand: gel.brand,
          sku: gel.sku,
          name: gel.name,
          packageGrams: gel.packageGrams,
          price: component?.unitPriceMinor === undefined
            ? undefined
            : component.unitPriceMinor / 100
        }
      }),
      recipes: palette.recipes.map((recipe) => ({
        id: recipe.id,
        colorId: recipe.colorId,
        baseIcingGrams: recipe.baseIcingGrams,
        additions: recipe.additions.map((addition) => ({
          gelSkuId: addition.gelSkuId,
          amount: addition.amount,
          unit: mapRecipeUnit(addition.unit)
        })),
        restMinutes: recipe.restMinutes,
        note: recipe.notes
      }))
    },
    kit: {
      id: kit.id,
      name: kit.name,
      status: kit.status,
      currency: kit.currency,
      components: kit.components.map((component) => ({
        id: component.id,
        kind: mapComponentKind(component),
        name: component.name,
        description: component.metadata?.description
          ? String(component.metadata.description)
          : undefined,
        quantity: component.quantity,
        sellableSku: component.sellableSku,
        gelSkuId: component.gelSkuId,
        unitPrice: component.unitPriceMinor === undefined
          ? undefined
          : component.unitPriceMinor / 100,
        included: component.unitPriceMinor === undefined || component.unitPriceMinor === 0
      }))
    }
  }
}
