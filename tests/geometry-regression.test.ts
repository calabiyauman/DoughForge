import assert from 'node:assert/strict'
import test from 'node:test'
import { CookieCutterGenerator } from '../lib/generators/CookieCutterGenerator'
import { ProfileGenerator } from '../lib/generators/ProfileGenerator'
import {
  cleanClosedOutline,
  hasOffsetSelfIntersections,
  hasSelfIntersections,
  normalizeOutline
} from '../lib/geometry/outline'

const closedSquare = {
  points: [
    { x: -25, y: -25 },
    { x: 25, y: -25 },
    { x: 25, y: 25 },
    { x: -25, y: 25 },
    { x: -25, y: -25 },
    { x: -25, y: -25 }
  ]
}

test('closed paths remove duplicate seam rings and create exact mitered corners', () => {
  const profile = ProfileGenerator.professional()
  const path = CookieCutterGenerator.outlineToPath(closedSquare, 1, {
    smoothCorners: false,
    cornerRadius: 0.5,
    angleThreshold: 15
  })
  const preparedProfile = CookieCutterGenerator.prepareProfile(profile)
  const geometry = CookieCutterGenerator.createSweptGeometry(path, preparedProfile)

  assert.equal(path.length, 4)
  assert.equal(preparedProfile.length, 7)
  assert.equal(geometry.vertices.length / 3, 28)
  assert.equal(geometry.faces.length / 3, 56)

  const outerCorner = Array.from(geometry.vertices.slice(0, 3))
  const inwardCorner = Array.from(geometry.vertices.slice(6 * 3, 6 * 3 + 3))
  assert.ok(Math.abs(outerCorner[0] + 31.35) < 1e-4)
  assert.ok(Math.abs(outerCorner[2] + 31.35) < 1e-4)
  assert.ok(Math.abs(inwardCorner[0] + 22.21) < 1e-4)
  assert.ok(Math.abs(inwardCorner[2] + 22.21) < 1e-4)

  const edgeUses = new Map<string, number>()
  for (let index = 0; index < geometry.faces.length; index += 3) {
    const triangle = [geometry.faces[index], geometry.faces[index + 1], geometry.faces[index + 2]]
    for (let edge = 0; edge < 3; edge += 1) {
      const pair = [triangle[edge], triangle[(edge + 1) % 3]].sort((a, b) => a - b)
      const key = `${pair[0]}:${pair[1]}`
      edgeUses.set(key, (edgeUses.get(key) ?? 0) + 1)
    }
  }
  assert.ok([...edgeUses.values()].every((uses) => uses === 2))
})

test('shape scale does not change millimeter profile dimensions', () => {
  const profile = ProfileGenerator.professional()
  const atOne = CookieCutterGenerator.generate({
    outline: closedSquare,
    profile,
    scale: 1,
    smoothCorners: false
  })
  const atTwo = CookieCutterGenerator.generate({
    outline: closedSquare,
    profile,
    scale: 2,
    smoothCorners: false
  })
  const heightsAtOne = Array.from(atOne.geometry.vertices).filter((_, index) => index % 3 === 1)
  const heightsAtTwo = Array.from(atTwo.geometry.vertices).filter((_, index) => index % 3 === 1)

  assert.equal(Math.max(...heightsAtOne), 17.780000686645508)
  assert.equal(Math.max(...heightsAtTwo), 17.780000686645508)
})

test('corner smoothing is cyclic and keeps the closing seam distinct', () => {
  const path = CookieCutterGenerator.outlineToPath(closedSquare, 1, {
    smoothCorners: true,
    cornerRadius: 1,
    angleThreshold: 15
  })
  const first = path[0]
  const last = path[path.length - 1]

  assert.ok(path.length > 4)
  assert.ok(Math.hypot(first.x - last.x, first.z - last.z) > 1e-6)
  assert.doesNotThrow(() => CookieCutterGenerator.calculatePathFrames(path))
})

