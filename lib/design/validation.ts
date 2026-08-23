import {
  DESIGN_SPEC_SCHEMA,
  DESIGN_SPEC_UNITS,
  DESIGN_SPEC_VERSION,
  type ClosedContour,
  type DesignRole,
  type DesignSpec,
  type JsonValue,
  type Point2D,
  type Transform2D
} from './types'

export interface DesignSpecIssue {
  path: string
  code: string
  message: string
}

export interface DesignSpecValidationResult {
  valid: boolean
  issues: DesignSpecIssue[]
}

export class DesignSpecValidationError extends Error {
  readonly issues: DesignSpecIssue[]

  constructor(issues: DesignSpecIssue[]) {
    super(`Invalid DesignSpec: ${issues.map((issue) => `${issue.path} ${issue.message}`).join('; ')}`)
    this.name = 'DesignSpecValidationError'
    this.issues = issues
  }
}

const DESIGN_ROLES: readonly DesignRole[] = ['cut', 'stamp', 'emboss', 'support', 'handle']
const SOURCE_KINDS = [
  'manual',
  'preset',
  'prompt',
  'svg',
  'raster',
  'model-3d',
  'legacy-outline',
  'generated',
  'other'
] as const
const TRANSFORMATION_KINDS = [
  'unit-conversion',
  'apply-transform',
  'normalize',
  'vectorize',
  'simplify',
  'repair',
  'legacy-adapter',
  'other'
] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function addIssue(
  issues: DesignSpecIssue[],
  path: string,
  code: string,
  message: string
): void {
  issues.push({ path, code, message })
}

function validateIdentifier(
  value: unknown,
  path: string,
  issues: DesignSpecIssue[]
): value is string {
  if (!isNonEmptyString(value)) {
    addIssue(issues, path, 'required_string', 'must be a non-empty string')
    return false
  }
  return true
}

function validateOptionalString(
  value: unknown,
  path: string,
  issues: DesignSpecIssue[],
  requireContent = false
): void {
  if (value === undefined) return
  if (typeof value !== 'string' || (requireContent && value.trim().length === 0)) {
    addIssue(
      issues,
      path,
      requireContent ? 'non_empty_string' : 'string',
      requireContent ? 'must be a non-empty string' : 'must be a string'
    )
  }
}

function validatePositiveNumber(
  value: unknown,
  path: string,
  issues: DesignSpecIssue[]
): value is number {
  if (!isFiniteNumber(value) || value <= 0) {
    addIssue(issues, path, 'positive_number', 'must be a finite number greater than zero')
    return false
  }
  return true
}

function validatePoint(value: unknown, path: string, issues: DesignSpecIssue[]): value is Point2D {
  if (!isRecord(value)) {
    addIssue(issues, path, 'point', 'must be an object with finite x and y coordinates')
    return false
  }

  let valid = true
  if (!isFiniteNumber(value.x)) {
    addIssue(issues, `${path}.x`, 'finite_number', 'must be a finite number')
    valid = false
  }
  if (!isFiniteNumber(value.y)) {
    addIssue(issues, `${path}.y`, 'finite_number', 'must be a finite number')
    valid = false
  }
  return valid
}

function samePoint(first: Point2D, second: Point2D): boolean {
  return first.x === second.x && first.y === second.y
}

function signedArea(points: readonly Point2D[]): number {
  let twiceArea = 0
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]
    const next = points[(index + 1) % points.length]
    twiceArea += current.x * next.y - next.x * current.y
  }
  return twiceArea / 2
}

function validateTransform(
  value: unknown,
  path: string,
  issues: DesignSpecIssue[]
): value is Transform2D {
  if (!Array.isArray(value) || value.length !== 6 || !value.every(isFiniteNumber)) {
    addIssue(issues, path, 'affine_transform', 'must contain six finite matrix values')
    return false
  }
  return true
}

