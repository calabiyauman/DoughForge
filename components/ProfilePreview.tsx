'use client'

import { useEffect, useRef } from 'react'
import { useCookieCutter } from '@/lib/context/CookieCutterContext'
import { ProfileGenerator } from '@/lib/generators/ProfileGenerator'

export default function ProfilePreview() {
  const svgRef = useRef<SVGSVGElement>(null)
  const { parameters } = useCookieCutter()

  useEffect(() => {
    if (!svgRef.current) return

    // Generate profile based on current parameters
    const profile = ProfileGenerator.professional({
      outerOffset: parameters.outerOffset,
      outerHeight: parameters.outerHeight,
      innerOffset: parameters.innerOffset,
      innerHeight: parameters.innerHeight,
      chamfer: parameters.chamfer,
    })

    renderProfile(profile, svgRef.current)
  }, [parameters])

  return (
    <div className="w-full h-40 bg-gray-50 border-2 border-gray-200 rounded-lg overflow-hidden">
      <svg
        ref={svgRef}
        className="w-full h-full"
        viewBox="0 0 200 100"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Grid background */}
        <defs>
          <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
            <path d="M 10 0 L 0 0 0 10" fill="none" stroke="#e5e7eb" strokeWidth="0.5"/>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>
    </div>
  )
}

function renderProfile(profile: any, svg: SVGSVGElement) {
  if (!profile || !profile.points || !svg) return

  // Clear existing content except grid
  const existingPaths = svg.querySelectorAll('path:not([id="grid"])')
  existingPaths.forEach(path => path.remove())

  const existingTexts = svg.querySelectorAll('text')
  existingTexts.forEach(text => text.remove())

  const points = profile.points
  if (points.length < 3) return

  // Calculate bounds and scale
  const bounds = calculateBounds(points)
  const padding = 20
  const svgWidth = 200
  const svgHeight = 100
  const availableWidth = svgWidth - padding * 2
  const availableHeight = svgHeight - padding * 2

  const scaleX = availableWidth / bounds.width
  const scaleY = availableHeight / bounds.height
  const scale = Math.min(scaleX, scaleY) * 0.8 // Leave some extra space

  // Transform points to SVG coordinates
  const transformedPoints = points.map((point: { x: number; y: number }) => ({
    x: (point.x - bounds.minX) * scale + padding,
    y: svgHeight - ((point.y - bounds.minY) * scale + padding) // Flip Y axis
  }))

  // Create path
  const pathData = pointsToPath(transformedPoints)
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  path.setAttribute('d', pathData)
  path.setAttribute('fill', '#e0e7ff')
  path.setAttribute('stroke', '#6366f1')
  path.setAttribute('stroke-width', '2')
  path.setAttribute('stroke-linejoin', 'round')
  svg.appendChild(path)

  // Add dimension labels
  addDimensionLabels(svg, profile.metadata, bounds, scale, padding, svgHeight)
}

function calculateBounds(points: any[]) {
  let minX = Infinity, minY = Infinity
  let maxX = -Infinity, maxY = -Infinity

  for (const point of points) {
    minX = Math.min(minX, point.x)
    minY = Math.min(minY, point.y)
    maxX = Math.max(maxX, point.x)
    maxY = Math.max(maxY, point.y)
  }

  return {
    minX, minY, maxX, maxY,
    width: maxX - minX,
    height: maxY - minY
  }
}

function pointsToPath(points: any[]) {
  if (points.length === 0) return ''

  let path = `M ${points[0].x} ${points[0].y}`
  for (let i = 1; i < points.length; i++) {
    path += ` L ${points[i].x} ${points[i].y}`
  }
  path += ' Z' // Close path

  return path
}

function addDimensionLabels(svg: SVGSVGElement, metadata: any, bounds: any, scale: number, padding: number, svgHeight: number) {
  if (!metadata) return

  const fontSize = 8
  const textColor = '#4b5563'

  // Height dimension
  if (metadata.outerHeight) {
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text')
    text.setAttribute('x', (bounds.width * scale + padding + 10).toString())
    text.setAttribute('y', (svgHeight / 2).toString())
    text.setAttribute('font-family', 'Arial, sans-serif')
    text.setAttribute('font-size', fontSize.toString())
    text.setAttribute('fill', textColor)
    text.setAttribute('dominant-baseline', 'middle')
    text.textContent = `H: ${metadata.outerHeight.toFixed(1)}mm`
    svg.appendChild(text)
  }

  // Width dimension
  if (metadata.outerOffset) {
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text')
    text.setAttribute('x', (padding + 10).toString())
    text.setAttribute('y', (svgHeight - 10).toString())
    text.setAttribute('font-family', 'Arial, sans-serif')
    text.setAttribute('font-size', fontSize.toString())
    text.setAttribute('fill', textColor)
    text.textContent = `W: ${metadata.outerOffset.toFixed(1)}mm`
    svg.appendChild(text)
  }

  // Chamfer dimension
  if (metadata.chamfer > 0) {
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text')
    text.setAttribute('x', (padding + bounds.width * scale / 2).toString())
    text.setAttribute('y', (padding + 15).toString())
    text.setAttribute('font-family', 'Arial, sans-serif')
    text.setAttribute('font-size', fontSize.toString())
    text.setAttribute('fill', textColor)
    text.setAttribute('text-anchor', 'middle')
    text.textContent = `Chamfer: ${metadata.chamfer.toFixed(1)}mm`
    svg.appendChild(text)
  }
}
