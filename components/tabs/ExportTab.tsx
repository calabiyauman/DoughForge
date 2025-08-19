'use client'

import { useState } from 'react'
import { Download, Save, Upload, Settings, FileText } from 'lucide-react'
import { useCookieCutter } from '@/lib/context/CookieCutterContext'

export default function ExportTab() {
  const { 
    parameters, 
    updateParameters, 
    exportSTL, 
    exportOBJ, 
    cookieCutter 
  } = useCookieCutter()
  
  const [projectName, setProjectName] = useState('my-cookie-cutter')

  const saveProject = () => {
    try {
      const projectData = {
        name: projectName,
        parameters,
        timestamp: new Date().toISOString(),
        version: '2.0.0'
      }

      const dataStr = JSON.stringify(projectData, null, 2)
      const blob = new Blob([dataStr], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${projectName}.cookiecutter`
      a.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Error saving project:', error)
      alert('Error saving project')
    }
  }

  const loadProject = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.cookiecutter,.json'
    
    input.onchange = async (e) => {
      try {
        const file = (e.target as HTMLInputElement).files?.[0]
        if (!file) return

        const text = await file.text()
        const projectData = JSON.parse(text)

        if (projectData.parameters) {
          updateParameters(projectData.parameters)
          setProjectName(projectData.name || 'loaded-project')
        }
      } catch (error) {
        console.error('Error loading project:', error)
        alert('Error loading project')
      }
    }
    
    input.click()
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Export & Save</h3>

        {/* 3D Print Settings */}
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Settings className="w-5 h-5 text-green-600" />
            <h4 className="font-medium text-green-800">3D Print Settings</h4>
          </div>
          
          <div className="space-y-3">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={parameters.optimizePrinting}
                onChange={(e) => updateParameters({ optimizePrinting: e.target.checked })}
                className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
              />
              <span className="text-sm text-green-700">
                Optimize for 3D Printing
              </span>
            </label>

            <div className="text-xs text-green-600 ml-7">
              Recommended: Layer height 0.2mm, Infill 15-20%, PLA material
            </div>
          </div>
        </div>

        {/* Export Options */}
        <div className="space-y-3 lg:space-y-4 mb-4 lg:mb-6">
          <h4 className="font-medium text-gray-800">Export 3D Model</h4>
          
          <div className="grid grid-cols-1 gap-2 lg:gap-3">
            <button
              onClick={exportSTL}
              disabled={!cookieCutter}
              className={`flex items-center justify-center gap-2 lg:gap-3 p-3 lg:p-4 rounded-lg border-2 transition-all duration-200 touch-manipulation ${
                cookieCutter
                  ? 'border-green-300 bg-green-50 hover:bg-green-100 active:bg-green-200 text-green-800'
                  : 'border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed'
              }`}
            >
              <Download className="w-4 lg:w-5 h-4 lg:h-5" />
              <div className="text-center lg:text-left">
                <div className="font-medium text-sm lg:text-base">Download STL</div>
                <div className="text-xs opacity-80">Ready for 3D printing</div>
              </div>
            </button>

            <button
              onClick={exportOBJ}
              disabled={!cookieCutter}
              className={`flex items-center justify-center gap-2 lg:gap-3 p-3 lg:p-4 rounded-lg border-2 transition-all duration-200 touch-manipulation ${
                cookieCutter
                  ? 'border-blue-300 bg-blue-50 hover:bg-blue-100 active:bg-blue-200 text-blue-800'
                  : 'border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed'
              }`}
            >
              <FileText className="w-4 lg:w-5 h-4 lg:h-5" />
              <div className="text-center lg:text-left">
                <div className="font-medium text-sm lg:text-base">Download OBJ</div>
                <div className="text-xs opacity-80">For advanced editing</div>
              </div>
            </button>
          </div>
        </div>

        {/* Project Management */}
        <div className="border-t border-gray-200 pt-6">
          <h4 className="font-medium text-gray-800 mb-4">Project Management</h4>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Project Name
              </label>
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="my-cookie-cutter"
                className="input-field"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={saveProject}
                className="flex items-center justify-center gap-2 btn-primary"
              >
                <Save className="w-4 h-4" />
                Save Project
              </button>

              <button
                onClick={loadProject}
                className="flex items-center justify-center gap-2 btn-secondary"
              >
                <Upload className="w-4 h-4" />
                Load Project
              </button>
            </div>
          </div>
        </div>

        {/* Usage Tips */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mt-6">
          <h4 className="font-medium text-gray-800 mb-2">💡 3D Printing Tips</h4>
          <ul className="text-sm text-gray-600 space-y-1">
            <li>• Print with cutting edge facing down</li>
            <li>• Use PLA filament for food safety</li>
            <li>• No supports needed with proper orientation</li>
            <li>• Sand cutting edge smooth before use</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
