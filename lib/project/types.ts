import type {
  DesignSpec,
  JsonObject,
  Point2D,
  Size2D,
  Transform2D
} from '../design/types'
import type { DecoratorFontStyle } from './decoratorProfile'

/**
 * Versioned, JSON-safe contracts for a complete cookie outcome.
 *
 * Geometry remains in the DesignSpec authoring coordinate system (millimeters).
 * Decoration geometry is registered to that coordinate system with an explicit
 * affine transform so previews, guides, and manufactured tools cannot silently
 * drift apart.
 */

export const PROJECT_BRIEF_SCHEMA = 'doughforge.project-brief' as const
export const PROJECT_BRIEF_VERSION = 1 as const
export const COOKIE_DESIGN_REVISION_SCHEMA = 'doughforge.cookie-design-revision' as const
export const COOKIE_DESIGN_REVISION_VERSION = 1 as const
export const DECORATION_SPEC_SCHEMA = 'doughforge.decoration-spec' as const
export const DECORATION_SPEC_VERSION = 1 as const
export const PALETTE_SPEC_SCHEMA = 'doughforge.palette-spec' as const
export const PALETTE_SPEC_VERSION = 1 as const
export const PREVIEW_ARTIFACT_SCHEMA = 'doughforge.preview-artifact' as const
export const PREVIEW_ARTIFACT_VERSION = 1 as const
export const KIT_BOM_SCHEMA = 'doughforge.kit-bom' as const
export const KIT_BOM_VERSION = 1 as const
export const PROJECT_VALIDATION_REPORT_SCHEMA = 'doughforge.project-validation-report' as const
export const PROJECT_VALIDATION_REPORT_VERSION = 1 as const
export const COOKIE_PROJECT_REVISION_SCHEMA = 'doughforge.cookie-project-revision' as const
export const COOKIE_PROJECT_REVISION_VERSION = 1 as const

export type CookieProjectLifecycle =
  | 'concept'
  | 'production-validation'
  | 'ready-to-order'
  | 'approved'
  | 'ordered'
  | 'archived'

export type DecorationDifficulty = 'easy' | 'detailed'

export interface ProjectPersonalization {
  label: string
  value: string
}

export interface ProjectInspirationAsset {
  id: string
  kind: 'upload' | 'url' | 'catalog'
  uri: string
  mimeType?: string
  rights?: {
    owner?: string
    license?: string
    usage?: string
  }
}

export interface ProjectBrief {
  schema: typeof PROJECT_BRIEF_SCHEMA
  version: typeof PROJECT_BRIEF_VERSION
  id: string
  title: string
  prompt: string
  createdAt: string
  requestedDesignCount: number
  difficulty: DecorationDifficulty
  occasion?: string
  audience?: string
  styles: string[]
  requestedColors: string[]
  avoid: string[]
  personalization: ProjectPersonalization[]
  inspirationAssets: ProjectInspirationAsset[]
  targetCookieSize?: Size2D
  preferredTooling?: Array<'cutter' | 'stamp' | 'embosser' | 'stencil' | 'transfer-template'>
  rightsAttestation: {
    userOwnsOrMayUseInputs: boolean
    commercialUseRequested?: boolean
    notes?: string
  }
  metadata?: JsonObject
}

export interface CookieDesignRevision {
  schema: typeof COOKIE_DESIGN_REVISION_SCHEMA
  version: typeof COOKIE_DESIGN_REVISION_VERSION
  id: string
  name: string
  createdAt: string
  sourceBriefId: string
  ordinal: number
  designSpec: DesignSpec
  metadata?: JsonObject
}

export interface DecorationRegistration {
  /** ID of the wrapped DesignSpec, not the CookieDesignRevision wrapper. */
  designSpecId: string
  coordinateSpace: 'design-canvas'
  /** Maps decoration coordinates into DesignSpec authoring coordinates. */
  transform: Transform2D
}

export interface DecorationRegion {
  id: string
  name: string
  outer: Point2D[]
  holes: Point2D[][]
  /** Optional traceability back to DesignSpec contours or strokes. */
  sourceGeometryIds: string[]
  fillColorId: string
  metadata?: JsonObject
}

export interface DecorationStroke {
  id: string
  name: string
  points: Point2D[]
  width: number
  closed: boolean
  sourceGeometryIds: string[]
  colorId: string
  lineCap?: 'butt' | 'round' | 'square'
  lineJoin?: 'miter' | 'round' | 'bevel'
  metadata?: JsonObject
}

export interface DecorationLettering {
  id: string
  name: string
  /** Editable copy retained for personalization and guide generation. */
  text: string
  /** Baseline anchor in decoration coordinates. */
  position: Point2D
  maxWidth: number
  fontSize: number
  /** Target deposited bead width, not a promise about a specific nozzle. */
  strokeWidth: number
  colorId: string
  style: DecoratorFontStyle
  technique: 'piped' | 'transfer' | 'marker'
  align: 'start' | 'middle' | 'end'
  rotationDegrees: number
  sourceGeometryIds: string[]
  metadata?: JsonObject
}

export type DecorationTechnique =
  | 'base-coat'
  | 'outline'
  | 'flood'
  | 'wet-on-wet'
  | 'piped-detail'
  | 'paint'
  | 'airbrush'
  | 'marker'
  | 'transfer'
  | 'sprinkle'
  | 'finish'

export type IcingConsistency = 'stiff' | 'piping' | 'medium' | 'flood'

