import {
  DESIGN_SPEC_SCHEMA,
  DESIGN_SPEC_UNITS,
  DESIGN_SPEC_VERSION,
  DEFAULT_MANUFACTURING_CONSTRAINTS,
  assertValidDesignSpec,
  type ClosedContour,
  type DesignRole,
  type DesignSpec,
  type OpenStroke,
  type Point2D,
  type Size2D,
  type Transform2D
} from '../design'
import { REFERENCE_V3_PROFILE } from '../profiles/measuredReferenceV3'
import { flattenSvgPathData } from './svgPathData'

const IDENTITY: Transform2D = [1, 0, 0, 1, 0, 0]
const MM_PER_PX = 25.4 / 96
const DEFAULT_LONG_EDGE_MM = 75
const DEFAULT_CURVE_TOLERANCE_MM = 0.12
const EPSILON = 1e-7
const SUPPORTED_ROLES: readonly DesignRole[] = ['cut', 'stamp', 'emboss', 'support', 'handle']
const SVG_NUMBER_PREFIX = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i
const SVG_NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i

interface RawClosedContour {
  id: string
  name?: string
  points: Point2D[]
  role: DesignRole
  fillRule: 'nonzero' | 'evenodd'
  sourceKey: string
  sourceTag: string
}

interface RawOpenStroke {
  id: string
  name?: string
  points: Point2D[]
  role: DesignRole
  width?: number
  lineCap?: OpenStroke['lineCap']
  lineJoin?: OpenStroke['lineJoin']
  sourceTag: string
}

interface SourceCanvas {
  origin: Point2D
  size: Size2D
}

export interface SVGImportOptions {
  name?: string
  /** Physical output size. When omitted, the SVG is fitted to a 75 mm long edge. */
  targetSize?: Size2D
  targetLongEdgeMm?: number
  curveToleranceMm?: number
}

export interface SVGImportStats {
  drawableElements: number
  closedContours: number
  openStrokes: number
  points: number
  holes: number
}

export interface SVGImportResult {
  design: DesignSpec
  warnings: string[]
  stats: SVGImportStats
}

interface ImportAccumulator {
  contours: RawClosedContour[]
  strokes: RawOpenStroke[]
  warnings: string[]
  drawableElements: number
  nextId: number
  toleranceSourceUnits: number
}

/**
 * Converts complete SVG documents into the versioned, multi-element DesignSpec.
 * Curves are adaptively flattened, compound paths remain separate, and nested
 * SVG transforms are baked into copied points before the design is measured.
 */
export class SVGParser {
  static parse(svgText: string, options: SVGImportOptions = {}): DesignSpec | null {
    try {
      return this.parseOrThrow(svgText, options).design
    } catch (error) {
      console.error('Error parsing SVG:', error)
      return null
    }
  }

