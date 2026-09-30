'use client'

import { useState, useCallback } from 'react'
import { Upload, Shapes, Sparkles } from 'lucide-react'
import { useCookieCutter } from '@/lib/context/CookieCutterContext'
import { SVGParser } from '@/lib/parsers/SVGParser'

const outlineMethods = [
  { id: 'svg', label: 'Upload SVG File', icon: Upload },
  { id: 'preset', label: 'Preset Shapes', icon: Shapes },
  { id: 'ai', label: 'Generate with AI', icon: Sparkles },
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
    loadDesign,
    loadGeneratedOutline,
    generateCookieCutter 
  } = useCookieCutter()
  
  const [outlineMethod, setOutlineMethod] = useState('preset')
  const [dragOver, setDragOver] = useState(false)
  const [aiDescription, setAiDescription] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [importSummary, setImportSummary] = useState<string | null>(null)
  const [importWarnings, setImportWarnings] = useState<string[]>([])

  const handleFileUpload = useCallback(async (file: File) => {
    if (!file.type.includes('svg') && !file.name.toLowerCase().endsWith('.svg')) {
      setStatus('Error: Please upload an SVG file')
      return
    }

    try {
      setStatus('Loading SVG file...')
      const text = await file.text()
      const result = SVGParser.parseOrThrow(text, {
        name: file.name.replace(/\.svg$/i, '')
      })
      loadDesign(result.design, `Loaded ${file.name}: ${result.stats.closedContours} contours, ${result.stats.openStrokes} strokes`)
      const warningText = result.warnings.length > 0
        ? ` ${result.warnings.length} import warning${result.warnings.length === 1 ? '' : 's'}.`
        : ''
      setImportSummary(
        `${result.stats.closedContours} closed contours, ${result.stats.holes} holes, ${result.stats.openStrokes} open detail strokes, and ${result.stats.points} fitted points.${warningText}`
      )
      setImportWarnings(result.warnings)
    } catch (error) {
      console.error('Error loading SVG:', error)
      setImportSummary(null)
      setImportWarnings([])
      setStatus(`Error loading SVG: ${error instanceof Error ? error.message : 'unknown import error'}`)
    }
  }, [setStatus, loadDesign])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    
    const files = e.dataTransfer.files
    if (files.length > 0) handleFileUpload(files[0])
  }, [handleFileUpload])

  const openSvgFilePicker = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.svg'
    input.onchange = (event) => {
      const file = (event.target as HTMLInputElement).files?.[0]
      if (file) handleFileUpload(file)
    }
    input.click()
  }, [handleFileUpload])

  const handlePresetChange = (shape: string) => {
    loadPresetShape(shape)
  }

  const handleAIGeneration = useCallback(async () => {
    if (!aiDescription.trim()) return

    setIsGenerating(true)
    setStatus('Generating cutter and registered cookie outcome...')

    try {
      const { AIShapeGenerator } = await import('@/lib/generators/AIShapeGenerator')
      const outline = await AIShapeGenerator.generateFromDescription(aiDescription.trim())

      if (outline) {
        const source = outline.metadata?.source
        const hasStructuredDecoration = Boolean(outline.metadata?.decorationGeneration)
        loadGeneratedOutline(
          outline,
          aiDescription.trim(),
          source === 'openai-server' && hasStructuredDecoration
            ? `Generated and ranked high-fidelity cookie project: "${aiDescription.trim()}"`
            : source === 'openai-server'
              ? `Generated printable cutter, but the AI decoration plan needs a retry: "${aiDescription.trim()}"`
            : `Generated printable project fallback for: "${aiDescription.trim()}"`
        )
      } else {
        setStatus('Error: Could not generate shape from description')
      }
    } catch (error) {
      console.error('Error generating AI shape:', error)
      setStatus('Error: AI generation failed. Please try a different description.')
    } finally {
      setIsGenerating(false)
    }
  }, [aiDescription, setStatus, loadGeneratedOutline])

  return (
    <div className="space-y-6">
      {/* Method Selection */}
      <div>
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Cookie Outline</h3>
        
        <div className="grid grid-cols-3 gap-1 lg:gap-2 mb-4 lg:mb-6">
          {outlineMethods.map((method) => {
            const Icon = method.icon
            return (
              <button
                key={method.id}
                onClick={() => setOutlineMethod(method.id)}
                className={`p-2 lg:p-3 rounded-lg border-2 transition-all duration-200 flex flex-col items-center gap-1 touch-manipulation ${
                  outlineMethod === method.id
                    ? 'border-primary-500 bg-primary-50 text-primary-700'
                    : 'border-gray-200 hover:border-gray-300 active:bg-gray-50'
                }`}
              >
                <Icon className="w-4 lg:w-5 h-4 lg:h-5" />
                <span className="text-xs font-medium text-center leading-tight">{method.label}</span>
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
                  <li>• Bézier curves, arcs, compound paths, holes, and nested transforms are supported</li>
                  <li>• Closed shapes become cutting walls; open paths become detail stamps</li>
                  <li>• Add <strong>data-doughforge-role=&quot;stamp&quot;</strong> to override an element&apos;s role</li>
                  <li>• Convert live text to paths when exact lettering matters</li>
                </ul>
              </div>
            </div>
          </div>
          
          <div
            className={`file-drop-zone ${dragOver ? 'dragover' : ''}`}
            role="button"
            tabIndex={0}
            aria-label="Upload SVG file"
            onDrop={handleDrop}
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onClick={openSvgFilePicker}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                openSvgFilePicker()
              }
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

          {importSummary && (
            <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
              {importSummary}
            </div>
          )}

          {importWarnings.length > 0 && (
            <details className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <summary className="cursor-pointer font-medium">
                Review {importWarnings.length} import warning{importWarnings.length === 1 ? '' : 's'}
              </summary>
              <ul className="mt-2 space-y-1 pl-4">
                {importWarnings.map((warning, index) => (
                  <li key={`${index}-${warning}`}>• {warning}</li>
                ))}
              </ul>
            </details>
          )}
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

      {/* AI Generation */}
      {outlineMethod === 'ai' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Describe the Cookies You Want
          </label>
          
          {/* AI Generation Tips */}
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 mb-4">
            <div className="flex items-start space-x-2">
              <div className="flex-shrink-0">
                <Sparkles className="w-4 h-4 text-purple-500 mt-0.5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-purple-800 mb-1">
                  ✨ Cookie Project Examples:
                </p>
                <p className="mb-2 text-xs text-purple-700">
                  DoughForge uses the generated outline as the shared coordinate frame for the
                  decorated preview, guide, palette, and cutter. Prototype color recipes remain
                  locked from checkout until they are physically verified.
                </p>
                <ul className="text-xs text-purple-700 space-y-1">
                  <li>• &ldquo;Woodland first birthday in sage, cream, and dusty rose&rdquo;</li>
                  <li>• &ldquo;Lavender butterfly with pink piped wing details&rdquo;</li>
                  <li>• &ldquo;Navy and gold graduation stars with class year&rdquo;</li>
                  <li>• &ldquo;Soft pink heart cookies for a bridal shower&rdquo;</li>
                </ul>
              </div>
            </div>
          </div>
          
          <div className="space-y-4">
            <textarea
              placeholder="Describe the subject, occasion, colors, and personalization..."
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 min-h-[100px] text-sm resize-none"
              value={aiDescription}
              onChange={(e) => setAiDescription(e.target.value)}
            />
            
            <button
              onClick={handleAIGeneration}
              disabled={!aiDescription.trim() || isGenerating}
              className={`w-full p-3 rounded-lg font-medium transition-all duration-200 flex items-center justify-center gap-2 ${
                !aiDescription.trim() || isGenerating
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:from-purple-600 hover:to-pink-600 active:scale-95'
              }`}
            >
              {isGenerating ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Building Cookie Project...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Create Cookie Project
                </>
              )}
            </button>
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

