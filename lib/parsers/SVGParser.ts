/**
 * SVG Parser - Converts SVG files to cookie cutter outlines
 * Handles various SVG elements and path commands
 */

interface SVGOutline {
  type: string
  curves: any[]
  points: Array<{x: number, y: number}>
  metadata: {
    viewBox?: string | null
    width?: string | null
    height?: string | null
  }
}

export class SVGParser {
  static parse(svgText: string): SVGOutline | null {
    try {
      // Parse SVG text
      const parser = new DOMParser()
      const svgDoc = parser.parseFromString(svgText, 'image/svg+xml')
      const svgElement = svgDoc.querySelector('svg')
      
      if (!svgElement) {
        throw new Error('No SVG element found')
      }

      console.log('Parsing SVG document...')

      // Extract outline curves from SVG
      const curves = this.extractCurves(svgElement)
      
      if (curves.length === 0) {
        throw new Error('No drawable elements found in SVG')
      }

      // Convert curves to unified point format
      const points = this.curvesToPoints(curves)
      
      console.log(`Extracted ${curves.length} curves, ${points.length} points`)

      return {
        type: 'svg',
        curves,
        points,
        metadata: {
          viewBox: svgElement.getAttribute('viewBox'),
          width: svgElement.getAttribute('width'),
          height: svgElement.getAttribute('height')
        }
      }
    } catch (error) {
      console.error('Error parsing SVG:', error)
      return null
    }
  }

  static extractCurves(svgElement: SVGElement): any[] {
    const curves: any[] = []
    
    // Find all drawable elements
    const paths = svgElement.querySelectorAll('path')
    const rects = svgElement.querySelectorAll('rect')
    const circles = svgElement.querySelectorAll('circle')
    const ellipses = svgElement.querySelectorAll('ellipse')
    const lines = svgElement.querySelectorAll('line')
    const polylines = svgElement.querySelectorAll('polyline')
    const polygons = svgElement.querySelectorAll('polygon')

    // Process each element type
    paths.forEach(path => {
      const pathData = path.getAttribute('d')
      if (pathData) {
        curves.push(...this.parsePathData(pathData))
      }
    })

    rects.forEach(rect => {
      curves.push(...this.rectToCurves(rect))
    })

    circles.forEach(circle => {
      curves.push(this.circleToCurve(circle))
    })

    ellipses.forEach(ellipse => {
      curves.push(this.ellipseToCurve(ellipse))
    })

    lines.forEach(line => {
      curves.push(this.lineToCurve(line))
    })

    polylines.forEach(polyline => {
      curves.push(...this.polylineToCurves(polyline))
    })

    polygons.forEach(polygon => {
      curves.push(...this.polygonToCurves(polygon))
    })

    return curves.flat()
  }

  static parsePathData(pathData: string): any[] {
    const curves: any[] = []
    const commands = pathData.match(/[MmLlHhVvCcSsQqTtAaZz][^MmLlHhVvCcSsQqTtAaZz]*/g) || []
    
    let currentX = 0
    let currentY = 0
    let startX = 0
    let startY = 0

    for (const command of commands) {
      const type = command[0]
      const coords = command.slice(1).trim().split(/[\s,]+/).map(Number).filter(n => !isNaN(n))
      
      switch (type.toLowerCase()) {
        case 'm': // Move to
          if (type === 'M') {
            currentX = coords[0] || 0
            currentY = coords[1] || 0
          } else {
            currentX += coords[0] || 0
            currentY += coords[1] || 0
          }
          startX = currentX
          startY = currentY
          break
          
        case 'l': // Line to
          for (let i = 0; i < coords.length; i += 2) {
            const nextX = type === 'L' ? coords[i] : currentX + coords[i]
            const nextY = type === 'L' ? coords[i + 1] : currentY + coords[i + 1]
            
            curves.push({
              type: 'line',
              x1: currentX,
              y1: currentY,
              x2: nextX,
              y2: nextY
            })
            
            currentX = nextX
            currentY = nextY
          }
          break
          
        case 'h': // Horizontal line
          const nextX = type === 'H' ? coords[0] : currentX + coords[0]
          curves.push({
            type: 'line',
            x1: currentX,
            y1: currentY,
            x2: nextX,
            y2: currentY
          })
          currentX = nextX
          break
          
        case 'v': // Vertical line
          const nextY = type === 'V' ? coords[0] : currentY + coords[0]
          curves.push({
            type: 'line',
            x1: currentX,
            y1: currentY,
            x2: currentX,
            y2: nextY
          })
          currentY = nextY
          break
          
        case 'z': // Close path
          if (currentX !== startX || currentY !== startY) {
            curves.push({
              type: 'line',
              x1: currentX,
              y1: currentY,
              x2: startX,
              y2: startY
            })
          }
          currentX = startX
          currentY = startY
          break
      }
    }

    return curves
  }