  static parseOrThrow(svgText: string, options: SVGImportOptions = {}): SVGImportResult {
    if (typeof DOMParser === 'undefined') {
      throw new Error('SVG document import requires a browser DOMParser')
    }
    if (typeof svgText !== 'string' || svgText.trim().length === 0) {
      throw new Error('The SVG file is empty')
    }

    const targetLongEdgeMm = options.targetLongEdgeMm ?? DEFAULT_LONG_EDGE_MM
    const curveToleranceMm = options.curveToleranceMm ?? DEFAULT_CURVE_TOLERANCE_MM
    if (!Number.isFinite(targetLongEdgeMm) || targetLongEdgeMm <= 0) {
      throw new RangeError('targetLongEdgeMm must be a finite number greater than zero')
    }
    if (!Number.isFinite(curveToleranceMm) || curveToleranceMm <= 0) {
      throw new RangeError('curveToleranceMm must be a finite number greater than zero')
    }

    const document = new DOMParser().parseFromString(svgText, 'image/svg+xml')
    const parserError = document.querySelector('parsererror')
    if (parserError) throw new Error(`Invalid SVG XML: ${parserError.textContent?.trim() || 'parse error'}`)

    const root = document.documentElement
    if (!root || root.localName.toLowerCase() !== 'svg') {
      throw new Error('No SVG root element found')
    }

    const sourceCanvasHint = parseSourceCanvas(root)
    const requestedTarget = resolveTargetSize(root, sourceCanvasHint, options, targetLongEdgeMm)
    const approximateScale = Math.min(
      requestedTarget.width / sourceCanvasHint.size.width,
      requestedTarget.height / sourceCanvasHint.size.height
    )
    const accumulator: ImportAccumulator = {
      contours: [],
      strokes: [],
      warnings: [],
      drawableElements: 0,
      nextId: 1,
      toleranceSourceUnits: curveToleranceMm / Math.max(approximateScale, EPSILON)
    }

    for (const child of Array.from(root.children)) {
      collectElement(child, IDENTITY, undefined, accumulator)
    }

    if (accumulator.contours.length === 0 && accumulator.strokes.length === 0) {
      throw new Error('No supported drawable geometry was found in the SVG')
    }

    const geometryBounds = boundsOfGeometry(accumulator.contours, accumulator.strokes)
    const sourceCanvas = hasDeclaredCanvas(root) && isUsableCanvas(sourceCanvasHint)
      ? sourceCanvasHint
      : geometryBounds
    const targetSize = resolveTargetSize(root, sourceCanvas, options, targetLongEdgeMm)
    const fit = createFitTransform(sourceCanvas, targetSize)

    const scaledContours = accumulator.contours
      .map((contour) => ({
        ...contour,
        points: cleanClosedPoints(contour.points.map((point) => applyTransform(fit, point)))
      }))
      .filter((contour) => {
        if (contour.points.length >= 3 && Math.abs(signedArea(contour.points)) > EPSILON) return true
        accumulator.warnings.push(`${contour.id} was skipped because it does not enclose an area.`)
        return false
      })

    const scaledStrokes = accumulator.strokes
      .map((stroke) => ({
        ...stroke,
        points: cleanOpenPoints(stroke.points.map((point) => applyTransform(fit, point))),
        width: stroke.width === undefined ? undefined : stroke.width * uniformScaleOf(fit)
      }))
      .filter((stroke) => {
        if (stroke.points.length >= 2) return true
        accumulator.warnings.push(`${stroke.id} was skipped because it has fewer than two distinct points.`)
        return false
      })

    const contours = classifyContourRelationships(scaledContours, accumulator.warnings)
    const strokes: OpenStroke[] = scaledStrokes.map((stroke) => ({
      id: stroke.id,
      kind: 'open-stroke',
      role: stroke.role,
      points: stroke.points,
      ...(stroke.name ? { name: stroke.name } : {}),
      ...(stroke.width ? { width: stroke.width } : {}),
      ...(stroke.lineCap ? { lineCap: stroke.lineCap } : {}),
      ...(stroke.lineJoin ? { lineJoin: stroke.lineJoin } : {}),
      metadata: { sourceElement: stroke.sourceTag }
    }))

    if (contours.length === 0 && strokes.length === 0) {
      throw new Error('All imported SVG geometry was degenerate')
    }

    const name = options.name?.trim() || root.getAttribute('aria-label')?.trim() || 'Imported SVG'
    const id = slug(name)
    const geometryIds = [...contours.map((contour) => contour.id), ...strokes.map((stroke) => stroke.id)]
    if (root.querySelector('text')) {
      accumulator.warnings.push('Live SVG text was not imported. Convert text to outlined paths to preserve the exact lettering.')
    }
    if (root.querySelector('use')) {
      accumulator.warnings.push('SVG <use> references are not expanded yet; convert referenced objects to paths before upload.')
    }

    const design: DesignSpec = {
      schema: DESIGN_SPEC_SCHEMA,
      version: DESIGN_SPEC_VERSION,
      units: DESIGN_SPEC_UNITS,
      id,
      name,
      canvas: { origin: { x: 0, y: 0 }, size: { ...targetSize } },
      target: { size: targetSize, fit: 'contain' },
      contours,
      strokes,
      parts: [{ id: `${id}:part`, name, geometryIds }],
      assemblies: [{ id: `${id}:assembly`, name, partIds: [`${id}:part`] }],
      profile: {
        id: REFERENCE_V3_PROFILE.id,
        name: 'Measured Reference V3',
        revision: 'v3',
        measurements: {
          overallHeight: REFERENCE_V3_PROFILE.overallHeight,
          flangeHeight: REFERENCE_V3_PROFILE.flangeHeight,
          wallThickness: REFERENCE_V3_PROFILE.wallThickness,
          cuttingLipThickness: REFERENCE_V3_PROFILE.cuttingLipThickness,
          flangeWidth: REFERENCE_V3_PROFILE.flangeWidth
        }
      },
      constraints: { ...DEFAULT_MANUFACTURING_CONSTRAINTS },
      provenance: {
        createdAt: new Date().toISOString(),
        generator: { name: 'DoughForge SVG importer', version: '1' },
        sources: [{ id: `${id}:source`, kind: 'svg', name }],
        transformations: [{
          kind: 'unit-conversion',
          description: 'Flattened SVG geometry and fitted its authoring canvas to millimeters',
          matrix: fit,
          parameters: {
            curveToleranceMm,
            sourceOriginX: sourceCanvas.origin.x,
            sourceOriginY: sourceCanvas.origin.y,
            sourceWidth: sourceCanvas.size.width,
            sourceHeight: sourceCanvas.size.height
          }
        }]
      },
      metadata: {
        importedViewBox: root.getAttribute('viewBox') || '',
        warnings: accumulator.warnings
      }
    }

    assertValidDesignSpec(design)
    const stats: SVGImportStats = {
      drawableElements: accumulator.drawableElements,
      closedContours: contours.length,
      openStrokes: strokes.length,
      points: contours.reduce((sum, contour) => sum + contour.points.length, 0)
        + strokes.reduce((sum, stroke) => sum + stroke.points.length, 0),
      holes: contours.filter((contour) => contour.relationship.kind === 'hole').length
    }

    return { design, warnings: [...accumulator.warnings], stats }
  }
}

