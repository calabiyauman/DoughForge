export type CookieOutcomeView = 'decorated' | 'guide' | 'palette' | 'kit'

export type CookieOutcomeLifecycle =
  | 'concept'
  | 'production-validation'
  | 'ready-to-order'
  | 'approved'
  | 'ordered'
  | 'archived'

export type CookieOutcomeDifficulty = 'easy' | 'intermediate' | 'advanced'

export interface OutcomePoint {
  x: number
  y: number
}

export interface OutcomeColor {
  id: string
  name: string
  hex: string
  role?: string
}

export interface OutcomeDesign {
  id: string
  name: string
  outerContour: OutcomePoint[]
  holes?: OutcomePoint[][]
  sizeMm: {
    width: number
    height: number
  }
}

export interface OutcomeDecorationRegion {
  id: string
  name: string
  outer: OutcomePoint[]
  holes?: OutcomePoint[][]
  fillColorId: string
}

export interface OutcomeDecorationStroke {
  id: string
  name: string
  points: OutcomePoint[]
  width: number
  colorId: string
  closed?: boolean
}

export interface OutcomeDecorationLettering {
  id: string
  name: string
  text: string
  position: OutcomePoint
  maxWidth: number
  fontSize: number
  strokeWidth: number
  colorId: string
  style: 'monoline-sans' | 'monoline-script' | 'rounded-block' | 'faux-calligraphy'
  technique: 'piped' | 'transfer' | 'marker'
  align: 'start' | 'middle' | 'end'
  rotationDegrees: number
}

export interface OutcomeDecorationStep {
  id: string
  sequence: number
  title: string
  instructions: string
  technique: string
  regionIds: string[]
  strokeIds: string[]
  colorIds: string[]
  icingConsistency?: string
  dryTimeMinutes?: number
}

export interface OutcomeGelSku {
  id: string
  brand: string
  sku: string
  name: string
  packageGrams?: number
  price?: number
}

export interface OutcomeColorRecipeAddition {
  gelSkuId: string
  amount: number
  unit: 'drops' | 'grams' | 'parts'
}

export interface OutcomeColorRecipe {
  id: string
  colorId: string
  baseIcingGrams: number
  additions: OutcomeColorRecipeAddition[]
  restMinutes?: number
  note?: string
}

export type OutcomeKitComponentKind =
  | 'cutter'
  | 'stamp'
  | 'stencil'
  | 'guide'
  | 'gel'
  | 'supply'

export interface OutcomeKitComponent {
  id: string
  kind: OutcomeKitComponentKind
  name: string
  description?: string
  quantity: number
  sellableSku?: string
  gelSkuId?: string
  unitPrice?: number
  included?: boolean
}

/**
 * A deliberately small presentation contract. The project-domain adapter can
 * select one registered design/decoration/palette/kit from CookieProjectRevision
 * without coupling this component to persistence or generation concerns.
 */
export interface CookieOutcomeViewModel {
  id: string
  projectId: string
  revisionNumber: number
  lifecycle: CookieOutcomeLifecycle
  title: string
  description?: string
  difficulty: CookieOutcomeDifficulty
  estimatedMinutes?: number
  yieldCount?: number
  design: OutcomeDesign
  decoration: {
    name: string
    regions: OutcomeDecorationRegion[]
    strokes: OutcomeDecorationStroke[]
    lettering: OutcomeDecorationLettering[]
    steps: OutcomeDecorationStep[]
  }
  generation?: {
    source: 'ai' | 'prototype'
    model?: string
    score?: number
    disposition?: 'eligible' | 'repair' | 'reject'
    candidateCount?: number
  }
  palette: {
    name: string
    colors: OutcomeColor[]
    gelSkus: OutcomeGelSku[]
    recipes: OutcomeColorRecipe[]
  }
  kit: {
    id: string
    name: string
    status: 'draft' | 'orderable' | 'unavailable'
    currency: string
    components: OutcomeKitComponent[]
  }
}

export interface CookieOutcomePanelProps {
  outcome: CookieOutcomeViewModel
  view?: CookieOutcomeView
  defaultView?: CookieOutcomeView
  onViewChange?: (view: CookieOutcomeView) => void
  onOrderKit?: (outcome: CookieOutcomeViewModel) => void
  onDownloadGuide?: (outcome: CookieOutcomeViewModel) => void
  onEditDesign?: (outcome: CookieOutcomeViewModel) => void
  className?: string
}
