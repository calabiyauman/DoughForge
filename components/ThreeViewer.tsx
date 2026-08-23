'use client'

import { useRef, useEffect } from 'react'
import { Canvas, extend, useThree } from '@react-three/fiber'
import { useCookieCutter } from '@/lib/context/CookieCutterContext'
import CookieCutterMesh from './CookieCutterMesh'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

// Extend Three.js objects for JSX usage
extend({ GridHelper: THREE.GridHelper })

// Custom OrbitControls component to avoid Drei dependencies
function SimpleOrbitControls({ controlsRef }: { controlsRef: any }) {
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
    
    const animate = () => {
      controls.update()
      requestAnimationFrame(animate)
    }
    animate()
    
    return () => {
      controls.dispose()
    }
  }, [camera, gl, controlsRef])
  
  return null
}

function CameraFitter({
  vertices,
  controlsRef
}: {
  vertices: Float32Array
  controlsRef: { current: any }
}) {
  const { camera, size } = useThree()

  useEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera) || vertices.length < 3) return

    const bounds = new THREE.Box3()
    const point = new THREE.Vector3()
    for (let index = 0; index < vertices.length; index += 3) {
      bounds.expandByPoint(point.set(
        vertices[index],
        vertices[index + 1],
        vertices[index + 2]
      ))
    }

    const dimensions = bounds.getSize(new THREE.Vector3())
    const largestDimension = Math.max(dimensions.x, dimensions.y, dimensions.z)
    const verticalFov = THREE.MathUtils.degToRad(camera.fov)
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * (size.width / size.height))
    const limitingFov = Math.min(verticalFov, horizontalFov)
    const distance = Math.max(30, (largestDimension / 2) / Math.tan(limitingFov / 2) * 1.65)
    const direction = new THREE.Vector3(1, 1, 1).normalize()

    camera.position.copy(direction.multiplyScalar(distance))
    camera.near = Math.max(0.1, distance / 100)
    camera.far = distance * 10
    camera.lookAt(0, 0, 0)
    camera.updateProjectionMatrix()

    if (controlsRef.current) {
      controlsRef.current.target.set(0, 0, 0)
      controlsRef.current.update()
      controlsRef.current.saveState()
    }
  }, [camera, controlsRef, size.height, size.width, vertices])

  return null
}

export default function ThreeViewer() {
  const { cookieCutter, wireframeMode } = useCookieCutter()
  const controlsRef = useRef<any>()

  // Reset view function exposed to parent
  useEffect(() => {
    if (controlsRef.current) {
      const resetView = () => {
        controlsRef.current.reset()
      }
      // Store reset function in global scope for access
      ;(window as any).resetThreeView = resetView
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
            <CameraFitter
              vertices={cookieCutter.geometry.vertices}
              controlsRef={controlsRef}
            />
          </>
        )}

        {/* Simple Controls without Drei */}
        <SimpleOrbitControls controlsRef={controlsRef} />
      </Canvas>
    </div>
  )
}