function collectElement(
  element: Element,
  parentTransform: Transform2D,
  inheritedRole: DesignRole | undefined,
  accumulator: ImportAccumulator
): void {
  const tag = element.localName.toLowerCase()
  if (['defs', 'clippath', 'mask', 'pattern', 'metadata', 'title', 'desc', 'symbol'].includes(tag)) return
  if (element.getAttribute('display') === 'none' || element.getAttribute('visibility') === 'hidden') return

  const transform = multiplyTransforms(parentTransform, parseTransform(element.getAttribute('transform')))
  const role = readRole(element, inheritedRole)

  if (tag === 'g' || tag === 'svg' || tag === 'a' || tag === 'switch') {
    for (const child of Array.from(element.children)) collectElement(child, transform, role, accumulator)
    return
  }

  const sourceKey = `svg-source-${accumulator.nextId}`
  const sourceTag = `<${tag}>`
  const fillRule = readFillRule(element)
  const name = element.getAttribute('aria-label') || element.getAttribute('id') || undefined
  const closedRole = role ?? 'cut'
  const openRole = role ?? 'stamp'
  let drew = false

  const addClosed = (input: Point2D[], suffix = '') => {
    const points = cleanClosedPoints(input.map((point) => applyTransform(transform, point)))
    if (points.length < 3 || Math.abs(signedArea(points)) <= EPSILON) return
    accumulator.contours.push({
      id: `svg-contour-${accumulator.nextId}${suffix}`,
      name,
      points,
      role: closedRole,
      fillRule,
      sourceKey,
      sourceTag
    })
    drew = true
  }

  const addOpen = (input: Point2D[], suffix = '') => {
    const points = cleanOpenPoints(input.map((point) => applyTransform(transform, point)))
    if (points.length < 2) return
    const width = readNumber(element, 'stroke-width')
    accumulator.strokes.push({
      id: `svg-stroke-${accumulator.nextId}${suffix}`,
      name,
      points,
      role: openRole,
      ...(width > 0 ? { width: width * uniformScaleOf(transform) } : {}),
      lineCap: readLineCap(element),
      lineJoin: readLineJoin(element),
      sourceTag
    })
    drew = true
  }

  try {
    if (tag === 'path') {
      const pathData = element.getAttribute('d')?.trim()
      if (pathData) {
        const subpaths = flattenSvgPathData(pathData, { tolerance: accumulator.toleranceSourceUnits })
        subpaths.forEach((subpath, index) => {
          if (subpath.closed) addClosed(subpath.points, `-${index + 1}`)
          else addOpen(subpath.points, `-${index + 1}`)
        })
      }
    } else if (tag === 'rect') {
      const x = readNumber(element, 'x')
      const y = readNumber(element, 'y')
      const width = readNumber(element, 'width')
      const height = readNumber(element, 'height')
      if (width > 0 && height > 0) addClosed(rectanglePoints(x, y, width, height, element, accumulator.toleranceSourceUnits))
    } else if (tag === 'circle') {
      const radius = readNumber(element, 'r')
      if (radius > 0) addClosed(ellipsePoints(
        readNumber(element, 'cx'), readNumber(element, 'cy'), radius, radius, accumulator.toleranceSourceUnits
      ))
    } else if (tag === 'ellipse') {
      const radiusX = readNumber(element, 'rx')
      const radiusY = readNumber(element, 'ry')
      if (radiusX > 0 && radiusY > 0) addClosed(ellipsePoints(
        readNumber(element, 'cx'), readNumber(element, 'cy'), radiusX, radiusY, accumulator.toleranceSourceUnits
      ))
    } else if (tag === 'polygon') {
      addClosed(parsePointList(element.getAttribute('points') || ''))
    } else if (tag === 'polyline') {
      addOpen(parsePointList(element.getAttribute('points') || ''))
    } else if (tag === 'line') {
      addOpen([
        { x: readNumber(element, 'x1'), y: readNumber(element, 'y1') },
        { x: readNumber(element, 'x2'), y: readNumber(element, 'y2') }
      ])
    }
  } catch (error) {
    const label = name ? `${sourceTag} “${name}”` : sourceTag
    throw new Error(`Could not import ${label}: ${error instanceof Error ? error.message : String(error)}`)
  }

  if (drew) {
    accumulator.drawableElements += 1
    accumulator.nextId += 1
  } else if (!['text', 'image', 'use', 'style'].includes(tag) && element.children.length > 0) {
    for (const child of Array.from(element.children)) collectElement(child, transform, role, accumulator)
  }
}

