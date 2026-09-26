export interface TrustedColorDefinition {
  key: string
  name: string
  hex: string
  gelName?: string
}

export const TRUSTED_COLOR_CATALOG: Record<string, TrustedColorDefinition> = {
  white: { key: 'white', name: 'Royal White', hex: '#FFFDF8' },
  cream: { key: 'cream', name: 'Warm Cream', hex: '#F5E7C8', gelName: 'Ivory' },
  ivory: { key: 'ivory', name: 'Ivory', hex: '#F1E1BF', gelName: 'Ivory' },
  black: { key: 'black', name: 'Soft Black', hex: '#25242A', gelName: 'Super Black' },
  brown: { key: 'brown', name: 'Cocoa Brown', hex: '#7A4A35', gelName: 'Chocolate Brown' },
  red: { key: 'red', name: 'Celebration Red', hex: '#C9444D', gelName: 'Tulip Red' },
  pink: { key: 'pink', name: 'Blush Pink', hex: '#EBA6B6', gelName: 'Soft Pink' },
  'dusty rose': { key: 'dusty rose', name: 'Dusty Rose', hex: '#C98993', gelName: 'Dusty Rose' },
  orange: { key: 'orange', name: 'Citrus Orange', hex: '#E98A45', gelName: 'Orange' },
  yellow: { key: 'yellow', name: 'Buttercup', hex: '#EBCB55', gelName: 'Lemon Yellow' },
  green: { key: 'green', name: 'Garden Green', hex: '#729664', gelName: 'Leaf Green' },
  sage: { key: 'sage', name: 'Soft Sage', hex: '#91A487', gelName: 'Avocado' },
  blue: { key: 'blue', name: 'Storybook Blue', hex: '#739DC4', gelName: 'Sky Blue' },
  navy: { key: 'navy', name: 'Evening Navy', hex: '#344A68', gelName: 'Navy Blue' },
  purple: { key: 'purple', name: 'Lavender Purple', hex: '#9A7AB8', gelName: 'Regal Purple' },
  lavender: { key: 'lavender', name: 'Lavender', hex: '#B9A5D2', gelName: 'Regal Purple' },
  teal: { key: 'teal', name: 'Modern Teal', hex: '#4F9A98', gelName: 'Teal' }
}

export const DEFAULT_PROJECT_PALETTES: Record<string, string[]> = {
  butterfly: ['lavender', 'pink', 'cream', 'white'],
  heart: ['dusty rose', 'pink', 'cream', 'white'],
  star: ['yellow', 'cream', 'navy', 'white'],
  cat: ['cream', 'pink', 'brown', 'white'],
  circle: ['sage', 'cream', 'dusty rose', 'white'],
  generic: ['blue', 'cream', 'navy', 'white']
}

export function cleanColorName(value: string): string {
  return value.trim().toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ')
}

export function requestedColorKeys(prompt: string, explicit: readonly string[]): string[] {
  const candidates = [...explicit.map(cleanColorName)]
  const normalizedPrompt = cleanColorName(prompt)
  for (const key of Object.keys(TRUSTED_COLOR_CATALOG).sort((a, b) => b.length - a.length)) {
    if (normalizedPrompt.includes(key)) candidates.push(key)
  }
  return [...new Set(candidates.filter((key) => TRUSTED_COLOR_CATALOG[key]))]
}

function rgb(hex: string): [number, number, number] {
  const normalized = hex.replace('#', '')
  const value = Number.parseInt(normalized, 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

/**
 * Finds the closest trusted display swatch. This is only a catalog lookup for
 * prototype product mapping; it is not a cured-icing color prediction.
 */
export function nearestTrustedColor(hex: string): TrustedColorDefinition {
  const [red, green, blue] = rgb(hex)
  return Object.values(TRUSTED_COLOR_CATALOG).reduce((best, candidate) => {
    const [candidateRed, candidateGreen, candidateBlue] = rgb(candidate.hex)
    const distance = (
      (red - candidateRed) ** 2
      + (green - candidateGreen) ** 2
      + (blue - candidateBlue) ** 2
    )
    const [bestRed, bestGreen, bestBlue] = rgb(best.hex)
    const bestDistance = (
      (red - bestRed) ** 2
      + (green - bestGreen) ** 2
      + (blue - bestBlue) ** 2
    )
    return distance < bestDistance ? candidate : best
  })
}
