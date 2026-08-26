/**
 * The stable, JSON-safe contract shared by design import, generation, geometry,
 * validation, preview, and export.
 *
 * All geometric coordinates and physical measurements are millimeters. Angles
 * and other unitless profile settings belong in `profile.parameters` with an
 * explicit name, rather than being mixed into the measured profile values.
 */

export const DESIGN_SPEC_SCHEMA = 'doughforge.design-spec' as const
export const DESIGN_SPEC_VERSION = 1 as const
export const DESIGN_SPEC_UNITS = 'mm' as const

export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }
export type JsonObject = { [key: string]: JsonValue }

export type DesignRole = 'cut' | 'stamp' | 'emboss' | 'support' | 'handle'

export interface Point2D {
  x: number
  y: number
}

export interface Size2D {
  width: number
  height: number
}

/** CSS/SVG-style affine matrix: [a, b, c, d, e, f]. */
export type Transform2D = [number, number, number, number, number, number]

export interface DesignCanvas {
  /** Lower-left extent of the authoring coordinate system. */
  origin: Point2D
  size: Size2D
}

export interface DesignTarget {
  /** Desired physical envelope after fitting the authoring canvas. */
  size: Size2D
  fit: 'contain' | 'stretch'
}

export interface DesignElementBase {
  id: string
  name?: string
  role: DesignRole
  metadata?: JsonObject
}

export type ContourRelationship =
  | { kind: 'outer' }
  | { kind: 'hole'; outerContourId: string }

/**
 * Closed contours do not repeat the first point at the end. Closure is implied
 * by the kind, preventing a zero-length seam in downstream geometry.
 */
export interface ClosedContour extends DesignElementBase {
  kind: 'closed-contour'
  points: Point2D[]
  relationship: ContourRelationship
  fillRule?: 'nonzero' | 'evenodd'
}

export interface OpenStroke extends DesignElementBase {
  kind: 'open-stroke'
  points: Point2D[]
  width?: number
  lineCap?: 'butt' | 'round' | 'square'
  lineJoin?: 'miter' | 'round' | 'bevel'
}

export interface DesignPart {
  id: string
  name: string
  /** IDs from the top-level `contours` and `strokes` collections. */
  geometryIds: string[]
  transform?: Transform2D
  metadata?: JsonObject
}

export interface DesignAssembly {
  id: string
  name: string
  partIds: string[]
  transform?: Transform2D
  metadata?: JsonObject
}

export interface ProfileReference {
  /** Stable catalog or embedded-profile identifier. */
  id: string
  name: string
  revision?: string
  /** Named profile dimensions; values use the DesignSpec millimeter unit. */
  measurements: Record<string, number>
  /** Explicit non-length settings such as angles, modes, or preset flags. */
  parameters?: JsonObject
}

export interface ManufacturingConstraints {
  process?: 'fdm' | 'resin' | 'other'
  nozzleDiameter?: number
  layerHeight?: number
  minimumWallThickness: number
  minimumFeatureSize: number
  minimumClearance: number
  maximumOverhangAngleDegrees?: number
  buildVolume?: {
    width: number
    depth: number
    height: number
  }
}

export type ProvenanceSourceKind =
  | 'manual'
  | 'preset'
  | 'prompt'
  | 'svg'
  | 'raster'
  | 'model-3d'
  | 'legacy-outline'
  | 'generated'
  | 'other'

export interface RightsMetadata {
  owner?: string
  license?: string
  usage?: string
  sourceUrl?: string
}

export interface ProvenanceSource {
  id: string
  kind: ProvenanceSourceKind
  name?: string
  uri?: string
  sha256?: string
  rights?: RightsMetadata
  metadata?: JsonObject
}

export type ProvenanceTransformationKind =
  | 'unit-conversion'
  | 'apply-transform'
  | 'normalize'
  | 'vectorize'
  | 'simplify'
  | 'repair'
  | 'legacy-adapter'
  | 'other'

export interface ProvenanceTransformation {
  kind: ProvenanceTransformationKind
  description?: string
  matrix?: Transform2D
  parameters?: JsonObject
  appliedAt?: string
}

export interface DesignProvenance {
  createdAt?: string
  createdBy?: string
  generator?: {
    name: string
    version?: string
    model?: string
    prompt?: string
  }
  sources: ProvenanceSource[]
  transformations: ProvenanceTransformation[]
  rights?: RightsMetadata
}

/** Text remains editable while its resolved glyph contours drive geometry. */
export interface DesignText {
  id: string
  text: string
  resolvedContourIds: string[]
  fontFamily?: string
  fontStyle?: string
  fontWeight?: string | number
  metadata?: JsonObject
}

export interface DesignSpec {
  schema: typeof DESIGN_SPEC_SCHEMA
  version: typeof DESIGN_SPEC_VERSION
  units: typeof DESIGN_SPEC_UNITS
  id: string
  name: string
  canvas: DesignCanvas
  target: DesignTarget
  contours: ClosedContour[]
  strokes: OpenStroke[]
  parts: DesignPart[]
  assemblies: DesignAssembly[]
  profile: ProfileReference
  constraints: ManufacturingConstraints
  provenance: DesignProvenance
  text?: DesignText[]
  metadata?: JsonObject
}
