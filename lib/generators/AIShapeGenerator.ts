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

    const prompt = `Generate a cookie cutter outline for: "${description}"

Create a simple, clean silhouette suitable for a cookie cutter. The shape should be:
- Recognizable and iconic 
- Simple enough for cutting through dough
- Closed path with no gaps
- Centered around origin (0,0)
- Sized between -30 to +30 units on both axes
- Smooth curves and clear features

Return ONLY a JSON object with this exact structure:
{
  "points": [{"x": number, "y": number}, ...],
  "reasoning": "Brief explanation of design choices",
  "category": "animal|nature|object|food|holiday|abstract"
}

The points array should form a closed path that traces the outer edge of the shape clockwise.
Start and end with the same point to close the shape.
Use 15-30 points for good detail without being too complex.`

    const response = await openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages: [
        {
          role: "system", 
          content: "You are a skilled designer creating cookie cutter shapes. Generate precise coordinate points for clean, printable silhouettes."
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
      // Extract JSON from response (in case there's extra text)
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        throw new Error('No JSON found in response')
      }
      aiData = JSON.parse(jsonMatch[0])
    } catch (parseError) {
      console.error('Failed to parse OpenAI response:', content)
      throw new Error('Invalid JSON response from OpenAI')
    }

    // Validate the response structure
    if (!aiData.points || !Array.isArray(aiData.points) || aiData.points.length < 3) {
      throw new Error('Invalid points array in OpenAI response')
    }

    // Ensure all points have x,y coordinates
    for (const point of aiData.points) {
      if (typeof point.x !== 'number' || typeof point.y !== 'number') {
        throw new Error('Invalid point coordinates in OpenAI response')
      }
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
