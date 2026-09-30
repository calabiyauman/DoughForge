import assert from 'node:assert/strict'
import test from 'node:test'
import { cookieProjectToOutcomeViewModel } from '../components/outcome/fromProject'
import { designSpecFromLegacyOutline } from '../lib/design'
import { PresetShapes } from '../lib/generators/PresetShapes'
import {
  createPrintableGuideHtml,
  createPrototypeCookieProject,
  printableGuideFilename
} from '../lib/project'

const CREATED_AT = '2026-09-26T12:00:00.000Z'

function projectFor(shape: string, prompt: string) {
  const design = designSpecFromLegacyOutline(PresetShapes.generate(shape), { name: shape })
  return createPrototypeCookieProject(design, { prompt, createdAt: CREATED_AT })
}

test('outcome adapter preserves registration, closed strokes, and coherent references', () => {
  const project = projectFor('heart', 'A dusty rose heart')
  const view = cookieProjectToOutcomeViewModel(project)

  assert.equal(view.id, project.id)
  assert.equal(view.design.id, project.designs[0].id)
  assert.equal(view.decoration.name, project.decorations[0].name)
  assert.equal(view.palette.name, project.palettes[0].name)
  assert.equal(view.kit.id, project.kits[0].id)
  assert.equal(view.kit.status, 'draft')
  assert.equal(view.generation?.source, 'prototype')
  assert.ok(view.decoration.strokes.some((stroke) => stroke.closed))
  assert.deepEqual(view.design.outerContour, project.designs[0].designSpec.contours[0].points)
})

test('AI decoration failure is exposed as a fallback instead of a matched AI result', () => {
  const design = designSpecFromLegacyOutline(PresetShapes.heart(), { name: 'AI heart outline' })
  const project = createPrototypeCookieProject(design, {
    prompt: 'A heart requested through AI',
    createdAt: CREATED_AT,
    metadata: {
      aiDecorationFallback: true,
      aiDecorationWarning: 'Structured decoration failed validation.',
    },
  })

  const view = cookieProjectToOutcomeViewModel(project)
  assert.equal(view.generation?.source, 'fallback')
})

test('printable guide is self-contained, escaped, revision-bound, and actual-size', () => {
  const project = projectFor('star', 'Star <script>alert("unsafe")</script> in yellow')
  const html = createPrintableGuideHtml(project)

  assert.match(html, /<!doctype html>/i)
  assert.match(html, /Actual-size transfer sheet/)
  assert.match(html, new RegExp(project.contentHash.replace(':', '\\:')))
  const target = project.designs[0].designSpec.target.size
  assert.ok(html.includes(`width="${Math.max(1, target.width)}mm"`))
  assert.ok(html.includes(`height="${Math.max(1, target.height)}mm"`))
  assert.ok(!html.includes('<script>alert("unsafe")</script>'))
  assert.ok(html.includes('&lt;script&gt;alert(&quot;unsafe&quot;)&lt;/script&gt;'))
  assert.equal(printableGuideFilename(project), 'star-decoration-guide.html')
})
