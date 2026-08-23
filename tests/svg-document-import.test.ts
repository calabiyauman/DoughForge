import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'
import { SVGParser } from '../lib/parsers/SVGParser'

class TestElement {
  readonly children: TestElement[] = []

  constructor(
    readonly localName: string,
    private readonly attributes: ReadonlyMap<string, string>
  ) {}

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null
  }

  querySelector(selector: string): TestElement | null {
    for (const child of this.children) {
      if (child.localName === selector) return child
      const nested = child.querySelector(selector)
      if (nested) return nested
    }
    return null
  }
}

class TestDocument {
  constructor(readonly documentElement: TestElement) {}

  querySelector(selector: string): TestElement | null {
    return this.documentElement.localName === selector
      ? this.documentElement
      : this.documentElement.querySelector(selector)
  }
}

class TestDOMParser {
  parseFromString(source: string): Document {
    const stack: TestElement[] = []
    let root: TestElement | undefined
    const tagPattern = /<[^>]+>/g
    let match: RegExpExecArray | null

    while ((match = tagPattern.exec(source)) !== null) {
      const raw = match[0]
      if (raw.startsWith('<?') || raw.startsWith('<!')) continue
      if (raw.startsWith('</')) {
        stack.pop()
        continue
      }

      const selfClosing = /\/\s*>$/.test(raw)
      const body = raw.slice(1, selfClosing ? raw.lastIndexOf('/') : -1).trim()
      const nameMatch = /^([^\s/>]+)/.exec(body)
      if (!nameMatch) continue
      const localName = nameMatch[1].split(':').at(-1) || nameMatch[1]
      const attributes = new Map<string, string>()
      const attributePattern = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g
      let attributeMatch: RegExpExecArray | null
      while ((attributeMatch = attributePattern.exec(body.slice(nameMatch[0].length))) !== null) {
        attributes.set(attributeMatch[1], attributeMatch[2] ?? attributeMatch[3] ?? '')
      }

      const element = new TestElement(localName, attributes)
      const parent = stack[stack.length - 1]
      if (parent) parent.children.push(element)
      else root = element
      if (!selfClosing) stack.push(element)
    }

    if (!root) throw new Error('Test XML did not contain a root element')
    return new TestDocument(root) as unknown as Document
  }
}

const domGlobal = globalThis as unknown as { DOMParser?: typeof DOMParser }
const originalDOMParser = domGlobal.DOMParser

before(() => {
  domGlobal.DOMParser = TestDOMParser as unknown as typeof DOMParser
})

after(() => {
  if (originalDOMParser) domGlobal.DOMParser = originalDOMParser
  else delete domGlobal.DOMParser
})