function validateJsonValue(
  value: unknown,
  path: string,
  issues: DesignSpecIssue[],
  ancestors = new Set<object>()
): value is JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      addIssue(issues, path, 'json_number', 'must not contain NaN or Infinity')
      return false
    }
    return true
  }
  if (typeof value !== 'object') {
    addIssue(issues, path, 'json_value', 'must contain only JSON-compatible values')
    return false
  }
  if (ancestors.has(value)) {
    addIssue(issues, path, 'json_cycle', 'must not contain cyclic references')
    return false
  }

  ancestors.add(value)
  let valid = true
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      valid = validateJsonValue(item, `${path}[${index}]`, issues, ancestors) && valid
    })
  } else {
    for (const [key, item] of Object.entries(value)) {
      valid = validateJsonValue(item, `${path}.${key}`, issues, ancestors) && valid
    }
  }
  ancestors.delete(value)
  return valid
}

function validateMetadata(owner: Record<string, unknown>, path: string, issues: DesignSpecIssue[]): void {
  if (owner.metadata !== undefined) {
    if (!isRecord(owner.metadata)) {
      addIssue(issues, `${path}.metadata`, 'json_object', 'must be a JSON object')
    } else {
      validateJsonValue(owner.metadata, `${path}.metadata`, issues)
    }
  }
}

function validateRole(value: unknown, path: string, issues: DesignSpecIssue[]): value is DesignRole {
  if (!DESIGN_ROLES.includes(value as DesignRole)) {
    addIssue(issues, path, 'design_role', `must be one of: ${DESIGN_ROLES.join(', ')}`)
    return false
  }
  return true
}

function validatePoints(
  value: unknown,
  path: string,
  minimum: number,
  closed: boolean,
  issues: DesignSpecIssue[]
): value is Point2D[] {
  if (!Array.isArray(value)) {
    addIssue(issues, path, 'points', 'must be an array of points')
    return false
  }
  if (value.length < minimum) {
    addIssue(issues, path, 'point_count', `must contain at least ${minimum} points`)
  }

  let allPointsValid = true
  value.forEach((point, index) => {
    allPointsValid = validatePoint(point, `${path}[${index}]`, issues) && allPointsValid
  })
  if (!allPointsValid) return false

  for (let index = 1; index < value.length; index += 1) {
    if (samePoint(value[index - 1] as Point2D, value[index] as Point2D)) {
      addIssue(issues, `${path}[${index}]`, 'duplicate_point', 'must not repeat the preceding point')
    }
  }

  if (closed && value.length > 1 && samePoint(value[0] as Point2D, value[value.length - 1] as Point2D)) {
    addIssue(issues, path, 'repeated_closure', 'must not repeat the first point; closure is implicit')
  }

  if (closed && value.length >= 3 && Math.abs(signedArea(value as Point2D[])) <= Number.EPSILON) {
    addIssue(issues, path, 'zero_area', 'must enclose a non-zero area')
  }

  return value.length >= minimum
}

function validateContours(value: unknown, issues: DesignSpecIssue[]): ClosedContour[] {
  if (!Array.isArray(value)) {
    addIssue(issues, 'contours', 'array', 'must be an array')
    return []
  }

  value.forEach((item, index) => {
    const path = `contours[${index}]`
    if (!isRecord(item)) {
      addIssue(issues, path, 'object', 'must be an object')
      return
    }
    validateIdentifier(item.id, `${path}.id`, issues)
    validateOptionalString(item.name, `${path}.name`, issues, true)
    if (item.kind !== 'closed-contour') {
      addIssue(issues, `${path}.kind`, 'literal', 'must equal "closed-contour"')
    }
    validateRole(item.role, `${path}.role`, issues)
    validatePoints(item.points, `${path}.points`, 3, true, issues)
    if (!isRecord(item.relationship)) {
      addIssue(issues, `${path}.relationship`, 'relationship', 'must describe an outer or hole contour')
    } else if (item.relationship.kind === 'outer') {
      // No additional reference is required.
    } else if (item.relationship.kind === 'hole') {
      validateIdentifier(
        item.relationship.outerContourId,
        `${path}.relationship.outerContourId`,
        issues
      )
    } else {
      addIssue(issues, `${path}.relationship.kind`, 'relationship_kind', 'must be "outer" or "hole"')
    }
    if (item.fillRule !== undefined && item.fillRule !== 'nonzero' && item.fillRule !== 'evenodd') {
      addIssue(issues, `${path}.fillRule`, 'fill_rule', 'must be "nonzero" or "evenodd"')
    }
    validateMetadata(item, path, issues)
  })

  return value.filter(isRecord) as unknown as ClosedContour[]
}

