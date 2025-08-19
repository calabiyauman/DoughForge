/**
 * Cookie Cutter Generator - 3D Geometry Generation
 * Creates cookie cutter geometry by sweeping profiles along paths
 */

interface GeneratorOptions {
  outline: any
  profile: any
  scale?: number
  optimize?: boolean
  smoothCorners?: boolean
  cornerRadius?: number
  angleThreshold?: number
}

interface Geometry {
  vertices: Float32Array
  faces: Uint32Array
}

interface CookieCutter {
  geometry: Geometry
  metadata: {
    vertices: number
    faces: number
    scale: number
    optimized: boolean
  }
}

export class CookieCutterGenerator {
  static generate(options: GeneratorOptions): CookieCutter {
    const {
      outline,
      profile,
      scale = 1.0,
      optimize = true,
      smoothCorners = true,
      cornerRadius = 0.5,
      angleThreshold = 15
    } = options

    if (!outline || !profile) {
      throw new Error('Both outline and profile are required')
    }

    console.log('Generating cookie cutter with options:', options)

    try {
      // Create 3D geometry by sweeping profile along outline
      const geometry = this.sweepProfileAlongPath(outline, profile, scale, {
        smoothCorners,
        cornerRadius,
        angleThreshold
      })
      
      // Apply optimizations if requested
      if (optimize) {
        this.optimizeForPrinting(geometry)
      }

      return {
        geometry,
        metadata: {
          vertices: geometry.vertices?.length / 3 || 0,
          faces: geometry.faces?.length / 3 || 0,
          scale,
          optimized: optimize
        }
      }
    } catch (error) {
      console.error('Error generating cookie cutter:', error)
      throw error
    }
  }

  static sweepProfileAlongPath(
    outline: any, 
    profile: any, 
    scale: number, 
    smoothingOptions: {
      smoothCorners: boolean
      cornerRadius: number
      angleThreshold: number
    } = { smoothCorners: true, cornerRadius: 0.5, angleThreshold: 15 }
  ): Geometry {
    // Convert outline points to path
    const pathPoints = this.outlineToPath(outline, scale, smoothingOptions)
    
    // Convert profile to cross-section
    const profilePoints = this.scaleProfile(profile, scale)
    
    // Generate swept geometry
    const geometry = this.createSweptGeometry(pathPoints, profilePoints)
    
    return geometry
  }

  static calculatePathTangents(pathPoints: Array<{x: number, y: number, z: number}>): Array<{x: number, z: number}> {
    const pathLength = pathPoints.length
    const tangents: Array<{x: number, z: number}> = []
    
    for (let i = 0; i < pathLength; i++) {
      let tangent = { x: 0, z: 1 } // Default direction
      
      if (pathLength === 1) {
        // Single point, use default
        tangents.push(tangent)
        continue
      }
      
      // Calculate tangent using neighboring points
      if (i === 0) {
        // First point: use direction to next point
        const next = pathPoints[1]
        const current = pathPoints[0]
        tangent = {
          x: next.x - current.x,
          z: next.z - current.z
        }
      } else if (i === pathLength - 1) {
        // Last point: use direction from previous point
        const current = pathPoints[i]
        const prev = pathPoints[i - 1]
        tangent = {
          x: current.x - prev.x,
          z: current.z - prev.z
        }
      } else {
        // Middle points: use average of incoming and outgoing directions for smoothness
        const prev = pathPoints[i - 1]
        const current = pathPoints[i]
        const next = pathPoints[i + 1]
        
        const incoming = {
          x: current.x - prev.x,
          z: current.z - prev.z
        }
        const outgoing = {
          x: next.x - current.x,
          z: next.z - current.z
        }
        
        // Average the directions for smooth tangent
        tangent = {
          x: (incoming.x + outgoing.x) * 0.5,
          z: (incoming.z + outgoing.z) * 0.5
        }
      }
      
      // Normalize tangent vector
      const length = Math.sqrt(tangent.x * tangent.x + tangent.z * tangent.z)
      if (length > 0.0001) { // Avoid division by zero
        tangent.x /= length
        tangent.z /= length
      } else {
        // Fallback to default direction if length is too small
        tangent = { x: 0, z: 1 }
      }
      
      tangents.push(tangent)
    }
    
    return tangents
  }

