import assert from 'node:assert/strict'
import test from 'node:test'
import { designSpecFromLegacyOutline } from '../lib/design'
import { PresetShapes } from '../lib/generators/PresetShapes'
import { computeCookieProjectRevisionHash } from '../lib/project/hash'
import { createPrototypeCookieProject } from '../lib/project/planner'

const CREATED_AT = '2026-09-26T12:00:00.000Z'

function presetDesign(shape: string) {
  const outline = PresetShapes.generate(shape)
  return designSpecFromLegacyOutline(outline, {
    name: shape.charAt(0).toUpperCase() + shape.slice(1)
  })
}

test('prototype planner registers the preview, guide, palette, and kit to one revision', () => {
  const design = presetDesign('heart')
  const project = createPrototypeCookieProject(design, {
    prompt: 'Dusty rose and cream heart for a wedding shower',
    createdAt: CREATED_AT
  })

  assert.equal(project.lifecycle, 'production-validation')
  assert.equal(project.designs.length, 1)
  assert.equal(project.decorations.length, 1)
  assert.equal(project.palettes.length, 1)
  assert.equal(project.kits.length, 1)
  assert.equal(project.kits[0].status, 'draft')
  assert.equal(project.contentHash, computeCookieProjectRevisionHash(project))

  const designRevision = project.designs[0]
  const decoration = project.decorations[0]
  const palette = project.palettes[0]
  const preview = project.previews[0]
  const sourceContour = design.contours.find((contour) => contour.role === 'cut')

  assert.ok(sourceContour)
  assert.equal(decoration.designRevisionId, designRevision.id)
  assert.equal(decoration.registration.designSpecId, design.id)
  assert.deepEqual(decoration.registration.transform, [1, 0, 0, 1, 0, 0])
  assert.deepEqual(decoration.regions[0].outer, sourceContour.points)
  assert.equal(decoration.paletteSpecId, palette.id)
  assert.deepEqual(preview.designRevisionIds, [designRevision.id])
  assert.deepEqual(preview.decorationSpecIds, [decoration.id])
  assert.deepEqual(preview.paletteSpecIds, [palette.id])

  const regionIds = new Set(decoration.regions.map((region) => region.id))
  const strokeIds = new Set(decoration.strokes.map((stroke) => stroke.id))
  const colorIds = new Set(palette.colors.map((color) => color.id))
  for (const step of decoration.steps) {
    assert.ok(step.regionIds.every((id) => regionIds.has(id)))
    assert.ok(step.strokeIds.every((id) => strokeIds.has(id)))
    assert.ok(step.colorIds.every((id) => colorIds.has(id)))
  }
})

test('prototype planner honors requested color language but keeps checkout locked', () => {
  const project = createPrototypeCookieProject(presetDesign('circle'), {
    prompt: 'Round first birthday plaque in sage, cream and dusty rose',
    requestedColors: ['sage', 'cream', 'dusty rose'],
    createdAt: CREATED_AT
  })

  assert.deepEqual(project.brief.requestedColors, ['sage', 'cream', 'dusty rose'])
  assert.deepEqual(
    project.palettes[0].colors.slice(0, 3).map((color) => color.name),
    ['Soft Sage', 'Warm Cream', 'Dusty Rose']
  )
  assert.match(project.palettes[0].disclaimer ?? '', /prototype palette/i)
  assert.equal(project.metadata?.checkoutLocked, true)
  assert.match(String(project.kits[0].metadata?.checkoutLockedReason), /not yet verified/i)
})

test('butterfly planner creates recognizable registered internal decoration', () => {
  const project = createPrototypeCookieProject(presetDesign('butterfly'), {
    prompt: 'Lavender butterfly with pink wing details',
    createdAt: CREATED_AT
  })
  const decoration = project.decorations[0]

  assert.equal(decoration.metadata?.subject, 'butterfly')
  assert.ok(decoration.regions.some((region) => region.name === 'Butterfly body'))
  assert.equal(decoration.regions.filter((region) => region.name.startsWith('Wing accent')).length, 4)
  assert.ok(decoration.strokes.some((stroke) => stroke.name === 'Left antenna'))
  assert.ok(decoration.strokes.some((stroke) => stroke.name === 'Right antenna'))
  assert.ok(decoration.steps.some((step) => step.technique === 'piped-detail'))
})

test('prototype project output is deterministic when revision inputs are stable', () => {
  const design = presetDesign('star')
  const options = {
    prompt: 'Yellow celestial star cookie',
    createdAt: CREATED_AT,
    projectId: 'project:star-test',
    revisionNumber: 3
  }

  const first = createPrototypeCookieProject(design, options)
  const second = createPrototypeCookieProject(design, options)
  assert.deepEqual(first, second)
  assert.equal(first.revisionNumber, 3)
})
