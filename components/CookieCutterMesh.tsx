'use client'

import { useEffect, useRef, useMemo } from 'react'
import { Mesh } from 'three'
import * as THREE from 'three'
import { createPreviewBufferGeometry } from '@/lib/geometry/previewGeometry'

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
  const threeGeometry = useMemo(
    () => createPreviewBufferGeometry(geometry),
    [geometry]
  )

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
      color: 0xe5e7eb,
      roughness: 0.58,
      metalness: 0,
      transparent: false,
      opacity: 1,
      side: THREE.DoubleSide,
      dithering: true,
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