test('profile selection uses the same requested profile definition', () => {
  const classic = ProfileGenerator.fromParameters({
    profileType: 'classic',
    outerOffset: 6.35,
    outerHeight: 10.16,
    innerOffset: -2.79,
    innerHeight: 17.78,
    chamfer: 2.29
  })
  const professional = ProfileGenerator.fromParameters({
    profileType: 'professional',
    outerOffset: 7,
    outerHeight: 11,
    innerOffset: -3,
    innerHeight: 18,
    chamfer: 2
  })

  assert.equal(classic.type, 'classic')
  assert.equal(professional.type, 'professional')
  assert.equal(professional.metadata.outerOffset, 7)
  assert.ok(professional.points.some((point) => point.x === -3))
  assert.equal(hasSelfIntersections(professional.points.slice(0, -1)), false)
})

test('AI outlines are deduplicated, normalized, and self-intersections are detected', () => {
  const padded = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
    { x: 0, y: 0 },
    { x: 0, y: 0 }
  ]
  const cleaned = cleanClosedOutline(padded)
  const normalized = normalizeOutline(cleaned, 50)

  assert.equal(cleaned.length, 4)
  assert.equal(Math.max(...normalized.map((point) => point.x)) - Math.min(...normalized.map((point) => point.x)), 50)
  assert.equal(hasSelfIntersections(cleaned), false)
  assert.equal(hasSelfIntersections([
    { x: 0, y: 0 },
    { x: 2, y: 2 },
    { x: 0, y: 2 },
    { x: 2, y: 0 }
  ]), true)
})

test('concave AI outlines create a closed professional mesh without folded triangles', () => {
  const butterfly = {
    points: [
      { x: 0, y: 3.125 },
      { x: -12.5, y: 15.625 },
      { x: -18.75, y: 9.375 },
      { x: -25, y: 3.125 },
      { x: -18.75, y: -3.125 },
      { x: -12.5, y: -9.375 },
      { x: 0, y: -15.625 },
      { x: 12.5, y: -9.375 },
      { x: 18.75, y: -3.125 },
      { x: 25, y: 3.125 },
      { x: 18.75, y: 9.375 },
      { x: 12.5, y: 15.625 },
      { x: 0, y: 3.125 }
    ]
  }
  const result = CookieCutterGenerator.generate({
    outline: butterfly,
    profile: ProfileGenerator.professional(),
    smoothCorners: true
  })
  const { vertices, faces } = result.geometry
  const edgeUses = new Map<string, number>()

  assert.equal(
    hasOffsetSelfIntersections(cleanClosedOutline(butterfly.points), [6.35, -2.79]),
    true
  )
  assert.ok(vertices.every(Number.isFinite))

  for (let index = 0; index < faces.length; index += 3) {
    const triangle = [faces[index], faces[index + 1], faces[index + 2]]
    const [first, second, third] = triangle.map((vertexIndex) => ({
      x: vertices[vertexIndex * 3],
      y: vertices[vertexIndex * 3 + 1],
      z: vertices[vertexIndex * 3 + 2]
    }))
    const ab = { x: second.x - first.x, y: second.y - first.y, z: second.z - first.z }
    const ac = { x: third.x - first.x, y: third.y - first.y, z: third.z - first.z }
    const doubledArea = Math.hypot(
      ab.y * ac.z - ab.z * ac.y,
      ab.z * ac.x - ab.x * ac.z,
      ab.x * ac.y - ab.y * ac.x
    )
    assert.ok(doubledArea > 1e-6)

    for (let edge = 0; edge < 3; edge += 1) {
      const pair = [triangle[edge], triangle[(edge + 1) % 3]].sort((a, b) => a - b)
      const key = `${pair[0]}:${pair[1]}`
      edgeUses.set(key, (edgeUses.get(key) ?? 0) + 1)
    }
  }

  assert.ok([...edgeUses.values()].every((uses) => uses === 2))
})

