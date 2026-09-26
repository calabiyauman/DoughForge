import type { Point2D } from '../design'
import {
  BUILD_PLANE_Y,
  type PreviewPlacement
} from './previewPlacement'

export const SOURCE_OUTLINE_PLANE_OFFSET = 0.08

export type PreviewOutlinePoint = [number, number, number]

function pointsMatch(first: Point2D, second: Point2D): boolean {
  return first.x === second.x && first.y === second.y
}

/**
 * Projects fitted DesignSpec X/Y points onto the horizontal Three.js X/Z
 * build plane. Only the final mesh's X/Z preview translation is shared here;
 * the overlay intentionally remains on the build plane instead of inheriting
 * the model's vertical placement.
 */
export function projectDesignPathToPreview(
  points: readonly Point2D[],
  placement: PreviewPlacement,
  closed: boolean
): PreviewOutlinePoint[] {
  if (points.length === 0) return []

  const projected = points.map((point): PreviewOutlinePoint => [
    point.x + placement.translation[0],
    BUILD_PLANE_Y + SOURCE_OUTLINE_PLANE_OFFSET,
    point.y + placement.translation[2]
  ])

  if (closed && !pointsMatch(points[0], points[points.length - 1])) {
    projected.push([...projected[0]])
  }

  return projected
}

/**
 * Expands camera framing to include source paths that did not survive mesh
 * generation. The mesh-derived translation remains unchanged so this cannot
 * alter the diagnostic alignment itself.
 */
export function includeDesignPathsInPreviewFraming(
  placement: PreviewPlacement,
  paths: readonly { points: readonly Point2D[] }[]
): PreviewPlacement {
  let minX = -placement.dimensions[0] / 2
  let maxX = placement.dimensions[0] / 2
  let minZ = -placement.dimensions[2] / 2
  let maxZ = placement.dimensions[2] / 2

  for (const path of paths) {
    for (const point of path.points) {
      const x = point.x + placement.translation[0]
      const z = point.y + placement.translation[2]
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minZ = Math.min(minZ, z)
      maxZ = Math.max(maxZ, z)
    }
  }

  return {
    translation: [...placement.translation],
    target: [
      (minX + maxX) / 2,
      placement.target[1],
      (minZ + maxZ) / 2
    ],
    dimensions: [
      maxX - minX,
      placement.dimensions[1],
      maxZ - minZ
    ]
  }
}
