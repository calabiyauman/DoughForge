/**
 * AI Shape Generator - Creates cookie cutter outlines from text descriptions
 * Calls the server-side shape API and falls back to local procedural shapes.
 */

import { closeOutline, cleanClosedOutline } from '@/lib/geometry/outline'
import { PresetShapes } from './PresetShapes'

interface AIShapeResponse {
  points: Array<{x: number, y: number}>
  reasoning: string
  category: string
  generator?: string
}

export class AIShapeGenerator {
  static async generateFromDescription(description: string): Promise<any> {
    const cleanDescription = description.trim()
    console.log('🤖 OpenAI generating shape for:', cleanDescription)

    try {
      // First try OpenAI generation
      const aiResult = await this.generateWithOpenAI(cleanDescription)
      if (aiResult) {
        return aiResult
      }
    } catch (error) {
      console.warn('⚠️ OpenAI generation failed, falling back to procedural:', error)
    }

    // Fallback to procedural generation if OpenAI fails
    return this.generateProceduralFallback(cleanDescription)
  }

  private static async generateWithOpenAI(description: string): Promise<any> {
    const response = await fetch('/api/generate-shape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description })
    })

    if (!response.ok) {
      const errorBody = await response.json().catch(() => null)
      throw new Error(errorBody?.error || `Shape generation failed (${response.status})`)
    }

    const aiData = await response.json() as AIShapeResponse & { model?: string }

    // Validate the response structure
    if (!aiData.points || !Array.isArray(aiData.points) || aiData.points.length < 3) {
      throw new Error(`Invalid points array: expected 3+ points, got ${aiData.points?.length || 0}`)
    }

    aiData.points = closeOutline(cleanClosedOutline(aiData.points, 0.01))
    if (aiData.points.length < 4) {
      throw new Error('Invalid points array: expected 3+ distinct points')
    }

    // Traced silhouettes need more vertices than the legacy model-drawn polygons.
    if (aiData.points.length > 400) {
      throw new Error(`Generated outline is too detailed (${aiData.points.length} points)`)
    }

    // Ensure all points have valid x,y coordinates within bounds
    for (let i = 0; i < aiData.points.length; i++) {
      const point = aiData.points[i]
      if (typeof point.x !== 'number' || typeof point.y !== 'number') {
        throw new Error(`Invalid coordinates at point ${i}: x=${point.x}, y=${point.y}`)
      }
      if (Math.abs(point.x) > 50 || Math.abs(point.y) > 50) {
        console.warn(`Point ${i} coordinates (${point.x}, ${point.y}) are outside expected range, clamping`)
        point.x = Math.max(-50, Math.min(50, point.x))
        point.y = Math.max(-50, Math.min(50, point.y))
      }
    }

    // Ensure path is closed (first point = last point)
    const firstPoint = aiData.points[0]
    const lastPoint = aiData.points[aiData.points.length - 1]
    if (Math.abs(firstPoint.x - lastPoint.x) > 0.1 || Math.abs(firstPoint.y - lastPoint.y) > 0.1) {
      console.log('Closing path: adding first point as last point')
      aiData.points.push({x: firstPoint.x, y: firstPoint.y})
    }

    // Validate category
    const validCategories = ['animal', 'nature', 'object', 'food', 'holiday', 'abstract', 'vehicle', 'character']
    if (!validCategories.includes(aiData.category)) {
      console.warn(`Invalid category "${aiData.category}", defaulting to "abstract"`)
      aiData.category = 'abstract'
    }

    // Convert to our outline format
    const outline = {
      type: 'openai-generated',
      description: description,
      points: aiData.points,
      metadata: {
        source: 'openai-server',
        reasoning: aiData.reasoning || 'AI-generated design',
        category: aiData.category || 'unknown',
        pointCount: aiData.points.length,
        timestamp: Date.now(),
        model: aiData.model || 'server-configured',
        generator: aiData.generator || 'structured-vector'
      }
    }

    console.log('✅ OpenAI generated outline:', outline)
    return outline
  }

  private static generateProceduralFallback(description: string): any {
    console.log('🔄 Using procedural fallback for:', description)
    
    // Simple pattern matching for common shapes
    const lowerDesc = description.toLowerCase()
    
    // Try to match to basic patterns
    if (lowerDesc.includes('cat') || lowerDesc.includes('kitten')) {
      return this.createBasicCat(description)
    }
    if (lowerDesc.includes('heart')) {
      return this.createBasicHeart(description) 
    }
    if (lowerDesc.includes('star')) {
      return this.createBasicStar(description)
    }
    if (lowerDesc.includes('circle') || lowerDesc.includes('round')) {
      return this.createBasicCircle(description)
    }
    if (lowerDesc.includes('butterfly')) {
      return {
        ...PresetShapes.butterfly(),
        type: 'procedural-butterfly',
        description,
        metadata: { source: 'procedural-butterfly', timestamp: Date.now() }
      }
    }

    throw new Error(`No recognizable fallback is available for "${description}"`)
  }

  // Basic shape generators for fallback
  private static createBasicCat(description: string): any {
    return {
      type: 'procedural-cat',
      description: description,
      points: [
        {x: 0, y: 20}, {x: -15, y: 25}, {x: -20, y: 15}, {x: -25, y: 5},
        {x: -20, y: -5}, {x: -30, y: -20}, {x: -25, y: -10}, {x: -15, y: -15},
        {x: 0, y: -18}, {x: 15, y: -15}, {x: 25, y: -10}, {x: 30, y: -20},
        {x: 20, y: -5}, {x: 25, y: 5}, {x: 20, y: 15}, {x: 15, y: 25}, {x: 0, y: 20}
      ],
      metadata: { source: 'procedural-cat', timestamp: Date.now() }
    }
  }

  private static createBasicHeart(description: string): any {
    return {
      type: 'procedural-heart',
      description: description,
      points: [
        {x: 0, y: 20}, {x: -15, y: 10}, {x: -20, y: 0}, {x: -15, y: -10},
        {x: -8, y: -15}, {x: 0, y: -8}, {x: 8, y: -15}, {x: 15, y: -10},
        {x: 20, y: 0}, {x: 15, y: 10}, {x: 0, y: 20}
      ],
      metadata: { source: 'procedural-heart', timestamp: Date.now() }
    }
  }

  private static createBasicStar(description: string): any {
    const points = []
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * 2 * Math.PI
      const radius = i % 2 === 0 ? 20 : 10
      points.push({
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius
      })
    }
    points.push(points[0]) // Close
    
    return {
      type: 'procedural-star',
      description: description,
      points: points,
      metadata: { source: 'procedural-star', timestamp: Date.now() }
    }
  }

  private static createBasicCircle(description: string): any {
    const points = []
    for (let i = 0; i < 32; i++) {
      const angle = (i / 32) * 2 * Math.PI
      points.push({
        x: Math.cos(angle) * 20,
        y: Math.sin(angle) * 20
      })
    }
    points.push(points[0]) // Close
    
    return {
      type: 'procedural-circle',
      description: description,
      points: points,
      metadata: { source: 'procedural-circle', timestamp: Date.now() }
    }
  }
}

