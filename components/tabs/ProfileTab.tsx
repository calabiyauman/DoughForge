'use client'

import { useCookieCutter } from '@/lib/context/CookieCutterContext'
import ProfilePreview from '../ProfilePreview'

const profileTypes = [
  { id: 'professional', label: 'Professional (Your Method)' },
  { id: 'classic', label: 'Classic Straight' },
  { id: 'bella', label: 'Bella Style' },
  { id: 'ergonomic', label: 'Ergonomic' },
]

export default function ProfileTab() {
  const { parameters, updateParameters, generateCookieCutter } = useCookieCutter()

  const updateParam = (key: string, value: number | string | boolean) => {
    updateParameters({ [key]: value })
    // Debounced regeneration
    setTimeout(() => {
      generateCookieCutter()
    }, 300)
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Cross-Section Profile</h3>
        
        {/* Profile Type Selection */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Profile Type
          </label>
          
          <select
            value={parameters.profileType}
            onChange={(e) => updateParam('profileType', e.target.value)}
            className="input-field"
          >
            {profileTypes.map((type) => (
              <option key={type.id} value={type.id}>
                {type.label}
              </option>
            ))}
          </select>
        </div>

        {/* Professional Parameters */}
        {parameters.profileType === 'professional' && (
          <div className="space-y-6">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <h4 className="font-medium text-blue-800 mb-2">Professional Method</h4>
              <p className="text-sm text-blue-700">
                Your exact specifications: outer wall (6.35mm offset, 10.16mm height), 
                inner wall (-2.79mm offset, 17.78mm height), 80° chamfer (2.29mm).
              </p>
            </div>

            {/* Outer Wall */}
            <div>
              <h4 className="font-medium text-gray-800 mb-3">Outer Wall</h4>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Outer Offset
                    <span className="ml-2 text-primary-600 font-semibold">
                      {parameters.outerOffset.toFixed(2)}mm
                    </span>
                  </label>
                  <input
                    type="range"
                    min="2"
                    max="15"
                    step="0.5"
                    value={parameters.outerOffset}
                    onChange={(e) => updateParam('outerOffset', parseFloat(e.target.value))}
                    className="slider"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Outer Height
                    <span className="ml-2 text-primary-600 font-semibold">
                      {parameters.outerHeight.toFixed(2)}mm
                    </span>
                  </label>
                  <input
                    type="range"
                    min="5"
                    max="25"
                    step="0.5"
                    value={parameters.outerHeight}
                    onChange={(e) => updateParam('outerHeight', parseFloat(e.target.value))}
                    className="slider"
                  />
                </div>
              </div>
            </div>

            {/* Inner Wall */}
            <div>
              <h4 className="font-medium text-gray-800 mb-3">Inner Wall</h4>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Inner Offset (negative = inward)
                    <span className="ml-2 text-primary-600 font-semibold">
                      {parameters.innerOffset.toFixed(2)}mm
                    </span>
                  </label>
                  <input
                    type="range"
                    min="-8"
                    max="0"
                    step="0.1"
                    value={parameters.innerOffset}
                    onChange={(e) => updateParam('innerOffset', parseFloat(e.target.value))}
                    className="slider"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Inner Height
                    <span className="ml-2 text-primary-600 font-semibold">
                      {parameters.innerHeight.toFixed(2)}mm
                    </span>
                  </label>
                  <input
                    type="range"
                    min="10"
                    max="30"
                    step="0.5"
                    value={parameters.innerHeight}
                    onChange={(e) => updateParam('innerHeight', parseFloat(e.target.value))}
                    className="slider"
                  />
                </div>
              </div>
            </div>

            {/* Chamfer */}
            <div>
              <h4 className="font-medium text-gray-800 mb-3">Chamfer (80° angle)</h4>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Chamfer Distance
                  <span className="ml-2 text-primary-600 font-semibold">
                    {parameters.chamfer.toFixed(2)}mm
                  </span>
                </label>
                <input
                  type="range"
                  min="0"
                  max="5"
                  step="0.1"
                  value={parameters.chamfer}
                  onChange={(e) => updateParam('chamfer', parseFloat(e.target.value))}
                  className="slider"
                />
              </div>
            </div>
          </div>
        )}

        {/* Corner Smoothing */}
        <div className="mt-6">
          <h4 className="font-medium text-gray-800 mb-4">Corner Smoothing</h4>
          
          <div className="space-y-4">
            <div className="input-group">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={parameters.smoothCorners}
                  onChange={(e) => updateParameters({ smoothCorners: e.target.checked })}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <span>Smooth Sharp Corners</span>
              </label>
              <p className="text-xs text-gray-500 mt-1">
                Prevents profile overlap at acute and obtuse angles
              </p>
            </div>

            {parameters.smoothCorners && (
              <div className="ml-6 space-y-4 border-l-2 border-primary-200 pl-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Corner Radius
                    <span className="ml-2 text-primary-600 font-semibold">
                      {parameters.cornerRadius.toFixed(1)}mm
                    </span>
                  </label>
                  <input
                    type="range"
                    min="0.1"
                    max="2.0"
                    step="0.1"
                    value={parameters.cornerRadius}
                    onChange={(e) => updateParameters({ cornerRadius: parseFloat(e.target.value) })}
                    className="slider"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Radius for smoothing sharp corners
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Angle Threshold
                    <span className="ml-2 text-primary-600 font-semibold">
                      {parameters.angleThreshold}°
                    </span>
                  </label>
                  <input
                    type="range"
                    min="5"
                    max="45"
                    step="5"
                    value={parameters.angleThreshold}
                    onChange={(e) => updateParameters({ angleThreshold: parseInt(e.target.value) })}
                    className="slider"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Angles sharper than this will be smoothed
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Optimization */}
        <div className="mt-6">
          <h4 className="font-medium text-gray-800 mb-4">3D Printing</h4>
          
          <div className="input-group">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={parameters.optimizePrinting}
                onChange={(e) => updateParameters({ optimizePrinting: e.target.checked })}
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <span>Optimize for 3D Printing</span>
            </label>
            <p className="text-xs text-gray-500 mt-1">
              Applies optimizations for better printability
            </p>
          </div>
        </div>

        {/* Profile Preview */}
        <div className="mt-4 lg:mt-6">
          <h4 className="font-medium text-gray-800 mb-3">Profile Preview</h4>
          <div className="h-32 lg:h-40">
            <ProfilePreview />
          </div>
        </div>
      </div>
    </div>
  )
}
