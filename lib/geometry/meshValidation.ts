import type { Geometry } from '../generators/CookieCutterGenerator'

export const DEFAULT_VERTEX_WELD_TOLERANCE = 1e-5

export interface MeshValidationOptions {
  /**
   * Maximum Euclidean distance between vertices that should be treated as the
   * same topological vertex. Vertices are considered in source order, so the
   * first matching vertex is always the deterministic representative.
   */
  vertexWeldTolerance?: number
  /**
   * Triangles at or below this area (in squared geometry units) are treated as
   * degenerate. Defaults to the square of vertexWeldTolerance.
   */
  degenerateTriangleAreaTolerance?: number
}

export interface InvalidFaceIndex {
  triangleIndex: number
  corner: 0 | 1 | 2
  vertexIndex: number
}

export interface DuplicateTriangle {
  triangleIndex: number
  duplicateOf: number
}

/** Vertex indices refer to the first source vertex in each welded group. */
export interface MeshEdgeReport {
  vertices: readonly [number, number]
  incidentTriangles: readonly number[]
}

export interface MeshConnectedComponent {
  index: number
  triangleIndices: readonly number[]
}

export interface MeshValidationReport {
  vertexCount: number
  triangleCount: number
  validTriangleCount: number
  weldedVertexCount: number
  trailingVertexCoordinateCount: number
  trailingFaceIndexCount: number
  nonFiniteVertexIndices: readonly number[]
  nonFiniteCoordinateIndices: readonly number[]
  invalidFaceIndices: readonly InvalidFaceIndex[]
  trianglesWithNonFiniteVertices: readonly number[]
  degenerateTriangleIndices: readonly number[]
  duplicateTriangles: readonly DuplicateTriangle[]
  boundaryEdges: readonly MeshEdgeReport[]
  nonManifoldEdges: readonly MeshEdgeReport[]
  inconsistentlyOrientedEdges: readonly MeshEdgeReport[]
  connectedComponentCount: number
  connectedComponents: readonly MeshConnectedComponent[]
  isWatertight: boolean
}

interface WeldedVertex {
  representativeIndex: number
  x: number
  y: number
  z: number
}

interface EdgeUse {
  triangleIndex: number
  from: number
  to: number
}

interface EdgeRecord {
  vertices: readonly [number, number]
  uses: EdgeUse[]
}

interface WeldResult {
  originalToRepresentative: Int32Array
  representatives: Map<number, WeldedVertex>
}

/**
 * Inspect an indexed triangle mesh without modifying it.
 *
 * Topology is calculated after tolerance-based vertex welding. Invalid and
 * degenerate triangles remain visible in the report but are excluded from edge
 * and connected-component calculations.
 */