  static outlineToPath(
    outline: any, 
    scale: number, 
    smoothingOptions: {
      smoothCorners: boolean
      cornerRadius: number
      angleThreshold: number
    } = { smoothCorners: true, cornerRadius: 0.5, angleThreshold: 15 }
  ): Array<{x: number, y: number, z: number}> {
    let points: Array<{x: number, y: number, z: number}> = []
    
    if (outline.points) {
      // Direct point array
      for (const point of outline.points) {
        points.push({
          x: point.x * scale,
          y: 0, // Path on XY plane
          z: point.y * scale
        })
      }
    } else if (outline.curves) {
      // SVG curves - sample points along curves
      for (const curve of outline.curves) {
        const curvePoints = this.sampleCurve(curve, 50) // 50 points per curve for smoother shapes
        for (const point of curvePoints) {
          points.push({
            x: point.x * scale,
            y: 0,
            z: point.y * scale
          })
        }
      }
    } else if (outline.path) {
      // SVG path data
      const pathPoints = this.parseSVGPath(outline.path)
      for (const point of pathPoints) {
        points.push({
          x: point.x * scale,
          y: 0,
          z: point.y * scale
        })
      }
    }

    // 🎯 SMOOTH PATH ANGLES - Prevent profile overlap at corners
    if (points.length > 2 && smoothingOptions.smoothCorners) {
      points = this.smoothPathAngles(points, smoothingOptions.cornerRadius, smoothingOptions.angleThreshold)
    }

    // Ensure path is closed
    if (points.length > 0) {
      const first = points[0]
      const last = points[points.length - 1]
      const distance = Math.sqrt(
        Math.pow(first.x - last.x, 2) + Math.pow(first.z - last.z, 2)
      )
      
      if (distance > 0.1) {
        points.push({ ...first }) // Close the path
      }
    }

    console.log(`Generated path with ${points.length} points`)
    return points
  }

  static scaleProfile(profile: any, scale: number): Array<{x: number, y: number}> {
    const points: Array<{x: number, y: number}> = []
    
    for (const point of profile.points) {
      points.push({
        x: point.x * scale,
        y: point.y * scale
      })
    }
    
    return points
  }

  static createSweptGeometry(pathPoints: Array<{x: number, y: number, z: number}>, profilePoints: Array<{x: number, y: number}>): Geometry {
    const vertices: number[] = []
    const faces: number[] = []
    
    const pathLength = pathPoints.length
    const profileLength = profilePoints.length
    
    // Calculate consistent tangent vectors for profile orientation (Frenet frame approach)
    const tangents = this.calculatePathTangents(pathPoints)
    
    // Generate vertices by placing profile at each path point
    for (let i = 0; i < pathLength; i++) {
      const pathPoint = pathPoints[i]
      const tangent = tangents[i]
      
      // Calculate normal vector (perpendicular to tangent in XZ plane)
      const normal = {
        x: -tangent.z,  // Rotate tangent 90 degrees in XZ plane
        z: tangent.x
      }
      
      // Place profile points at this path position
      for (let j = 0; j < profileLength; j++) {
        const profilePoint = profilePoints[j]
        
        // Transform profile point to world coordinates using consistent orientation
        const worldX = pathPoint.x + profilePoint.x * normal.x
        const worldY = profilePoint.y
        const worldZ = pathPoint.z + profilePoint.x * normal.z
        
        vertices.push(worldX, worldY, worldZ)
      }
    }
    
    // Generate faces connecting profile rings (including closure)
    for (let i = 0; i < pathLength; i++) {
      const nextI = (i + 1) % pathLength // This ensures we close the loop
      
      for (let j = 0; j < profileLength; j++) {
        const nextJ = (j + 1) % profileLength
        
        const v1 = i * profileLength + j
        const v2 = i * profileLength + nextJ
        const v3 = nextI * profileLength + j
        const v4 = nextI * profileLength + nextJ
        
        // Create two triangles for each quad
        faces.push(v1, v2, v3)
        faces.push(v2, v4, v3)
      }
    }
    
    // Add selective caps - only close where needed for cookie cutter functionality
    this.addCookieCutterCaps(vertices, faces, pathPoints, profilePoints)
    
    console.log(`Generated geometry: ${vertices.length / 3} vertices, ${faces.length / 3} faces`)
    
    return {
      vertices: new Float32Array(vertices),
      faces: new Uint32Array(faces)
    }
  }