function classifyContourRelationships(
  input: RawClosedContour[],
  warnings: string[]
): ClosedContour[] {
  const areaById = new Map(input.map((contour) => [contour.id, signedArea(contour.points)]))
  const parentById = new Map<string, RawClosedContour>()

  for (let firstIndex = 0; firstIndex < input.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < input.length; secondIndex += 1) {
      const first = input[firstIndex]
      const second = input[secondIndex]
      if (first.sourceKey === second.sourceKey && contoursTouchOrIntersect(first.points, second.points)) {
        throw new Error(
          `${first.id} and ${second.id} overlap or touch; compound SVG subpaths must be resolved with vector boolean operations before import.`
        )
      }
    }
  }

  for (const contour of input) {
    const area = Math.abs(areaById.get(contour.id) || 0)
    const candidates = input.filter((candidate) => (
      candidate.id !== contour.id
      && candidate.sourceKey === contour.sourceKey
      && Math.abs(areaById.get(candidate.id) || 0) > area + EPSILON
      && pointInPolygon(contour.points[0], candidate.points)
    ))
    candidates.sort((first, second) => (
      Math.abs(areaById.get(first.id) || 0) - Math.abs(areaById.get(second.id) || 0)
    ))
    if (candidates[0]) parentById.set(contour.id, candidates[0])
  }

  const depthOf = (contour: RawClosedContour): number => {
    let depth = 0
    let parent = parentById.get(contour.id)
    const seen = new Set<string>()
    while (parent && !seen.has(parent.id)) {
      seen.add(parent.id)
      depth += 1
      parent = parentById.get(parent.id)
    }
    return depth
  }

  const relationshipById = new Map<string, ClosedContour['relationship'] | null>()
  const byDepth = [...input].sort((first, second) => depthOf(first) - depthOf(second))

  for (const contour of byDepth) {
    const depth = depthOf(contour)
    let relationship: ClosedContour['relationship'] | null

    if (contour.fillRule === 'evenodd') {
      if (depth % 2 === 0) {
        relationship = { kind: 'outer' }
      } else {
        const outer = nearestOuterAncestor(contour, parentById, relationshipById)
        relationship = outer ? { kind: 'hole', outerContourId: outer.id } : { kind: 'outer' }
      }
    } else {
      let outsideWinding = 0
      let ancestor = parentById.get(contour.id)
      while (ancestor) {
        outsideWinding += Math.sign(areaById.get(ancestor.id) || 0)
        ancestor = parentById.get(ancestor.id)
      }
      const insideWinding = outsideWinding + Math.sign(areaById.get(contour.id) || 0)
      const outsideFilled = outsideWinding !== 0
      const insideFilled = insideWinding !== 0

      if (!outsideFilled && insideFilled) {
        relationship = { kind: 'outer' }
      } else if (outsideFilled && !insideFilled) {
        const outer = nearestOuterAncestor(contour, parentById, relationshipById)
        relationship = outer ? { kind: 'hole', outerContourId: outer.id } : { kind: 'outer' }
      } else {
        relationship = null
        warnings.push(
          `${contour.id} was omitted because it does not bound a filled region under the nonzero fill rule.`
        )
      }
    }

    relationshipById.set(contour.id, relationship)
  }

  return input.flatMap((contour): ClosedContour[] => {
    const relationship = relationshipById.get(contour.id)
    if (!relationship) return []
    return [{
      id: contour.id,
      kind: 'closed-contour',
      role: contour.role,
      points: contour.points,
      fillRule: contour.fillRule,
      relationship,
      ...(contour.name ? { name: contour.name } : {}),
      metadata: { sourceElement: contour.sourceTag }
    }]
  })
}

function nearestOuterAncestor(
  contour: RawClosedContour,
  parentById: ReadonlyMap<string, RawClosedContour>,
  relationshipById: ReadonlyMap<string, ClosedContour['relationship'] | null>
): RawClosedContour | undefined {
  let ancestor = parentById.get(contour.id)
  while (ancestor) {
    if (relationshipById.get(ancestor.id)?.kind === 'outer') return ancestor
    ancestor = parentById.get(ancestor.id)
  }
  return undefined
}

function parseSourceCanvas(root: Element): SourceCanvas {
  const viewBox = parseNumberList(root.getAttribute('viewBox') || '', 'viewBox')
  if (viewBox.length === 4 && viewBox.every(Number.isFinite) && viewBox[2] > 0 && viewBox[3] > 0) {
    return { origin: { x: viewBox[0], y: viewBox[1] }, size: { width: viewBox[2], height: viewBox[3] } }
  }
  const width = parseSvgLength(root.getAttribute('width'))?.sourceUnits
  const height = parseSvgLength(root.getAttribute('height'))?.sourceUnits
  return {
    origin: { x: 0, y: 0 },
    size: { width: width && width > 0 ? width : 100, height: height && height > 0 ? height : 100 }
  }
}

