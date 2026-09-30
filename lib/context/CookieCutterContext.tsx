'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react'
import {
  designSpecFromLegacyOutline,
  type DesignSpec,
  type JsonObject,
  type LegacySingleOutline
} from '@/lib/design'
import {
  createAIEnhancedCookieProject,
  createPrototypeCookieProject,
  rebaseCookieProjectDesign
} from '@/lib/project'
import type { CookieProjectRevision } from '@/lib/project/types'
import { serializeAsciiSTL, serializeOBJ } from '@/lib/exporters/meshExport'
import { PresetShapes } from '@/lib/generators/PresetShapes'
import type { AIGeneratedOutline } from '@/lib/generators/AIShapeGenerator'
import { ProfileGenerator, type Profile } from '@/lib/generators/ProfileGenerator'
import {
  StructuredCookieCutterGenerator,
  type StructuredCookieCutter
} from '@/lib/generators/StructuredCookieCutterGenerator'
import { profileReferenceFromProfile } from '@/lib/profiles/profileReference'
import {
  DEFAULT_COOKIE_CUTTER_PARAMETERS,
  normalizeCookieCutterParameters,
  type CookieCutterParameters
} from './cookieCutterParameters'

export type { CookieCutterParameters } from './cookieCutterParameters'

interface CookieCutterState {
  design: DesignSpec | null
  outcomeProject: CookieProjectRevision | null
  profile: Profile | null
  cookieCutter: StructuredCookieCutter | null
  status: string
  wireframeMode: boolean
  parameters: CookieCutterParameters
}

interface CookieCutterContextType extends CookieCutterState {
  updateParameters: (parameters: Partial<CookieCutterParameters>) => void
  generateCookieCutter: () => void
  resetView: () => void
  toggleWireframe: () => void
  setStatus: (status: string) => void
  loadPresetShape: (shape: string) => void
  loadDesign: (design: DesignSpec, status?: string) => void
  loadProject: (
    design: DesignSpec | null,
    parameters: unknown,
    status?: string,
    outcomeProject?: CookieProjectRevision | null
  ) => void
  loadLegacyOutline: (outline: LegacySingleOutline, name?: string, status?: string) => void
  loadGeneratedOutline: (outline: AIGeneratedOutline, name?: string, status?: string) => void
  exportSTL: () => void
  exportOBJ: () => void
}

const CookieCutterContext = createContext<CookieCutterContextType | undefined>(undefined)

function generateFromDesign(
  design: DesignSpec,
  parameters: CookieCutterParameters
): { design: DesignSpec; profile: Profile; cookieCutter: StructuredCookieCutter } {
  const profile = ProfileGenerator.fromParameters(parameters)
  const effectiveDesign = {
    ...design,
    profile: profileReferenceFromProfile(profile)
  }
  const cookieCutter = StructuredCookieCutterGenerator.generate({
    design: effectiveDesign,
    profile,
    scale: parameters.scale,
    optimize: parameters.optimizePrinting,
    smoothCorners: parameters.smoothCorners,
    cornerRadius: parameters.cornerRadius,
    angleThreshold: parameters.angleThreshold
  })
  return { design: effectiveDesign, profile, cookieCutter }
}

