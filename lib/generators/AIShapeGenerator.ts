/**
 * AI Shape Generator - Creates cookie cutter outlines from text descriptions
 * Uses procedural generation and pattern matching to create SVG paths
 */

interface ShapePattern {
  keywords: string[]
  generator: (description: string) => Array<{x: number, y: number}>
}

export class AIShapeGenerator {
  static async generateFromDescription(description: string): Promise<any> {
    const cleanDescription = description.toLowerCase().trim()
    console.log('🤖 AI generating shape for:', cleanDescription)

    // Find matching pattern
    const pattern = this.findBestPattern(cleanDescription)
    
    if (pattern) {
      try {
        const points = pattern.generator(cleanDescription)
        
        // Convert points to SVG-like outline format
        const outline = {
          type: 'ai-generated',
          description: description,
          points: points,
          metadata: {
            source: 'ai-generated',
            keywords: pattern.keywords,
            timestamp: Date.now()
          }
        }

        console.log('✅ AI generated outline:', outline)
        return outline
      } catch (error) {
        console.error('❌ Error in pattern generator:', error)
        return null
      }
    }

    // Fallback: generate a simple shape based on description complexity
    return this.generateFallbackShape(cleanDescription)
  }

  private static findBestPattern(description: string): ShapePattern | null {
    const patterns: ShapePattern[] = [
      // Animals
      {
        keywords: ['cat', 'kitten', 'feline'],
        generator: this.generateCat
      },
      {
        keywords: ['dog', 'puppy', 'canine'],
        generator: this.generateDog
      },
      {
        keywords: ['bird', 'eagle', 'dove', 'owl'],
        generator: this.generateBird
      },
      {
        keywords: ['fish', 'shark', 'whale'],
        generator: this.generateFish
      },
      
      // Nature
      {
        keywords: ['leaf', 'oak', 'maple', 'tree'],
        generator: this.generateLeaf
      },
      {
        keywords: ['flower', 'rose', 'daisy', 'tulip'],
        generator: this.generateFlower
      },
      {
        keywords: ['mountain', 'peak', 'range', 'hill'],
        generator: this.generateMountains
      },
      {
        keywords: ['cloud', 'clouds'],
        generator: this.generateCloud
      },
      
      // Objects
      {
        keywords: ['car', 'vehicle', 'auto'],
        generator: this.generateCar
      },
      {
        keywords: ['house', 'home', 'building'],
        generator: this.generateHouse
      },
      {
        keywords: ['rocket', 'spaceship', 'ship'],
        generator: this.generateRocket
      },
      {
        keywords: ['crown', 'tiara'],
        generator: this.generateCrown
      },
      
      // Seasonal/Holiday
      {
        keywords: ['christmas', 'xmas', 'tree', 'pine'],
        generator: this.generateChristmasTree
      },
      {
        keywords: ['snowman', 'snow'],
        generator: this.generateSnowman
      },
      {
        keywords: ['pumpkin', 'halloween', 'jack'],
        generator: this.generatePumpkin
      },
      
      // Dinosaurs
      {
        keywords: ['dinosaur', 'dino', 't-rex', 'triceratops', 'stegosaurus'],
        generator: this.generateDinosaur
      }
    ]

    // Find the best matching pattern
    let bestMatch: ShapePattern | null = null
    let bestScore = 0

    for (const pattern of patterns) {
      const score = pattern.keywords.reduce((acc, keyword) => {
        return acc + (description.includes(keyword) ? keyword.length : 0)
      }, 0)

      if (score > bestScore) {
        bestScore = score
        bestMatch = pattern
      }
    }

    return bestScore > 0 ? bestMatch : null
  }

  // Shape generators
  private static generateCat(description: string): Array<{x: number, y: number}> {
    const points: Array<{x: number, y: number}> = []
    const size = 40
    
    // Cat silhouette with pointed ears
    const catPath = [
      {x: 0, y: 20}, // bottom center
      {x: -15, y: 25}, // left body
      {x: -20, y: 15}, // left shoulder
      {x: -25, y: 5}, // left side of head
      {x: -20, y: -5}, // left ear base
      {x: -30, y: -20}, // left ear tip
      {x: -25, y: -10}, // left ear inner
      {x: -15, y: -15}, // top left head
      {x: 0, y: -18}, // top center
      {x: 15, y: -15}, // top right head
      {x: 25, y: -10}, // right ear inner
      {x: 30, y: -20}, // right ear tip
      {x: 20, y: -5}, // right ear base
      {x: 25, y: 5}, // right side of head
      {x: 20, y: 15}, // right shoulder
      {x: 15, y: 25}, // right body
      {x: 0, y: 20} // close
    ]
    
    return catPath
  }

  private static generateDog(description: string): Array<{x: number, y: number}> {
    // Dog silhouette with floppy ears
    return [
      {x: 0, y: 25}, // bottom center
      {x: -18, y: 28}, // left body
      {x: -22, y: 18}, // left shoulder
      {x: -25, y: 8}, // left side of head
      {x: -30, y: 0}, // left ear
      {x: -25, y: -8}, // left ear curve
      {x: -15, y: -12}, // top left head
      {x: 0, y: -15}, // top center (snout area)
      {x: 15, y: -12}, // top right head
      {x: 25, y: -8}, // right ear curve
      {x: 30, y: 0}, // right ear
      {x: 25, y: 8}, // right side of head
      {x: 22, y: 18}, // right shoulder
      {x: 18, y: 28}, // right body
      {x: 0, y: 25} // close
    ]
  }