function hasDeclaredCanvas(root: Element): boolean {
  const viewBox = parseNumberList(root.getAttribute('viewBox') || '', 'viewBox')
  if (viewBox.length === 4 && viewBox[2] > 0 && viewBox[3] > 0) return true
  const width = parseSvgLength(root.getAttribute('width'))
  const height = parseSvgLength(root.getAttribute('height'))
  return Boolean(width && height && width.sourceUnits > 0 && height.sourceUnits > 0)
}

function resolveTargetSize(
  root: Element,
  sourceCanvas: SourceCanvas,
  options: SVGImportOptions,
  longEdgeMm: number
): Size2D {
  if (options.targetSize) return validateSize(options.targetSize, 'targetSize')
  if (options.targetLongEdgeMm !== undefined) return sizeWithLongEdge(sourceCanvas.size, longEdgeMm)
  const width = parseSvgLength(root.getAttribute('width'))
  const height = parseSvgLength(root.getAttribute('height'))
  if (width?.physical && height?.physical && width.mm > 0 && height.mm > 0) {
    return { width: width.mm, height: height.mm }
  }
  return sizeWithLongEdge(sourceCanvas.size, longEdgeMm)
}

function parseSvgLength(value: string | null): { sourceUnits: number; mm: number; physical: boolean } | null {
  if (!value) return null
  const match = value.trim().match(/^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*(mm|cm|in|pt|pc|px)?$/i)
  if (!match) throw new Error(`Unsupported or malformed SVG length “${value}”`)
  const number = Number(match[1])
  if (!Number.isFinite(number)) throw new Error(`SVG length must be finite: “${value}”`)
  const unit = (match[2] || 'px').toLowerCase()
  const mmByUnit: Record<string, number> = { mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72, pc: 25.4 / 6, px: MM_PER_PX }
  const mm = number * mmByUnit[unit]
  return {
    sourceUnits: unit === 'px' ? number : mm / MM_PER_PX,
    mm,
    physical: unit !== 'px'
  }
}

function createFitTransform(source: SourceCanvas, target: Size2D): Transform2D {
  const scale = Math.min(target.width / source.size.width, target.height / source.size.height)
  const fittedWidth = source.size.width * scale
  const fittedHeight = source.size.height * scale
  const left = (target.width - fittedWidth) / 2
  const bottom = (target.height - fittedHeight) / 2
  return [
    scale, 0, 0, -scale,
    left - source.origin.x * scale,
    bottom + (source.origin.y + source.size.height) * scale
  ]
}

function parseTransform(value: string | null): Transform2D {
  if (!value?.trim()) return [...IDENTITY]
  const operationPattern = /([a-zA-Z]+)\s*\(([^)]*)\)/g
  let result: Transform2D = [...IDENTITY]
  let match: RegExpExecArray | null
  let found = false
  while ((match = operationPattern.exec(value)) !== null) {
    found = true
    const name = match[1].toLowerCase()
    const numbers = parseNumberList(match[2], `${name} transform`)
    let operation: Transform2D
    if (name === 'matrix' && numbers.length === 6) {
      operation = numbers as Transform2D
    } else if (name === 'translate' && (numbers.length === 1 || numbers.length === 2)) {
      operation = [1, 0, 0, 1, numbers[0], numbers[1] ?? 0]
    } else if (name === 'scale' && (numbers.length === 1 || numbers.length === 2)) {
      operation = [numbers[0], 0, 0, numbers[1] ?? numbers[0], 0, 0]
    } else if (name === 'rotate' && (numbers.length === 1 || numbers.length === 3)) {
      const radians = numbers[0] * Math.PI / 180
      const rotation: Transform2D = [Math.cos(radians), Math.sin(radians), -Math.sin(radians), Math.cos(radians), 0, 0]
      operation = numbers.length === 3
        ? multiplyTransforms(
          multiplyTransforms([1, 0, 0, 1, numbers[1], numbers[2]], rotation),
          [1, 0, 0, 1, -numbers[1], -numbers[2]]
        )
        : rotation
    } else if (name === 'skewx' && numbers.length === 1) {
      operation = [1, 0, Math.tan(numbers[0] * Math.PI / 180), 1, 0, 0]
    } else if (name === 'skewy' && numbers.length === 1) {
      operation = [1, Math.tan(numbers[0] * Math.PI / 180), 0, 1, 0, 0]
    } else {
      throw new Error(`Unsupported or malformed SVG transform: ${match[0]}`)
    }
    result = multiplyTransforms(result, operation)
  }
  const remainder = value.replace(operationPattern, '').replace(/[\s,]+/g, '')
  if (!found || remainder.length > 0) throw new Error(`Malformed SVG transform: ${value}`)
  return result
}

