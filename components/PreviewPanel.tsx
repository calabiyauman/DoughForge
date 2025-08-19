'use client'

import { Suspense } from 'react'
import { RotateCcw, Grid3X3, Eye } from 'lucide-react'
import { useCookieCutter } from '@/lib/context/CookieCutterContext'
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
  const { status, resetView, toggleWireframe, wireframeMode, cookieCutter } = useCookieCutter()

  return (
    <div className="card h-full relative overflow-hidden">
      {/* 3D Viewer */}
      <div className="w-full h-full rounded-xl overflow-hidden bg-gray-50">
        <Suspense fallback={
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary-500 mx-auto mb-4"></div>
              <p className="text-gray-600">Loading 3D Viewer...</p>
            </div>
          </div>
        }>
          <ThreeViewer />
        </Suspense>
      </div>

      {/* Control Overlay */}
      <div className="absolute top-2 lg:top-4 right-2 lg:right-4 flex gap-1 lg:gap-2 z-10">
        <button
          onClick={resetView}
          className="p-2 lg:p-2 bg-white/90 hover:bg-white rounded-lg shadow-lg transition-all duration-200 hover:scale-105 touch-manipulation"
          title="Reset View"
        >
          <RotateCcw className="w-4 lg:w-5 h-4 lg:h-5 text-gray-700" />
        </button>
        
        <button
          onClick={toggleWireframe}
          className={`p-2 lg:p-2 rounded-lg shadow-lg transition-all duration-200 hover:scale-105 touch-manipulation ${
            wireframeMode 
              ? 'bg-primary-500 text-white' 
              : 'bg-white/90 hover:bg-white text-gray-700'
          }`}
          title="Toggle Wireframe"
        >
          <Grid3X3 className="w-4 lg:w-5 h-4 lg:h-5" />
        </button>
      </div>

      {/* Status Overlay */}
      <div className="absolute bottom-2 lg:bottom-4 left-2 lg:left-4 z-10">
        <div className="bg-black/80 text-white px-2 lg:px-3 py-1 lg:py-2 rounded-lg text-xs lg:text-sm font-medium max-w-[250px] lg:max-w-none truncate">
          {status}
        </div>
      </div>

      {/* Profile Preview Overlay - Only show when we have a cookie cutter */}
      {cookieCutter && (
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
      {status === 'Ready - Select an outline to begin' && (
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
