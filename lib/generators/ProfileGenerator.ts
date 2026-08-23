/**
 * Profile Generator - Creates cross-section profiles for cookie cutters
 * Implements various cookie cutter profiles including the user's professional method
 */

import { referenceV3Profile } from '../profiles/measuredReferenceV3'

export interface ProfilePoint {
  x: number
  y: number
}

export interface ProfileMetadata {
  outerOffset?: number
  outerHeight?: number
  innerOffset?: number
  innerHeight?: number
  chamfer?: number
  wallThickness?: number
  height?: number
  cutterThickness?: number
  handleRadius?: number
  handleHeight?: number
  description: string
}

export interface Profile {
  type: string
  points: ProfilePoint[]
  metadata: ProfileMetadata
}

interface ProfessionalParams {
  outerOffset?: number
  outerHeight?: number
  innerOffset?: number
  innerHeight?: number
  chamfer?: number
}

export interface ProfileParameters extends ProfessionalParams {
  profileType: string
}

export class ProfileGenerator {
  static fromParameters(parameters: ProfileParameters): Profile {
    if (parameters.profileType === 'reference-v3') {
      return referenceV3Profile()
    }

    if (parameters.profileType === 'professional') {
      return this.professional(parameters)
    }

    return this.generate(parameters.profileType)
  }

  static generate(type: string, params: any = {}): Profile {
    switch (type) {
      case 'reference-v3':
        return referenceV3Profile()
      case 'professional':
        return this.professional(params)
      case 'classic':
        return this.classic(params)
      case 'bella':
        return this.bella(params)
      case 'ergonomic':
        return this.ergonomic(params)
      case 'custom':
        return this.custom(params)
      default:
        return this.professional()
    }
  }

  /**
   * Professional method as specified by the user:
   * 1. Outer offset 0.25" (6.35mm), extrude 0.4" (10.16mm)
   * 2. Inner offset -0.11" (-2.79mm), extrude 0.7" (17.78mm)
   * 3. Chamfer interior top edge 0.09" (2.29mm) at 80°
   */
  static professional(params: ProfessionalParams = {}): Profile {
    const {
      outerOffset = 6.35,    // mm
      outerHeight = 10.16,   // mm
      innerOffset = -2.79,   // mm (negative = inward)
      innerHeight = 17.78,   // mm
      chamfer = 2.29         // mm
    } = params

    const points: ProfilePoint[] = []
    
    // Calculate chamfer offset based on 80° angle
    const chamferAngle = 80 * Math.PI / 180 // Convert to radians
    const chamferX = chamfer * Math.cos(chamferAngle)
    const chamferY = chamfer * Math.sin(chamferAngle)

    // Start from bottom outer corner
    points.push({ x: outerOffset, y: 0 })
    
    // Outer wall up
    points.push({ x: outerOffset, y: outerHeight })
    
    // Step from the broad handle to the outside of the taller cutting wall.
    points.push({ x: 0, y: outerHeight })

    // Outside cutting edge.
    points.push({ x: 0, y: innerHeight })

    // Top of the cutting wall up to the chamfer.
    points.push({ x: Math.min(0, innerOffset + chamferX), y: innerHeight })

    // Chamfered interior cutting edge.
    points.push({ x: innerOffset, y: innerHeight - chamferY })

    // Interior wall back to the build plate.
    points.push({ x: innerOffset, y: 0 })
    
    // Close the profile
    points.push({ x: outerOffset, y: 0 })

    return {
      type: 'professional',
      points,
      metadata: {
        outerOffset,
        outerHeight,
        innerOffset,
        innerHeight,
        chamfer,
        description: 'Professional cookie cutter profile with chamfered cutting edge'
      }
    }
  }

  static classic(params: any = {}): Profile {
    const {
      wallThickness = 2.0,  // mm
      height = 15.0,        // mm
      cutterThickness = 1.0 // mm
    } = params

    const points: ProfilePoint[] = [
      { x: wallThickness, y: 0 },
      { x: wallThickness, y: height },
      { x: cutterThickness, y: height },
      { x: cutterThickness, y: height * 0.8 },
      { x: 0, y: height * 0.8 },
      { x: 0, y: 0 },
      { x: wallThickness, y: 0 }
    ]

    return {
      type: 'classic',
      points,
      metadata: {
        wallThickness,
        height,
        cutterThickness,
        description: 'Classic straight-wall cookie cutter'
      }
    }
  }

  static bella(params: any = {}): Profile {
    const {
      wallThickness = 3.0,
      height = 18.0,
      handleHeight = 8.0,
      cutterAngle = 15 // degrees
    } = params

    const angleRad = cutterAngle * Math.PI / 180
    const cutterOffset = (height - handleHeight) * Math.tan(angleRad)

    const points: ProfilePoint[] = [
      { x: wallThickness, y: 0 },
      { x: wallThickness, y: handleHeight },
      { x: wallThickness - cutterOffset, y: height },
      { x: 0, y: height },
      { x: 0, y: 0 },
      { x: wallThickness, y: 0 }
    ]

    return {
      type: 'bella',
      points,
      metadata: {
        wallThickness,
        height,
        handleHeight,
        description: 'Bella-style cookie cutter with angled cutting edge'
      }
    }
  }

  static ergonomic(params: any = {}): Profile {
    const {
      wallThickness = 4.0,
      height = 20.0,
      handleRadius = 2.0,
      cutterThickness = 0.8
    } = params

    const points: ProfilePoint[] = []
    
    // Create ergonomic handle with rounded top
    const segments = 32
    for (let i = 0; i <= segments; i++) {
      const angle = (Math.PI * i) / segments
      const x = wallThickness - handleRadius + Math.cos(angle) * handleRadius
      const y = height - handleRadius + Math.sin(angle) * handleRadius
      if (y >= height - handleRadius) {
        points.push({ x, y })
      }
    }

    // Add cutting edge
    points.push({ x: cutterThickness, y: height })
    points.push({ x: cutterThickness, y: height * 0.75 })
    points.push({ x: 0, y: height * 0.75 })
    points.push({ x: 0, y: 0 })
    points.push({ x: wallThickness, y: 0 })

    return {
      type: 'ergonomic',
      points,
      metadata: {
        wallThickness,
        height,
        handleRadius,
        cutterThickness,
        description: 'Ergonomic cookie cutter with rounded handle'
      }
    }
  }

  static custom(params: any = {}): Profile {
    const { points = [] } = params
    
    if (points.length === 0) {
      // Default custom profile
      return this.professional()
    }

    return {
      type: 'custom',
      points,
      metadata: {
        description: 'Custom user-defined profile'
      }
    }
  }
}

