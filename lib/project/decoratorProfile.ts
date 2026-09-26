/**
 * Provisional production rules derived from common royal-icing workflows.
 * Exact deposited widths vary by recipe, bag/tip, pressure, humidity, and
 * decorator skill, so these values must be calibrated before checkout unlocks.
 */
export const PROFESSIONAL_DECORATOR_PROFILE = {
  id: 'royal-icing-professional-provisional-v1',
  edgeKeepoutMm: 2.5,
  beginnerEdgeKeepoutMm: 3.5,
  minimumStrokeWidthMm: 1,
  hardMinimumStrokeWidthMm: 0.7,
  standardDetailWidthMm: 1.5,
  beginnerOutlineWidthMm: 1.8,
  minimumFloodCorridorMm: 4,
  minimumNegativeSpaceMm: 2.5,
  minimumFloodIslandAreaMm2: 12,
  minimumLetterHeightMm: 7,
  expertMinimumLetterHeightMm: 6,
  minimumLetterCounterMm: 2.5,
  maximumPaletteColors: 6,
  warningPaletteColors: 8,
  hardDryMinutes: 480,
  adjacentSectionCrustMinutes: 20,
  maximumEasyFeatures: 14,
  maximumDetailedFeatures: 24,
} as const

export type DecoratorFontStyle =
  | 'monoline-sans'
  | 'monoline-script'
  | 'rounded-block'
  | 'faux-calligraphy'

export const DECORATOR_FONT_STYLES: readonly DecoratorFontStyle[] = [
  'monoline-sans',
  'monoline-script',
  'rounded-block',
  'faux-calligraphy',
] as const
