import * as THREE from 'three'
import { toCreasedAngleWeightedNormals } from './previewNormals'
import { calculatePreviewPlacement } from './previewPlacement'

export const PREVIEW_CREASE_ANGLE = THREE.MathUtils.degToRad(45)

export interface PreviewGeometrySource {
  vertices: Float32Array
  faces: Uint32Array
}

/** Creates an independently owned Three.js geometry for the positioned preview. */
export function createPreviewBufferGeometry(
  source: PreviewGeometrySource
): THREE.BufferGeometry {
  const indexedGeometry = new THREE.BufferGeometry()
  indexedGeometry.setAttribute(
    'position',
    new THREE.BufferAttribute(source.vertices.slice(), 3)
  )
  indexedGeometry.setIndex(new THREE.BufferAttribute(source.faces.slice(), 1))

  const placement = calculatePreviewPlacement(source.vertices)
  indexedGeometry.translate(...placement.translation)

  // Generated meshes intentionally share vertices between caps, walls, and
  // profile transitions. A global smooth-normal pass blends those surfaces
  // together and exposes the cap triangulation as dark wedges. Crease-aware
  // normals keep genuine profile edges crisp while still smoothing curves.
  const geometry = toCreasedAngleWeightedNormals(
    indexedGeometry,
    PREVIEW_CREASE_ANGLE
  )
  indexedGeometry.dispose()
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  return geometry
}
