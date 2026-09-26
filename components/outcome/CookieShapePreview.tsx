import { useId, useMemo } from 'react'
import {
  compoundSvgPath,
  getOutcomeBounds,
  getRegionLabelPoint,
  pointsToSvgPath,
  projectOutcomePoint,
} from './geometry'
import type {
  CookieOutcomeView,
  OutcomeColor,
  OutcomeDecorationLettering,
  OutcomeDecorationRegion,
  OutcomeDecorationStep,
  OutcomeDecorationStroke,
  OutcomeDesign,
} from './types'

interface CookieShapePreviewProps {
  design: OutcomeDesign
  regions: OutcomeDecorationRegion[]
  strokes: OutcomeDecorationStroke[]
  lettering: OutcomeDecorationLettering[]
  steps: OutcomeDecorationStep[]
  colors: OutcomeColor[]
  view: CookieOutcomeView
}

export default function CookieShapePreview({
  design,
  regions,
  strokes,
  lettering,
  steps,
  colors,
  view,
}: CookieShapePreviewProps) {
  const rawId = useId()
  const idPrefix = rawId.replace(/[^a-zA-Z0-9_-]/g, '')
  const bounds = useMemo(
    () =>
      getOutcomeBounds([
        design.outerContour,
        ...(design.holes ?? []),
        ...regions.map((region) => region.outer),
        ...strokes.map((stroke) => stroke.points),
        ...lettering.map((item) => [item.position]),
      ]),
    [design.holes, design.outerContour, lettering, regions, strokes]
  )
  const colorById = useMemo(
    () => new Map(colors.map((color) => [color.id, color])),
    [colors]
  )
  const regionStepNumber = useMemo(() => {
    const result = new Map<string, number>()
    for (const step of steps) {
      for (const regionId of step.regionIds) {
        if (!result.has(regionId)) result.set(regionId, step.sequence)
      }
    }
    regions.forEach((region, index) => {
      if (!result.has(region.id)) result.set(region.id, index + 1)
    })
    return result
  }, [regions, steps])

  const padding = Math.max(bounds.width, bounds.height) * 0.14
  const viewBox = `${bounds.minX - padding} ${bounds.minY - padding} ${bounds.width + padding * 2} ${bounds.height + padding * 2}`
  const outerPath = compoundSvgPath(design.outerContour, design.holes, bounds)
  const showGuide = view === 'guide'
  const showPalette = view === 'palette'

  return (
    <svg
      viewBox={viewBox}
      role="img"
      aria-labelledby={`${idPrefix}-title ${idPrefix}-description`}
      className="h-full w-full overflow-visible"
      preserveAspectRatio="xMidYMid meet"
    >
      <title id={`${idPrefix}-title`}>{design.name} decorated cookie preview</title>
      <desc id={`${idPrefix}-description`}>
        A production preview built from the cutter contour and registered icing regions.
      </desc>
      <defs>
        <linearGradient id={`${idPrefix}-cookie`} x1="0" y1="0" x2="0.75" y2="1">
          <stop offset="0" stopColor="#e8b971" />
          <stop offset="0.52" stopColor="#ce8740" />
          <stop offset="1" stopColor="#a95b2b" />
        </linearGradient>
        <linearGradient id={`${idPrefix}-edge`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f2ca87" />
          <stop offset="1" stopColor="#8f4723" />
        </linearGradient>
        <linearGradient id={`${idPrefix}-glaze`} x1="0" y1="0" x2="0.6" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.38" />
          <stop offset="0.5" stopColor="#ffffff" stopOpacity="0.08" />
          <stop offset="1" stopColor="#7c2d12" stopOpacity="0.1" />
        </linearGradient>
        <filter id={`${idPrefix}-shadow`} x="-30%" y="-30%" width="160%" height="180%">
          <feDropShadow dx="0" dy={padding * 0.08} stdDeviation={padding * 0.08} floodColor="#422006" floodOpacity="0.28" />
        </filter>
        <filter id={`${idPrefix}-icing-shadow`} x="-20%" y="-20%" width="140%" height="150%">
          <feDropShadow dx="0" dy={Math.max(bounds.height * 0.008, 0.35)} stdDeviation={Math.max(bounds.height * 0.009, 0.4)} floodColor="#451a03" floodOpacity="0.2" />
        </filter>
        <clipPath id={`${idPrefix}-cookie-clip`}>
          <path d={outerPath} fillRule="evenodd" clipRule="evenodd" />
        </clipPath>
      </defs>

      <ellipse
        cx={bounds.minX + bounds.width / 2}
        cy={bounds.maxY + padding * 0.7}
        rx={bounds.width * 0.43}
        ry={padding * 0.15}
        fill="#422006"
        opacity="0.12"
      />

      <g filter={`url(#${idPrefix}-shadow)`}>
        <path
          d={outerPath}
          fill={`url(#${idPrefix}-cookie)`}
          fillRule="evenodd"
          stroke={`url(#${idPrefix}-edge)`}
          strokeWidth={Math.max(bounds.width * 0.025, 0.7)}
          strokeLinejoin="round"
        />
      </g>

      <g clipPath={`url(#${idPrefix}-cookie-clip)`} filter={`url(#${idPrefix}-icing-shadow)`}>
        {regions.map((region) => {
          const color = colorById.get(region.fillColorId)
          return (
            <path
              key={region.id}
              d={compoundSvgPath(region.outer, region.holes, bounds)}
              fill={color?.hex ?? '#f8fafc'}
              fillRule="evenodd"
              stroke={showGuide ? '#ffffff' : color?.hex ?? '#f8fafc'}
              strokeOpacity={showGuide ? 0.95 : 0.8}
              strokeWidth={Math.max(bounds.width * 0.014, 0.45)}
              strokeLinejoin="round"
            />
          )
        })}

        {strokes.map((stroke) => {
          const color = colorById.get(stroke.colorId)
          return (
            <g key={stroke.id}>
              <path
                d={pointsToSvgPath(stroke.points, bounds, stroke.closed ?? false)}
                fill="none"
                stroke={color?.hex ?? '#78350f'}
                strokeWidth={stroke.width}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {!showGuide ? (
                <path
                  d={pointsToSvgPath(stroke.points, bounds, stroke.closed ?? false)}
                  fill="none"
                  stroke="#ffffff"
                  strokeOpacity="0.3"
                  strokeWidth={Math.max(stroke.width * 0.2, 0.2)}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  transform={`translate(0 ${-Math.max(stroke.width * 0.12, 0.18)})`}
                />
              ) : null}
            </g>
          )
        })}

        {lettering.map((item) => {
          const color = colorById.get(item.colorId)
          const position = projectOutcomePoint(item.position, bounds)
          const estimatedWidth = item.text.length * item.fontSize * (item.style.includes('script') ? 0.52 : 0.61)
          const shouldFit = estimatedWidth > item.maxWidth
          const fontFamily = item.style === 'monoline-script' || item.style === 'faux-calligraphy'
            ? '"Segoe Script", "Brush Script MT", cursive'
            : item.style === 'rounded-block'
              ? '"Trebuchet MS", "Arial Rounded MT Bold", sans-serif'
              : 'Arial, Helvetica, sans-serif'
          return (
            <text
              key={item.id}
              x={position.x}
              y={position.y}
              fill={color?.hex ?? '#78350f'}
              stroke={item.style === 'faux-calligraphy' ? color?.hex ?? '#78350f' : 'none'}
              strokeWidth={item.style === 'faux-calligraphy' ? item.strokeWidth * 0.35 : 0}
              paintOrder="stroke fill"
              fontFamily={fontFamily}
              fontSize={item.fontSize}
              fontWeight={item.style === 'rounded-block' ? 700 : 600}
              fontStyle={item.style === 'monoline-script' || item.style === 'faux-calligraphy' ? 'italic' : 'normal'}
              textAnchor={item.align}
              dominantBaseline="central"
              textLength={shouldFit ? item.maxWidth : undefined}
              lengthAdjust={shouldFit ? 'spacingAndGlyphs' : undefined}
              transform={`rotate(${-item.rotationDegrees} ${position.x} ${position.y})`}
              opacity={showGuide ? 0.88 : 1}
            >
              {item.text}
            </text>
          )
        })}

        {!showGuide ? (
          <path d={outerPath} fill={`url(#${idPrefix}-glaze)`} fillRule="evenodd" pointerEvents="none" />
        ) : null}
      </g>

      <path
        d={outerPath}
        fill="none"
        fillRule="evenodd"
        stroke={showGuide ? '#312e81' : '#7c3f1f'}
        strokeOpacity={showGuide ? 0.8 : 0.48}
        strokeWidth={Math.max(bounds.width * 0.012, 0.4)}
        strokeLinejoin="round"
        strokeDasharray={showGuide ? `${bounds.width * 0.025} ${bounds.width * 0.016}` : undefined}
      />

      {showGuide
        ? regions.map((region) => {
            const labelPoint = getRegionLabelPoint(region.outer, bounds)
            const number = regionStepNumber.get(region.id)
            const markerRadius = Math.max(Math.min(bounds.width, bounds.height) * 0.055, 2.8)
            return (
              <g key={`${region.id}-marker`} aria-hidden="true">
                <circle
                  cx={labelPoint.x}
                  cy={labelPoint.y}
                  r={markerRadius}
                  fill="#312e81"
                  stroke="#ffffff"
                  strokeWidth={markerRadius * 0.18}
                />
                <text
                  x={labelPoint.x}
                  y={labelPoint.y}
                  fill="#ffffff"
                  fontSize={markerRadius * 1.05}
                  fontWeight="700"
                  textAnchor="middle"
                  dominantBaseline="central"
                >
                  {number}
                </text>
              </g>
            )
          })
        : null}

      {showPalette
        ? colors.map((color, index) => {
            const chipRadius = Math.max(Math.min(bounds.width, bounds.height) * 0.032, 2)
            const totalWidth = colors.length * chipRadius * 2.65
            const startX = bounds.minX + (bounds.width - totalWidth) / 2 + chipRadius
            return (
              <circle
                key={`${color.id}-chip`}
                cx={startX + index * chipRadius * 2.65}
                cy={bounds.maxY + padding * 0.52}
                r={chipRadius}
                fill={color.hex}
                stroke="#ffffff"
                strokeWidth={chipRadius * 0.2}
                aria-hidden="true"
              />
            )
          })
        : null}
    </svg>
  )
}
