import * as THREE from 'three'

const DEGENERATE_ANGLE_EPSILON_SQUARED = 1e-16
const NORMAL_LENGTH_EPSILON = 1e-12
const CREASE_BOUNDARY_GUARD = 1e-6

interface EdgeUse {
  faceOffset: number
  lowCorner: number
  highCorner: number
}

function coordinateKey(
  position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  vertexIndex: number
): string {
  return `${position.getX(vertexIndex)}:${position.getY(vertexIndex)}:${position.getZ(vertexIndex)}`
}

/**
 * Builds a non-indexed preview geometry with angle-weighted normals inside
 * each smoothing group. Corner-angle weighting prevents a quad's diagonal
 * from pulling one end of a wall edge more strongly than the other.
 */
export function toCreasedAngleWeightedNormals(
  indexedGeometry: THREE.BufferGeometry,
  creaseAngle: number
): THREE.BufferGeometry {
  if (!Number.isFinite(creaseAngle) || creaseAngle <= 0 || creaseAngle > Math.PI) {
    throw new RangeError('Preview crease angle must be within (0, PI]')
  }

  const position = indexedGeometry.getAttribute('position')
  const index = indexedGeometry.getIndex()
  if (!position || position.itemSize !== 3) {
    throw new RangeError('Preview geometry must contain XYZ positions')
  }
  if (!index || index.count < 3 || index.count % 3 !== 0) {
    throw new RangeError('Preview geometry must contain indexed triangles')
  }

  const sourceIndexBuffer = new Uint32Array(index.count)
  const faceNormalBuffer = new Float64Array(index.count)
  const cornerAngleBuffer = new Float64Array(index.count)
  const coordinateGroups = new Map<string, number>()
  const groupByVertex = new Uint32Array(position.count)
  let coordinateGroupCount = 0

  for (let vertexIndex = 0; vertexIndex < position.count; vertexIndex += 1) {
    const x = position.getX(vertexIndex)
    const y = position.getY(vertexIndex)
    const z = position.getZ(vertexIndex)
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      throw new RangeError('Preview geometry contains a non-finite coordinate')
    }

    const key = coordinateKey(position, vertexIndex)
    let groupIndex = coordinateGroups.get(key)
    if (groupIndex === undefined) {
      groupIndex = coordinateGroupCount
      coordinateGroupCount += 1
      coordinateGroups.set(key, groupIndex)
    }
    groupByVertex[vertexIndex] = groupIndex
  }

  let cornerCount = 0
  for (let sourceFaceOffset = 0; sourceFaceOffset < index.count; sourceFaceOffset += 3) {
    const first = index.getX(sourceFaceOffset)
    const second = index.getX(sourceFaceOffset + 1)
    const third = index.getX(sourceFaceOffset + 2)
    if (
      !Number.isInteger(first) || first < 0 || first >= position.count
      || !Number.isInteger(second) || second < 0 || second >= position.count
      || !Number.isInteger(third) || third < 0 || third >= position.count
    ) {
      throw new RangeError('Preview geometry contains an out-of-range face index')
    }
    if (
      groupByVertex[first] === groupByVertex[second]
      || groupByVertex[second] === groupByVertex[third]
      || groupByVertex[third] === groupByVertex[first]
    ) continue

    const ax = position.getX(first)
    const ay = position.getY(first)
    const az = position.getZ(first)
    const abx = position.getX(second) - ax
    const aby = position.getY(second) - ay
    const abz = position.getZ(second) - az
    const acx = position.getX(third) - ax
    const acy = position.getY(third) - ay
    const acz = position.getZ(third) - az
    const normalX = aby * acz - abz * acy
    const normalY = abz * acx - abx * acz
    const normalZ = abx * acy - aby * acx
    const abSquared = abx * abx + aby * aby + abz * abz
    const acSquared = acx * acx + acy * acy + acz * acz
    const doubleAreaSquared = normalX * normalX + normalY * normalY + normalZ * normalZ
    if (
      !Number.isFinite(doubleAreaSquared)
      || doubleAreaSquared <= abSquared * acSquared * DEGENERATE_ANGLE_EPSILON_SQUARED
    ) continue

    const doubleArea = Math.sqrt(doubleAreaSquared)
    const abDotAc = abx * acx + aby * acy + abz * acz
    sourceIndexBuffer[cornerCount] = first
    sourceIndexBuffer[cornerCount + 1] = second
    sourceIndexBuffer[cornerCount + 2] = third
    faceNormalBuffer[cornerCount] = normalX / doubleArea
    faceNormalBuffer[cornerCount + 1] = normalY / doubleArea
    faceNormalBuffer[cornerCount + 2] = normalZ / doubleArea
    cornerAngleBuffer[cornerCount] = Math.atan2(doubleArea, abDotAc)
    cornerAngleBuffer[cornerCount + 1] = Math.atan2(doubleArea, abSquared - abDotAc)
    cornerAngleBuffer[cornerCount + 2] = Math.atan2(doubleArea, acSquared - abDotAc)
    cornerCount += 3
  }
  if (cornerCount === 0) {
    throw new RangeError('Preview geometry contains no non-degenerate faces')
  }

  const sourceIndices = sourceIndexBuffer.subarray(0, cornerCount)
  const faceNormals = faceNormalBuffer.subarray(0, cornerCount)
  const cornerAngles = cornerAngleBuffer.subarray(0, cornerCount)
  const outputPositions = new Float32Array(cornerCount * 3)
  for (let cornerIndex = 0; cornerIndex < cornerCount; cornerIndex += 1) {
    const sourceIndex = sourceIndices[cornerIndex]
    outputPositions[cornerIndex * 3] = position.getX(sourceIndex)
    outputPositions[cornerIndex * 3 + 1] = position.getY(sourceIndex)
    outputPositions[cornerIndex * 3 + 2] = position.getZ(sourceIndex)
  }

  const edgeUses = new Map<string, EdgeUse[]>()
  const addEdgeUse = (firstCorner: number, secondCorner: number, faceOffset: number) => {
    const firstGroup = groupByVertex[sourceIndices[firstCorner]]
    const secondGroup = groupByVertex[sourceIndices[secondCorner]]
    const lowGroup = Math.min(firstGroup, secondGroup)
    const highGroup = Math.max(firstGroup, secondGroup)
    const key = `${lowGroup}:${highGroup}`
    const uses = edgeUses.get(key) ?? []
    uses.push({
      faceOffset,
      lowCorner: firstGroup === lowGroup ? firstCorner : secondCorner,
      highCorner: firstGroup === lowGroup ? secondCorner : firstCorner
    })
    edgeUses.set(key, uses)
  }
  for (let faceOffset = 0; faceOffset < cornerCount; faceOffset += 3) {
    addEdgeUse(faceOffset, faceOffset + 1, faceOffset)
    addEdgeUse(faceOffset + 1, faceOffset + 2, faceOffset)
    addEdgeUse(faceOffset + 2, faceOffset, faceOffset)
  }

  const parents = new Uint32Array(cornerCount)
  const ranks = new Uint8Array(cornerCount)
  for (let cornerIndex = 0; cornerIndex < cornerCount; cornerIndex += 1) {
    parents[cornerIndex] = cornerIndex
  }
  const findRoot = (node: number): number => {
    let root = node
    while (parents[root] !== root) root = parents[root]
    while (parents[node] !== node) {
      const parent = parents[node]
      parents[node] = root
      node = parent
    }
    return root
  }
  const union = (first: number, second: number) => {
    let firstRoot = findRoot(first)
    let secondRoot = findRoot(second)
    if (firstRoot === secondRoot) return
    if (ranks[firstRoot] < ranks[secondRoot]) {
      const swap = firstRoot
      firstRoot = secondRoot
      secondRoot = swap
    }
    parents[secondRoot] = firstRoot
    if (ranks[firstRoot] === ranks[secondRoot]) ranks[firstRoot] += 1
  }

  const smoothDot = Math.cos(Math.max(0, creaseAngle - CREASE_BOUNDARY_GUARD))
  for (const uses of edgeUses.values()) {
    if (uses.length !== 2) continue
    const [first, second] = uses
    const dot = (
      faceNormals[first.faceOffset] * faceNormals[second.faceOffset]
      + faceNormals[first.faceOffset + 1] * faceNormals[second.faceOffset + 1]
      + faceNormals[first.faceOffset + 2] * faceNormals[second.faceOffset + 2]
    )
    if (dot <= smoothDot) continue
    union(first.lowCorner, second.lowCorner)
    union(first.highCorner, second.highCorner)
  }

  const summedNormals = new Float64Array(cornerCount * 3)
  for (let cornerIndex = 0; cornerIndex < cornerCount; cornerIndex += 1) {
    const root = findRoot(cornerIndex)
    const rootOffset = root * 3
    const faceOffset = cornerIndex - cornerIndex % 3
    const weight = cornerAngles[cornerIndex]
    summedNormals[rootOffset] += faceNormals[faceOffset] * weight
    summedNormals[rootOffset + 1] += faceNormals[faceOffset + 1] * weight
    summedNormals[rootOffset + 2] += faceNormals[faceOffset + 2] * weight
  }

  const outputNormals = new Float32Array(cornerCount * 3)
  for (let cornerIndex = 0; cornerIndex < cornerCount; cornerIndex += 1) {
    const rootOffset = findRoot(cornerIndex) * 3
    let normalX = summedNormals[rootOffset]
    let normalY = summedNormals[rootOffset + 1]
    let normalZ = summedNormals[rootOffset + 2]
    let length = Math.hypot(normalX, normalY, normalZ)
    if (!Number.isFinite(length) || length <= NORMAL_LENGTH_EPSILON) {
      const faceOffset = cornerIndex - cornerIndex % 3
      normalX = faceNormals[faceOffset]
      normalY = faceNormals[faceOffset + 1]
      normalZ = faceNormals[faceOffset + 2]
      length = 1
    }
    const outputOffset = cornerIndex * 3
    outputNormals[outputOffset] = normalX / length
    outputNormals[outputOffset + 1] = normalY / length
    outputNormals[outputOffset + 2] = normalZ / length
  }

  const result = new THREE.BufferGeometry()
  result.setAttribute('position', new THREE.BufferAttribute(outputPositions, 3))
  result.setAttribute('normal', new THREE.BufferAttribute(outputNormals, 3))
  return result
}