export function analyzeMesh(
  geometry: Geometry,
  options: MeshValidationOptions = {}
): MeshValidationReport {
  assertGeometryArrays(geometry)

  const vertexWeldTolerance = options.vertexWeldTolerance
    ?? DEFAULT_VERTEX_WELD_TOLERANCE
  assertFinitePositive(vertexWeldTolerance, 'vertexWeldTolerance')

  const areaTolerance = options.degenerateTriangleAreaTolerance
    ?? vertexWeldTolerance * vertexWeldTolerance
  assertFiniteNonNegative(areaTolerance, 'degenerateTriangleAreaTolerance')

  const vertexCount = Math.floor(geometry.vertices.length / 3)
  const triangleCount = Math.floor(geometry.faces.length / 3)
  const trailingVertexCoordinateCount = geometry.vertices.length % 3
  const trailingFaceIndexCount = geometry.faces.length % 3
  const nonFiniteCoordinateIndices: number[] = []
  const nonFiniteVertexIndices: number[] = []

  for (let coordinateIndex = 0; coordinateIndex < geometry.vertices.length; coordinateIndex += 1) {
    if (!Number.isFinite(geometry.vertices[coordinateIndex])) {
      nonFiniteCoordinateIndices.push(coordinateIndex)
    }
  }

  for (let vertexIndex = 0; vertexIndex < vertexCount; vertexIndex += 1) {
    const offset = vertexIndex * 3
    if (
      !Number.isFinite(geometry.vertices[offset])
      || !Number.isFinite(geometry.vertices[offset + 1])
      || !Number.isFinite(geometry.vertices[offset + 2])
    ) {
      nonFiniteVertexIndices.push(vertexIndex)
    }
  }

  const weldResult = weldVertices(
    geometry.vertices,
    vertexCount,
    vertexWeldTolerance
  )
  const invalidFaceIndices: InvalidFaceIndex[] = []
  const trianglesWithNonFiniteVertices: number[] = []
  const degenerateTriangleIndices: number[] = []
  const duplicateTriangles: DuplicateTriangle[] = []
  const firstTriangleByVertices = new Map<string, number>()
  const edges = new Map<string, EdgeRecord>()
  const validTriangleIndices: number[] = []

  for (let triangleIndex = 0; triangleIndex < triangleCount; triangleIndex += 1) {
    const faceOffset = triangleIndex * 3
    const sourceIndices = [
      geometry.faces[faceOffset],
      geometry.faces[faceOffset + 1],
      geometry.faces[faceOffset + 2]
    ] as const
    let hasInvalidIndex = false

    for (let corner = 0; corner < 3; corner += 1) {
      const vertexIndex = sourceIndices[corner]
      if (!Number.isInteger(vertexIndex) || vertexIndex < 0 || vertexIndex >= vertexCount) {
        invalidFaceIndices.push({
          triangleIndex,
          corner: corner as 0 | 1 | 2,
          vertexIndex
        })
        hasInvalidIndex = true
      }
    }

    if (hasInvalidIndex) continue

    const weldedIndices = sourceIndices.map((vertexIndex) => (
      weldResult.originalToRepresentative[vertexIndex]
    )) as [number, number, number]

    if (weldedIndices.some((vertexIndex) => vertexIndex < 0)) {
      trianglesWithNonFiniteVertices.push(triangleIndex)
      continue
    }

    if (
      new Set(weldedIndices).size < 3
      || triangleArea(weldedIndices, weldResult.representatives) <= areaTolerance
    ) {
      degenerateTriangleIndices.push(triangleIndex)
      continue
    }

    validTriangleIndices.push(triangleIndex)
    const triangleKey = [...weldedIndices].sort((first, second) => first - second).join(':')
    const duplicateOf = firstTriangleByVertices.get(triangleKey)
    if (duplicateOf === undefined) {
      firstTriangleByVertices.set(triangleKey, triangleIndex)
    } else {
      duplicateTriangles.push({ triangleIndex, duplicateOf })
    }

    addEdge(edges, weldedIndices[0], weldedIndices[1], triangleIndex)
    addEdge(edges, weldedIndices[1], weldedIndices[2], triangleIndex)
    addEdge(edges, weldedIndices[2], weldedIndices[0], triangleIndex)
  }

  const boundaryEdges: MeshEdgeReport[] = []
  const nonManifoldEdges: MeshEdgeReport[] = []
  const inconsistentlyOrientedEdges: MeshEdgeReport[] = []

  for (const edge of edges.values()) {
    const report = edgeReport(edge)
    if (edge.uses.length === 1) {
      boundaryEdges.push(report)
    } else if (edge.uses.length > 2) {
      nonManifoldEdges.push(report)
    } else if (!usesHaveOppositeDirections(edge.uses[0], edge.uses[1])) {
      inconsistentlyOrientedEdges.push(report)
    }
  }

  const connectedComponents = findConnectedComponents(validTriangleIndices, edges)
  const hasStructuralErrors = (
    trailingVertexCoordinateCount > 0
    || trailingFaceIndexCount > 0
    || nonFiniteCoordinateIndices.length > 0
    || invalidFaceIndices.length > 0
    || trianglesWithNonFiniteVertices.length > 0
  )
  const isWatertight = (
    validTriangleIndices.length > 0
    && !hasStructuralErrors
    && degenerateTriangleIndices.length === 0
    && duplicateTriangles.length === 0
    && boundaryEdges.length === 0
    && nonManifoldEdges.length === 0
    && inconsistentlyOrientedEdges.length === 0
  )

  return {
    vertexCount,
    triangleCount,
    validTriangleCount: validTriangleIndices.length,
    weldedVertexCount: weldResult.representatives.size,
    trailingVertexCoordinateCount,
    trailingFaceIndexCount,
    nonFiniteVertexIndices,
    nonFiniteCoordinateIndices,
    invalidFaceIndices,
    trianglesWithNonFiniteVertices,
    degenerateTriangleIndices,
    duplicateTriangles,
    boundaryEdges,
    nonManifoldEdges,
    inconsistentlyOrientedEdges,
    connectedComponentCount: connectedComponents.length,
    connectedComponents,
    isWatertight
  }
}

/** Alias for callers that prefer validation terminology. */
export const validateMesh = analyzeMesh

function assertGeometryArrays(geometry: Geometry): void {
  if (!geometry || typeof geometry !== 'object') {
    throw new TypeError('Geometry must be an object')
  }
  if (!(geometry.vertices instanceof Float32Array)) {
    throw new TypeError('Geometry vertices must be a Float32Array')
  }
  if (!(geometry.faces instanceof Uint32Array)) {
    throw new TypeError('Geometry faces must be a Uint32Array')
  }
}

function assertFinitePositive(value: number, field: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${field} must be a finite number greater than zero`)
  }
}

function assertFiniteNonNegative(value: number, field: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${field} must be a finite non-negative number`)
  }
}

