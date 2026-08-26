/**
 * Dependency-free SVG path-data parsing and polyline flattening.
 *
 * Parsing expands implicit command repetitions but preserves command casing.
 * Flattening resolves relative coordinates and smooth control-point reflection.
 */

export type SvgPathCommandType =
  | 'M' | 'm'
  | 'L' | 'l'
  | 'H' | 'h'
  | 'V' | 'v'
  | 'C' | 'c'
  | 'S' | 's'
  | 'Q' | 'q'
  | 'T' | 't'
  | 'A' | 'a'
  | 'Z' | 'z'

export type SvgPathToken =
  | {
      type: 'command'
      value: SvgPathCommandType
      offset: number
      end: number
    }
  | {
      type: 'number'
      value: number
      raw: string
      offset: number
      end: number
    }

export interface SvgPathCommand {
  type: SvgPathCommandType
  values: number[]
  offset: number
}

export interface SvgPoint {
  x: number
  y: number
}

export interface FlattenedSvgSubpath {
  points: SvgPoint[]
  closed: boolean
}

export interface SvgPathFlattenOptions {
  /** Maximum geometric deviation, in path coordinate units. */
  tolerance?: number
  /** Recursion safety limit for Bézier subdivision. */
  maxCurveDepth?: number
  /** Safety limit for the number of segments emitted by one curve or arc. */
  maxSegments?: number
}

export class SvgPathDataError extends Error {
  readonly offset: number

  constructor(message: string, offset: number) {
    super(offset >= 0 ? `${message} at offset ${offset}` : message)
    this.name = 'SvgPathDataError'
    this.offset = offset
  }
}

const COMMANDS = new Set<string>([
  'M', 'm', 'L', 'l', 'H', 'h', 'V', 'v', 'C', 'c', 'S', 's',
  'Q', 'q', 'T', 't', 'A', 'a', 'Z', 'z'
])

const PARAMETER_COUNTS: Record<Uppercase<SvgPathCommandType>, number> = {
  M: 2,
  L: 2,
  H: 1,
  V: 1,
  C: 6,
  S: 4,
  Q: 4,
  T: 2,
  A: 7,
  Z: 0
}

const NUMBER_PREFIX = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/
const NUMBER_WHOLE = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/

function isWhitespace(character: string): boolean {
  return character === ' ' || character === '\t' || character === '\n' ||
    character === '\r' || character === '\f'
}

function isNumberStart(character: string): boolean {
  return character === '+' || character === '-' || character === '.' ||
    (character >= '0' && character <= '9')
}

/** Tokenize path data while retaining source offsets and numeric lexemes. */
export function tokenizeSvgPathData(pathData: string): SvgPathToken[] {
  if (typeof pathData !== 'string') {
    throw new SvgPathDataError('SVG path data must be a string', -1)
  }

  const tokens: SvgPathToken[] = []
  let offset = 0

  while (offset < pathData.length) {
    const character = pathData[offset]

    if (isWhitespace(character)) {
      offset += 1
      continue
    }

    if (character === ',') {
      const previous = tokens[tokens.length - 1]
      if (!previous || previous.type !== 'number') {
        throw new SvgPathDataError('Unexpected comma', offset)
      }

      let nextOffset = offset + 1
      while (nextOffset < pathData.length && isWhitespace(pathData[nextOffset])) {
        nextOffset += 1
      }
      if (nextOffset >= pathData.length || !isNumberStart(pathData[nextOffset])) {
        throw new SvgPathDataError('Comma must separate numeric parameters', offset)
      }
      offset += 1
      continue
    }

    if (COMMANDS.has(character)) {
      tokens.push({
        type: 'command',
        value: character as SvgPathCommandType,
        offset,
        end: offset + 1
      })
      offset += 1
      continue
    }

    if (isNumberStart(character)) {
      const match = NUMBER_PREFIX.exec(pathData.slice(offset))
      if (!match) {
        throw new SvgPathDataError('Malformed number', offset)
      }

      const raw = match[0]
      const value = Number(raw)
      if (!Number.isFinite(value)) {
        throw new SvgPathDataError('Path numbers must be finite', offset)
      }

      tokens.push({
        type: 'number',
        value,
        raw,
        offset,
        end: offset + raw.length
      })
      offset += raw.length
      continue
    }

    if (/[A-Za-z]/.test(character)) {
      throw new SvgPathDataError(`Unsupported SVG path command "${character}"`, offset)
    }
    throw new SvgPathDataError(`Unexpected character "${character}"`, offset)
  }

  return tokens
}

interface MutableNumberToken {
  type: 'number'
  value: number
  raw: string
  offset: number
  end: number
}