function multiplyTransforms(left: Transform2D, right: Transform2D): Transform2D {
  return [
    left[0] * right[0] + left[2] * right[1], left[1] * right[0] + left[3] * right[1],
    left[0] * right[2] + left[2] * right[3], left[1] * right[2] + left[3] * right[3],
    left[0] * right[4] + left[2] * right[5] + left[4],
    left[1] * right[4] + left[3] * right[5] + left[5]
  ]
}

function applyTransform(transform: Transform2D, point: Point2D): Point2D {
  return {
    x: transform[0] * point.x + transform[2] * point.y + transform[4],
    y: transform[1] * point.x + transform[3] * point.y + transform[5]
  }
}

function uniformScaleOf(transform: Transform2D): number {
  const scaleX = Math.hypot(transform[0], transform[1])
  const scaleY = Math.hypot(transform[2], transform[3])
  return Math.sqrt(Math.max(scaleX * scaleY, EPSILON))
}

function rectanglePoints(
  x: number,
  y: number,
  width: number,
  height: number,
  element: Element,
  tolerance: number
): Point2D[] {
  let radiusX = Math.max(0, readNumber(element, 'rx'))
  let radiusY = Math.max(0, readNumber(element, 'ry'))
  if (radiusX === 0 && radiusY > 0) radiusX = radiusY
  if (radiusY === 0 && radiusX > 0) radiusY = radiusX
  radiusX = Math.min(radiusX, width / 2)
  radiusY = Math.min(radiusY, height / 2)
  if (radiusX <= EPSILON || radiusY <= EPSILON) {
    return [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }]
  }

  const points: Point2D[] = []
  const segments = arcSegments(Math.max(radiusX, radiusY), Math.PI / 2, tolerance)
  const corners = [
    { cx: x + width - radiusX, cy: y + radiusY, start: -Math.PI / 2 },
    { cx: x + width - radiusX, cy: y + height - radiusY, start: 0 },
    { cx: x + radiusX, cy: y + height - radiusY, start: Math.PI / 2 },
    { cx: x + radiusX, cy: y + radiusY, start: Math.PI }
  ]
  for (const corner of corners) {
    for (let index = 0; index <= segments; index += 1) {
      const angle = corner.start + index / segments * Math.PI / 2
      points.push({ x: corner.cx + Math.cos(angle) * radiusX, y: corner.cy + Math.sin(angle) * radiusY })
    }
  }
  return points
}

function ellipsePoints(cx: number, cy: number, rx: number, ry: number, tolerance: number): Point2D[] {
  const segments = arcSegments(Math.max(rx, ry), Math.PI * 2, tolerance)
  return Array.from({ length: segments }, (_, index) => {
    const angle = index / segments * Math.PI * 2
    return { x: cx + Math.cos(angle) * rx, y: cy + Math.sin(angle) * ry }
  })
}

function arcSegments(radius: number, angle: number, tolerance: number): number {
  const safeTolerance = Math.min(Math.max(tolerance, EPSILON), radius)
  const step = 2 * Math.acos(Math.max(-1, Math.min(1, 1 - safeTolerance / radius)))
  const requiredSegments = Math.ceil(angle / step)
  if (!Number.isFinite(requiredSegments) || requiredSegments > 2048) {
    throw new RangeError('Primitive curve exceeds the 2048-segment safety limit at the requested tolerance')
  }
  return Math.max(4, requiredSegments)
}

function parsePointList(value: string): Point2D[] {
  const numbers = parseNumberList(value, 'point list')
  if (numbers.length % 2 !== 0) throw new Error('Point list must contain x/y pairs')
  const points: Point2D[] = []
  for (let index = 0; index < numbers.length; index += 2) points.push({ x: numbers[index], y: numbers[index + 1] })
  return points
}

function parseNumberList(value: string, label = 'number list'): number[] {
  const numbers: number[] = []
  let offset = 0
  let previousWasComma = false

  while (offset < value.length) {
    while (offset < value.length && isSvgWhitespace(value[offset])) offset += 1
    if (offset >= value.length) break

    if (value[offset] === ',') {
      if (numbers.length === 0 || previousWasComma) {
        throw new Error(`${label} contains an unexpected comma at offset ${offset}`)
      }
      previousWasComma = true
      offset += 1
      continue
    }

    const match = SVG_NUMBER_PREFIX.exec(value.slice(offset))
    if (!match) throw new Error(`${label} contains invalid syntax at offset ${offset}`)
    const number = Number(match[0])
    if (!Number.isFinite(number)) throw new Error(`${label} values must be finite`)
    numbers.push(number)
    previousWasComma = false
    offset += match[0].length
  }

  if (previousWasComma) throw new Error(`${label} must not end with a comma`)
  return numbers
}

