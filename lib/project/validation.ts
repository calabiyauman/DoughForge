import { validateDesignSpec } from '../design/validation'
import { computeCookieProjectRevisionHash } from './hash'
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
  PROJECT_VALIDATION_REPORT_SCHEMA,
  PROJECT_VALIDATION_REPORT_VERSION,
  type CookieProjectRevision,
  type DecorationSpec,
  type PaletteSpec,
  type ProjectValidationIssue,
  type ProjectValidationReport,
  type ProjectValidationSeverity
} from './types'

export interface ValidateCookieProjectRevisionOptions {
  reportId?: string
  /** Defaults to revision.createdAt to keep validation deterministic. */
  evaluatedAt?: string
  verifyContentHash?: boolean
}

export class CookieProjectValidationError extends Error {
  readonly report: ProjectValidationReport

  constructor(report: ProjectValidationReport) {
    super(`Invalid CookieProjectRevision: ${report.issues.map((issue) => `${issue.path} ${issue.message}`).join('; ')}`)
    this.name = 'CookieProjectValidationError'
    this.report = report
  }
}

function addIssue(
  issues: ProjectValidationIssue[],
  path: string,
  code: string,
  message: string,
  severity: ProjectValidationSeverity = 'error',
  relatedIds?: string[]
): void {
  issues.push({ path, code, message, severity, ...(relatedIds ? { relatedIds } : {}) })
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function validateIdentifier(
  value: unknown,
  path: string,
  issues: ProjectValidationIssue[]
): value is string {
  if (!isNonEmptyString(value)) {
    addIssue(issues, path, 'required_string', 'must be a non-empty string')
    return false
  }
  return true
}

function validateSchema(
  actualSchema: unknown,
  expectedSchema: string,
  actualVersion: unknown,
  expectedVersion: number,
  path: string,
  issues: ProjectValidationIssue[]
): void {
  if (actualSchema !== expectedSchema) {
    addIssue(issues, `${path}schema`, 'schema', `must equal "${expectedSchema}"`)
  }
  if (actualVersion !== expectedVersion) {
    addIssue(issues, `${path}version`, 'version', `must equal ${expectedVersion}`)
  }
}

function collectUniqueIds<T extends { id: string }>(
  items: readonly T[],
  path: string,
  issues: ProjectValidationIssue[]
): Map<string, T> {
  const result = new Map<string, T>()
  items.forEach((item, index) => {
    if (!validateIdentifier(item.id, `${path}[${index}].id`, issues)) return
    if (result.has(item.id)) {
      addIssue(issues, `${path}[${index}].id`, 'duplicate_id', `ID "${item.id}" must be unique`, 'error', [item.id])
    } else {
      result.set(item.id, item)
    }
  })
  return result
}

function checkReferences(
  references: readonly string[],
  knownIds: ReadonlySet<string>,
  path: string,
  code: string,
  label: string,
  issues: ProjectValidationIssue[]
): void {
  const seen = new Set<string>()
  references.forEach((id, index) => {
    const referencePath = `${path}[${index}]`
    if (!validateIdentifier(id, referencePath, issues)) return
    if (seen.has(id)) {
      addIssue(issues, referencePath, 'duplicate_reference', `must not repeat ${label} "${id}"`, 'error', [id])
    }
    seen.add(id)
    if (!knownIds.has(id)) {
      addIssue(issues, referencePath, code, `references unknown ${label} "${id}"`, 'error', [id])
    }
  })
}

function validatePositiveNumber(
  value: unknown,
  path: string,
  issues: ProjectValidationIssue[],
  allowZero = false
): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || (allowZero ? value < 0 : value <= 0)) {
    addIssue(
      issues,
      path,
      allowZero ? 'non_negative_number' : 'positive_number',
      allowZero ? 'must be a finite non-negative number' : 'must be a finite number greater than zero'
    )
  }
}

