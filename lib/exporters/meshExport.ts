import type { Geometry } from '../generators/CookieCutterGenerator'

export type DegenerateTrianglePolicy = 'reject' | 'skip'

/** Keeps mesh headers readable and names broadly interoperable across export tools. */
export const MAX_MESH_NAME_LENGTH = 80

const PRINTABLE_ASCII = /^[\x20-\x7e]+$/

export interface MeshExportOptions {
  /** Reject invalid faces by default; use "skip" only when filtering is intentional. */
  degenerateTriangles?: DegenerateTrianglePolicy
}

export interface AsciiSTLExportOptions extends MeshExportOptions {
  solidName?: string
}

export interface OBJExportOptions extends MeshExportOptions {
  objectName?: string
}

interface PreparedTriangle {
  indices: readonly [number, number, number]
  normal: readonly [number, number, number]
}

interface PreparedGeometry {
  vertices: Float32Array
  triangles: PreparedTriangle[]
}

export class MeshExportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MeshExportError'
  }
}

/** Serialize indexed triangle geometry as an ASCII STL document. */
export function serializeAsciiSTL(
  geometry: Geometry,
  options: AsciiSTLExportOptions = {}
): string {
  const solidName = validateName(options.solidName ?? 'cookie-cutter', 'solidName')
  const prepared = prepareGeometry(geometry, options.degenerateTriangles)
  const lines: string[] = [`solid ${solidName}`]

  for (const triangle of prepared.triangles) {
    const [normalX, normalY, normalZ] = triangle.normal
    lines.push(
      `  facet normal ${formatNumber(normalX)} ${formatNumber(normalY)} ${formatNumber(normalZ)}`,
      '    outer loop'
    )

    for (const vertexIndex of triangle.indices) {
      const offset = vertexIndex * 3
      lines.push(
        `      vertex ${formatNumber(prepared.vertices[offset])} ${formatNumber(prepared.vertices[offset + 1])} ${formatNumber(prepared.vertices[offset + 2])}`
      )
    }

    lines.push('    endloop', '  endfacet')
  }

  lines.push(`endsolid ${solidName}`)
  return `${lines.join('\n')}\n`
}

/** Serialize indexed triangle geometry as an OBJ document with one-based faces. */
export function serializeOBJ(
  geometry: Geometry,
  options: OBJExportOptions = {}
): string {
  const objectName = validateName(options.objectName ?? 'cookie-cutter', 'objectName')
  const prepared = prepareGeometry(geometry, options.degenerateTriangles)
  const lines: string[] = ['# Dough Forge OBJ export', `o ${objectName}`]

  for (let offset = 0; offset < prepared.vertices.length; offset += 3) {
    lines.push(
      `v ${formatNumber(prepared.vertices[offset])} ${formatNumber(prepared.vertices[offset + 1])} ${formatNumber(prepared.vertices[offset + 2])}`
    )
  }

  for (const triangle of prepared.triangles) {
    const [first, second, third] = triangle.indices
    lines.push(`f ${first + 1} ${second + 1} ${third + 1}`)
  }

  return `${lines.join('\n')}\n`
}

function prepareGeometry(
  geometry: Geometry,
  requestedPolicy: DegenerateTrianglePolicy | undefined
): PreparedGeometry {
  const policy = requestedPolicy ?? 'reject'
  if (policy !== 'reject' && policy !== 'skip') {
    throw new MeshExportError(`Unsupported degenerate triangle policy: ${String(policy)}`)
  }

  if (!geometry || typeof geometry !== 'object') {
    throw new MeshExportError('Geometry must be an object')
  }

  const { vertices, faces } = geometry
  if (!(vertices instanceof Float32Array)) {
    throw new MeshExportError('Geometry vertices must be a Float32Array')
  }
  if (!(faces instanceof Uint32Array)) {
    throw new MeshExportError('Geometry faces must be a Uint32Array')
  }
  if (vertices.length < 9 || vertices.length % 3 !== 0) {
    throw new MeshExportError(
      'Geometry vertices must contain at least three complete XYZ coordinates'
    )
  }
  if (faces.length < 3 || faces.length % 3 !== 0) {
    throw new MeshExportError(
      'Geometry faces must contain at least one complete triangle'
    )
  }

  for (let coordinateIndex = 0; coordinateIndex < vertices.length; coordinateIndex += 1) {
    if (!Number.isFinite(vertices[coordinateIndex])) {
      throw new MeshExportError(
        `Geometry vertex coordinate ${coordinateIndex} must be finite`
      )
    }
  }

  const vertexCount = vertices.length / 3
  const triangles: PreparedTriangle[] = []

  for (let faceOffset = 0; faceOffset < faces.length; faceOffset += 3) {
    const triangleIndex = faceOffset / 3
    const first = faces[faceOffset]
    const second = faces[faceOffset + 1]
    const third = faces[faceOffset + 2]

    for (const vertexIndex of [first, second, third]) {
      if (!Number.isInteger(vertexIndex) || vertexIndex < 0 || vertexIndex >= vertexCount) {
        throw new MeshExportError(
          `Triangle ${triangleIndex} references out-of-range vertex ${vertexIndex}`
        )
      }
    }

    const normal = calculateNormal(vertices, first, second, third)
    if (normal === null) {
      if (policy === 'reject') {
        throw new MeshExportError(`Triangle ${triangleIndex} is degenerate`)
      }
      continue
    }

    triangles.push({ indices: [first, second, third], normal })
  }

  if (triangles.length === 0) {
    throw new MeshExportError(
      'Geometry contains no non-degenerate triangles after filtering'
    )
  }

  return { vertices, triangles }
}

function calculateNormal(
  vertices: Float32Array,
  first: number,
  second: number,
  third: number
): readonly [number, number, number] | null {
  const firstOffset = first * 3
  const secondOffset = second * 3
  const thirdOffset = third * 3
  const edgeAX = vertices[secondOffset] - vertices[firstOffset]
  const edgeAY = vertices[secondOffset + 1] - vertices[firstOffset + 1]
  const edgeAZ = vertices[secondOffset + 2] - vertices[firstOffset + 2]
  const edgeBX = vertices[thirdOffset] - vertices[firstOffset]
  const edgeBY = vertices[thirdOffset + 1] - vertices[firstOffset + 1]
  const edgeBZ = vertices[thirdOffset + 2] - vertices[firstOffset + 2]
  const normalX = edgeAY * edgeBZ - edgeAZ * edgeBY
  const normalY = edgeAZ * edgeBX - edgeAX * edgeBZ
  const normalZ = edgeAX * edgeBY - edgeAY * edgeBX
  const length = Math.hypot(normalX, normalY, normalZ)

  if (!Number.isFinite(length)) {
    throw new MeshExportError('Triangle normal calculation produced a non-finite value')
  }
  if (length === 0) return null

  return [normalX / length, normalY / length, normalZ / length]
}

function validateName(name: string, field: string): string {
  if (typeof name !== 'string' || name.trim().length === 0) {
    throw new MeshExportError(`${field} must be a non-empty string`)
  }
  if (!PRINTABLE_ASCII.test(name)) {
    throw new MeshExportError(`${field} must contain only printable ASCII characters`)
  }

  const normalizedName = name.trim()
  if (normalizedName.length > MAX_MESH_NAME_LENGTH) {
    throw new MeshExportError(
      `${field} must be ${MAX_MESH_NAME_LENGTH} characters or fewer`
    )
  }
  return normalizedName
}

function formatNumber(value: number): string {
  return Object.is(value, -0) ? '0' : String(value)
}
