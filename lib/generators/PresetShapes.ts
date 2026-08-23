/**
 * Preset Shapes - Common cookie cutter shapes
 */

interface ShapePoint {
  x: number
  y: number
}

interface Shape {
  type: string
  subtype: string
  points: ShapePoint[]
}

export class PresetShapes {
  static generate(shape: string): Shape {
    switch (shape) {
      case 'heart':
        return this.heart()
      case 'star':
        return this.star()
      case 'circle':
        return this.circle()
      case 'square':
        return this.square()
      case 'flower':
        return this.flower()
      case 'butterfly':
        return this.butterfly()
      default:
        return this.heart()
    }
  }

  static heart(): Shape {
    const points: ShapePoint[] = []
    const size = 30
    
    // Heart shape using parametric equations
    for (let t = 0; t <= 2 * Math.PI; t += 0.1) {
      const x = size * (16 * Math.pow(Math.sin(t), 3))
      const y = size * (13 * Math.cos(t) - 5 * Math.cos(2*t) - 2 * Math.cos(3*t) - Math.cos(4*t))
      points.push({ x: x / 20, y: y / 20 })
    }

    return { type: 'preset', subtype: 'heart', points }
  }

  static star(): Shape {
    const points: ShapePoint[] = []
    const outerRadius = 25
    const innerRadius = 12
    const spikes = 5

    for (let i = 0; i < spikes * 2; i++) {
      const angle = (i * Math.PI) / spikes
      const radius = i % 2 === 0 ? outerRadius : innerRadius
      points.push({
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius
      })
    }

    return { type: 'preset', subtype: 'star', points }
  }

  static circle(): Shape {
    const points: ShapePoint[] = []
    const radius = 25
    const segments = 64

    for (let i = 0; i < segments; i++) {
      const angle = (i * 2 * Math.PI) / segments
      points.push({
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius
      })
    }

    return { type: 'preset', subtype: 'circle', points }
  }

  static square(): Shape {
    const size = 25
    return {
      type: 'preset',
      subtype: 'square',
      points: [
        { x: -size, y: -size },
        { x: size, y: -size },
        { x: size, y: size },
        { x: -size, y: size },
        { x: -size, y: -size }
      ]
    }
  }

  static flower(): Shape {
    const points: ShapePoint[] = []
    const petals = 6
    const outerRadius = 25
    const innerRadius = 15

    for (let i = 0; i <= petals * 16; i++) {
      const angle = (i * 2 * Math.PI) / (petals * 16)
      const petalAngle = (i * 2 * Math.PI) / petals
      const radius = innerRadius + (outerRadius - innerRadius) * (1 + Math.cos(petalAngle * petals)) / 2
      
      points.push({
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius
      })
    }

    return { type: 'preset', subtype: 'flower', points }
  }

  static butterfly(): Shape {
    // A broad head-to-abdomen half-outline with distinct upper and lower wing
    // lobes. A single broad waist vertex remains safe for thick cutter offsets.
    const rightSide: ShapePoint[] = [
      { x: 0, y: 34 }, { x: 8, y: 29 }, { x: 14, y: 28 },
      { x: 25, y: 34 }, { x: 38, y: 30 }, { x: 44, y: 20 },
      { x: 43, y: 10 }, { x: 36, y: 4 }, { x: 24, y: 0 },
      { x: 38, y: -12 }, { x: 39, y: -19 }, { x: 34, y: -27 },
      { x: 26, y: -31 }, { x: 17, y: -30 }, { x: 10, y: -24 },
      { x: 6, y: -32 }, { x: 0, y: -39 }
    ]

    const leftSide = rightSide
      .slice(1, -1)
      .reverse()
      .map(({ x, y }) => ({ x: -x, y }))
    const points = [...rightSide, ...leftSide, { ...rightSide[0] }]

    return { type: 'preset', subtype: 'butterfly', points }
  }
}

