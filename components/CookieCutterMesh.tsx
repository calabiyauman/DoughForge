'use client'

import { useEffect, useRef, useMemo } from 'react'
import { Mesh } from 'three'
import * as THREE from 'three'

interface CookieCutterMeshProps {
  geometry: {
    vertices: Float32Array
    faces: Uint32Array
  }
  wireframe?: boolean
}

export default function CookieCutterMesh({ geometry, wireframe = false }: CookieCutterMeshProps) {
  const meshRef = useRef<Mesh>(null!)

  // Create Three.js geometry from data
  const threeGeometry = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    
    // Set vertices
    geo.setAttribute('position', new THREE.BufferAttribute(geometry.vertices, 3))
    
    // Set faces (indices)
    geo.setIndex(new THREE.BufferAttribute(geometry.faces, 1))
    
    // Compute normals for proper lighting
    geo.computeVertexNormals()
    geo.computeBoundingBox()
    geo.computeBoundingSphere()

    if (geo.boundingBox) {
      const center = geo.boundingBox.getCenter(new THREE.Vector3())
      geo.translate(-center.x, -center.y, -center.z)
    }

    return geo
  }, [geometry])

  useEffect(() => () => threeGeometry.dispose(), [threeGeometry])

  // Material based on wireframe mode
  const material = useMemo(() => {
    if (wireframe) {
      return new THREE.MeshBasicMaterial({
        color: 0x666666,
        wireframe: true,
        wireframeLinewidth: 1,
      })
    }

    return new THREE.MeshStandardMaterial({
      color: 0xf0f0f0,
      roughness: 0.3,
      metalness: 0.1,
      transparent: false,
      opacity: 1,
      side: THREE.DoubleSide,
      envMapIntensity: 0.5,
    })
  }, [wireframe])

  useEffect(() => () => material.dispose(), [material])

  // Keep mesh static to avoid shadow flickering
  // Removed floating animation to prevent shadow movement

  return (
    <mesh
      ref={meshRef}
      geometry={threeGeometry}
      material={material}
      castShadow
      receiveShadow={false}
      scale={[1, 1, 1]}
    />
  )
}

