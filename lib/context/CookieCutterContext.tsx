'use client'

import React, { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from 'react'
import { CookieCutterGenerator } from '@/lib/generators/CookieCutterGenerator'
import { ProfileGenerator } from '@/lib/generators/ProfileGenerator'
import { PresetShapes } from '@/lib/generators/PresetShapes'

interface CookieCutterState {
  outline: any
  profile: any
  cookieCutter: any
  status: string
  wireframeMode: boolean
  parameters: {
    scale: number
    profileType: string
    outerOffset: number
    outerHeight: number
    innerOffset: number
    innerHeight: number
    chamfer: number
    optimizePrinting: boolean
    smoothCorners: boolean
    cornerRadius: number
    angleThreshold: number
  }
}

interface CookieCutterContextType extends CookieCutterState {
  setOutline: (outline: any) => void
  setProfile: (profile: any) => void
  updateParameters: (params: Partial<CookieCutterState['parameters']>) => void
  generateCookieCutter: () => void
  resetView: () => void
  toggleWireframe: () => void
  setStatus: (status: string) => void
  loadPresetShape: (shape: string) => void
  loadSVGOutline: (outline: any) => void
  exportSTL: () => void
  exportOBJ: () => void
}

const CookieCutterContext = createContext<CookieCutterContextType | undefined>(undefined)

export function CookieCutterProvider({ children }: { children: ReactNode }) {
  const hasInitialized = useRef(false)
  const [state, setState] = useState<CookieCutterState>({
    outline: null,
    profile: null,
    cookieCutter: null,
    status: 'Ready - Select an outline to begin',
    wireframeMode: false,
    parameters: {
      scale: 1.0,
      profileType: 'professional',
      outerOffset: 6.35,  // mm
      outerHeight: 10.16, // mm
      innerOffset: -2.79, // mm
      innerHeight: 17.78, // mm
      chamfer: 2.29,      // mm
      optimizePrinting: true,
      smoothCorners: true,
      cornerRadius: 0.5,   // mm
      angleThreshold: 15,  // degrees
    },
  })

  const setOutline = useCallback((outline: any) => {
    setState(prev => ({ ...prev, outline }))
  }, [])

  const setProfile = useCallback((profile: any) => {
    setState(prev => ({ ...prev, profile }))
  }, [])

  const updateParameters = useCallback((params: Partial<CookieCutterState['parameters']>) => {
    setState(prev => {
      // If we have an outline and cookieCutter, regenerate immediately with new parameters
      if (prev.outline && prev.cookieCutter) {
        console.log(`🔧 Regenerating immediately with new parameters for ${prev.outline.type}`)
        
        try {
          // Generate profile based on new parameters
          const newParams = { ...prev.parameters, ...params }
          const profile = ProfileGenerator.fromParameters(newParams)

          const cookieCutter = CookieCutterGenerator.generate({
            outline: prev.outline, // Keep the existing outline!
            profile,
            scale: newParams.scale,
            optimize: newParams.optimizePrinting,
            smoothCorners: newParams.smoothCorners,
            cornerRadius: newParams.cornerRadius,
            angleThreshold: newParams.angleThreshold,
          })

          console.log(`🔧 Successfully regenerated ${prev.outline.type} with new parameters`)

          return {
            ...prev,
            parameters: newParams,
            cookieCutter,
            profile,
            status: 'Parameters updated successfully'
            // Keep the outline unchanged!
          }
        } catch (error) {
          console.error('Error updating parameters:', error)
          return {
            ...prev,
            parameters: { ...prev.parameters, ...params },
            status: 'Error updating parameters'
          }
        }
      } else {
        // No outline or cookieCutter, just update parameters
        return {
          ...prev,
          parameters: { ...prev.parameters, ...params }
        }
      }
    })
  }, [])

  const setStatus = useCallback((status: string) => {
    setState(prev => ({ ...prev, status }))
  }, [])

  const resetView = useCallback(() => {
    if (typeof window !== 'undefined' && (window as any).resetThreeView) {
      (window as any).resetThreeView()
    }
  }, [])

  const toggleWireframe = useCallback(() => {
    setState(prev => ({ ...prev, wireframeMode: !prev.wireframeMode }))
  }, [])

  const generateCookieCutter = useCallback(() => {
    // Access current state directly to avoid stale closures
    setState(currentState => {
      console.log(`🍪 generateCookieCutter called with outline:`, currentState.outline)
      
      // If we don't have an outline, skip generation - don't auto-default to heart
      if (!currentState.outline) {
        console.log(`🍪 No outline found, skipping generation`)
        return { ...currentState, status: 'Ready - Select an outline to begin' }
      }
      
      console.log(`🍪 Using existing outline:`, currentState.outline)

      try {
        // Generate profile based on current parameters
        const profile = ProfileGenerator.fromParameters(currentState.parameters)

        const cookieCutter = CookieCutterGenerator.generate({
          outline: currentState.outline, // Use the current outline directly
          profile,
          scale: currentState.parameters.scale,
          optimize: currentState.parameters.optimizePrinting,
          smoothCorners: currentState.parameters.smoothCorners,
          cornerRadius: currentState.parameters.cornerRadius,
          angleThreshold: currentState.parameters.angleThreshold,
        })

        return {
          ...currentState,
          cookieCutter,
          profile,
          status: 'Cookie cutter generated successfully'
          // Don't touch the outline at all - keep whatever is currently selected
        }
      } catch (error) {
        console.error('Error generating cookie cutter:', error)
        return { ...currentState, status: 'Error generating cookie cutter' }
      }
    })
  }, []) // No dependencies needed since we access current state directly

  const loadPresetShape = useCallback((shape: string) => {
    try {
      const outline = PresetShapes.generate(shape)
      setState(currentState => {
        const profile = ProfileGenerator.fromParameters(currentState.parameters)
        const cookieCutter = CookieCutterGenerator.generate({
          outline,
          profile,
          scale: currentState.parameters.scale,
          optimize: currentState.parameters.optimizePrinting,
          smoothCorners: currentState.parameters.smoothCorners,
          cornerRadius: currentState.parameters.cornerRadius,
          angleThreshold: currentState.parameters.angleThreshold,
        })

        return {
          ...currentState,
          outline,
          profile,
          cookieCutter,
          status: `Generated ${shape} cookie cutter successfully`
        }
      })
    } catch (error) {
      console.error('Error generating preset shape:', error)
      setStatus('Error generating shape')
    }
  }, [setStatus])

  const loadSVGOutline = useCallback((outline: any) => {
    try {
      setState(currentState => {
        const profile = ProfileGenerator.fromParameters(currentState.parameters)
        const cookieCutter = CookieCutterGenerator.generate({
          outline,
          profile,
          scale: currentState.parameters.scale,
          optimize: currentState.parameters.optimizePrinting,
          smoothCorners: currentState.parameters.smoothCorners,
          cornerRadius: currentState.parameters.cornerRadius,
          angleThreshold: currentState.parameters.angleThreshold,
        })

        return {
          ...currentState,
          outline,
          profile,
          cookieCutter,
          status: 'Outline loaded successfully'
        }
      })
    } catch (error) {
      console.error('Error loading SVG outline:', error)
      setStatus('Error loading SVG outline')
    }
  }, [setStatus])

  // Generate initial cookie cutter on mount (only once ever)
  useEffect(() => {
    // Only load heart if we haven't initialized yet
    if (!hasInitialized.current) {
      console.log('🍪 First time initialization - loading heart')
      hasInitialized.current = true
      const timer = setTimeout(() => {
        loadPresetShape('heart')
      }, 500)
      
      return () => clearTimeout(timer)
    } else {
      console.log('🍪 Already initialized, skipping heart load')
    }
  }, [loadPresetShape])

  // TEMPORARILY DISABLED - testing if this useEffect causes the issue
  // Regenerate when parameters change (but only if we have an outline)
  /*
  useEffect(() => {
    if (state.outline && state.cookieCutter) {
      console.log(`🔧 Parameters changed for outline:`, state.outline?.type || 'unknown')
      console.log(`🔧 Current parameters:`, state.parameters)
      
      const timer = setTimeout(() => {
        console.log(`🔧 About to regenerate with outline:`, state.outline?.type || 'unknown')
        
        // Use functional state update to avoid stale closures
        setState(currentState => {
          if (!currentState.outline) {
            console.log(`🔧 No outline in current state, skipping regeneration`)
            return currentState
          }
          
          console.log(`🔧 Regenerating ${currentState.outline.type} with updated parameters`)
          
          try {
            // Generate profile based on current parameters
            const profile = ProfileGenerator.fromParameters(currentState.parameters)

            const cookieCutter = CookieCutterGenerator.generate({
              outline: currentState.outline, // Use the current outline directly
              profile,
              scale: currentState.parameters.scale,
              optimize: currentState.parameters.optimizePrinting,
              smoothCorners: currentState.parameters.smoothCorners,
              cornerRadius: currentState.parameters.cornerRadius,
              angleThreshold: currentState.parameters.angleThreshold,
            })

            console.log(`🔧 Successfully regenerated ${currentState.outline.type}`)

            return {
              ...currentState,
              cookieCutter,
              profile,
              status: 'Cookie cutter regenerated successfully'
              // Keep the outline unchanged!
            }
          } catch (error) {
            console.error('Error regenerating cookie cutter:', error)
            return { ...currentState, status: 'Error regenerating cookie cutter' }
          }
        })
      }, 50)
      
      return () => clearTimeout(timer)
    } else {
      console.log(`🔧 Skipping regeneration - outline:`, !!state.outline, 'cookieCutter:', !!state.cookieCutter)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.parameters]) // Only depend on parameters, not generateCookieCutter
  */

  const exportSTL = useCallback(() => {
    if (!state.cookieCutter) {
      alert('Please generate a cookie cutter first')
      return
    }

    try {
      setStatus('Exporting STL...')
      
      // Create STL data (simplified for now)
      const stlData = generateSTLData(state.cookieCutter)
      
      // Download file
      const blob = new Blob([stlData], { type: 'application/octet-stream' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'cookie-cutter.stl'
      a.click()
      URL.revokeObjectURL(url)
      
      setStatus('STL exported successfully')
    } catch (error) {
      console.error('Error exporting STL:', error)
      setStatus('Error exporting STL')
    }
  }, [state.cookieCutter, setStatus])

  const exportOBJ = useCallback(() => {
    if (!state.cookieCutter) {
      alert('Please generate a cookie cutter first')
      return
    }

    try {
      setStatus('Exporting OBJ...')
      
      // Create OBJ data (simplified for now)
      const objData = generateOBJData(state.cookieCutter)
      
      // Download file
      const blob = new Blob([objData], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'cookie-cutter.obj'
      a.click()
      URL.revokeObjectURL(url)
      
      setStatus('OBJ exported successfully')
    } catch (error) {
      console.error('Error exporting OBJ:', error)
      setStatus('Error exporting OBJ')
    }
  }, [state.cookieCutter, setStatus])

  const contextValue: CookieCutterContextType = {
    ...state,
    setOutline,
    setProfile,
    updateParameters,
    generateCookieCutter,
    resetView,
    toggleWireframe,
    setStatus,
    loadPresetShape,
    loadSVGOutline,
    exportSTL,
    exportOBJ,
  }

  return (
    <CookieCutterContext.Provider value={contextValue}>
      {children}
    </CookieCutterContext.Provider>
  )
}

export function useCookieCutter() {
  const context = useContext(CookieCutterContext)
  if (context === undefined) {
    throw new Error('useCookieCutter must be used within a CookieCutterProvider')
  }
  return context
}

// Simplified export functions (to be implemented properly)
function generateSTLData(cookieCutter: any): string {
  // This would generate proper binary STL data
  // For now, return ASCII STL format
  let stl = 'solid cookie-cutter\n'
  
  if (cookieCutter.geometry && cookieCutter.geometry.vertices && cookieCutter.geometry.faces) {
    const vertices = cookieCutter.geometry.vertices
    const faces = cookieCutter.geometry.faces
    
    for (let i = 0; i < faces.length; i += 3) {
      const v1 = faces[i] * 3
      const v2 = faces[i + 1] * 3
      const v3 = faces[i + 2] * 3
      
      stl += `facet normal 0 0 0\n`
      stl += `  outer loop\n`
      stl += `    vertex ${vertices[v1]} ${vertices[v1 + 1]} ${vertices[v1 + 2]}\n`
      stl += `    vertex ${vertices[v2]} ${vertices[v2 + 1]} ${vertices[v2 + 2]}\n`
      stl += `    vertex ${vertices[v3]} ${vertices[v3 + 1]} ${vertices[v3 + 2]}\n`
      stl += `  endloop\n`
      stl += `endfacet\n`
    }
  }
  
  stl += 'endsolid cookie-cutter\n'
  return stl
}

function generateOBJData(cookieCutter: any): string {
  let obj = '# Cookie Cutter OBJ Export\n\n'
  
  if (cookieCutter.geometry && cookieCutter.geometry.vertices && cookieCutter.geometry.faces) {
    const vertices = cookieCutter.geometry.vertices
    const faces = cookieCutter.geometry.faces
    
    // Export vertices
    for (let i = 0; i < vertices.length; i += 3) {
      obj += `v ${vertices[i]} ${vertices[i + 1]} ${vertices[i + 2]}\n`
    }
    
    obj += '\n'
    
    // Export faces (OBJ uses 1-based indexing)
    for (let i = 0; i < faces.length; i += 3) {
      obj += `f ${faces[i] + 1} ${faces[i + 1] + 1} ${faces[i + 2] + 1}\n`
    }
  }
  
  return obj
}