function readNumber(element: Element, name: string): number {
  const value = element.getAttribute(name)
  if (value === null || value.trim() === '') return 0
  const normalized = value.trim()
  if (!SVG_NUMBER.test(normalized)) {
    throw new Error(`<${element.localName}> ${name} must be a finite unitless SVG number`)
  }
  const result = Number(normalized)
  if (!Number.isFinite(result)) throw new Error(`<${element.localName}> ${name} must be finite`)
  return result
}

function isSvgWhitespace(character: string): boolean {
  return character === ' ' || character === '\t' || character === '\n'
    || character === '\r' || character === '\f'
}

function readRole(element: Element, inherited: DesignRole | undefined): DesignRole | undefined {
  const value = element.getAttribute('data-doughforge-role') || element.getAttribute('data-role')
  if (!value) return inherited
  const normalized = value.trim().toLowerCase() as DesignRole
  if (!SUPPORTED_ROLES.includes(normalized)) {
    throw new Error(`Unknown DoughForge role “${value}”; expected ${SUPPORTED_ROLES.join(', ')}`)
  }
  return normalized
}

function readFillRule(element: Element): 'nonzero' | 'evenodd' {
  const direct = element.getAttribute('fill-rule')
  const style = readStyleProperty(element, 'fill-rule')
  return (direct || style)?.trim().toLowerCase() === 'evenodd' ? 'evenodd' : 'nonzero'
}

function readLineCap(element: Element): OpenStroke['lineCap'] | undefined {
  const value = (element.getAttribute('stroke-linecap') || readStyleProperty(element, 'stroke-linecap'))?.trim()
  return value === 'butt' || value === 'round' || value === 'square' ? value : undefined
}

function readLineJoin(element: Element): OpenStroke['lineJoin'] | undefined {
  const value = (element.getAttribute('stroke-linejoin') || readStyleProperty(element, 'stroke-linejoin'))?.trim()
  return value === 'miter' || value === 'round' || value === 'bevel' ? value : undefined
}

function readStyleProperty(element: Element, property: string): string | undefined {
  const style = element.getAttribute('style')
  if (!style) return undefined
  for (const declaration of style.split(';')) {
    const separator = declaration.indexOf(':')
    if (separator < 0) continue
    if (declaration.slice(0, separator).trim().toLowerCase() === property) {
      return declaration.slice(separator + 1).trim()
    }
  }
  return undefined
}

function cleanClosedPoints(points: Point2D[]): Point2D[] {
  const cleaned = cleanOpenPoints(points)
  while (cleaned.length > 1 && distance(cleaned[0], cleaned[cleaned.length - 1]) <= EPSILON) cleaned.pop()
  return cleaned
}

function cleanOpenPoints(points: Point2D[]): Point2D[] {
  const cleaned: Point2D[] = []
  for (const point of points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue
    const previous = cleaned[cleaned.length - 1]
    if (!previous || distance(previous, point) > EPSILON) cleaned.push({ ...point })
  }
  return cleaned
}

function distance(first: Point2D, second: Point2D): number {
  return Math.hypot(first.x - second.x, first.y - second.y)
}

function signedArea(points: Point2D[]): number {
  let area = 0
  for (let index = 0; index < points.length; index += 1) {
    const next = points[(index + 1) % points.length]
    area += points[index].x * next.y - next.x * points[index].y
  }
  return area / 2
}

function pointInPolygon(point: Point2D, polygon: Point2D[]): boolean {
  let inside = false
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const currentPoint = polygon[index]
    const previousPoint = polygon[previous]
    const intersects = (currentPoint.y > point.y) !== (previousPoint.y > point.y)
      && point.x < (previousPoint.x - currentPoint.x) * (point.y - currentPoint.y)
        / (previousPoint.y - currentPoint.y) + currentPoint.x
    if (intersects) inside = !inside
  }
  return inside
}

function contoursTouchOrIntersect(first: Point2D[], second: Point2D[]): boolean {
  const firstBounds = boundsOfPoints(first)
  const secondBounds = boundsOfPoints(second)
  if (
    firstBounds.origin.x + firstBounds.size.width < secondBounds.origin.x - EPSILON
    || secondBounds.origin.x + secondBounds.size.width < firstBounds.origin.x - EPSILON
    || firstBounds.origin.y + firstBounds.size.height < secondBounds.origin.y - EPSILON
    || secondBounds.origin.y + secondBounds.size.height < firstBounds.origin.y - EPSILON
  ) {
    return false
  }

  for (let firstIndex = 0; firstIndex < first.length; firstIndex += 1) {
    const firstStart = first[firstIndex]
    const firstEnd = first[(firstIndex + 1) % first.length]
    for (let secondIndex = 0; secondIndex < second.length; secondIndex += 1) {
      const secondStart = second[secondIndex]
      const secondEnd = second[(secondIndex + 1) % second.length]
      if (segmentsTouchOrIntersect(firstStart, firstEnd, secondStart, secondEnd)) return true
    }
  }
  return false
}

