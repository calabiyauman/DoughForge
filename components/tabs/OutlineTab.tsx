'use client'

import { useState, useCallback } from 'react'
import { Upload, Image, Shapes } from 'lucide-react'
import { useCookieCutter } from '@/lib/context/CookieCutterContext'
import { SVGParser } from '@/lib/parsers/SVGParser'

const outlineMethods = [
  { id: 'svg', label: 'Upload SVG File', icon: Upload },
  { id: 'preset', label: 'Preset Shapes', icon: Shapes },
]

const presetShapes = [
  { id: 'heart', label: 'Heart ❤️' },
  { id: 'star', label: 'Star ⭐' },
  { id: 'circle', label: 'Circle ⭕' },
  { id: 'square', label: 'Square ⬜' },
  { id: 'flower', label: 'Flower 🌸' },
  { id: 'butterfly', label: 'Butterfly 🦋' },
]

export default function OutlineTab() {
  const { 
    parameters, 
    updateParameters, 
    setStatus, 
    loadPresetShape, 
    loadSVGOutline,
    generateCookieCutter 
  } = useCookieCutter()
  
  const [outlineMethod, setOutlineMethod] = useState('preset')
  const [dragOver, setDragOver] = useState(false)

  const handleFileUpload = useCallback(async (file: File) => {
    if (!file.type.includes('svg')) {
      setStatus('Error: Please upload an SVG file')
      return
    }

    try {
      setStatus('Loading SVG file...')
      const text = await file.text()
      const outline = SVGParser.parse(text)
      
      if (outline) {
        // Use the context's loadSVGOutline to update and regenerate
        loadSVGOutline(outline)
        setStatus(`Loaded SVG: ${file.name}`)
      } else {
        setStatus('Error: Could not parse SVG file')
      }
    } catch (error) {
      console.error('Error loading SVG:', error)
      setStatus('Error loading SVG file')
    }
  }, [setStatus, generateCookieCutter])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    
    const files = e.dataTransfer.files
    if (files.length > 0 && files[0].type.includes('svg')) {
      handleFileUpload(files[0])
    }
  }, [handleFileUpload])

  const handlePresetChange = (shape: string) => {
    console.log(`🎯 OutlineTab: Preset shape clicked: ${shape}`)
    loadPresetShape(shape)
    // Don't call generateCookieCutter here - loadPresetShape already does it
  }

  return (
    <div className="space-y-6">
      {/* Method Selection */}
      <div>
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Cookie Outline</h3>
        
        <div className="grid grid-cols-2 gap-2 lg:gap-3 mb-4 lg:mb-6">
          {outlineMethods.map((method) => {
            const Icon = method.icon
            return (
              <button
                key={method.id}
                onClick={() => setOutlineMethod(method.id)}
                className={`p-3 lg:p-4 rounded-lg border-2 transition-all duration-200 flex flex-col items-center gap-1 lg:gap-2 touch-manipulation ${
                  outlineMethod === method.id
                    ? 'border-primary-500 bg-primary-50 text-primary-700'
                    : 'border-gray-200 hover:border-gray-300 active:bg-gray-50'
                }`}
              >
                <Icon className="w-5 lg:w-6 h-5 lg:h-6" />
                <span className="text-xs lg:text-sm font-medium text-center leading-tight">{method.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* SVG Upload */}
      {outlineMethod === 'svg' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            SVG File
          </label>
          
          {/* SVG Best Practices Tip */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
            <div className="flex items-start space-x-2">
              <div className="flex-shrink-0">
                <svg className="w-4 h-4 text-blue-500 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-blue-800 mb-1">
                  💡 For Best Results:
                </p>
                <ul className="text-xs text-blue-700 space-y-1">
                  <li>• Save as <strong>SVG</strong> with <strong>closed paths/shapes</strong></li>
                  <li>• Use <strong>black fills</strong> or <strong>outlines</strong> (no strokes)</li>
                  <li>• <strong>Merge/union</strong> overlapping shapes into single path</li>
                  <li>• Keep designs <strong>simple</strong> - avoid tiny details</li>
                  <li>• Size: <strong>100-500px</strong> works well</li>
                </ul>
              </div>
            </div>
          </div>
          
          <div
            className={`file-drop-zone ${dragOver ? 'dragover' : ''}`}
            onDrop={handleDrop}
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onClick={() => {
              const input = document.createElement('input')
              input.type = 'file'
              input.accept = '.svg'
              input.onchange = (e) => {
                const file = (e.target as HTMLInputElement).files?.[0]
                if (file) handleFileUpload(file)
              }
              input.click()
            }}
          >
            <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <div className="text-center">
              <p className="text-lg font-medium text-gray-700 mb-2">
                Drop SVG file here
              </p>
              <p className="text-sm text-gray-500">
                or click to browse
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Preset Shapes */}
      {outlineMethod === 'preset' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Preset Shapes
          </label>
          
          <div className="grid grid-cols-2 gap-2 lg:gap-3">
            {presetShapes.map((shape) => (
              <button
                key={shape.id}
                onClick={() => handlePresetChange(shape.id)}
                className="p-3 lg:p-4 text-center rounded-lg border-2 border-gray-200 hover:border-primary-300 hover:bg-primary-50 active:bg-primary-100 transition-all duration-200 group touch-manipulation"
              >
                <div className="text-sm lg:text-lg font-medium text-gray-800 group-hover:text-primary-700 leading-tight">
                  {shape.label}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Scale Control */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-3">
          Scale Factor
          <span className="ml-2 text-primary-600 font-semibold">
            {parameters.scale.toFixed(1)}x
          </span>
        </label>
        
        <input
          type="range"
          min="0.5"
          max="3.0"
          step="0.1"
          value={parameters.scale}
          onChange={(e) => {
            const scale = parseFloat(e.target.value)
            updateParameters({ scale })
            generateCookieCutter() // Regenerate with new scale
          }}
          className="slider"
        />
        
        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>0.5x</span>
          <span>3.0x</span>
        </div>
      </div>

      {/* Generate Button */}
      <button
        onClick={generateCookieCutter}
        className="btn-primary w-full"
      >
        Generate Preview
      </button>
    </div>
  )
}