  private static generateLeaf(description: string): Array<{x: number, y: number}> {
    // Oak leaf with lobes
    return [
      {x: 0, y: -30}, // tip
      {x: -8, y: -20}, // left side
      {x: -15, y: -10}, // left lobe
      {x: -12, y: 0}, // left mid
      {x: -18, y: 10}, // left lower lobe
      {x: -10, y: 20}, // left base
      {x: 0, y: 25}, // stem
      {x: 10, y: 20}, // right base
      {x: 18, y: 10}, // right lower lobe
      {x: 12, y: 0}, // right mid
      {x: 15, y: -10}, // right lobe
      {x: 8, y: -20}, // right side
      {x: 0, y: -30} // close
    ]
  }

  private static generateMountains(description: string): Array<{x: number, y: number}> {
    // Mountain range with three peaks
    return [
      {x: -40, y: 20}, // left base
      {x: -30, y: 5}, // first peak base
      {x: -20, y: -15}, // first peak
      {x: -10, y: 0}, // valley
      {x: 0, y: -20}, // main peak
      {x: 10, y: -5}, // valley
      {x: 20, y: -10}, // third peak
      {x: 30, y: 5}, // third peak base
      {x: 40, y: 20}, // right base
      {x: -40, y: 20} // close
    ]
  }

  private static generateCar(description: string): Array<{x: number, y: number}> {
    // Simple car silhouette
    return [
      {x: -25, y: 15}, // front bumper bottom
      {x: -25, y: 10}, // front bumper
      {x: -20, y: 5}, // hood start
      {x: -10, y: 0}, // windshield base
      {x: -5, y: -8}, // windshield top
      {x: 5, y: -8}, // roof
      {x: 15, y: -5}, // rear window
      {x: 20, y: 0}, // trunk
      {x: 25, y: 5}, // rear
      {x: 25, y: 15}, // rear bumper
      {x: 15, y: 15}, // rear wheel well
      {x: 5, y: 15}, // between wheels
      {x: -5, y: 15}, // between wheels
      {x: -15, y: 15}, // front wheel well
      {x: -25, y: 15} // close
    ]
  }

  private static generateRocket(description: string): Array<{x: number, y: number}> {
    // Rocket ship pointing up
    return [
      {x: 0, y: -25}, // nose tip
      {x: -5, y: -20}, // left nose
      {x: -8, y: -10}, // left upper body
      {x: -8, y: 10}, // left lower body
      {x: -15, y: 15}, // left fin
      {x: -15, y: 20}, // left fin bottom
      {x: -5, y: 20}, // left engine
      {x: 0, y: 25}, // engine center
      {x: 5, y: 20}, // right engine
      {x: 15, y: 20}, // right fin bottom
      {x: 15, y: 15}, // right fin
      {x: 8, y: 10}, // right lower body
      {x: 8, y: -10}, // right upper body
      {x: 5, y: -20}, // right nose
      {x: 0, y: -25} // close
    ]
  }

  private static generateChristmasTree(description: string): Array<{x: number, y: number}> {
    // Christmas tree with three tiers
    return [
      {x: 0, y: -25}, // star/top
      {x: -8, y: -20}, // top tier
      {x: -12, y: -15},
      {x: -6, y: -12},
      {x: -15, y: -10}, // middle tier
      {x: -18, y: -5},
      {x: -10, y: -2},
      {x: -20, y: 0}, // bottom tier
      {x: -25, y: 10},
      {x: -5, y: 15}, // trunk left
      {x: -5, y: 20},
      {x: 5, y: 20}, // trunk right
      {x: 5, y: 15},
      {x: 25, y: 10}, // bottom tier right
      {x: 20, y: 0},
      {x: 10, y: -2}, // middle tier right
      {x: 18, y: -5},
      {x: 15, y: -10},
      {x: 6, y: -12}, // top tier right
      {x: 12, y: -15},
      {x: 8, y: -20},
      {x: 0, y: -25} // close
    ]
  }

  private static generateDinosaur(description: string): Array<{x: number, y: number}> {
    // Simple T-Rex silhouette
    return [
      {x: -20, y: 20}, // tail base
      {x: -25, y: 15}, // tail
      {x: -30, y: 10},
      {x: -25, y: 12}, // tail curve back
      {x: -15, y: 18}, // back
      {x: -10, y: 10}, // shoulder
      {x: -5, y: 0}, // neck
      {x: 0, y: -10}, // head back
      {x: 10, y: -15}, // snout
      {x: 15, y: -10}, // jaw
      {x: 10, y: -5}, // jaw back
      {x: 5, y: 0}, // throat
      {x: 8, y: 5}, // chest
      {x: 10, y: 15}, // belly
      {x: 5, y: 20}, // leg
      {x: -5, y: 20}, // between legs
      {x: -10, y: 18}, // back leg
      {x: -20, y: 20} // close
    ]
  }

  // Additional generators for other patterns...
  private static generateBird = AIShapeGenerator.generateCat // Simplified - use cat shape
  private static generateFish = AIShapeGenerator.generateLeaf // Simplified - use leaf shape
  private static generateFlower = AIShapeGenerator.generateLeaf // Simplified - use leaf shape
  private static generateCloud = AIShapeGenerator.generateMountains // Simplified - use mountain shape
  private static generateHouse = AIShapeGenerator.generateCar // Simplified - use car shape
  private static generateCrown = AIShapeGenerator.generateMountains // Simplified - use mountain shape
  private static generateSnowman = AIShapeGenerator.generateCar // Simplified - use car shape
  private static generatePumpkin = AIShapeGenerator.generateCat // Simplified - use cat shape

  private static generateFallbackShape(description: string): any {
    console.log('🔄 Using fallback shape generation for:', description)
    
    // Generate a simple geometric shape based on description length
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
      type: 'ai-generated-fallback',
      description: description,
      points: points,
      metadata: {
        source: 'ai-generated-fallback',
        sides: sides,
        complexity: complexity,
        timestamp: Date.now()
      }
    }
  }
}