function approximatelyEqual(actual: number, expected: number, tolerance = 1e-8): void {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`
  )
}

function dimensions(points: Array<{ x: number; y: number }>): { width: number; height: number } {
  let minimumX = Number.POSITIVE_INFINITY
  let maximumX = Number.NEGATIVE_INFINITY
  let minimumY = Number.POSITIVE_INFINITY
  let maximumY = Number.NEGATIVE_INFINITY
  for (const point of points) {
    minimumX = Math.min(minimumX, point.x)
    maximumX = Math.max(maximumX, point.x)
    minimumY = Math.min(minimumY, point.y)
    maximumY = Math.max(maximumY, point.y)
  }
  return { width: maximumX - minimumX, height: maximumY - minimumY }
}

test('imports multiple open subpaths with unique IDs and flips SVG y into DesignSpec y-up', () => {
  const result = SVGParser.parseOrThrow(`
    <svg viewBox="0 0 100 100">
      <path id="asymmetric" d="M10 10 L30 10 L10 40 Z"/>
      <path d="M10 60 L20 60 M30 70 L40 70" stroke-width="2"/>
    </svg>
  `, { targetSize: { width: 100, height: 100 } })

  assert.deepEqual(result.design.contours[0].points, [
    { x: 10, y: 90 },
    { x: 30, y: 90 },
    { x: 10, y: 60 }
  ])
  assert.deepEqual(
    result.design.strokes.map((stroke) => stroke.id),
    ['svg-stroke-2-1', 'svg-stroke-2-2']
  )
  assert.equal(new Set(result.design.parts[0].geometryIds).size, 3)
})

test('physical root dimensions establish CSS-pixel source units without a viewBox', () => {
  const svg = `
    <svg width="100mm" height="50mm">
      <rect x="0" y="0" width="96" height="48"/>
    </svg>
  `
  const physical = SVGParser.parseOrThrow(svg)
  const contourSize = dimensions(physical.design.contours[0].points)

  assert.deepEqual(physical.design.target.size, { width: 100, height: 50 })
  approximatelyEqual(contourSize.width, 25.4)
  approximatelyEqual(contourSize.height, 12.7)

  const overridden = SVGParser.parseOrThrow(svg, { targetLongEdgeMm: 75 })
  approximatelyEqual(overridden.design.target.size.width, 75)
  approximatelyEqual(overridden.design.target.size.height, 37.5)
})

test('rejects junk in viewBox, point-list, transform, and numeric attributes', () => {
  const invalidDocuments = [
    '<svg viewBox="junk 0 0 100 100"><rect width="10" height="10"/></svg>',
    '<svg viewBox="0 0 100 100"><polygon points="0,0 nope 10,0 10,10"/></svg>',
    '<svg viewBox="0 0 100 100"><rect width="10junk" height="10"/></svg>',
    '<svg viewBox="0 0 100 100"><rect transform="translate(junk 10)" width="10" height="10"/></svg>'
  ]

  for (const svg of invalidDocuments) {
    assert.throws(() => SVGParser.parseOrThrow(svg), /invalid syntax|unitless SVG number/i)
  }
})

test('primitive sampling honors tolerances that require more than 128 circle segments', () => {
  const result = SVGParser.parseOrThrow(`
    <svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="50"/></svg>
  `, {
    targetSize: { width: 100, height: 100 },
    curveToleranceMm: 0.001
  })

  assert.ok(result.design.contours[0].points.length > 128)
  assert.ok(result.design.contours[0].points.length <= 2048)
})

test('compound contours use evenodd parity and nonzero winding', () => {
  const sameDirection = 'M0 0H100V100H0Z M20 20H80V80H20Z'
  const oppositeDirection = 'M0 0H100V100H0Z M20 20V80H80V20Z'
  const evenodd = SVGParser.parseOrThrow(`
    <svg viewBox="0 0 100 100"><path fill-rule="evenodd" d="${sameDirection}"/></svg>
  `)
  assert.equal(evenodd.design.contours.length, 2)
  assert.deepEqual(evenodd.design.contours[1].relationship, {
    kind: 'hole',
    outerContourId: evenodd.design.contours[0].id
  })

  const redundantNonzero = SVGParser.parseOrThrow(`
    <svg viewBox="0 0 100 100"><path d="${sameDirection}"/></svg>
  `)
  assert.equal(redundantNonzero.design.contours.length, 1)
  assert.ok(redundantNonzero.warnings.some((warning) => warning.includes('nonzero fill rule')))

  const windingHole = SVGParser.parseOrThrow(`
    <svg viewBox="0 0 100 100"><path d="${oppositeDirection}"/></svg>
  `)
  assert.equal(windingHole.design.contours.length, 2)
  assert.deepEqual(windingHole.design.contours[1].relationship, {
    kind: 'hole',
    outerContourId: windingHole.design.contours[0].id
  })
})

test('rejects partially overlapping compound subpaths instead of inventing containment', () => {
  assert.throws(() => SVGParser.parseOrThrow(`
    <svg viewBox="0 0 150 150">
      <path d="M0 0H100V100H0Z M50 50H120V120H50Z"/>
    </svg>
  `), /overlap or touch/)
})