function projectFromDesign(
  design: DesignSpec,
  previous: CookieProjectRevision | null | undefined,
  physicalScale: number,
  metadata?: JsonObject
): CookieProjectRevision {
  if (previous) {
    const rebased = rebaseCookieProjectDesign(previous, design, physicalScale)
    if (rebased) return rebased
  }
  return createPrototypeCookieProject(design, {
    prompt: previous?.brief.prompt
      ?? design.provenance.generator?.prompt
      ?? design.name,
    title: previous?.brief.title ?? design.name,
    difficulty: previous?.brief.difficulty,
    requestedColors: previous?.brief.requestedColors,
    createdAt: previous?.createdAt,
    projectId: previous?.projectId,
    revisionNumber: previous?.revisionNumber,
    physicalScale,
    metadata
  })
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function downloadText(data: string, mimeType: string, filename: string): void {
  const blob = new Blob([data], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.hidden = true
  document.body.appendChild(anchor)
  try {
    anchor.click()
  } finally {
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
  }
}

function safeFilename(value: string): string {
  const filename = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '')
  return filename || 'cookie-cutter'
}

function generationStatus(base: string, cookieCutter: StructuredCookieCutter): string {
  const notices: string[] = []
  if (cookieCutter.metadata.skippedElements > 0) {
    notices.push(`${cookieCutter.metadata.skippedElements} element${cookieCutter.metadata.skippedElements === 1 ? '' : 's'} skipped`)
  } else if (cookieCutter.metadata.warnings.length > 0) {
    notices.push(`${cookieCutter.metadata.warnings.length} geometry warning${cookieCutter.metadata.warnings.length === 1 ? '' : 's'}`)
  }
  if (cookieCutter.metadata.warnings[0]) notices.push(cookieCutter.metadata.warnings[0])
  if (cookieCutter.metadata.generatedElements > 1) {
    notices.push('check detail connections in your slicer')
  }
  return notices.length > 0 ? `${base} — ${notices.join('; ')}` : base
}

export function CookieCutterProvider({ children }: { children: ReactNode }) {
  const initialized = useRef(false)
  const [state, setState] = useState<CookieCutterState>({
    design: null,
    outcomeProject: null,
    profile: null,
    cookieCutter: null,
    status: 'Ready — select an outline to begin',
    wireframeMode: false,
    parameters: { ...DEFAULT_COOKIE_CUTTER_PARAMETERS }
  })

  const setStatus = useCallback((status: string) => {
    setState((previous) => ({ ...previous, status }))
  }, [])

  const loadDesign = useCallback((design: DesignSpec, successStatus = 'Design loaded successfully') => {
    setState((previous) => {
      try {
        const generated = generateFromDesign(design, previous.parameters)
        const outcomeProject = projectFromDesign(generated.design, null, previous.parameters.scale)
        return {
          ...previous,
          ...generated,
          outcomeProject,
          status: generationStatus(successStatus, generated.cookieCutter)
        }
      } catch (error) {
        console.error('Error loading design:', error)
        return {
          ...previous,
          status: `Could not generate this design: ${errorMessage(error)}`
        }
      }
    })
  }, [])

  const loadProject = useCallback((
    design: DesignSpec | null,
    projectParameters: unknown,
    successStatus = 'Project loaded successfully',
    savedOutcomeProject?: CookieProjectRevision | null
  ) => {
    // Validate outside the state updater so callers can report malformed files
    // without partially mutating the current project.
    const parameters = normalizeCookieCutterParameters(projectParameters)
    setState((previous) => {
      const projectDesign = design ?? previous.design
      if (!projectDesign) {
        return { ...previous, parameters, status: 'Project settings loaded; select an outline' }
      }
      try {
        const generated = generateFromDesign(projectDesign, parameters)
        const outcomeProject = savedOutcomeProject
          ? rebaseCookieProjectDesign(savedOutcomeProject, generated.design, parameters.scale) ?? savedOutcomeProject
          : projectFromDesign(generated.design, previous.outcomeProject, parameters.scale)
        return {
          ...previous,
          parameters,
          ...generated,
          outcomeProject,
          status: generationStatus(successStatus, generated.cookieCutter)
        }
      } catch (error) {
        console.error('Error loading project:', error)
        return { ...previous, status: `Could not load project: ${errorMessage(error)}` }
      }
    })
  }, [])

  const loadLegacyOutline = useCallback((
    outline: LegacySingleOutline,
    name?: string,
    successStatus?: string
  ) => {
    try {
      const design = designSpecFromLegacyOutline(outline, {
        name: name || outline.name || outline.type || 'Generated outline',
        sourceName: name || outline.name || outline.type || 'Generated outline'
      })
      loadDesign(design, successStatus ?? `${design.name} generated successfully`)
    } catch (error) {
      console.error('Error adapting outline:', error)
      setStatus(`Could not load outline: ${errorMessage(error)}`)
    }
  }, [loadDesign, setStatus])

  const loadGeneratedOutline = useCallback((
    outline: AIGeneratedOutline,
    name?: string,
    successStatus?: string
  ) => {
    try {
      const design = designSpecFromLegacyOutline(outline, {
        name: name || outline.description || outline.type || 'AI-generated cookie',
        sourceName: name || outline.description || outline.type || 'AI-generated cookie'
      })
      setState((previous) => {
        try {
          const generated = generateFromDesign(design, previous.parameters)
          let decorationWarning = outline.metadata.decorationWarning
          let usedDecorationFallback = !outline.metadata.decorationGeneration
          let outcomeProject: CookieProjectRevision
          if (outline.metadata.decorationGeneration) {
            try {
              outcomeProject = createAIEnhancedCookieProject(
                generated.design,
                outline.metadata.decorationGeneration,
                {
                  prompt: outline.description,
                  title: name || outline.description,
                  physicalScale: previous.parameters.scale
                }
              )
            } catch (error) {
              console.warn('AI decoration candidates were rejected; using a labeled placeholder', error)
              usedDecorationFallback = true
              decorationWarning = 'AI decoration candidates did not pass subject-recognition and production checks. Please retry.'
              outcomeProject = projectFromDesign(generated.design, null, previous.parameters.scale, {
                aiDecorationFallback: true,
                aiDecorationWarning: decorationWarning,
              })
            }
          } else {
            decorationWarning = decorationWarning
              ?? 'Structured AI decoration was unavailable for this generation.'
            outcomeProject = projectFromDesign(generated.design, null, previous.parameters.scale, {
              aiDecorationFallback: true,
              aiDecorationWarning: decorationWarning,
            })
          }
          const score = outcomeProject.metadata?.selectedCandidateScore
          const scoreSuffix = typeof score === 'number' ? ` — selected decoration score ${score}/100` : ''
          const warningSuffix = decorationWarning ? ` — ${decorationWarning}` : ''
          const resolvedStatus = usedDecorationFallback
            ? `Generated printable cutter, but the AI decoration plan needs a retry: "${name || outline.description}"`
            : successStatus ?? `Generated AI cookie project: ${design.name}`
          return {
            ...previous,
            ...generated,
            outcomeProject,
            status: generationStatus(
              `${resolvedStatus}${scoreSuffix}${warningSuffix}`,
              generated.cookieCutter
            )
          }
        } catch (error) {
          console.error('Error loading generated cookie project:', error)
          return { ...previous, status: `Could not build AI cookie project: ${errorMessage(error)}` }
        }
      })
    } catch (error) {
      console.error('Error adapting generated outline:', error)
      setStatus(`Could not load AI outline: ${errorMessage(error)}`)
    }
  }, [setStatus])

  const loadPresetShape = useCallback((shape: string) => {
    try {
      const outline = PresetShapes.generate(shape)
      loadLegacyOutline(outline, shape.charAt(0).toUpperCase() + shape.slice(1))
    } catch (error) {
      console.error('Error generating preset shape:', error)
      setStatus(`Could not generate preset: ${errorMessage(error)}`)
    }
  }, [loadLegacyOutline, setStatus])

  const updateParameters = useCallback((updates: Partial<CookieCutterParameters>) => {
    setState((previous) => {
      try {
        const parameters = normalizeCookieCutterParameters(
          { ...previous.parameters, ...updates },
          previous.parameters
        )
        if (!previous.design || !previous.cookieCutter) return { ...previous, parameters }
        const generated = generateFromDesign(previous.design, parameters)
        const outcomeProject = projectFromDesign(generated.design, previous.outcomeProject, parameters.scale)
        return {
          ...previous,
          parameters,
          ...generated,
          outcomeProject,
          status: generationStatus('Parameters updated successfully', generated.cookieCutter)
        }
      } catch (error) {
        console.error('Error updating parameters:', error)
        return {
          ...previous,
          status: `Could not regenerate design: ${errorMessage(error)}`
        }
      }
    })
  }, [])

  const generateCookieCutter = useCallback(() => {
    setState((previous) => {
      if (!previous.design) return { ...previous, status: 'Ready — select an outline to begin' }
      try {
        const generated = generateFromDesign(previous.design, previous.parameters)
        const outcomeProject = projectFromDesign(generated.design, previous.outcomeProject, previous.parameters.scale)
        return {
          ...previous,
          ...generated,
          outcomeProject,
          status: generationStatus('Cookie cutter regenerated successfully', generated.cookieCutter)
        }
      } catch (error) {
        console.error('Error generating cookie cutter:', error)
        return { ...previous, status: `Could not generate cookie cutter: ${errorMessage(error)}` }
      }
    })
  }, [])

  const resetView = useCallback(() => {
    const reset = (window as Window & { resetThreeView?: () => void }).resetThreeView
    reset?.()
  }, [])

  const toggleWireframe = useCallback(() => {
    setState((previous) => ({ ...previous, wireframeMode: !previous.wireframeMode }))
  }, [])

  const exportSTL = useCallback(() => {
    if (!state.cookieCutter || !state.design) {
      setStatus('Generate a cookie cutter before exporting')
      return
    }
    if (state.cookieCutter.metadata.skippedElements > 0) {
      setStatus('Cannot export an incomplete mesh; fix the skipped design elements first')
      return
    }
    if (!state.cookieCutter.metadata.productionReadiness.ready) {
      setStatus(
        state.cookieCutter.metadata.productionReadiness.reasons[0]?.message
          ?? 'Cannot export a design that failed production-readiness checks'
      )
      return
    }
    try {
      const data = serializeAsciiSTL(state.cookieCutter.geometry, {
        solidName: safeFilename(state.design.name)
      })
      downloadText(data, 'model/stl', `${safeFilename(state.design.name)}.stl`)
      setStatus(state.cookieCutter.metadata.generatedElements > 1
        ? 'STL exported — validate detail connections in your slicer before printing'
        : 'STL exported with calculated face normals')
    } catch (error) {
      console.error('Error exporting STL:', error)
      setStatus(`Could not export STL: ${errorMessage(error)}`)
    }
  }, [state.cookieCutter, state.design, setStatus])

  const exportOBJ = useCallback(() => {
    if (!state.cookieCutter || !state.design) {
      setStatus('Generate a cookie cutter before exporting')
      return
    }
    if (state.cookieCutter.metadata.skippedElements > 0) {
      setStatus('Cannot export an incomplete mesh; fix the skipped design elements first')
      return
    }
    if (!state.cookieCutter.metadata.productionReadiness.ready) {
      setStatus(
        state.cookieCutter.metadata.productionReadiness.reasons[0]?.message
          ?? 'Cannot export a design that failed production-readiness checks'
      )
      return
    }
    try {
      const data = serializeOBJ(state.cookieCutter.geometry, {
        objectName: safeFilename(state.design.name)
      })
      downloadText(data, 'text/plain', `${safeFilename(state.design.name)}.obj`)
      setStatus('OBJ exported successfully')
    } catch (error) {
      console.error('Error exporting OBJ:', error)
      setStatus(`Could not export OBJ: ${errorMessage(error)}`)
    }
  }, [state.cookieCutter, state.design, setStatus])

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true
    loadPresetShape('heart')
  }, [loadPresetShape])

  const value = useMemo<CookieCutterContextType>(() => ({
    ...state,
    updateParameters,
    generateCookieCutter,
    resetView,
    toggleWireframe,
    setStatus,
    loadPresetShape,
    loadDesign,
    loadProject,
    loadLegacyOutline,
    loadGeneratedOutline,
    exportSTL,
    exportOBJ
  }), [
    state,
    updateParameters,
    generateCookieCutter,
    resetView,
    toggleWireframe,
    setStatus,
    loadPresetShape,
    loadDesign,
    loadProject,
    loadLegacyOutline,
    loadGeneratedOutline,
    exportSTL,
    exportOBJ
  ])

  return <CookieCutterContext.Provider value={value}>{children}</CookieCutterContext.Provider>
}

export function useCookieCutter(): CookieCutterContextType {
  const context = useContext(CookieCutterContext)
  if (!context) throw new Error('useCookieCutter must be used within a CookieCutterProvider')
  return context
}
