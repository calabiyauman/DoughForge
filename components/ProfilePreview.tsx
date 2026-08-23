'use client'

import { useMemo } from 'react'
import { useCookieCutter } from '@/lib/context/CookieCutterContext'
import { ProfileGenerator, type ProfilePoint } from '@/lib/generators/ProfileGenerator'

const SVG_WIDTH = 200
const SVG_HEIGHT = 100
const PADDING = 18

export default function ProfilePreview() {
  const { parameters, profile } = useCookieCutter()
  const previewProfile = profile?.type === parameters.profileType
    ? profile
    : ProfileGenerator.fromParameters(parameters)

  const drawing = useMemo(() => createProfileDrawing(previewProfile.points), [previewProfile])
  const height = previewProfile.metadata.outerHeight ?? previewProfile.metadata.height ?? drawing.height

  return (
    <div className="w-full h-40 bg-gray-50 border-2 border-gray-200 rounded-lg overflow-hidden">
      <svg
        className="w-full h-full"
        viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`${previewProfile.type} cookie cutter cross-section`}
      >
        <defs>
          <pattern id="profile-grid" width="10" height="10" patternUnits="userSpaceOnUse">
            <path d="M 10 0 L 0 0 0 10" fill="none" stroke="#e5e7eb" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#profile-grid)" />
        <path
          d={drawing.path}
          fill="#e0e7ff"
          stroke="#6366f1"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <text x="8" y="12" fontSize="8" fill="#374151" className="capitalize">
          {previewProfile.type}
        </text>
        <text x="192" y="12" textAnchor="end" fontSize="8" fill="#4b5563">
          H: {height.toFixed(1)}mm
        </text>
        <text x="192" y="94" textAnchor="end" fontSize="8" fill="#4b5563">
          W: {drawing.width.toFixed(1)}mm
        </text>
      </svg>
    </div>
  )
}

function createProfileDrawing(points: ProfilePoint[]) {
  const minX = Math.min(...points.map((point) => point.x))
  const maxX = Math.max(...points.map((point) => point.x))
  const minY = Math.min(...points.map((point) => point.y))
  const maxY = Math.max(...points.map((point) => point.y))
  const width = Math.max(maxX - minX, 1e-6)
  const height = Math.max(maxY - minY, 1e-6)
  const scale = Math.min(
    (SVG_WIDTH - PADDING * 2) / width,
    (SVG_HEIGHT - PADDING * 2) / height
  ) * 0.85
  const drawingWidth = width * scale
  const drawingHeight = height * scale
  const offsetX = (SVG_WIDTH - drawingWidth) / 2
  const offsetY = (SVG_HEIGHT - drawingHeight) / 2
  const transformed = points.map((point) => ({
    x: (point.x - minX) * scale + offsetX,
    y: SVG_HEIGHT - ((point.y - minY) * scale + offsetY)
  }))
  const path = transformed.reduce(
    (result, point, index) => `${result}${index === 0 ? 'M' : ' L'} ${point.x.toFixed(3)} ${point.y.toFixed(3)}`,
    ''
  ) + ' Z'

  return { path, width, height }
}

