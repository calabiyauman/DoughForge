import assert from 'node:assert/strict'
import test from 'node:test'
import { inflateSync } from 'node:zlib'
import type { AIDecorationCandidateDraft } from '../lib/ai/decorationPlan'
import { renderDecorationCandidatePng } from '../lib/ai/decorationRaster'

const candidate: AIDecorationCandidateDraft = {
  id: 'raster-fixture',
  name: 'Happy house',
  concept: 'A bright house with a door, window, piped roof, and a short name.',
  subject: 'house',
  recognitionStrategy: 'Roof, centered door, and window establish a readable house.',
  difficulty: 'easy',
  estimatedMinutes: 35,
  paletteName: 'Bright cottage',
  palette: [
    { slot: 'base', name: 'Sky', hex: '#8CC8E8' },
    { slot: 'outline', name: 'Navy', hex: '#243B53' },
    { slot: 'accent', name: 'Berry', hex: '#DD4A68' },
    { slot: 'detail', name: 'Sunshine', hex: '#FFD166' },
    { slot: 'neutral', name: 'White', hex: '#FFF8E7' },
  ],
  regions: [
    {
      id: 'door',
      name: 'Door',
      kind: 'polygon',
      centerX: 0.5,
      centerY: 0.35,
      radiusX: 0,
      radiusY: 0,
      points: [
        { x: 0.42, y: 0.18 },
        { x: 0.58, y: 0.18 },
        { x: 0.58, y: 0.48 },
        { x: 0.42, y: 0.48 },
      ],
      colorSlot: 'accent',
      technique: 'flood',
      layer: 1,
    },
    {
      id: 'window',
      name: 'Round window',
      kind: 'ellipse',
      centerX: 0.5,
      centerY: 0.65,
      radiusX: 0.09,
      radiusY: 0.09,
      points: [{ x: 0.41, y: 0.65 }, { x: 0.5, y: 0.74 }, { x: 0.59, y: 0.65 }],
      colorSlot: 'detail',
      technique: 'wet-on-wet',
      layer: 1,
    },
  ],
  strokes: [{
    id: 'roof',
    name: 'Roof line',
    points: [{ x: 0.2, y: 0.62 }, { x: 0.5, y: 0.86 }, { x: 0.8, y: 0.62 }],
    widthMm: 2,
    colorSlot: 'neutral',
    closed: false,
    technique: 'piped-detail',
    layer: 2,
  }],
  lettering: [{
    id: 'name',
    name: 'Name',
    text: 'HOME',
    position: { x: 0.5, y: 0.54 },
    maxWidthRatio: 0.38,
    fontSizeMm: 7,
    strokeWidthMm: 1.2,
    colorSlot: 'outline',
    style: 'rounded-block',
    technique: 'transfer',
    align: 'middle',
    rotationDegrees: 0,
    layer: 3,
  }],
  semanticFeatures: [
    { id: 'roof-feature', name: 'Roof', description: 'Peaked roof', role: 'signature', geometryIds: ['roof'] },
    { id: 'door-feature', name: 'Door', description: 'Centered door', role: 'signature', geometryIds: ['door'] },
    { id: 'window-feature', name: 'Window', description: 'Round window', role: 'supporting', geometryIds: ['window'] },
    { id: 'name-feature', name: 'Name', description: 'Visible label', role: 'accent', geometryIds: ['name'] },
  ],
}

const outline = [
  { x: 0.12, y: 0.12 },
  { x: 0.12, y: 0.62 },
  { x: 0.5, y: 0.94 },
  { x: 0.88, y: 0.62 },
  { x: 0.88, y: 0.12 },
]

function pngData(buffer: Buffer): Buffer {
  const chunks: Buffer[] = []
  for (let offset = 8; offset + 12 <= buffer.length;) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.toString('ascii', offset + 4, offset + 8)
    if (type === 'IDAT') chunks.push(buffer.subarray(offset + 8, offset + 8 + length))
    offset += length + 12
  }
  return inflateSync(Buffer.concat(chunks))
}

test('decoration raster emits a deterministic square RGBA PNG at the requested size', () => {
  const first = renderDecorationCandidatePng(candidate, outline, 160)
  const second = renderDecorationCandidatePng(candidate, outline, 160)

  assert.deepEqual(first.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  assert.equal(first.toString('ascii', 12, 16), 'IHDR')
  assert.equal(first.readUInt32BE(16), 160)
  assert.equal(first.readUInt32BE(20), 160)
  assert.equal(first[24], 8)
  assert.equal(first[25], 6)
  assert.deepEqual(first, second)
})

test('decoration raster contains substantial non-background image data', () => {
  const png = renderDecorationCandidatePng(candidate, outline, 128)
  const scanlines = pngData(png)
  const rowLength = 128 * 4 + 1
  const colors = new Set<string>()

  for (let y = 0; y < 128; y += 1) {
    assert.equal(scanlines[y * rowLength], 0)
    for (let x = 0; x < 128; x += 1) {
      const offset = y * rowLength + 1 + x * 4
      colors.add(`${scanlines[offset]},${scanlines[offset + 1]},${scanlines[offset + 2]}`)
    }
  }

  assert.ok(png.length > 1_000)
  assert.ok(colors.size > 12, `expected antialiased cookie artwork, received ${colors.size} colors`)
})

test('neutral visual-QC raster cannot reveal the subject from its cutter silhouette', () => {
  const unrelatedOutline = [
    { x: 0.08, y: 0.08 },
    { x: 0.92, y: 0.08 },
    { x: 0.5, y: 0.92 },
  ]
  const first = renderDecorationCandidatePng(candidate, outline, 128, { neutralizeOutline: true })
  const second = renderDecorationCandidatePng(candidate, unrelatedOutline, 128, { neutralizeOutline: true })

  assert.deepEqual(first, second)
})

test('decoration raster rejects unusable outlines and unsafe output sizes', () => {
  assert.throws(() => renderDecorationCandidatePng(candidate, outline.slice(0, 2), 128), /at least three/)
  assert.throws(() => renderDecorationCandidatePng(candidate, outline, 63), /between 64 and 2048/)
})