export interface DecorationStep {
  id: string
  /** One-based, contiguous execution order. */
  sequence: number
  title: string
  instructions: string
  technique: DecorationTechnique
  regionIds: string[]
  strokeIds: string[]
  letteringIds?: string[]
  colorIds: string[]
  /** Dependencies must point to earlier steps in this same spec. */
  dependsOnStepIds: string[]
  icingConsistency?: IcingConsistency
  dryTimeMinutes?: number
  tool?: string
  metadata?: JsonObject
}

export interface DecorationSpec {
  schema: typeof DECORATION_SPEC_SCHEMA
  version: typeof DECORATION_SPEC_VERSION
  id: string
  name: string
  designRevisionId: string
  paletteSpecId: string
  difficulty: DecorationDifficulty
  estimatedMinutes?: number
  registration: DecorationRegistration
  regions: DecorationRegion[]
  strokes: DecorationStroke[]
  lettering?: DecorationLettering[]
  steps: DecorationStep[]
  metadata?: JsonObject
}

export interface PaletteTargetColor {
  /** Canonical uppercase or lowercase six-digit sRGB color. */
  hex: string
  /** Optional calibrated CIE L*a*b* target under the named illuminant. */
  lab?: {
    l: number
    a: number
    b: number
    illuminant: 'D50' | 'D65'
  }
}

export interface PaletteColor {
  id: string
  name: string
  target: PaletteTargetColor
  role?: 'base' | 'outline' | 'detail' | 'accent' | 'neutral'
  recipeId?: string
  metadata?: JsonObject
}

export interface GelColorSku {
  id: string
  brand: string
  sku: string
  name: string
  packageGrams?: number
  productUrl?: string
  allergenStatement?: string
  metadata?: JsonObject
}

export interface GelRecipeAddition {
  gelSkuId: string
  amount: number
  unit: 'drop' | 'gram'
}

export interface GelColorRecipe {
  id: string
  colorId: string
  baseIcingGrams: number
  additions: GelRecipeAddition[]
  restMinutes?: number
  notes?: string
  metadata?: JsonObject
}

export interface PaletteSpec {
  schema: typeof PALETTE_SPEC_SCHEMA
  version: typeof PALETTE_SPEC_VERSION
  id: string
  name: string
  colors: PaletteColor[]
  gelSkus: GelColorSku[]
  recipes: GelColorRecipe[]
  disclaimer?: string
  metadata?: JsonObject
}

export type PreviewArtifactKind =
  | 'decorated-cookie'
  | 'cookie-set'
  | 'cutter'
  | 'line-art'
  | 'guide-page'
  | 'palette-card'

export type PreviewFidelity = 'concept' | 'production-faithful' | 'approved'

export interface PreviewArtifact {
  schema: typeof PREVIEW_ARTIFACT_SCHEMA
  version: typeof PREVIEW_ARTIFACT_VERSION
  id: string
  kind: PreviewArtifactKind
  fidelity: PreviewFidelity
  uri: string
  mimeType: string
  widthPixels?: number
  heightPixels?: number
  altText: string
  createdAt: string
  designRevisionIds: string[]
  decorationSpecIds: string[]
  paletteSpecIds: string[]
  generator?: {
    name: string
    version?: string
    model?: string
  }
  metadata?: JsonObject
}

export type KitComponentKind =
  | 'printed-tool'
  | 'stencil'
  | 'transfer-template'
  | 'digital-guide'
  | 'gel-color'
  | 'supply'
  | 'packaging'

export interface KitBOMComponent {
  id: string
  kind: KitComponentKind
  name: string
  quantity: number
  unit: 'piece' | 'bottle' | 'download' | 'set'
  required: boolean
  designRevisionId?: string
  previewArtifactId?: string
  paletteSpecId?: string
  gelSkuId?: string
  sellableSku?: string
  unitPriceMinor?: number
  metadata?: JsonObject
}

export interface KitBOM {
  schema: typeof KIT_BOM_SCHEMA
  version: typeof KIT_BOM_VERSION
  id: string
  name: string
  status: 'draft' | 'orderable' | 'unavailable'
  currency: string
  components: KitBOMComponent[]
  metadata?: JsonObject
}

export type ProjectValidationSeverity = 'warning' | 'error'

export interface ProjectValidationIssue {
  path: string
  code: string
  message: string
  severity: ProjectValidationSeverity
  relatedIds?: string[]
}

export interface ProjectValidationReport {
  schema: typeof PROJECT_VALIDATION_REPORT_SCHEMA
  version: typeof PROJECT_VALIDATION_REPORT_VERSION
  id: string
  projectRevisionId: string
  evaluatedAt: string
  status: 'pass' | 'warning' | 'fail'
  issues: ProjectValidationIssue[]
}

export interface CookieProjectRevision {
  schema: typeof COOKIE_PROJECT_REVISION_SCHEMA
  version: typeof COOKIE_PROJECT_REVISION_VERSION
  id: string
  projectId: string
  revisionNumber: number
  parentRevisionId?: string
  createdAt: string
  lifecycle: CookieProjectLifecycle
  brief: ProjectBrief
  designs: CookieDesignRevision[]
  decorations: DecorationSpec[]
  palettes: PaletteSpec[]
  previews: PreviewArtifact[]
  kits: KitBOM[]
  validation?: ProjectValidationReport
  /** sha256 hash of the canonical revision JSON, excluding this field. */
  contentHash: string
  metadata?: JsonObject
}