function validatePalette(
  palette: PaletteSpec,
  index: number,
  issues: ProjectValidationIssue[]
): void {
  const path = `palettes[${index}]`
  validateSchema(
    palette.schema,
    PALETTE_SPEC_SCHEMA,
    palette.version,
    PALETTE_SPEC_VERSION,
    `${path}.`,
    issues
  )
  const colors = collectUniqueIds(palette.colors, `${path}.colors`, issues)
  const gelSkus = collectUniqueIds(palette.gelSkus, `${path}.gelSkus`, issues)
  const recipes = collectUniqueIds(palette.recipes, `${path}.recipes`, issues)

  palette.colors.forEach((color, colorIndex) => {
    const colorPath = `${path}.colors[${colorIndex}]`
    if (!/^#[0-9a-f]{6}$/i.test(color.target.hex)) {
      addIssue(issues, `${colorPath}.target.hex`, 'hex_color', 'must be a six-digit sRGB hex color such as #A1B2C3')
    }
    if (color.recipeId && !recipes.has(color.recipeId)) {
      addIssue(
        issues,
        `${colorPath}.recipeId`,
        'unknown_recipe',
        `references unknown recipe "${color.recipeId}"`,
        'error',
        [color.recipeId]
      )
    }
  })

  palette.gelSkus.forEach((gel, gelIndex) => {
    validateIdentifier(gel.brand, `${path}.gelSkus[${gelIndex}].brand`, issues)
    validateIdentifier(gel.sku, `${path}.gelSkus[${gelIndex}].sku`, issues)
    if (gel.packageGrams !== undefined) {
      validatePositiveNumber(gel.packageGrams, `${path}.gelSkus[${gelIndex}].packageGrams`, issues)
    }
  })

  palette.recipes.forEach((recipe, recipeIndex) => {
    const recipePath = `${path}.recipes[${recipeIndex}]`
    if (!colors.has(recipe.colorId)) {
      addIssue(issues, `${recipePath}.colorId`, 'unknown_color', `references unknown color "${recipe.colorId}"`, 'error', [recipe.colorId])
    }
    validatePositiveNumber(recipe.baseIcingGrams, `${recipePath}.baseIcingGrams`, issues)
    // An empty addition list intentionally represents untinted base icing.
    recipe.additions.forEach((addition, additionIndex) => {
      const additionPath = `${recipePath}.additions[${additionIndex}]`
      if (!gelSkus.has(addition.gelSkuId)) {
        addIssue(
          issues,
          `${additionPath}.gelSkuId`,
          'unknown_gel_sku',
          `references unknown gel SKU "${addition.gelSkuId}"`,
          'error',
          [addition.gelSkuId]
        )
      }
      validatePositiveNumber(addition.amount, `${additionPath}.amount`, issues)
    })
    if (recipe.restMinutes !== undefined) {
      validatePositiveNumber(recipe.restMinutes, `${recipePath}.restMinutes`, issues, true)
    }
  })
}