  static sampleCurve(curve: any, numPoints: number): Array<{x: number, y: number}> {
    const points: Array<{x: number, y: number}> = []
    
    if (curve.type === 'line') {
      // For lines, interpolate more points for smoother connection
      const steps = Math.max(2, Math.floor(numPoints / 10))
      for (let i = 0; i < steps; i++) {
        const t = i / (steps - 1)
        points.push({
          x: curve.x1 + (curve.x2 - curve.x1) * t,
          y: curve.y1 + (curve.y2 - curve.y1) * t
        })
      }
    } else if (curve.type === 'arc' || curve.type === 'circle') {
      const centerX = curve.cx || 0
      const centerY = curve.cy || 0
      const radius = curve.r || curve.radius || 1
      const startAngle = curve.startAngle || 0
      const endAngle = curve.endAngle || Math.PI * 2
      
      // Use full resolution for circular shapes
      for (let i = 0; i < numPoints; i++) {
        const t = i / (numPoints - 1)
        const angle = startAngle + (endAngle - startAngle) * t
        points.push({
          x: centerX + Math.cos(angle) * radius,
          y: centerY + Math.sin(angle) * radius
        })
      }
    } else if (curve.type === 'bezier') {
      // Use full resolution for bezier curves
      for (let i = 0; i < numPoints; i++) {
        const t = i / (numPoints - 1)
        const point = this.evaluateBezier(curve, t)
        points.push(point)
      }
    } else {
      // Default to line with interpolation
      const steps = Math.max(2, Math.floor(numPoints / 10))
      for (let i = 0; i < steps; i++) {
        const t = i / (steps - 1)
        points.push({
          x: (curve.x1 || 0) + ((curve.x2 || 1) - (curve.x1 || 0)) * t,
          y: (curve.y1 || 0) + ((curve.y2 || 0) - (curve.y1 || 0)) * t
        })
      }
    }
    
    return points
  }

  static evaluateBezier(curve: any, t: number): {x: number, y: number} {
    // Simple quadratic bezier for now
    const p0 = { x: curve.x1, y: curve.y1 }
    const p1 = { x: curve.cx, y: curve.cy }
    const p2 = { x: curve.x2, y: curve.y2 }
    
    const mt = 1 - t
    const mt2 = mt * mt
    const t2 = t * t
    
    return {
      x: mt2 * p0.x + 2 * mt * t * p1.x + t2 * p2.x,
      y: mt2 * p0.y + 2 * mt * t * p1.y + t2 * p2.y
    }
  }

  static parseSVGPath(pathData: string): Array<{x: number, y: number}> {
    // Simple SVG path parser
    const points: Array<{x: number, y: number}> = []
    const commands = pathData.match(/[MmLlHhVvZz][^MmLlHhVvZz]*/g) || []
    
    let currentX = 0
    let currentY = 0
    
    for (const command of commands) {
      const type = command[0]
      const coords = command.slice(1).trim().split(/[\s,]+/).map(Number)
      
      switch (type.toLowerCase()) {
        case 'm': // Move to
          currentX += type === 'M' ? 0 : coords[0]
          currentY += type === 'M' ? 0 : coords[1]
          if (type === 'M') {
            currentX = coords[0]
            currentY = coords[1]
          }
          points.push({ x: currentX, y: currentY })
          break
          
        case 'l': // Line to
          for (let i = 0; i < coords.length; i += 2) {
            if (type === 'L') {
              currentX = coords[i]
              currentY = coords[i + 1]
            } else {
              currentX += coords[i]
              currentY += coords[i + 1]
            }
            points.push({ x: currentX, y: currentY })
          }
          break
          
        case 'h': // Horizontal line
          currentX += type === 'H' ? 0 : coords[0]
          if (type === 'H') currentX = coords[0]
          points.push({ x: currentX, y: currentY })
          break
          
        case 'v': // Vertical line
          currentY += type === 'V' ? 0 : coords[0]
          if (type === 'V') currentY = coords[0]
          points.push({ x: currentX, y: currentY })
          break
          
        case 'z': // Close path
          if (points.length > 0) {
            points.push({ ...points[0] })
          }
          break
      }
    }
    
    return points
  }