function validateStrokes(value: unknown, issues: DesignSpecIssue[]): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    addIssue(issues, 'strokes', 'array', 'must be an array')
    return []
  }

  value.forEach((item, index) => {
    const path = `strokes[${index}]`
    if (!isRecord(item)) {
      addIssue(issues, path, 'object', 'must be an object')
      return
    }
    validateIdentifier(item.id, `${path}.id`, issues)
    validateOptionalString(item.name, `${path}.name`, issues, true)
    if (item.kind !== 'open-stroke') {
      addIssue(issues, `${path}.kind`, 'literal', 'must equal "open-stroke"')
    }
    validateRole(item.role, `${path}.role`, issues)
    validatePoints(item.points, `${path}.points`, 2, false, issues)
    if (item.width !== undefined) validatePositiveNumber(item.width, `${path}.width`, issues)
    if (item.lineCap !== undefined && !['butt', 'round', 'square'].includes(item.lineCap as string)) {
      addIssue(issues, `${path}.lineCap`, 'line_cap', 'must be "butt", "round", or "square"')
    }
    if (item.lineJoin !== undefined && !['miter', 'round', 'bevel'].includes(item.lineJoin as string)) {
      addIssue(issues, `${path}.lineJoin`, 'line_join', 'must be "miter", "round", or "bevel"')
    }
    validateMetadata(item, path, issues)
  })

  return value.filter(isRecord)
}

function validateCanvasAndTarget(spec: Record<string, unknown>, issues: DesignSpecIssue[]): void {
  if (!isRecord(spec.canvas)) {
    addIssue(issues, 'canvas', 'object', 'must be an object')
  } else {
    validatePoint(spec.canvas.origin, 'canvas.origin', issues)
    if (!isRecord(spec.canvas.size)) {
      addIssue(issues, 'canvas.size', 'size', 'must be an object with positive width and height')
    } else {
      validatePositiveNumber(spec.canvas.size.width, 'canvas.size.width', issues)
      validatePositiveNumber(spec.canvas.size.height, 'canvas.size.height', issues)
    }
  }

  if (!isRecord(spec.target)) {
    addIssue(issues, 'target', 'object', 'must be an object')
  } else {
    if (!isRecord(spec.target.size)) {
      addIssue(issues, 'target.size', 'size', 'must be an object with positive width and height')
    } else {
      validatePositiveNumber(spec.target.size.width, 'target.size.width', issues)
      validatePositiveNumber(spec.target.size.height, 'target.size.height', issues)
    }
    if (spec.target.fit !== 'contain' && spec.target.fit !== 'stretch') {
      addIssue(issues, 'target.fit', 'target_fit', 'must be "contain" or "stretch"')
    }
  }
}

function validateProfile(value: unknown, issues: DesignSpecIssue[]): void {
  if (!isRecord(value)) {
    addIssue(issues, 'profile', 'object', 'must be an object')
    return
  }
  validateIdentifier(value.id, 'profile.id', issues)
  validateIdentifier(value.name, 'profile.name', issues)
  if (value.revision !== undefined && !isNonEmptyString(value.revision)) {
    addIssue(issues, 'profile.revision', 'non_empty_string', 'must be a non-empty string')
  }
  if (!isRecord(value.measurements) || Object.keys(value.measurements).length === 0) {
    addIssue(issues, 'profile.measurements', 'measurements', 'must contain at least one named measurement')
  } else {
    for (const [name, measurement] of Object.entries(value.measurements)) {
      if (!name.trim()) addIssue(issues, 'profile.measurements', 'measurement_name', 'names must not be empty')
      if (!isFiniteNumber(measurement)) {
        addIssue(issues, `profile.measurements.${name}`, 'finite_number', 'must be a finite millimeter value')
      }
    }
  }
  if (value.parameters !== undefined) {
    if (!isRecord(value.parameters)) {
      addIssue(issues, 'profile.parameters', 'json_object', 'must be a JSON object')
    } else {
      validateJsonValue(value.parameters, 'profile.parameters', issues)
    }
  }
}