function validateDecoration(
  decoration: DecorationSpec,
  index: number,
  designById: Map<string, CookieProjectRevision['designs'][number]>,
  paletteById: Map<string, PaletteSpec>,
  issues: ProjectValidationIssue[]
): void {
  const path = `decorations[${index}]`
  validateSchema(
    decoration.schema,
    DECORATION_SPEC_SCHEMA,
    decoration.version,
    DECORATION_SPEC_VERSION,
    `${path}.`,
    issues
  )
  const design = designById.get(decoration.designRevisionId)
  if (!design) {
    addIssue(
      issues,
      `${path}.designRevisionId`,
      'unknown_design_revision',
      `references unknown design revision "${decoration.designRevisionId}"`,
      'error',
      [decoration.designRevisionId]
    )
  } else if (decoration.registration.designSpecId !== design.designSpec.id) {
    addIssue(
      issues,
      `${path}.registration.designSpecId`,
      'design_registration_mismatch',
      `must equal the referenced DesignSpec ID "${design.designSpec.id}"`,
      'error',
      [decoration.registration.designSpecId, design.designSpec.id]
    )
  }

  const palette = paletteById.get(decoration.paletteSpecId)
  if (!palette) {
    addIssue(
      issues,
      `${path}.paletteSpecId`,
      'unknown_palette',
      `references unknown palette "${decoration.paletteSpecId}"`,
      'error',
      [decoration.paletteSpecId]
    )
  }
  if (
    decoration.registration.transform.length !== 6
    || !decoration.registration.transform.every((value) => Number.isFinite(value))
  ) {
    addIssue(issues, `${path}.registration.transform`, 'affine_transform', 'must contain six finite matrix values')
  }

  const geometryIds = new Set<string>()
  design?.designSpec.contours.forEach((item) => geometryIds.add(item.id))
  design?.designSpec.strokes.forEach((item) => geometryIds.add(item.id))
  const colorIds = new Set(palette?.colors.map((item) => item.id) ?? [])
  const regionById = collectUniqueIds(decoration.regions, `${path}.regions`, issues)
  const strokeById = collectUniqueIds(decoration.strokes, `${path}.strokes`, issues)
  const letteringById = collectUniqueIds(decoration.lettering ?? [], `${path}.lettering`, issues)
  const stepById = collectUniqueIds(decoration.steps, `${path}.steps`, issues)

  decoration.regions.forEach((region, regionIndex) => {
    const regionPath = `${path}.regions[${regionIndex}]`
    if (region.outer.length < 3) {
      addIssue(issues, `${regionPath}.outer`, 'point_count', 'must contain at least three points')
    }
    region.holes.forEach((hole, holeIndex) => {
      if (hole.length < 3) {
        addIssue(issues, `${regionPath}.holes[${holeIndex}]`, 'point_count', 'must contain at least three points')
      }
    })
    checkReferences(
      region.sourceGeometryIds,
      geometryIds,
      `${regionPath}.sourceGeometryIds`,
      'unknown_geometry',
      'DesignSpec geometry',
      issues
    )
    if (!colorIds.has(region.fillColorId)) {
      addIssue(issues, `${regionPath}.fillColorId`, 'unknown_color', `references unknown palette color "${region.fillColorId}"`, 'error', [region.fillColorId])
    }
  })

  decoration.strokes.forEach((stroke, strokeIndex) => {
    const strokePath = `${path}.strokes[${strokeIndex}]`
    if (stroke.points.length < 2) {
      addIssue(issues, `${strokePath}.points`, 'point_count', 'must contain at least two points')
    }
    validatePositiveNumber(stroke.width, `${strokePath}.width`, issues)
    checkReferences(
      stroke.sourceGeometryIds,
      geometryIds,
      `${strokePath}.sourceGeometryIds`,
      'unknown_geometry',
      'DesignSpec geometry',
      issues
    )
    if (!colorIds.has(stroke.colorId)) {
      addIssue(issues, `${strokePath}.colorId`, 'unknown_color', `references unknown palette color "${stroke.colorId}"`, 'error', [stroke.colorId])
    }
  })

  ;(decoration.lettering ?? []).forEach((lettering, letteringIndex) => {
    const letteringPath = `${path}.lettering[${letteringIndex}]`
    validateIdentifier(lettering.text, `${letteringPath}.text`, issues)
    validatePositiveNumber(lettering.maxWidth, `${letteringPath}.maxWidth`, issues)
    validatePositiveNumber(lettering.fontSize, `${letteringPath}.fontSize`, issues)
    validatePositiveNumber(lettering.strokeWidth, `${letteringPath}.strokeWidth`, issues)
    if (!Number.isFinite(lettering.position.x) || !Number.isFinite(lettering.position.y)) {
      addIssue(issues, `${letteringPath}.position`, 'finite_point', 'must contain finite x and y coordinates')
    }
    checkReferences(
      lettering.sourceGeometryIds,
      geometryIds,
      `${letteringPath}.sourceGeometryIds`,
      'unknown_geometry',
      'DesignSpec geometry',
      issues
    )
    if (!colorIds.has(lettering.colorId)) {
      addIssue(issues, `${letteringPath}.colorId`, 'unknown_color', `references unknown palette color "${lettering.colorId}"`, 'error', [lettering.colorId])
    }
  })

  const previousSteps = new Set<string>()
  decoration.steps.forEach((step, stepIndex) => {
    const stepPath = `${path}.steps[${stepIndex}]`
    if (step.sequence !== stepIndex + 1) {
      addIssue(issues, `${stepPath}.sequence`, 'step_sequence', `must equal ${stepIndex + 1} to preserve explicit execution order`)
    }
    checkReferences(step.regionIds, new Set(regionById.keys()), `${stepPath}.regionIds`, 'unknown_region', 'decoration region', issues)
    checkReferences(step.strokeIds, new Set(strokeById.keys()), `${stepPath}.strokeIds`, 'unknown_stroke', 'decoration stroke', issues)
    checkReferences(step.letteringIds ?? [], new Set(letteringById.keys()), `${stepPath}.letteringIds`, 'unknown_lettering', 'decoration lettering', issues)
    checkReferences(step.colorIds, colorIds, `${stepPath}.colorIds`, 'unknown_color', 'palette color', issues)
    step.dependsOnStepIds.forEach((dependencyId, dependencyIndex) => {
      const dependencyPath = `${stepPath}.dependsOnStepIds[${dependencyIndex}]`
      if (!stepById.has(dependencyId)) {
        addIssue(issues, dependencyPath, 'unknown_step', `references unknown step "${dependencyId}"`, 'error', [dependencyId])
      } else if (!previousSteps.has(dependencyId)) {
        addIssue(issues, dependencyPath, 'forward_step_dependency', 'must reference an earlier decoration step', 'error', [dependencyId])
      }
    })
    if (step.dryTimeMinutes !== undefined) {
      validatePositiveNumber(step.dryTimeMinutes, `${stepPath}.dryTimeMinutes`, issues, true)
    }
    previousSteps.add(step.id)
  })

  if (decoration.estimatedMinutes !== undefined) {
    validatePositiveNumber(decoration.estimatedMinutes, `${path}.estimatedMinutes`, issues)
  }
}

