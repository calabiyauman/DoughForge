'use client'

import { useRef, useEffect, useMemo, type MutableRefObject } from 'react'
import { Canvas, extend, useThree } from '@react-three/fiber'
import { useCookieCutter } from '@/lib/context/CookieCutterContext'
import CookieCutterMesh from './CookieCutterMesh'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { calculatePreviewPlacement } from '@/lib/geometry/previewPlacement'

// Extend Three.js objects for JSX usage
extend({ GridHelper: THREE.GridHelper })

const DEFAULT_CAMERA_TARGET: [number, number, number] = [0, 0, 0]

declare global {
  interface Window {
    resetThreeView?: () => void
  }
}

// Custom OrbitControls component to avoid Drei dependencies
function SimpleOrbitControls({
  controlsRef,
  target
}: {
  controlsRef: MutableRefObject<OrbitControls | null>
  target: readonly [number, number, number]
}) {
  const { camera, gl } = useThree()
  
  useEffect(() => {
    if (!camera || !gl) return
    
    const controls = new OrbitControls(camera, gl.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.05
    controls.enableZoom = true
    controls.enablePan = true
    controls.maxPolarAngle = Math.PI / 2 * 0.99
    controls.minDistance = 10
    controls.maxDistance = 200
    
    controlsRef.current = controls
    let animationFrame = 0
    const animate = () => {
      controls.update()
      animationFrame = requestAnimationFrame(animate)
    }
    animate()
    
    return () => {
      cancelAnimationFrame(animationFrame)
      controls.dispose()
      if (controlsRef.current === controls) controlsRef.current = null
    }
  }, [camera, gl, controlsRef])

  useEffect(() => {
    const controls = controlsRef.current
    if (!controls) return
    controls.target.set(...target)
    controls.update()
    controls.saveState()
  }, [controlsRef, target])
  
  return null
}

function CameraFitter({
  placement,
  controlsRef
}: {
  placement: ReturnType<typeof calculatePreviewPlacement>
  controlsRef: MutableRefObject<OrbitControls | null>
}) {
  const { camera, size } = useThree()

  useEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return

    const largestDimension = Math.max(...placement.dimensions)
    const verticalFov = THREE.MathUtils.degToRad(camera.fov)
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * (size.width / size.height))
    const limitingFov = Math.min(verticalFov, horizontalFov)
    const distance = Math.max(30, (largestDimension / 2) / Math.tan(limitingFov / 2) * 1.65)
    const direction = new THREE.Vector3(1, 1, 1).normalize()
    const target = new THREE.Vector3(...placement.target)

    camera.position.copy(direction.multiplyScalar(distance).add(target))
    camera.near = Math.max(0.1, distance / 100)
    camera.far = distance * 10
    camera.lookAt(target)
    camera.updateProjectionMatrix()

    if (controlsRef.current) {
      controlsRef.current.target.copy(target)
      controlsRef.current.update()
      controlsRef.current.saveState()
    }
  }, [camera, controlsRef, placement, size.height, size.width])

  return null
}

export default function ThreeViewer() {
  const { cookieCutter, wireframeMode } = useCookieCutter()
  const controlsRef = useRef<OrbitControls | null>(null)
  const previewVertices = cookieCutter?.geometry.vertices
  const previewPlacement = useMemo(
    () => previewVertices ? calculatePreviewPlacement(previewVertices) : null,
    [previewVertices]
  )
  const cameraTarget = previewPlacement?.target ?? DEFAULT_CAMERA_TARGET

  // Reset view function exposed to parent
  useEffect(() => {
    const resetView = () => controlsRef.current?.reset()
    window.resetThreeView = resetView
    return () => {
      if (window.resetThreeView === resetView) delete window.resetThreeView
    }
  }, [])

  return (
    <div className="w-full h-full">
      <Canvas
        camera={{ position: [50, 50, 50], fov: 50 }}
        shadows
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: "high-performance" as WebGLPowerPreference,
          precision: "highp" as "highp" | "mediump" | "lowp",
          logarithmicDepthBuffer: false,
        }}
        onCreated={({ gl }) => {
          gl.shadowMap.enabled = true
          gl.shadowMap.type = THREE.PCFShadowMap
          gl.shadowMap.autoUpdate = true
        }}
        className="bg-gradient-to-b from-gray-50 to-gray-100"
      >
        {/* Enhanced Lighting for Natural Shadows */}
        <ambientLight intensity={0.4} color="#ffffff" />
        
        {/* Main key light with stable shadows */}
        <directionalLight
          position={[30, 40, 30]}
          intensity={1.0}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-near={1}
          shadow-camera-far={100}
          shadow-camera-left={-30}
          shadow-camera-right={30}
          shadow-camera-top={30}
          shadow-camera-bottom={-30}
          shadow-bias={-0.001}
          shadow-normalBias={0.05}
        />
        
        {/* Fill light to soften shadows */}
        <directionalLight 
          position={[-20, 30, -20]} 
          intensity={0.4} 
          color="#f0f8ff"
        />
        
        {/* Rim light for better definition */}
        <directionalLight 
          position={[0, 20, -40]} 
          intensity={0.3} 
          color="#fff8f0"
        />

        {/* Simple background */}
        <color attach="background" args={['#f5f5f5']} />

        {/* Ground and Grid */}
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, -0.5, 0]}
          receiveShadow
        >
          <planeGeometry args={[100, 100]} />
          <meshStandardMaterial 
            color="#ffffff" 
            transparent 
            opacity={0.9}
            roughness={0.9}
            metalness={0.0}
            shadowSide={THREE.FrontSide}
          />
        </mesh>
        
        {/* Simple grid helper */}
        <gridHelper args={[100, 20, '#cccccc', '#eeeeee']} />

        {/* Cookie Cutter Model */}
        {cookieCutter && (
          <>
            <CookieCutterMesh 
              geometry={cookieCutter.geometry} 
              wireframe={wireframeMode}
            />
            {previewPlacement && (
              <CameraFitter
                placement={previewPlacement}
                controlsRef={controlsRef}
              />
            )}
          </>
        )}

        {/* Simple Controls without Drei */}
        <SimpleOrbitControls
          controlsRef={controlsRef}
          target={cameraTarget}
        />
      </Canvas>
    </div>
  )
}