function validateConstraints(value: unknown, issues: DesignSpecIssue[]): void {
  if (!isRecord(value)) {
    addIssue(issues, 'constraints', 'object', 'must be an object')
    return
  }
  if (value.process !== undefined && !['fdm', 'resin', 'other'].includes(value.process as string)) {
    addIssue(issues, 'constraints.process', 'process', 'must be "fdm", "resin", or "other"')
  }
  if (value.nozzleDiameter !== undefined) {
    validatePositiveNumber(value.nozzleDiameter, 'constraints.nozzleDiameter', issues)
  }
  if (value.layerHeight !== undefined) {
    validatePositiveNumber(value.layerHeight, 'constraints.layerHeight', issues)
  }
  validatePositiveNumber(value.minimumWallThickness, 'constraints.minimumWallThickness', issues)
  validatePositiveNumber(value.minimumFeatureSize, 'constraints.minimumFeatureSize', issues)
  validatePositiveNumber(value.minimumClearance, 'constraints.minimumClearance', issues)
  if (
    value.maximumOverhangAngleDegrees !== undefined
    && (!isFiniteNumber(value.maximumOverhangAngleDegrees)
      || value.maximumOverhangAngleDegrees < 0
      || value.maximumOverhangAngleDegrees > 90)
  ) {
    addIssue(
      issues,
      'constraints.maximumOverhangAngleDegrees',
      'angle_range',
      'must be between 0 and 90 degrees'
    )
  }
  if (value.buildVolume !== undefined) {
    if (!isRecord(value.buildVolume)) {
      addIssue(issues, 'constraints.buildVolume', 'build_volume', 'must be an object')
    } else {
      validatePositiveNumber(value.buildVolume.width, 'constraints.buildVolume.width', issues)
      validatePositiveNumber(value.buildVolume.depth, 'constraints.buildVolume.depth', issues)
      validatePositiveNumber(value.buildVolume.height, 'constraints.buildVolume.height', issues)
    }
  }
}

function validateRights(value: unknown, path: string, issues: DesignSpecIssue[]): void {
  if (!isRecord(value)) {
    addIssue(issues, path, 'rights', 'must be an object')
    return
  }
  for (const field of ['owner', 'license', 'usage', 'sourceUrl']) {
    if (value[field] !== undefined && typeof value[field] !== 'string') {
      addIssue(issues, `${path}.${field}`, 'string', 'must be a string')
    }
  }
}