class TokenCursor {
  private readonly tokens: Array<SvgPathToken | MutableNumberToken>
  private position = 0

  constructor(tokens: readonly SvgPathToken[]) {
    this.tokens = tokens.map((token) => ({ ...token }))
  }

  get done(): boolean {
    return this.position >= this.tokens.length
  }

  peek(): SvgPathToken | MutableNumberToken | undefined {
    return this.tokens[this.position]
  }

  takeCommand(): Extract<SvgPathToken, { type: 'command' }> | undefined {
    const token = this.peek()
    if (!token || token.type !== 'command') return undefined
    this.position += 1
    return token
  }

  hasNumber(): boolean {
    return this.peek()?.type === 'number'
  }

  readNumber(description: string, fallbackOffset: number): number {
    const token = this.peek()
    if (!token || token.type !== 'number') {
      throw new SvgPathDataError(`Expected ${description}`, token?.offset ?? fallbackOffset)
    }
    this.position += 1
    return token.value
  }

  readArcFlag(description: string, fallbackOffset: number): number {
    const token = this.peek()
    if (!token || token.type !== 'number') {
      throw new SvgPathDataError(`Expected ${description}`, token?.offset ?? fallbackOffset)
    }

    const flagCharacter = token.raw[0]
    if (flagCharacter !== '0' && flagCharacter !== '1') {
      throw new SvgPathDataError(`${description} must be 0 or 1`, token.offset)
    }

    if (token.raw.length === 1) {
      this.position += 1
    } else {
      const remainder = token.raw.slice(1)
      if (!NUMBER_WHOLE.test(remainder)) {
        throw new SvgPathDataError(`${description} must be 0 or 1`, token.offset)
      }
      token.raw = remainder
      token.value = Number(remainder)
      token.offset += 1
    }

    return Number(flagCharacter)
  }
}

function readParameterGroup(
  cursor: TokenCursor,
  type: SvgPathCommandType,
  commandOffset: number
): number[] {
  const upperType = type.toUpperCase() as Uppercase<SvgPathCommandType>
  const parameterCount = PARAMETER_COUNTS[upperType]
  const values: number[] = []

  for (let parameter = 0; parameter < parameterCount; parameter += 1) {
    if (upperType === 'A' && (parameter === 3 || parameter === 4)) {
      values.push(cursor.readArcFlag(
        parameter === 3 ? 'large-arc flag' : 'sweep flag',
        commandOffset
      ))
    } else {
      values.push(cursor.readNumber(`parameter ${parameter + 1} for ${type}`, commandOffset))
    }
  }

  return values
}

/**
 * Parse SVG path data into explicit parameter groups. Repeated groups become
 * separate commands; additional moveto pairs correctly become lineto commands.
 */
export function parseSvgPathData(pathData: string): SvgPathCommand[] {
  const cursor = new TokenCursor(tokenizeSvgPathData(pathData))
  const commands: SvgPathCommand[] = []

  while (!cursor.done) {
    const commandToken = cursor.takeCommand()
    if (!commandToken) {
      const token = cursor.peek()
      throw new SvgPathDataError('Expected an SVG path command', token?.offset ?? pathData.length)
    }

    const type = commandToken.value
    const upperType = type.toUpperCase() as Uppercase<SvgPathCommandType>
    if (commands.length === 0 && upperType !== 'M') {
      throw new SvgPathDataError('SVG path data must begin with moveto', commandToken.offset)
    }

    if (upperType === 'Z') {
      commands.push({ type, values: [], offset: commandToken.offset })
      continue
    }

    if (!cursor.hasNumber()) {
      throw new SvgPathDataError(`Command ${type} requires parameters`, commandToken.offset)
    }

    let repeatedType = type
    do {
      const values = readParameterGroup(cursor, repeatedType, commandToken.offset)
      commands.push({ type: repeatedType, values, offset: commandToken.offset })

      if (upperType === 'M') {
        repeatedType = type === 'M' ? 'L' : 'l'
      }
    } while (cursor.hasNumber())
  }

  return commands
}

function copyPoint(point: SvgPoint): SvgPoint {
  return { x: point.x, y: point.y }
}

function samePoint(first: SvgPoint, second: SvgPoint): boolean {
  return first.x === second.x && first.y === second.y
}

function resolvePoint(
  x: number,
  y: number,
  relative: boolean,
  current: SvgPoint
): SvgPoint {
  return relative
    ? { x: current.x + x, y: current.y + y }
    : { x, y }
}

