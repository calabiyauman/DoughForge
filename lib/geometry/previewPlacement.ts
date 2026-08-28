export const BUILD_PLANE_Y = 0

export interface PreviewPlacement {
  translation: [number, number, number]
  target: [number, number, number]
  dimensions: [number, number, number]
}

/**
 * Centers a generated mesh horizontally while placing its lowest vertex on
 * the build plane. The camera target follows the transformed model center.
 */
export function calculatePreviewPlacement(
  vertices: ArrayLike<number>
): PreviewPlacement {
  if (vertices.length < 3 || vertices.length % 3 !== 0) {
    throw new RangeError('Preview geometry must contain complete vertex triples')
  }

  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let minZ = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  let maxZ = Number.NEGATIVE_INFINITY

  for (let index = 0; index < vertices.length; index += 3) {
    const x = vertices[index]
    const y = vertices[index + 1]
    const z = vertices[index + 2]
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      throw new RangeError('Preview geometry contains a non-finite coordinate')
    }
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    minZ = Math.min(minZ, z)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
    maxZ = Math.max(maxZ, z)
  }

  const width = maxX - minX
  const height = maxY - minY
  const depth = maxZ - minZ

  return {
    translation: [
      -(minX + maxX) / 2,
      BUILD_PLANE_Y - minY,
      -(minZ + maxZ) / 2
    ],
    target: [0, BUILD_PLANE_Y + height / 2, 0],
    dimensions: [width, height, depth]
  }
}