  static rectToCurves(rect: Element): any[] {
    const x = parseFloat(rect.getAttribute('x') || '0')
    const y = parseFloat(rect.getAttribute('y') || '0')
    const width = parseFloat(rect.getAttribute('width') || '0')
    const height = parseFloat(rect.getAttribute('height') || '0')

    return [
      { type: 'line', x1: x, y1: y, x2: x + width, y2: y },
      { type: 'line', x1: x + width, y1: y, x2: x + width, y2: y + height },
      { type: 'line', x1: x + width, y1: y + height, x2: x, y2: y + height },
      { type: 'line', x1: x, y1: y + height, x2: x, y2: y }
    ]
  }

  static circleToCurve(circle: Element): any {
    const cx = parseFloat(circle.getAttribute('cx') || '0')
    const cy = parseFloat(circle.getAttribute('cy') || '0')
    const r = parseFloat(circle.getAttribute('r') || '0')

    return {
      type: 'circle',
      cx: cx,
      cy: cy,
      r: r
    }
  }

  static ellipseToCurve(ellipse: Element): any {
    const cx = parseFloat(ellipse.getAttribute('cx') || '0')
    const cy = parseFloat(ellipse.getAttribute('cy') || '0')
    const rx = parseFloat(ellipse.getAttribute('rx') || '0')
    const ry = parseFloat(ellipse.getAttribute('ry') || '0')

    return {
      type: 'ellipse',
      cx: cx,
      cy: cy,
      rx: rx,
      ry: ry
    }
  }

  static lineToCurve(line: Element): any {
    return {
      type: 'line',
      x1: parseFloat(line.getAttribute('x1') || '0'),
      y1: parseFloat(line.getAttribute('y1') || '0'),
      x2: parseFloat(line.getAttribute('x2') || '0'),
      y2: parseFloat(line.getAttribute('y2') || '0')
    }
  }

  static polylineToCurves(polyline: Element): any[] {
    const points = this.parsePoints(polyline.getAttribute('points') || '')
    const curves: any[] = []

    for (let i = 0; i < points.length - 1; i++) {
      curves.push({
        type: 'line',
        x1: points[i].x,
        y1: points[i].y,
        x2: points[i + 1].x,
        y2: points[i + 1].y
      })
    }

    return curves
  }

  static polygonToCurves(polygon: Element): any[] {
    const points = this.parsePoints(polygon.getAttribute('points') || '')
    const curves: any[] = []

    for (let i = 0; i < points.length; i++) {
      const nextIndex = (i + 1) % points.length
      curves.push({
        type: 'line',
        x1: points[i].x,
        y1: points[i].y,
        x2: points[nextIndex].x,
        y2: points[nextIndex].y
      })
    }

    return curves
  }

  static parsePoints(pointsStr: string): Array<{x: number, y: number}> {
    const coords = pointsStr.trim().split(/[\s,]+/).map(Number).filter(n => !isNaN(n))
    const points: Array<{x: number, y: number}> = []

    for (let i = 0; i < coords.length; i += 2) {
      if (i + 1 < coords.length) {
        points.push({ x: coords[i], y: coords[i + 1] })
      }
    }

    return points
  }

  static curvesToPoints(curves: any[], resolution: number = 20): Array<{x: number, y: number}> {
    const points: Array<{x: number, y: number}> = []
    
    for (const curve of curves) {
      const curvePoints = this.sampleCurve(curve, resolution)
      points.push(...curvePoints)
    }

    // Remove duplicate points
    return this.removeDuplicatePoints(points)
  }

  static sampleCurve(curve: any, numPoints: number): Array<{x: number, y: number}> {
    const points: Array<{x: number, y: number}> = []

    switch (curve.type) {
      case 'line':
        points.push({ x: curve.x1, y: curve.y1 })
        points.push({ x: curve.x2, y: curve.y2 })
        break

      case 'circle':
        for (let i = 0; i < numPoints; i++) {
          const angle = (i * 2 * Math.PI) / numPoints
          points.push({
            x: curve.cx + Math.cos(angle) * curve.r,
            y: curve.cy + Math.sin(angle) * curve.r
          })
        }
        break

      case 'ellipse':
        for (let i = 0; i < numPoints; i++) {
          const angle = (i * 2 * Math.PI) / numPoints
          points.push({
            x: curve.cx + Math.cos(angle) * curve.rx,
            y: curve.cy + Math.sin(angle) * curve.ry
          })
        }
        break

      default:
        console.warn('Unknown curve type:', curve.type)
        break
    }

    return points
  }

  static removeDuplicatePoints(points: Array<{x: number, y: number}>, tolerance: number = 0.1): Array<{x: number, y: number}> {
    if (points.length === 0) return points

    const filtered = [points[0]]
    
    for (let i = 1; i < points.length; i++) {
      const current = points[i]
      const last = filtered[filtered.length - 1]
      
      const distance = Math.sqrt(
        Math.pow(current.x - last.x, 2) + 
        Math.pow(current.y - last.y, 2)
      )
      
      if (distance > tolerance) {
        filtered.push(current)
      }
    }

    return filtered
  }
}