function pointToSegmentDistance(point: SvgPoint, start: SvgPoint, end: SvgPoint): number {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const squaredLength = dx * dx + dy * dy
  if (squaredLength === 0) return Math.hypot(point.x - start.x, point.y - start.y)

  const projection = Math.max(0, Math.min(1,
    ((point.x - start.x) * dx + (point.y - start.y) * dy) / squaredLength
  ))
  return Math.hypot(
    point.x - (start.x + projection * dx),
    point.y - (start.y + projection * dy)
  )
}

function midpoint(first: SvgPoint, second: SvgPoint): SvgPoint {
  return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 }
}

function flattenCubic(
  start: SvgPoint,
  control1: SvgPoint,
  control2: SvgPoint,
  end: SvgPoint,
  tolerance: number,
  maxDepth: number,
  maxSegments: number,
  append: (point: SvgPoint) => void
): void {
  let emittedSegments = 0

  const visit = (
    from: SvgPoint,
    firstControl: SvgPoint,
    secondControl: SvgPoint,
    to: SvgPoint,
    depth: number
  ): void => {
    const flat = Math.max(
      pointToSegmentDistance(firstControl, from, to),
      pointToSegmentDistance(secondControl, from, to)
    ) <= tolerance

    if (flat || depth >= maxDepth) {
      emittedSegments += 1
      if (emittedSegments > maxSegments) {
        throw new SvgPathDataError('Cubic curve exceeds the segment safety limit', -1)
      }
      append(to)
      return
    }

    const firstHalf = midpoint(from, firstControl)
    const middleHalf = midpoint(firstControl, secondControl)
    const secondHalf = midpoint(secondControl, to)
    const leftControl = midpoint(firstHalf, middleHalf)
    const rightControl = midpoint(middleHalf, secondHalf)
    const split = midpoint(leftControl, rightControl)

    visit(from, firstHalf, leftControl, split, depth + 1)
    visit(split, rightControl, secondHalf, to, depth + 1)
  }

  visit(start, control1, control2, end, 0)
}

function flattenQuadratic(
  start: SvgPoint,
  control: SvgPoint,
  end: SvgPoint,
  tolerance: number,
  maxDepth: number,
  maxSegments: number,
  append: (point: SvgPoint) => void
): void {
  let emittedSegments = 0

  const visit = (from: SvgPoint, via: SvgPoint, to: SvgPoint, depth: number): void => {
    if (pointToSegmentDistance(via, from, to) <= tolerance || depth >= maxDepth) {
      emittedSegments += 1
      if (emittedSegments > maxSegments) {
        throw new SvgPathDataError('Quadratic curve exceeds the segment safety limit', -1)
      }
      append(to)
      return
    }

    const firstHalf = midpoint(from, via)
    const secondHalf = midpoint(via, to)
    const split = midpoint(firstHalf, secondHalf)
    visit(from, firstHalf, split, depth + 1)
    visit(split, secondHalf, to, depth + 1)
  }

  visit(start, control, end, 0)
}