  static smoothPathAngles(
    points: Array<{x: number, y: number, z: number}>, 
    cornerRadius: number = 0.5, 
    angleThreshold: number = 15
  ): Array<{x: number, y: number, z: number}> {
    if (points.length < 3) return points
    
    const smoothedPoints: Array<{x: number, y: number, z: number}> = []
    const minAngleThreshold = angleThreshold // degrees - minimum angle before smoothing
    const maxAngleThreshold = 180 - angleThreshold // degrees - maximum angle before smoothing
    
    console.log('Smoothing path angles to prevent profile overlap...')
    
    for (let i = 0; i < points.length; i++) {
      const prev = points[(i - 1 + points.length) % points.length]
      const current = points[i]
      const next = points[(i + 1) % points.length]
      
      // Calculate vectors
      const vec1 = {
        x: current.x - prev.x,
        z: current.z - prev.z
      }
      const vec2 = {
        x: next.x - current.x,
        z: next.z - current.z
      }
      
      // Calculate angle between vectors
      const angle = this.calculateAngleBetweenVectors(vec1, vec2)
      const angleDegrees = (angle * 180) / Math.PI
      
      // Check if angle needs smoothing (acute or very obtuse)
      const needsSmoothing = angleDegrees < minAngleThreshold || angleDegrees > maxAngleThreshold
      
      if (needsSmoothing && i > 0 && i < points.length - 1) {
        // Apply corner smoothing
        const smoothedCorner = this.createSmoothCorner(prev, current, next, cornerRadius, angleDegrees)
        smoothedPoints.push(...smoothedCorner)
      } else {
        // Keep original point
        smoothedPoints.push({ ...current })
      }
    }
    
    console.log(`Path smoothing: ${points.length} -> ${smoothedPoints.length} points`)
    return smoothedPoints
  }
  
  static calculateAngleBetweenVectors(vec1: {x: number, z: number}, vec2: {x: number, z: number}): number {
    // Normalize vectors
    const len1 = Math.sqrt(vec1.x * vec1.x + vec1.z * vec1.z)
    const len2 = Math.sqrt(vec2.x * vec2.x + vec2.z * vec2.z)
    
    if (len1 === 0 || len2 === 0) return Math.PI // 180 degrees for zero-length vectors
    
    const norm1 = { x: vec1.x / len1, z: vec1.z / len1 }
    const norm2 = { x: vec2.x / len2, z: vec2.z / len2 }
    
    // Calculate dot product
    const dotProduct = norm1.x * norm2.x + norm1.z * norm2.z
    
    // Clamp to prevent floating point errors
    const clampedDot = Math.max(-1, Math.min(1, dotProduct))
    
    return Math.acos(clampedDot)
  }
  
  static createSmoothCorner(
    prev: {x: number, y: number, z: number},
    current: {x: number, y: number, z: number},
    next: {x: number, y: number, z: number},
    radius: number,
    angleDegrees: number
  ): Array<{x: number, y: number, z: number}> {
    
    const smoothPoints: Array<{x: number, y: number, z: number}> = []
    
    // Calculate distances to previous and next points
    const distToPrev = Math.sqrt(
      Math.pow(current.x - prev.x, 2) + Math.pow(current.z - prev.z, 2)
    )
    const distToNext = Math.sqrt(
      Math.pow(next.x - current.x, 2) + Math.pow(next.z - current.z, 2)
    )
    
    // Adjust radius based on available distance
    const maxRadius = Math.min(distToPrev, distToNext) * 0.3 // Use 30% of shortest segment
    const effectiveRadius = Math.min(radius, maxRadius)
    
    if (effectiveRadius < 0.1) {
      // Too small to smooth effectively, return original point
      return [{ ...current }]
    }
    
    // Calculate smoothing approach based on angle type
    if (angleDegrees < 90) {
      // Acute angle - use fillet approach
      return this.createFilletCorner(prev, current, next, effectiveRadius)
    } else {
      // Obtuse angle - use chamfer approach  
      return this.createChamferCorner(prev, current, next, effectiveRadius)
    }
  }
  
  static createFilletCorner(
    prev: {x: number, y: number, z: number},
    current: {x: number, y: number, z: number},
    next: {x: number, y: number, z: number},
    radius: number
  ): Array<{x: number, y: number, z: number}> {
    
    const points: Array<{x: number, y: number, z: number}> = []
    
    // Calculate unit vectors
    const vec1 = {
      x: prev.x - current.x,
      z: prev.z - current.z
    }
    const vec2 = {
      x: next.x - current.x,
      z: next.z - current.z
    }
    
    const len1 = Math.sqrt(vec1.x * vec1.x + vec1.z * vec1.z)
    const len2 = Math.sqrt(vec2.x * vec2.x + vec2.z * vec2.z)
    
    if (len1 === 0 || len2 === 0) return [{ ...current }]
    
    const unit1 = { x: vec1.x / len1, z: vec1.z / len1 }
    const unit2 = { x: vec2.x / len2, z: vec2.z / len2 }
    
    // Calculate fillet points
    const startPoint = {
      x: current.x + unit1.x * radius,
      y: current.y,
      z: current.z + unit1.z * radius
    }
    
    const endPoint = {
      x: current.x + unit2.x * radius,
      y: current.y,
      z: current.z + unit2.z * radius
    }
    
    // Create smooth arc between start and end points
    const numArcPoints = 5
    for (let i = 0; i <= numArcPoints; i++) {
      const t = i / numArcPoints
      
      // Simple linear interpolation for now (could be improved with actual arc)
      const point = {
        x: startPoint.x * (1 - t) + endPoint.x * t,
        y: current.y,
        z: startPoint.z * (1 - t) + endPoint.z * t
      }
      
      points.push(point)
    }
    
    return points
  }
  