function validateProvenance(value: unknown, issues: DesignSpecIssue[]): void {
  if (!isRecord(value)) {
    addIssue(issues, 'provenance', 'object', 'must be an object')
    return
  }
  if (!Array.isArray(value.sources)) {
    addIssue(issues, 'provenance.sources', 'array', 'must be an array')
  } else {
    const sourceIds = new Set<string>()
    value.sources.forEach((source, index) => {
      const path = `provenance.sources[${index}]`
      if (!isRecord(source)) {
        addIssue(issues, path, 'object', 'must be an object')
        return
      }
      if (validateIdentifier(source.id, `${path}.id`, issues)) {
        if (sourceIds.has(source.id)) addIssue(issues, `${path}.id`, 'duplicate_id', 'must be unique')
        sourceIds.add(source.id)
      }
      if (!SOURCE_KINDS.includes(source.kind as typeof SOURCE_KINDS[number])) {
        addIssue(issues, `${path}.kind`, 'source_kind', 'is not a supported provenance source kind')
      }
      validateOptionalString(source.name, `${path}.name`, issues)
      validateOptionalString(source.uri, `${path}.uri`, issues)
      validateOptionalString(source.sha256, `${path}.sha256`, issues)
      if (source.rights !== undefined) validateRights(source.rights, `${path}.rights`, issues)
      validateMetadata(source, path, issues)
    })
  }

  if (!Array.isArray(value.transformations)) {
    addIssue(issues, 'provenance.transformations', 'array', 'must be an array')
  } else {
    value.transformations.forEach((transformation, index) => {
      const path = `provenance.transformations[${index}]`
      if (!isRecord(transformation)) {
        addIssue(issues, path, 'object', 'must be an object')
        return
      }
      if (!TRANSFORMATION_KINDS.includes(
        transformation.kind as typeof TRANSFORMATION_KINDS[number]
      )) {
        addIssue(issues, `${path}.kind`, 'transformation_kind', 'is not a supported transformation kind')
      }
      validateOptionalString(transformation.description, `${path}.description`, issues)
      validateOptionalString(transformation.appliedAt, `${path}.appliedAt`, issues)
      if (transformation.matrix !== undefined) {
        validateTransform(transformation.matrix, `${path}.matrix`, issues)
      }
      if (transformation.parameters !== undefined) {
        if (!isRecord(transformation.parameters)) {
          addIssue(issues, `${path}.parameters`, 'json_object', 'must be a JSON object')
        } else {
          validateJsonValue(transformation.parameters, `${path}.parameters`, issues)
        }
      }
    })
  }

  validateOptionalString(value.createdAt, 'provenance.createdAt', issues)
  validateOptionalString(value.createdBy, 'provenance.createdBy', issues)
  if (value.generator !== undefined) {
    if (!isRecord(value.generator)) {
      addIssue(issues, 'provenance.generator', 'object', 'must be an object')
    } else {
      validateIdentifier(value.generator.name, 'provenance.generator.name', issues)
      validateOptionalString(value.generator.version, 'provenance.generator.version', issues)
      validateOptionalString(value.generator.model, 'provenance.generator.model', issues)
      validateOptionalString(value.generator.prompt, 'provenance.generator.prompt', issues)
    }
  }
  if (value.rights !== undefined) validateRights(value.rights, 'provenance.rights', issues)
}

function collectUniqueIds(
  items: readonly Record<string, unknown>[],
  collectionPath: string,
  issues: DesignSpecIssue[]
): Set<string> {
  const ids = new Set<string>()
  items.forEach((item, index) => {
    if (!isNonEmptyString(item.id)) return
    if (ids.has(item.id)) {
      addIssue(issues, `${collectionPath}[${index}].id`, 'duplicate_id', 'must be unique')
    }
    ids.add(item.id)
  })
  return ids
}