function segmentsTouchOrIntersect(
  firstStart: Point2D,
  firstEnd: Point2D,
  secondStart: Point2D,
  secondEnd: Point2D
): boolean {
  const firstSideStart = crossProduct(firstStart, firstEnd, secondStart)
  const firstSideEnd = crossProduct(firstStart, firstEnd, secondEnd)
  const secondSideStart = crossProduct(secondStart, secondEnd, firstStart)
  const secondSideEnd = crossProduct(secondStart, secondEnd, firstEnd)

  const crossesFirst = (firstSideStart > EPSILON && firstSideEnd < -EPSILON)
    || (firstSideStart < -EPSILON && firstSideEnd > EPSILON)
  const crossesSecond = (secondSideStart > EPSILON && secondSideEnd < -EPSILON)
    || (secondSideStart < -EPSILON && secondSideEnd > EPSILON)
  if (crossesFirst && crossesSecond) return true

  return (Math.abs(firstSideStart) <= EPSILON && pointOnSegment(secondStart, firstStart, firstEnd))
    || (Math.abs(firstSideEnd) <= EPSILON && pointOnSegment(secondEnd, firstStart, firstEnd))
    || (Math.abs(secondSideStart) <= EPSILON && pointOnSegment(firstStart, secondStart, secondEnd))
    || (Math.abs(secondSideEnd) <= EPSILON && pointOnSegment(firstEnd, secondStart, secondEnd))
}

function crossProduct(start: Point2D, end: Point2D, point: Point2D): number {
  return (end.x - start.x) * (point.y - start.y) - (end.y - start.y) * (point.x - start.x)
}

function pointOnSegment(point: Point2D, start: Point2D, end: Point2D): boolean {
  return point.x >= Math.min(start.x, end.x) - EPSILON
    && point.x <= Math.max(start.x, end.x) + EPSILON
    && point.y >= Math.min(start.y, end.y) - EPSILON
    && point.y <= Math.max(start.y, end.y) + EPSILON
}

function boundsOfGeometry(contours: RawClosedContour[], strokes: RawOpenStroke[]): SourceCanvas {
  let minimumX = Number.POSITIVE_INFINITY
  let maximumX = Number.NEGATIVE_INFINITY
  let minimumY = Number.POSITIVE_INFINITY
  let maximumY = Number.NEGATIVE_INFINITY
  let pointCount = 0

  const include = (point: Point2D): void => {
    minimumX = Math.min(minimumX, point.x)
    maximumX = Math.max(maximumX, point.x)
    minimumY = Math.min(minimumY, point.y)
    maximumY = Math.max(maximumY, point.y)
    pointCount += 1
  }
  for (const contour of contours) for (const point of contour.points) include(point)
  for (const stroke of strokes) for (const point of stroke.points) include(point)

  return pointCount === 0
    ? { origin: { x: 0, y: 0 }, size: { width: 1, height: 1 } }
    : canvasFromExtents(minimumX, minimumY, maximumX, maximumY)
}

function boundsOfPoints(points: Point2D[]): SourceCanvas {
  if (points.length === 0) return { origin: { x: 0, y: 0 }, size: { width: 1, height: 1 } }
  let minimumX = Number.POSITIVE_INFINITY
  let maximumX = Number.NEGATIVE_INFINITY
  let minimumY = Number.POSITIVE_INFINITY
  let maximumY = Number.NEGATIVE_INFINITY
  for (const point of points) {
    minimumX = Math.min(minimumX, point.x)
    maximumX = Math.max(maximumX, point.x)
    minimumY = Math.min(minimumY, point.y)
    maximumY = Math.max(maximumY, point.y)
  }
  return canvasFromExtents(minimumX, minimumY, maximumX, maximumY)
}

function canvasFromExtents(
  minimumX: number,
  minimumY: number,
  maximumX: number,
  maximumY: number
): SourceCanvas {
  return {
    origin: { x: minimumX, y: minimumY },
    size: { width: Math.max(maximumX - minimumX, EPSILON), height: Math.max(maximumY - minimumY, EPSILON) }
  }
}

function isUsableCanvas(canvas: SourceCanvas): boolean {
  return Number.isFinite(canvas.size.width) && Number.isFinite(canvas.size.height)
    && canvas.size.width > EPSILON && canvas.size.height > EPSILON
}

function validateSize(size: Size2D, label: string): Size2D {
  if (!Number.isFinite(size.width) || size.width <= 0 || !Number.isFinite(size.height) || size.height <= 0) {
    throw new RangeError(`${label} width and height must be finite numbers greater than zero`)
  }
  return { ...size }
}

function sizeWithLongEdge(size: Size2D, longEdge: number): Size2D {
  const scale = longEdge / Math.max(size.width, size.height)
  return { width: size.width * scale, height: size.height * scale }
}

function slug(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'imported-svg'
}