  static createChamferCorner(
    prev: {x: number, y: number, z: number},
    current: {x: number, y: number, z: number},
    next: {x: number, y: number, z: number},
    radius: number
  ): Array<{x: number, y: number, z: number}> {
    
    // For obtuse angles, create a simple chamfer
    const vec1 = {
      x: prev.x - current.x,
      z: prev.z - current.z
    }
    const vec2 = {
      x: next.x - current.x,
      z: next.z - current.z
    }
    
    const len1 = Math.sqrt(vec1.x * vec1.x + vec1.z * vec1.z)
    const len2 = Math.sqrt(vec2.x * vec2.x + vec2.z * vec2.z)
    
    if (len1 === 0 || len2 === 0) return [{ ...current }]
    
    const unit1 = { x: vec1.x / len1, z: vec1.z / len1 }
    const unit2 = { x: vec2.x / len2, z: vec2.z / len2 }
    
    // Create chamfer points
    const chamferStart = {
      x: current.x + unit1.x * radius,
      y: current.y,
      z: current.z + unit1.z * radius
    }
    
    const chamferEnd = {
      x: current.x + unit2.x * radius,
      y: current.y,
      z: current.z + unit2.z * radius
    }
    
    return [chamferStart, chamferEnd]
  }

  static addCookieCutterCaps(
    vertices: number[], 
    faces: number[], 
    pathPoints: Array<{x: number, y: number, z: number}>, 
    profilePoints: Array<{x: number, y: number}>
  ): void {
    const pathLength = pathPoints.length
    const currentVertexCount = vertices.length / 3
    
    console.log('Adding cookie cutter caps - keeping top open for cutting...')
    
    // Find the Y extents of the profile to understand the geometry
    const profileYValues = profilePoints.map(p => p.y)
    const minY = Math.min(...profileYValues)
    const maxY = Math.max(...profileYValues)
    
    // For a cookie cutter, we want:
    // 1. NO top cap - this needs to stay open for cutting dough
    // 2. Bottom cap - only if there's a flat bottom area (handle area)
    // 3. Close the sides properly
    
    // Only add bottom cap if the profile has a significant flat bottom area
    // (This would be the handle area of the cookie cutter)
    const bottomProfilePoints = profilePoints.filter(p => Math.abs(p.y - minY) < 0.1)
    
    if (bottomProfilePoints.length > 1) {
      console.log('Adding bottom cap for handle area...')
      
      // Create bottom cap - flat surface at minY (handle area)
      const bottomCenterIndex = currentVertexCount
      const pathCenterX = pathPoints.reduce((sum, p) => sum + p.x, 0) / pathLength
      const pathCenterZ = pathPoints.reduce((sum, p) => sum + p.z, 0) / pathLength
      vertices.push(pathCenterX, minY, pathCenterZ)
      
      // Add bottom edge vertices (outline at bottom height)
      const bottomRingStartIndex = bottomCenterIndex + 1
      for (let i = 0; i < pathLength; i++) {
        vertices.push(pathPoints[i].x, minY, pathPoints[i].z)
      }
      
      // Create bottom cap triangles (fan from center, reversed winding for correct normals)
      for (let i = 0; i < pathLength; i++) {
        const nextI = (i + 1) % pathLength
        faces.push(
          bottomCenterIndex,
          bottomRingStartIndex + nextI,
          bottomRingStartIndex + i
        )
      }
      
      console.log(`Added bottom cap: ${pathLength} triangles (handle area)`)
    } else {
      console.log('No significant bottom area found - leaving bottom open')
    }
    
    // Note: Top remains completely open for dough cutting functionality
    // Side walls are already created by the main sweep operation
    
    console.log('Cookie cutter geometry completed - top open for cutting!')
  }

  static optimizeForPrinting(geometry: Geometry): Geometry {
    // Apply 3D printing optimizations
    console.log('Applying 3D printing optimizations...')
    
    // TODO: Implement optimizations like:
    // - Remove overhangs
    // - Add support structures if needed
    // - Optimize wall thickness
    // - Add drainage holes
    
    return geometry
  }
}