function validatePartsAndAssemblies(
  spec: Record<string, unknown>,
  geometryIds: Set<string>,
  contours: ClosedContour[],
  issues: DesignSpecIssue[]
): void {
  const geometryPart = new Map<string, string>()
  const partIds = new Set<string>()

  if (!Array.isArray(spec.parts) || spec.parts.length === 0) {
    addIssue(issues, 'parts', 'non_empty_array', 'must contain at least one part')
  } else {
    spec.parts.forEach((part, index) => {
      const path = `parts[${index}]`
      if (!isRecord(part)) {
        addIssue(issues, path, 'object', 'must be an object')
        return
      }
      if (validateIdentifier(part.id, `${path}.id`, issues)) {
        if (partIds.has(part.id)) addIssue(issues, `${path}.id`, 'duplicate_id', 'must be unique')
        partIds.add(part.id)
      }
      validateIdentifier(part.name, `${path}.name`, issues)
      if (!Array.isArray(part.geometryIds) || part.geometryIds.length === 0) {
        addIssue(issues, `${path}.geometryIds`, 'non_empty_array', 'must reference at least one geometry item')
      } else {
        const localIds = new Set<string>()
        part.geometryIds.forEach((geometryId, geometryIndex) => {
          const referencePath = `${path}.geometryIds[${geometryIndex}]`
          if (!validateIdentifier(geometryId, referencePath, issues)) return
          if (localIds.has(geometryId)) {
            addIssue(issues, referencePath, 'duplicate_reference', 'must not repeat within a part')
          }
          localIds.add(geometryId)
          if (!geometryIds.has(geometryId)) {
            addIssue(issues, referencePath, 'unknown_geometry', `references unknown geometry "${geometryId}"`)
          }
          const previousPart = geometryPart.get(geometryId)
          if (previousPart && previousPart !== part.id) {
            addIssue(issues, referencePath, 'multiple_parts', `is already assigned to part "${previousPart}"`)
          } else if (isNonEmptyString(part.id)) {
            geometryPart.set(geometryId, part.id)
          }
        })
      }
      if (part.transform !== undefined) validateTransform(part.transform, `${path}.transform`, issues)
      validateMetadata(part, path, issues)
    })
  }

  geometryIds.forEach((geometryId) => {
    if (!geometryPart.has(geometryId)) {
      addIssue(issues, 'parts', 'unassigned_geometry', `geometry "${geometryId}" is not assigned to a part`)
    }
  })

  const partAssembly = new Map<string, string>()
  const assemblyIds = new Set<string>()
  if (!Array.isArray(spec.assemblies) || spec.assemblies.length === 0) {
    addIssue(issues, 'assemblies', 'non_empty_array', 'must contain at least one assembly')
  } else {
    spec.assemblies.forEach((assembly, index) => {
      const path = `assemblies[${index}]`
      if (!isRecord(assembly)) {
        addIssue(issues, path, 'object', 'must be an object')
        return
      }
      if (validateIdentifier(assembly.id, `${path}.id`, issues)) {
        if (assemblyIds.has(assembly.id)) addIssue(issues, `${path}.id`, 'duplicate_id', 'must be unique')
        assemblyIds.add(assembly.id)
      }
      validateIdentifier(assembly.name, `${path}.name`, issues)
      if (!Array.isArray(assembly.partIds) || assembly.partIds.length === 0) {
        addIssue(issues, `${path}.partIds`, 'non_empty_array', 'must reference at least one part')
      } else {
        const localIds = new Set<string>()
        assembly.partIds.forEach((partId, partIndex) => {
          const referencePath = `${path}.partIds[${partIndex}]`
          if (!validateIdentifier(partId, referencePath, issues)) return
          if (localIds.has(partId)) {
            addIssue(issues, referencePath, 'duplicate_reference', 'must not repeat within an assembly')
          }
          localIds.add(partId)
          if (!partIds.has(partId)) {
            addIssue(issues, referencePath, 'unknown_part', `references unknown part "${partId}"`)
          }
          const previousAssembly = partAssembly.get(partId)
          if (previousAssembly && previousAssembly !== assembly.id) {
            addIssue(issues, referencePath, 'multiple_assemblies', `is already assigned to assembly "${previousAssembly}"`)
          } else if (isNonEmptyString(assembly.id)) {
            partAssembly.set(partId, assembly.id)
          }
        })
      }
      if (assembly.transform !== undefined) {
        validateTransform(assembly.transform, `${path}.transform`, issues)
      }
      validateMetadata(assembly, path, issues)
    })
  }

  partIds.forEach((partId) => {
    if (!partAssembly.has(partId)) {
      addIssue(issues, 'assemblies', 'unassigned_part', `part "${partId}" is not assigned to an assembly`)
    }
  })

  const contourById = new Map(contours.map((contour) => [contour.id, contour]))
  contours.forEach((contour, index) => {
    if (contour.relationship?.kind !== 'hole') return
    const outer = contourById.get(contour.relationship.outerContourId)
    const path = `contours[${index}].relationship.outerContourId`
    if (!outer) {
      addIssue(issues, path, 'unknown_outer_contour', 'must reference an existing contour')
      return
    }
    if (outer.relationship?.kind !== 'outer') {
      addIssue(issues, path, 'invalid_outer_contour', 'must reference a contour with outer semantics')
    }
    if (outer.role !== contour.role) {
      addIssue(issues, path, 'role_mismatch', 'hole and outer contour must have the same role')
    }
    if (geometryPart.get(outer.id) !== geometryPart.get(contour.id)) {
      addIssue(issues, path, 'part_mismatch', 'hole and outer contour must belong to the same part')
    }
  })
}