function flattenArc(
  start: SvgPoint,
  rxValue: number,
  ryValue: number,
  rotationDegrees: number,
  largeArc: boolean,
  sweep: boolean,
  end: SvgPoint,
  tolerance: number,
  maxSegments: number,
  append: (point: SvgPoint) => void
): void {
  if (samePoint(start, end)) return

  let rx = Math.abs(rxValue)
  let ry = Math.abs(ryValue)
  if (rx === 0 || ry === 0) {
    append(end)
    return
  }

  const rotation = ((rotationDegrees % 360) * Math.PI) / 180
  const cosine = Math.cos(rotation)
  const sine = Math.sin(rotation)
  const halfDx = (start.x - end.x) / 2
  const halfDy = (start.y - end.y) / 2
  const transformedX = cosine * halfDx + sine * halfDy
  const transformedY = -sine * halfDx + cosine * halfDy

  const radiiScale = (transformedX * transformedX) / (rx * rx) +
    (transformedY * transformedY) / (ry * ry)
  if (radiiScale > 1) {
    const scale = Math.sqrt(radiiScale)
    rx *= scale
    ry *= scale
  }

  const rxSquared = rx * rx
  const rySquared = ry * ry
  const xSquared = transformedX * transformedX
  const ySquared = transformedY * transformedY
  const denominator = rxSquared * ySquared + rySquared * xSquared
  const numerator = Math.max(0,
    rxSquared * rySquared - rxSquared * ySquared - rySquared * xSquared
  )
  const sign = largeArc === sweep ? -1 : 1
  const coefficient = denominator === 0 ? 0 : sign * Math.sqrt(numerator / denominator)
  const centerTransformedX = coefficient * (rx * transformedY) / ry
  const centerTransformedY = coefficient * (-ry * transformedX) / rx
  const center = {
    x: cosine * centerTransformedX - sine * centerTransformedY + (start.x + end.x) / 2,
    y: sine * centerTransformedX + cosine * centerTransformedY + (start.y + end.y) / 2
  }

  const startVector = {
    x: (transformedX - centerTransformedX) / rx,
    y: (transformedY - centerTransformedY) / ry
  }
  const endVector = {
    x: (-transformedX - centerTransformedX) / rx,
    y: (-transformedY - centerTransformedY) / ry
  }
  const startAngle = Math.atan2(startVector.y, startVector.x)
  let angleDelta = Math.atan2(
    startVector.x * endVector.y - startVector.y * endVector.x,
    startVector.x * endVector.x + startVector.y * endVector.y
  )
  if (!sweep && angleDelta > 0) angleDelta -= Math.PI * 2
  if (sweep && angleDelta < 0) angleDelta += Math.PI * 2

  const maximumRadius = Math.max(rx, ry)
  const cosineArgument = Math.max(-1, Math.min(1, 1 - tolerance / maximumRadius))
  let maximumAngle = 2 * Math.acos(cosineArgument)
  if (!Number.isFinite(maximumAngle) || maximumAngle <= 0) {
    maximumAngle = Math.abs(angleDelta) / maxSegments
  }
  maximumAngle = Math.min(maximumAngle, Math.PI / 2)
  const segmentCount = Math.max(1, Math.ceil(Math.abs(angleDelta) / maximumAngle))
  if (segmentCount > maxSegments) {
    throw new SvgPathDataError('Elliptical arc exceeds the segment safety limit', -1)
  }

  for (let segment = 1; segment <= segmentCount; segment += 1) {
    if (segment === segmentCount) {
      append(end)
      continue
    }
    const angle = startAngle + angleDelta * (segment / segmentCount)
    const ellipseX = rx * Math.cos(angle)
    const ellipseY = ry * Math.sin(angle)
    append({
      x: center.x + cosine * ellipseX - sine * ellipseY,
      y: center.y + sine * ellipseX + cosine * ellipseY
    })
  }
}

function validateFlattenOptions(options: SvgPathFlattenOptions): Required<SvgPathFlattenOptions> {
  const tolerance = options.tolerance ?? 0.25
  const maxCurveDepth = options.maxCurveDepth ?? 18
  const maxSegments = options.maxSegments ?? 65536

  if (!Number.isFinite(tolerance) || tolerance <= 0) {
    throw new RangeError('SVG path flattening tolerance must be a positive finite number')
  }
  if (!Number.isInteger(maxCurveDepth) || maxCurveDepth < 0 || maxCurveDepth > 30) {
    throw new RangeError('maxCurveDepth must be an integer from 0 through 30')
  }
  if (!Number.isInteger(maxSegments) || maxSegments < 1) {
    throw new RangeError('maxSegments must be a positive integer')
  }

  return { tolerance, maxCurveDepth, maxSegments }
}

function assertCommandShape(command: SvgPathCommand): void {
  if (!COMMANDS.has(command.type)) {
    throw new SvgPathDataError(`Unsupported SVG path command "${command.type}"`, command.offset)
  }
  const upperType = command.type.toUpperCase() as Uppercase<SvgPathCommandType>
  if (command.values.length !== PARAMETER_COUNTS[upperType]) {
    throw new SvgPathDataError(
      `Command ${command.type} requires ${PARAMETER_COUNTS[upperType]} parameters`,
      command.offset
    )
  }
  if (!command.values.every(Number.isFinite)) {
    throw new SvgPathDataError('Path command parameters must be finite', command.offset)
  }
  if (upperType === 'A' &&
      ((command.values[3] !== 0 && command.values[3] !== 1) ||
       (command.values[4] !== 0 && command.values[4] !== 1))) {
    throw new SvgPathDataError('Arc flags must be 0 or 1', command.offset)
  }
}

