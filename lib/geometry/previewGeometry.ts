import * as THREE from 'three'
import { calculatePreviewPlacement } from './previewPlacement'

export interface PreviewGeometrySource {
  vertices: Float32Array
  faces: Uint32Array
}

/** Creates an independently owned Three.js geometry for the positioned preview. */
export function createPreviewBufferGeometry(
  source: PreviewGeometrySource
): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(source.vertices.slice(), 3)
  )
  geometry.setIndex(new THREE.BufferAttribute(source.faces.slice(), 1))
  geometry.computeVertexNormals()

  const placement = calculatePreviewPlacement(source.vertices)
  geometry.translate(...placement.translation)
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  return geometry
}
