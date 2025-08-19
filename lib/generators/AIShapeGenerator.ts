/**
 * AI Shape Generator - Creates cookie cutter outlines from text descriptions
 * Uses OpenAI API to generate unlimited, high-quality SVG paths
 */

import OpenAI from 'openai'

interface AIShapeResponse {
  points: Array<{x: number, y: number}>
  reasoning: string
  category: string
}

export class AIShapeGenerator {
  private static openai: OpenAI | null = null

  private static getOpenAI(): OpenAI {
    if (!this.openai) {
      const apiKey = process.env.NEXT_PUBLIC_OPENAI_API_KEY || process.env.OPENAI_API_KEY
      if (!apiKey) {
        throw new Error('OpenAI API key not found. Please set NEXT_PUBLIC_OPENAI_API_KEY environment variable.')
      }
      this.openai = new OpenAI({
        apiKey: apiKey,
        dangerouslyAllowBrowser: true
      })
    }
    return this.openai
  }

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
    const openai = this.getOpenAI()

    const prompt = `Create a cookie cutter outline for: "${description}"

REQUIREMENTS:
- Simple, recognizable silhouette suitable for cutting dough
- Closed path with NO gaps or holes
- Centered at origin (0,0)
- All coordinates between -30 and +30
- 15-30 points for optimal detail
- Clockwise path tracing outer edge
- First point = last point (closed)
- Smooth transitions between points
- No internal details or thin features

RESPOND WITH ONLY THE JSON OBJECT - NO OTHER TEXT.`

    const response = await openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages: [
        {
          role: "system", 
          content: "You are a skilled designer creating cookie cutter shapes. You MUST respond with ONLY a valid JSON object in this EXACT format:\n\n{\n  \"points\": [{\"x\": number, \"y\": number}, {\"x\": number, \"y\": number}, ...],\n  \"reasoning\": \"Brief explanation of design choices\",\n  \"category\": \"animal|nature|object|food|holiday|abstract|vehicle|character\"\n}\n\nRULES:\n- points: Array of 15-30 coordinate objects forming a closed path\n- Each point: {\"x\": number, \"y\": number} where numbers are between -30 and +30\n- First and last points MUST be identical to close the shape\n- Path traces clockwise around the outer edge\n- reasoning: 1-2 sentences explaining design decisions\n- category: Must be one of the listed options\n- NO additional text, explanations, or markdown - ONLY the JSON object"
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 1000
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      throw new Error('No response from OpenAI')
    }

    // Parse the JSON response
    let aiData: AIShapeResponse
    try {
      // Clean the response - remove any markdown, extra text, or formatting
      let cleanContent = content.trim()
      
      // Remove markdown code blocks if present
      cleanContent = cleanContent.replace(/```json\s*/g, '').replace(/```\s*/g, '')
      
      // Extract JSON object (find the first complete JSON object)
      const jsonMatch = cleanContent.match(/\{[\s\S]*?\}(?=\s*$|$)/)
      if (!jsonMatch) {
        throw new Error('No valid JSON object found in response')
      }
      
      // Parse the JSON
      aiData = JSON.parse(jsonMatch[0])
      
      // Validate required fields exist
      if (!aiData.points || !aiData.reasoning || !aiData.category) {
        throw new Error('Missing required fields in JSON response')
      }
      
    } catch (parseError) {
      console.error('Failed to parse OpenAI response:', content)
      console.error('Parse error:', parseError)
      throw new Error(`Invalid JSON response from OpenAI: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`)
    }

    // Validate the response structure
    if (!aiData.points || !Array.isArray(aiData.points) || aiData.points.length < 3) {
      throw new Error(`Invalid points array: expected 3+ points, got ${aiData.points?.length || 0}`)
    }

    // Validate point count is within reasonable range
    if (aiData.points.length > 50) {
      console.warn(`Point count ${aiData.points.length} is high, truncating to 50 points`)
      aiData.points = aiData.points.slice(0, 50)
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
        source: 'openai-gpt4',
        reasoning: aiData.reasoning || 'AI-generated design',
        category: aiData.category || 'unknown',
        pointCount: aiData.points.length,
        timestamp: Date.now(),
        model: 'gpt-4-turbo-preview'
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
    
    // Default: generate geometric shape based on description complexity
    const complexity = Math.min(description.length / 20, 1)
    const sides = Math.max(Math.floor(complexity * 8) + 3, 4)
    
    const points: Array<{x: number, y: number}> = []
    const radius = 20
    
    for (let i = 0; i < sides; i++) {
      const angle = (i / sides) * 2 * Math.PI
      const x = Math.cos(angle) * radius
      const y = Math.sin(angle) * radius
      points.push({x, y})
    }
    
    // Close the shape
    points.push(points[0])
    
    return {
      type: 'procedural-fallback',
      description: description,
      points: points,
      metadata: {
        source: 'procedural-fallback',
        sides: sides,
        complexity: complexity,
        timestamp: Date.now()
      }
    }
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