/** Flatten parsed commands (or a path-data string) into independent polylines. */
export function flattenSvgPathData(
  pathDataOrCommands: string | readonly SvgPathCommand[],
  options: SvgPathFlattenOptions = {}
): FlattenedSvgSubpath[] {
  const commands = typeof pathDataOrCommands === 'string'
    ? parseSvgPathData(pathDataOrCommands)
    : pathDataOrCommands
  const { tolerance, maxCurveDepth, maxSegments } = validateFlattenOptions(options)
  if (commands.length === 0) return []

  const subpaths: FlattenedSvgSubpath[] = []
  let active: FlattenedSvgSubpath | undefined
  let current: SvgPoint = { x: 0, y: 0 }
  let subpathStart: SvgPoint = { x: 0, y: 0 }
  let previousType: Uppercase<SvgPathCommandType> | undefined
  let lastCubicControl: SvgPoint | undefined
  let lastQuadraticControl: SvgPoint | undefined

  const finishOpenSubpath = (): void => {
    if (active) subpaths.push(active)
    active = undefined
  }
  const ensureActive = (): FlattenedSvgSubpath => {
    if (!active) active = { points: [copyPoint(current)], closed: false }
    return active
  }
  const append = (point: SvgPoint): void => {
    const target = ensureActive()
    const last = target.points[target.points.length - 1]
    if (!samePoint(last, point)) target.points.push(copyPoint(point))
  }
  const resetControls = (): void => {
    lastCubicControl = undefined
    lastQuadraticControl = undefined
  }

  commands.forEach((command, commandIndex) => {
    assertCommandShape(command)
    const rawType = command.type
    const type = rawType.toUpperCase() as Uppercase<SvgPathCommandType>
    if (commandIndex === 0 && type !== 'M') {
      throw new SvgPathDataError('SVG path data must begin with moveto', command.offset)
    }
    const relative = rawType === rawType.toLowerCase()
    const values = command.values

    switch (type) {
      case 'M': {
        finishOpenSubpath()
        current = resolvePoint(values[0], values[1], relative, current)
        subpathStart = copyPoint(current)
        active = { points: [copyPoint(current)], closed: false }
        resetControls()
        break
      }
      case 'L': {
        const end = resolvePoint(values[0], values[1], relative, current)
        append(end)
        current = end
        resetControls()
        break
      }
      case 'H': {
        const end = { x: relative ? current.x + values[0] : values[0], y: current.y }
        append(end)
        current = end
        resetControls()
        break
      }
      case 'V': {
        const end = { x: current.x, y: relative ? current.y + values[0] : values[0] }
        append(end)
        current = end
        resetControls()
        break
      }
      case 'C': {
        const control1 = resolvePoint(values[0], values[1], relative, current)
        const control2 = resolvePoint(values[2], values[3], relative, current)
        const end = resolvePoint(values[4], values[5], relative, current)
        flattenCubic(
          current, control1, control2, end,
          tolerance, maxCurveDepth, maxSegments, append
        )
        current = end
        lastCubicControl = control2
        lastQuadraticControl = undefined
        break
      }
      case 'S': {
        const control1 = previousType === 'C' || previousType === 'S'
          ? {
              x: current.x * 2 - (lastCubicControl?.x ?? current.x),
              y: current.y * 2 - (lastCubicControl?.y ?? current.y)
            }
          : copyPoint(current)
        const control2 = resolvePoint(values[0], values[1], relative, current)
        const end = resolvePoint(values[2], values[3], relative, current)
        flattenCubic(
          current, control1, control2, end,
          tolerance, maxCurveDepth, maxSegments, append
        )
        current = end
        lastCubicControl = control2
        lastQuadraticControl = undefined
        break
      }
      case 'Q': {
        const control = resolvePoint(values[0], values[1], relative, current)
        const end = resolvePoint(values[2], values[3], relative, current)
        flattenQuadratic(
          current, control, end,
          tolerance, maxCurveDepth, maxSegments, append
        )
        current = end
        lastQuadraticControl = control
        lastCubicControl = undefined
        break
      }
      case 'T': {
        const control = previousType === 'Q' || previousType === 'T'
          ? {
              x: current.x * 2 - (lastQuadraticControl?.x ?? current.x),
              y: current.y * 2 - (lastQuadraticControl?.y ?? current.y)
            }
          : copyPoint(current)
        const end = resolvePoint(values[0], values[1], relative, current)
        flattenQuadratic(
          current, control, end,
          tolerance, maxCurveDepth, maxSegments, append
        )
        current = end
        lastQuadraticControl = control
        lastCubicControl = undefined
        break
      }
      case 'A': {
        const end = resolvePoint(values[5], values[6], relative, current)
        flattenArc(
          current, values[0], values[1], values[2],
          values[3] === 1, values[4] === 1, end,
          tolerance, maxSegments, append
        )
        current = end
        resetControls()
        break
      }
      case 'Z': {
        if (active) {
          append(subpathStart)
          active.closed = true
          subpaths.push(active)
          active = undefined
        }
        current = copyPoint(subpathStart)
        resetControls()
        break
      }
    }

    previousType = type
  })

  finishOpenSubpath()
  return subpaths
}
