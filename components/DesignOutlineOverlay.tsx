'use client'

import { memo, useEffect, useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import { Line2 } from 'three/examples/jsm/lines/Line2.js'
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import type { SourceOutlinePath } from '@/lib/generators/StructuredCookieCutterGenerator'
import {
  projectDesignPathToPreview
} from '@/lib/geometry/designOutlinePreview'
import type { PreviewPlacement } from '@/lib/geometry/previewPlacement'

export const SOURCE_OUTLINE_COLOR = '#2563eb'
export const SKIPPED_OUTLINE_COLOR = '#dc2626'

interface DesignOutlineOverlayProps {
  paths: readonly SourceOutlinePath[]
  placement: PreviewPlacement
}

interface DiagnosticLine {
  line: Line2
  geometry: LineGeometry
  material: LineMaterial
}

function createDiagnosticLine(
  points: readonly [number, number, number][],
  color: number,
  lineWidth: number,
  dashed: boolean,
  renderOrder: number
): DiagnosticLine {
  const geometry = new LineGeometry()
  geometry.setPositions(points.flat())
  const material = new LineMaterial({
    color,
    linewidth: lineWidth,
    dashed,
    dashSize: 0.6,
    gapSize: 0.35,
    transparent: true,
    opacity: dashed ? 0.98 : 0.9,
    depthTest: false,
    depthWrite: false
  })
  const line = new Line2(geometry, material)
  line.computeLineDistances()
  line.renderOrder = renderOrder
  line.frustumCulled = false
  return { line, geometry, material }
}

function SourcePathLine({
  path,
  placement
}: {
  path: SourceOutlinePath
  placement: PreviewPlacement
}) {
  const { size } = useThree()
  const points = useMemo(
    () => projectDesignPathToPreview(path.points, placement, path.closed),
    [path, placement]
  )
  const lines = useMemo(() => {
    if (points.length < 2) return []
    return [
      createDiagnosticLine(points, 0xffffff, 5, false, 99),
      createDiagnosticLine(
        points,
        path.generated ? 0x2563eb : 0xdc2626,
        2.5,
        !path.generated,
        100
      )
    ]
  }, [path.generated, points])

  useEffect(() => {
    for (const { material } of lines) {
      material.resolution.set(size.width, size.height)
    }
  }, [lines, size.height, size.width])

  useEffect(() => () => {
    for (const { geometry, material } of lines) {
      geometry.dispose()
      material.dispose()
    }
  }, [lines])

  if (lines.length === 0) return null

  return (
    <>
      {lines.map(({ line }) => (
        <primitive key={line.id} object={line} />
      ))}
    </>
  )
}

const MemoizedSourcePathLine = memo(SourcePathLine)

export default function DesignOutlineOverlay({
  paths,
  placement
}: DesignOutlineOverlayProps) {
  return (
    <group name="source-design-outline">
      {paths.map((path) => (
        <MemoizedSourcePathLine
          key={path.id}
          path={path}
          placement={placement}
        />
      ))}
    </group>
  )
}
