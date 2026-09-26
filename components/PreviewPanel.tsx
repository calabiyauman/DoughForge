'use client'

import { Suspense, useCallback, useMemo, useState } from 'react'
import { Box, RotateCcw, Grid3X3, Eye, ScanLine, Sparkles } from 'lucide-react'
import { useCookieCutter } from '@/lib/context/CookieCutterContext'
import CookieOutcomePanel from './outcome/CookieOutcomePanel'
import { cookieProjectToOutcomeViewModel } from './outcome/fromProject'
import {
  createPrintableGuideHtml,
  printableGuideFilename
} from '@/lib/project/guideExport'
import ProfilePreview from './ProfilePreview'
import dynamic from 'next/dynamic'

// Dynamically import Three.js component to avoid SSR issues
const ThreeViewer = dynamic(() => import('./ThreeViewer'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary-500 mx-auto mb-4"></div>
        <p className="text-gray-600">Loading 3D Viewer...</p>
      </div>
    </div>
  ),
})

export default function PreviewPanel() {
  const {
    status,
    resetView,
    toggleWireframe,
    wireframeMode,
    cookieCutter,
    outcomeProject
  } = useCookieCutter()
  const [showSourceOutline, setShowSourceOutline] = useState(false)
  const [previewMode, setPreviewMode] = useState<'cutter' | 'outcome'>('outcome')
  const outcome = useMemo(
    () => outcomeProject ? cookieProjectToOutcomeViewModel(outcomeProject) : null,
    [outcomeProject]
  )

  const downloadGuide = useCallback(() => {
    if (!outcomeProject) return
    const blob = new Blob([createPrintableGuideHtml(outcomeProject)], {
      type: 'text/html;charset=utf-8'
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = printableGuideFilename(outcomeProject)
    anchor.hidden = true
    document.body.appendChild(anchor)
    try {
      anchor.click()
    } finally {
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
    }
  }, [outcomeProject])

  return (
    <div className="card h-full relative overflow-hidden">
      <div className="absolute left-1/2 top-2 z-30 flex -translate-x-1/2 rounded-xl border border-white/70 bg-white/95 p-1 shadow-lg backdrop-blur-sm" role="group" aria-label="Preview mode">
        <button
          type="button"
          onClick={() => setPreviewMode('outcome')}
          className={`flex min-h-10 items-center gap-2 rounded-lg px-3 text-xs font-semibold transition ${previewMode === 'outcome' ? 'bg-stone-900 text-white' : 'text-stone-600 hover:bg-stone-100'}`}
          aria-pressed={previewMode === 'outcome'}
        >
          <Sparkles className="h-4 w-4" aria-hidden="true" />
          Cookie outcome
        </button>
        <button
          type="button"
          onClick={() => setPreviewMode('cutter')}
          className={`flex min-h-10 items-center gap-2 rounded-lg px-3 text-xs font-semibold transition ${previewMode === 'cutter' ? 'bg-stone-900 text-white' : 'text-stone-600 hover:bg-stone-100'}`}
          aria-pressed={previewMode === 'cutter'}
        >
          <Box className="h-4 w-4" aria-hidden="true" />
          3D cutter
        </button>
      </div>

      {previewMode === 'outcome' && outcome ? (
        <div className="h-full w-full overflow-auto rounded-xl bg-stone-100 pt-12">
          <CookieOutcomePanel
            outcome={outcome}
            className="min-h-full"
            onDownloadGuide={downloadGuide}
            onEditDesign={() => setPreviewMode('cutter')}
          />
        </div>
      ) : (
        <div className="w-full h-full rounded-xl overflow-hidden bg-gray-50">
          <Suspense fallback={
            <div className="w-full h-full flex items-center justify-center">
              <div className="text-center">
                <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary-500 mx-auto mb-4"></div>
                <p className="text-gray-600">Loading 3D Viewer...</p>
              </div>
            </div>
          }>
            <ThreeViewer showSourceOutline={showSourceOutline} />
          </Suspense>
        </div>
      )}

      {/* Control Overlay */}
      {previewMode === 'cutter' && <div
        className="absolute top-2 lg:top-4 right-2 lg:right-4 flex gap-1 lg:gap-2 z-10"
        role="toolbar"
        aria-label="3D preview controls"
      >
        <button
          type="button"
          onClick={resetView}
          className="p-2 lg:p-2 bg-white/90 hover:bg-white rounded-lg shadow-lg transition-all duration-200 hover:scale-105 touch-manipulation"
          title="Reset View"
          aria-label="Reset 3D view"
        >
          <RotateCcw className="w-4 lg:w-5 h-4 lg:h-5 text-gray-700" />
        </button>
        
        <button
          type="button"
          onClick={toggleWireframe}
          className={`p-2 lg:p-2 rounded-lg shadow-lg transition-all duration-200 hover:scale-105 touch-manipulation ${
            wireframeMode 
              ? 'bg-primary-500 text-white' 
              : 'bg-white/90 hover:bg-white text-gray-700'
          }`}
          title="Toggle Wireframe"
          aria-label="Toggle wireframe"
          aria-pressed={wireframeMode}
        >
          <Grid3X3 className="w-4 lg:w-5 h-4 lg:h-5" />
        </button>

        <button
          type="button"
          onClick={() => setShowSourceOutline((visible) => !visible)}
          className={`p-2 lg:p-2 rounded-lg shadow-lg transition-all duration-200 hover:scale-105 touch-manipulation ${
            showSourceOutline
              ? 'bg-blue-600 text-white'
              : 'bg-white/90 hover:bg-white text-gray-700'
          }`}
          title={showSourceOutline ? 'Hide Source Outline' : 'Show Source Outline'}
          aria-label={showSourceOutline ? 'Hide source outline' : 'Show source outline'}
          aria-pressed={showSourceOutline}
        >
          <ScanLine className="w-4 lg:w-5 h-4 lg:h-5" />
        </button>
      </div>}

      {previewMode === 'cutter' && showSourceOutline && cookieCutter && (
        <div className="absolute top-16 left-2 lg:left-4 z-10 pointer-events-none">
          <div className="bg-white/95 backdrop-blur-sm rounded-lg px-3 py-2 shadow-lg text-xs text-gray-700">
            <div className="font-medium mb-1.5">Design alignment</div>
            <div className="flex items-center gap-2">
              <span className="w-6 h-0.5 bg-blue-600 rounded-full" aria-hidden="true" />
              <span>Source outline</span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="w-6 h-2.5 bg-gray-200 border border-gray-300 rounded-sm" aria-hidden="true" />
              <span>Generated cutter</span>
            </div>
            {cookieCutter.sourceOutline.paths.some((path) => !path.generated) && (
              <div className="flex items-center gap-2 mt-1 text-red-700">
                <span className="w-6 border-t-2 border-dashed border-red-600" aria-hidden="true" />
                <span>Skipped source path</span>
              </div>
            )}
            <div className="mt-1.5 text-[10px] text-gray-500">Design XY mapped to the build plane</div>
          </div>
        </div>
      )}

      {/* Status Overlay */}
      {previewMode === 'cutter' && <div className="absolute bottom-2 lg:bottom-4 left-2 lg:left-4 z-10">
        <div className="bg-black/80 text-white px-2 lg:px-3 py-1 lg:py-2 rounded-lg text-xs lg:text-sm font-medium max-w-[250px] lg:max-w-none truncate">
          {status}
        </div>
      </div>}

      {/* Profile Preview Overlay - Only show when we have a cookie cutter */}
      {previewMode === 'cutter' && cookieCutter && (
        <div className="absolute bottom-12 lg:bottom-16 left-2 lg:left-4 z-20 opacity-80">
          <div className="bg-white/95 backdrop-blur-sm rounded-lg p-2 shadow-lg">
            <div className="text-xs font-medium text-gray-700 mb-1">Profile</div>
            <div className="w-36 h-32 lg:w-48 lg:h-36">
              <ProfilePreview />
            </div>
          </div>
        </div>
      )}

      {/* Instructions Overlay (when no model) */}
      {previewMode === 'cutter' && status.startsWith('Ready') && (
        <div className="absolute inset-0 flex items-center justify-center z-5 p-4">
          <div className="text-center text-gray-500 max-w-sm lg:max-w-md">
            <Eye className="w-12 lg:w-16 h-12 lg:h-16 mx-auto mb-3 lg:mb-4 opacity-50" />
            <h3 className="text-lg lg:text-xl font-semibold mb-2">3D Preview</h3>
            <p className="text-sm lg:text-base">Upload an SVG file or select a preset shape to see your cookie cutter in 3D.</p>
          </div>
        </div>
      )}
    </div>
  )
}