function validateText(value: unknown, contourIds: Set<string>, issues: DesignSpecIssue[]): void {
  if (value === undefined) return
  if (!Array.isArray(value)) {
    addIssue(issues, 'text', 'array', 'must be an array')
    return
  }
  const textIds = new Set<string>()
  value.forEach((text, index) => {
    const path = `text[${index}]`
    if (!isRecord(text)) {
      addIssue(issues, path, 'object', 'must be an object')
      return
    }
    if (validateIdentifier(text.id, `${path}.id`, issues)) {
      if (textIds.has(text.id)) addIssue(issues, `${path}.id`, 'duplicate_id', 'must be unique')
      textIds.add(text.id)
    }
    if (typeof text.text !== 'string') addIssue(issues, `${path}.text`, 'string', 'must be a string')
    validateOptionalString(text.fontFamily, `${path}.fontFamily`, issues)
    validateOptionalString(text.fontStyle, `${path}.fontStyle`, issues)
    if (
      text.fontWeight !== undefined
      && typeof text.fontWeight !== 'string'
      && !isFiniteNumber(text.fontWeight)
    ) {
      addIssue(issues, `${path}.fontWeight`, 'font_weight', 'must be a string or finite number')
    }
    if (!Array.isArray(text.resolvedContourIds) || text.resolvedContourIds.length === 0) {
      addIssue(issues, `${path}.resolvedContourIds`, 'non_empty_array', 'must reference resolved glyph contours')
    } else {
      text.resolvedContourIds.forEach((contourId, contourIndex) => {
        const referencePath = `${path}.resolvedContourIds[${contourIndex}]`
        if (!validateIdentifier(contourId, referencePath, issues)) return
        if (!contourIds.has(contourId)) {
          addIssue(issues, referencePath, 'unknown_contour', `references unknown contour "${contourId}"`)
        }
      })
    }
    validateMetadata(text, path, issues)
  })
}

export function validateDesignSpec(value: unknown): DesignSpecValidationResult {
  const issues: DesignSpecIssue[] = []
  if (!isRecord(value)) {
    return {
      valid: false,
      issues: [{ path: '$', code: 'object', message: 'must be a DesignSpec object' }]
    }
  }

  if (value.schema !== DESIGN_SPEC_SCHEMA) {
    addIssue(issues, 'schema', 'schema', `must equal "${DESIGN_SPEC_SCHEMA}"`)
  }
  if (value.version !== DESIGN_SPEC_VERSION) {
    addIssue(issues, 'version', 'version', `must equal ${DESIGN_SPEC_VERSION}`)
  }
  if (value.units !== DESIGN_SPEC_UNITS) {
    addIssue(issues, 'units', 'units', 'must equal "mm"')
  }
  validateIdentifier(value.id, 'id', issues)
  validateIdentifier(value.name, 'name', issues)
  validateCanvasAndTarget(value, issues)

  const contours = validateContours(value.contours, issues)
  const strokes = validateStrokes(value.strokes, issues)
  const contourIds = collectUniqueIds(contours as unknown as Record<string, unknown>[], 'contours', issues)
  const strokeIds = collectUniqueIds(strokes, 'strokes', issues)
  const geometryIds = new Set(contourIds)
  strokeIds.forEach((id) => {
    if (geometryIds.has(id)) {
      addIssue(issues, 'strokes', 'duplicate_geometry_id', `geometry ID "${id}" is already used by a contour`)
    }
    geometryIds.add(id)
  })

  if (geometryIds.size === 0) {
    addIssue(issues, 'contours', 'empty_design', 'the design must contain at least one contour or stroke')
  }

  validatePartsAndAssemblies(value, geometryIds, contours, issues)
  validateProfile(value.profile, issues)
  validateConstraints(value.constraints, issues)
  validateProvenance(value.provenance, issues)
  validateText(value.text, contourIds, issues)
  if (value.metadata !== undefined) {
    if (!isRecord(value.metadata)) {
      addIssue(issues, 'metadata', 'json_object', 'must be a JSON object')
    } else {
      validateJsonValue(value.metadata, 'metadata', issues)
    }
  }

  return { valid: issues.length === 0, issues }
}

export function isDesignSpec(value: unknown): value is DesignSpec {
  return validateDesignSpec(value).valid
}

export function assertValidDesignSpec(value: unknown): asserts value is DesignSpec {
  const result = validateDesignSpec(value)
  if (!result.valid) throw new DesignSpecValidationError(result.issues)
}