function weldVertices(
  vertices: Float32Array,
  vertexCount: number,
  tolerance: number
): WeldResult {
  const originalToRepresentative = new Int32Array(vertexCount)
  originalToRepresentative.fill(-1)
  const representatives = new Map<number, WeldedVertex>()
  const spatialBuckets = new Map<string, WeldedVertex[]>()
  const squaredTolerance = tolerance * tolerance

  for (let vertexIndex = 0; vertexIndex < vertexCount; vertexIndex += 1) {
    const offset = vertexIndex * 3
    const x = vertices[offset]
    const y = vertices[offset + 1]
    const z = vertices[offset + 2]
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue

    const cellX = Math.floor(x / tolerance)
    const cellY = Math.floor(y / tolerance)
    const cellZ = Math.floor(z / tolerance)
    let match: WeldedVertex | undefined

    for (let deltaX = -1; deltaX <= 1; deltaX += 1) {
      for (let deltaY = -1; deltaY <= 1; deltaY += 1) {
        for (let deltaZ = -1; deltaZ <= 1; deltaZ += 1) {
          const bucket = spatialBuckets.get(
            bucketKey(cellX + deltaX, cellY + deltaY, cellZ + deltaZ)
          )
          if (!bucket) continue

          for (const candidate of bucket) {
            const squaredDistance = (
              (candidate.x - x) ** 2
              + (candidate.y - y) ** 2
              + (candidate.z - z) ** 2
            )
            if (
              squaredDistance <= squaredTolerance
              && (!match || candidate.representativeIndex < match.representativeIndex)
            ) {
              match = candidate
            }
          }
        }
      }
    }

    if (match) {
      originalToRepresentative[vertexIndex] = match.representativeIndex
      continue
    }

    const representative: WeldedVertex = {
      representativeIndex: vertexIndex,
      x,
      y,
      z
    }
    originalToRepresentative[vertexIndex] = vertexIndex
    representatives.set(vertexIndex, representative)
    const key = bucketKey(cellX, cellY, cellZ)
    const bucket = spatialBuckets.get(key)
    if (bucket) bucket.push(representative)
    else spatialBuckets.set(key, [representative])
  }

  return { originalToRepresentative, representatives }
}

function bucketKey(x: number, y: number, z: number): string {
  return `${x}:${y}:${z}`
}

function triangleArea(
  indices: readonly [number, number, number],
  vertices: Map<number, WeldedVertex>
): number {
  const first = vertices.get(indices[0])
  const second = vertices.get(indices[1])
  const third = vertices.get(indices[2])
  if (!first || !second || !third) return 0

  const edgeAX = second.x - first.x
  const edgeAY = second.y - first.y
  const edgeAZ = second.z - first.z
  const edgeBX = third.x - first.x
  const edgeBY = third.y - first.y
  const edgeBZ = third.z - first.z
  const crossX = edgeAY * edgeBZ - edgeAZ * edgeBY
  const crossY = edgeAZ * edgeBX - edgeAX * edgeBZ
  const crossZ = edgeAX * edgeBY - edgeAY * edgeBX

  return Math.hypot(crossX, crossY, crossZ) / 2
}

function addEdge(
  edges: Map<string, EdgeRecord>,
  from: number,
  to: number,
  triangleIndex: number
): void {
  const first = Math.min(from, to)
  const second = Math.max(from, to)
  const key = `${first}:${second}`
  const use = { triangleIndex, from, to }
  const existing = edges.get(key)
  if (existing) existing.uses.push(use)
  else edges.set(key, { vertices: [first, second], uses: [use] })
}

function edgeReport(edge: EdgeRecord): MeshEdgeReport {
  return {
    vertices: edge.vertices,
    incidentTriangles: edge.uses.map((use) => use.triangleIndex)
  }
}

function usesHaveOppositeDirections(first: EdgeUse, second: EdgeUse): boolean {
  return first.from === second.to && first.to === second.from
}

function findConnectedComponents(
  triangleIndices: readonly number[],
  edges: Map<string, EdgeRecord>
): MeshConnectedComponent[] {
  const parent = new Map<number, number>()
  for (const triangleIndex of triangleIndices) parent.set(triangleIndex, triangleIndex)

  const find = (triangleIndex: number): number => {
    const currentParent = parent.get(triangleIndex)
    if (currentParent === undefined || currentParent === triangleIndex) return triangleIndex
    const root = find(currentParent)
    parent.set(triangleIndex, root)
    return root
  }

  const union = (first: number, second: number): void => {
    const firstRoot = find(first)
    const secondRoot = find(second)
    if (firstRoot === secondRoot) return

    if (firstRoot < secondRoot) parent.set(secondRoot, firstRoot)
    else parent.set(firstRoot, secondRoot)
  }

  for (const edge of edges.values()) {
    const firstTriangle = edge.uses[0]?.triangleIndex
    if (firstTriangle === undefined) continue
    for (let index = 1; index < edge.uses.length; index += 1) {
      union(firstTriangle, edge.uses[index].triangleIndex)
    }
  }

  const groups = new Map<number, number[]>()
  for (const triangleIndex of triangleIndices) {
    const root = find(triangleIndex)
    const group = groups.get(root)
    if (group) group.push(triangleIndex)
    else groups.set(root, [triangleIndex])
  }

  return [...groups.values()]
    .map((indices) => indices.sort((first, second) => first - second))
    .sort((first, second) => first[0] - second[0])
    .map((triangleIndicesInComponent, index) => ({
      index,
      triangleIndices: triangleIndicesInComponent
    }))
}