export function validateCookieProjectRevision(
  revision: CookieProjectRevision,
  options: ValidateCookieProjectRevisionOptions = {}
): ProjectValidationReport {
  const issues: ProjectValidationIssue[] = []
  validateSchema(
    revision.schema,
    COOKIE_PROJECT_REVISION_SCHEMA,
    revision.version,
    COOKIE_PROJECT_REVISION_VERSION,
    '',
    issues
  )
  validateIdentifier(revision.id, 'id', issues)
  validateIdentifier(revision.projectId, 'projectId', issues)
  if (!Number.isInteger(revision.revisionNumber) || revision.revisionNumber < 1) {
    addIssue(issues, 'revisionNumber', 'revision_number', 'must be a positive integer')
  }
  if (revision.parentRevisionId === revision.id) {
    addIssue(issues, 'parentRevisionId', 'self_reference', 'must not reference this revision', 'error', [revision.id])
  }

  validateSchema(
    revision.brief.schema,
    PROJECT_BRIEF_SCHEMA,
    revision.brief.version,
    PROJECT_BRIEF_VERSION,
    'brief.',
    issues
  )
  validateIdentifier(revision.brief.id, 'brief.id', issues)
  validateIdentifier(revision.brief.title, 'brief.title', issues)
  validateIdentifier(revision.brief.prompt, 'brief.prompt', issues)
  if (!Number.isInteger(revision.brief.requestedDesignCount) || revision.brief.requestedDesignCount < 1) {
    addIssue(issues, 'brief.requestedDesignCount', 'design_count', 'must be a positive integer')
  }

  const designById = collectUniqueIds(revision.designs, 'designs', issues)
  const paletteById = collectUniqueIds(revision.palettes, 'palettes', issues)
  const decorationById = collectUniqueIds(revision.decorations, 'decorations', issues)
  const previewById = collectUniqueIds(revision.previews, 'previews', issues)
  collectUniqueIds(revision.kits, 'kits', issues)

  const ordinals = new Set<number>()
  revision.designs.forEach((design, index) => {
    const path = `designs[${index}]`
    validateSchema(
      design.schema,
      COOKIE_DESIGN_REVISION_SCHEMA,
      design.version,
      COOKIE_DESIGN_REVISION_VERSION,
      `${path}.`,
      issues
    )
    if (design.sourceBriefId !== revision.brief.id) {
      addIssue(issues, `${path}.sourceBriefId`, 'brief_mismatch', `must reference brief "${revision.brief.id}"`, 'error', [design.sourceBriefId, revision.brief.id])
    }
    if (!Number.isInteger(design.ordinal) || design.ordinal < 1) {
      addIssue(issues, `${path}.ordinal`, 'ordinal', 'must be a positive integer')
    } else if (ordinals.has(design.ordinal)) {
      addIssue(issues, `${path}.ordinal`, 'duplicate_ordinal', `ordinal ${design.ordinal} must be unique`)
    }
    ordinals.add(design.ordinal)
    const designResult = validateDesignSpec(design.designSpec)
    designResult.issues.forEach((issue) => {
      addIssue(issues, `${path}.designSpec.${issue.path}`, `design_spec.${issue.code}`, issue.message)
    })
  })

  revision.palettes.forEach((palette, index) => validatePalette(palette, index, issues))
  revision.decorations.forEach((decoration, index) => {
    validateDecoration(decoration, index, designById, paletteById, issues)
  })

  revision.previews.forEach((preview, index) => {
    const path = `previews[${index}]`
    validateSchema(
      preview.schema,
      PREVIEW_ARTIFACT_SCHEMA,
      preview.version,
      PREVIEW_ARTIFACT_VERSION,
      `${path}.`,
      issues
    )
    validateIdentifier(preview.uri, `${path}.uri`, issues)
    validateIdentifier(preview.mimeType, `${path}.mimeType`, issues)
    checkReferences(preview.designRevisionIds, new Set(designById.keys()), `${path}.designRevisionIds`, 'unknown_design_revision', 'design revision', issues)
    checkReferences(preview.decorationSpecIds, new Set(decorationById.keys()), `${path}.decorationSpecIds`, 'unknown_decoration', 'decoration spec', issues)
    checkReferences(preview.paletteSpecIds, new Set(paletteById.keys()), `${path}.paletteSpecIds`, 'unknown_palette', 'palette spec', issues)
    if (preview.widthPixels !== undefined) validatePositiveNumber(preview.widthPixels, `${path}.widthPixels`, issues)
    if (preview.heightPixels !== undefined) validatePositiveNumber(preview.heightPixels, `${path}.heightPixels`, issues)
  })

  revision.kits.forEach((kit, kitIndex) => {
    const path = `kits[${kitIndex}]`
    validateSchema(kit.schema, KIT_BOM_SCHEMA, kit.version, KIT_BOM_VERSION, `${path}.`, issues)
    validateIdentifier(kit.currency, `${path}.currency`, issues)
    const componentById = collectUniqueIds(kit.components, `${path}.components`, issues)
    if (componentById.size === 0) {
      addIssue(issues, `${path}.components`, 'empty_kit', 'must contain at least one component')
    }
    kit.components.forEach((component, componentIndex) => {
      const componentPath = `${path}.components[${componentIndex}]`
      validatePositiveNumber(component.quantity, `${componentPath}.quantity`, issues)
      if (component.unitPriceMinor !== undefined) {
        validatePositiveNumber(component.unitPriceMinor, `${componentPath}.unitPriceMinor`, issues, true)
        if (!Number.isInteger(component.unitPriceMinor)) {
          addIssue(issues, `${componentPath}.unitPriceMinor`, 'minor_currency_integer', 'must be an integer number of minor currency units')
        }
      }
      if (component.designRevisionId && !designById.has(component.designRevisionId)) {
        addIssue(issues, `${componentPath}.designRevisionId`, 'unknown_design_revision', `references unknown design revision "${component.designRevisionId}"`, 'error', [component.designRevisionId])
      }
      if (component.previewArtifactId && !previewById.has(component.previewArtifactId)) {
        addIssue(issues, `${componentPath}.previewArtifactId`, 'unknown_preview', `references unknown preview artifact "${component.previewArtifactId}"`, 'error', [component.previewArtifactId])
      }
      if (component.gelSkuId) {
        if (!component.paletteSpecId) {
          addIssue(issues, `${componentPath}.paletteSpecId`, 'palette_required', 'is required when gelSkuId is present')
        } else {
          const palette = paletteById.get(component.paletteSpecId)
          if (!palette) {
            addIssue(issues, `${componentPath}.paletteSpecId`, 'unknown_palette', `references unknown palette "${component.paletteSpecId}"`, 'error', [component.paletteSpecId])
          } else if (!palette.gelSkus.some((gel) => gel.id === component.gelSkuId)) {
            addIssue(issues, `${componentPath}.gelSkuId`, 'unknown_gel_sku', `references unknown gel SKU "${component.gelSkuId}" in palette "${palette.id}"`, 'error', [component.gelSkuId, palette.id])
          }
        }
      } else if (component.paletteSpecId && !paletteById.has(component.paletteSpecId)) {
        addIssue(issues, `${componentPath}.paletteSpecId`, 'unknown_palette', `references unknown palette "${component.paletteSpecId}"`, 'error', [component.paletteSpecId])
      }
    })
  })

  if (revision.designs.length !== revision.brief.requestedDesignCount) {
    addIssue(
      issues,
      'designs',
      'requested_design_count_mismatch',
      `contains ${revision.designs.length} designs but the brief requests ${revision.brief.requestedDesignCount}`,
      revision.lifecycle === 'concept' ? 'warning' : 'error'
    )
  }

  const isOrderStage = ['ready-to-order', 'approved', 'ordered'].includes(revision.lifecycle)
  if (isOrderStage) {
    if (!revision.brief.rightsAttestation.userOwnsOrMayUseInputs) {
      addIssue(issues, 'brief.rightsAttestation.userOwnsOrMayUseInputs', 'rights_not_attested', 'must be true before a project can be ordered')
    }
    if (!revision.previews.some((preview) => preview.fidelity !== 'concept')) {
      addIssue(issues, 'previews', 'production_preview_required', 'must include a production-faithful or approved preview before ordering')
    }
    if (!revision.kits.some((kit) => kit.status === 'orderable')) {
      addIssue(issues, 'kits', 'orderable_kit_required', 'must include at least one orderable kit')
    }
  } else if (revision.kits.some((kit) => kit.status === 'orderable')) {
    addIssue(issues, 'kits', 'premature_orderable_kit', 'an orderable kit requires the project lifecycle to be ready-to-order or later')
  }

  if (revision.validation) {
    validateSchema(
      revision.validation.schema,
      PROJECT_VALIDATION_REPORT_SCHEMA,
      revision.validation.version,
      PROJECT_VALIDATION_REPORT_VERSION,
      'validation.',
      issues
    )
    if (revision.validation.projectRevisionId !== revision.id) {
      addIssue(issues, 'validation.projectRevisionId', 'revision_mismatch', `must reference revision "${revision.id}"`, 'error', [revision.validation.projectRevisionId, revision.id])
    }
  }

  if (options.verifyContentHash !== false) {
    let expectedHash: string | undefined
    try {
      expectedHash = computeCookieProjectRevisionHash(revision)
    } catch (error) {
      addIssue(issues, '$', 'non_json_content', error instanceof Error ? error.message : 'revision must contain only JSON-compatible content')
    }
    if (expectedHash && revision.contentHash !== expectedHash) {
      addIssue(issues, 'contentHash', 'content_hash_mismatch', `must equal computed content hash "${expectedHash}"`)
    }
  }

  const hasErrors = issues.some((issue) => issue.severity === 'error')
  const status = hasErrors ? 'fail' : issues.length > 0 ? 'warning' : 'pass'
  return {
    schema: PROJECT_VALIDATION_REPORT_SCHEMA,
    version: PROJECT_VALIDATION_REPORT_VERSION,
    id: options.reportId ?? `${revision.id}:validation`,
    projectRevisionId: revision.id,
    evaluatedAt: options.evaluatedAt ?? revision.createdAt,
    status,
    issues
  }
}

export function assertValidCookieProjectRevision(
  revision: CookieProjectRevision,
  options: ValidateCookieProjectRevisionOptions = {}
): void {
  const report = validateCookieProjectRevision(revision, options)
  if (report.status === 'fail') throw new CookieProjectValidationError(report)
}
