import assert from 'node:assert/strict'
import test from 'node:test'
import {
  validateAIDecorationGeneration,
  validateAIDecorationModelResult,
  type AIDecorationCandidateDraft,
  type AIDecorationGeneration,
} from '../lib/ai/decorationPlan'
import { designSpecFromLegacyOutline } from '../lib/design'
import { PresetShapes } from '../lib/generators/PresetShapes'
import {
  createAIEnhancedCookieProject,
  evaluateDecorationCandidate,
  rebaseCookieProjectDesign,
  validateCookieProjectRevision,
} from '../lib/project'
import { createPrintableGuideHtml } from '../lib/project/guideExport'
import { cookieProjectToOutcomeViewModel } from '../components/outcome/fromProject'

function candidate(id: string, text: string, offset: number): AIDecorationCandidateDraft {
  return {
    id,
    name: `${id} butterfly plan`,
    concept: 'Symmetrical wing sections with a centered monoline name and piped body.',
    difficulty: id === 'candidate-2' ? 'detailed' : 'easy',
    estimatedMinutes: 55 + offset,
    paletteName: `${id} palette`,
    palette: [
      { slot: 'base', name: 'Lavender', hex: '#B9A5D2' },
      { slot: 'outline', name: 'Plum', hex: '#5B3A70' },
      { slot: 'accent', name: 'Blush', hex: '#EBA6B6' },
      { slot: 'neutral', name: 'Cream', hex: '#F5E7C8' },
    ],
    regions: [
      {
        id: `${id}-body`,
        name: 'Butterfly body',
        kind: 'ellipse',
        centerX: 0.5,
        centerY: 0.5,
        radiusX: 0.045,
        radiusY: 0.24,
        points: [],
        colorSlot: 'outline',
        technique: 'piped-detail',
        layer: 2,
      },
      {
        id: `${id}-wing-dot`,
        name: 'Wet-on-wet wing accent',
        kind: 'ellipse',
        centerX: 0.34 + offset * 0.002,
        centerY: 0.6,
        radiusX: 0.055,
        radiusY: 0.045,
        points: [],
        colorSlot: 'accent',
        technique: 'wet-on-wet',
        layer: 0,
      },
    ],
    strokes: [{
      id: `${id}-wing-line`,
      name: 'Wing contour',
      points: [{ x: 0.32, y: 0.42 }, { x: 0.38, y: 0.51 }, { x: 0.42, y: 0.63 }],
      widthMm: 1.5,
      colorSlot: 'neutral',
      closed: false,
      technique: 'piped-detail',
      layer: 2,
    }],
    lettering: [{
      id: `${id}-name`,
      name: 'Personalized name',
      text,
      position: { x: 0.5, y: 0.31 },
      maxWidthRatio: 0.48,
      fontSizeMm: 8,
      strokeWidthMm: 1.4,
      colorSlot: 'outline',
      style: 'monoline-script',
      technique: 'transfer',
      align: 'middle',
      rotationDegrees: 0,
      layer: 3,
    }],
  }
}

function generation(): AIDecorationGeneration {
  return {
    generationId: 'generation:test:butterfly',
    model: 'test-model',
    createdAt: '2026-09-26T12:00:00.000Z',
    candidates: [
      candidate('candidate-1', 'Mia', 0),
      candidate('candidate-2', 'Mia', 1),
      candidate('candidate-3', 'Mia', 2),
    ],
    usage: { inputTokens: 100, outputTokens: 200, totalTokens: 300 },
  }
}

test('strict AI decoration parser accepts three bounded candidates and rejects invalid geometry', () => {
  const value = generation()
  const parsed = validateAIDecorationGeneration(value)
  assert.equal(parsed.candidates.length, 3)
  assert.equal(parsed.candidates[0].lettering[0].text, 'Mia')

  const invalid = structuredClone(value)
  invalid.candidates[0].strokes[0].points[0].x = 1.2
  assert.throws(
    () => validateAIDecorationModelResult({ candidates: invalid.candidates }),
    /between 0\.04 and 0\.96/
  )
})

test('AI candidates become ranked, registered, revision-bound cookie outcomes', () => {
  const design = designSpecFromLegacyOutline(PresetShapes.butterfly(), {
    name: 'Personalized butterfly',
  })
  const project = createAIEnhancedCookieProject(design, generation(), {
    prompt: 'Lavender butterfly with Mia in piped script',
    title: 'Mia butterfly',
    physicalScale: 1.25,
  })
  const report = validateCookieProjectRevision(project)

  assert.notEqual(report.status, 'fail')
  assert.equal(project.decorations.length, 3)
  assert.equal(project.palettes.length, 3)
  assert.equal(project.previews.length, 3)
  assert.equal(project.metadata?.generatedByAI, true)
  assert.equal(project.metadata?.candidateCount, 3)
  assert.equal(typeof project.metadata?.selectedCandidateScore, 'number')
  assert.equal(project.previews[0].fidelity, 'concept')
  assert.equal(project.decorations[0].lettering?.[0].text, 'Mia')
  assert.ok(project.decorations[0].steps.some((step) => step.letteringIds?.length))

  const outcome = cookieProjectToOutcomeViewModel(project)
  assert.equal(outcome.generation?.source, 'ai')
  assert.equal(outcome.generation?.candidateCount, 3)
  assert.equal(outcome.decoration.lettering[0].text, 'Mia')
  assert.equal(outcome.design.sizeMm.width, design.target.size.width * 1.25)

  const guide = createPrintableGuideHtml(project)
  assert.match(guide, />Mia<\/text>/)
  assert.match(guide, /AI decoration guide and true-size transfer sheet/)
})

test('candidate evaluator rejects geometry outside the cutter instead of relying on SVG clipping', () => {
  const design = designSpecFromLegacyOutline(PresetShapes.heart(), { name: 'Heart' })
  const project = createAIEnhancedCookieProject(design, generation(), { title: 'Heart', physicalScale: 1 })
  const decoration = structuredClone(project.decorations[0])
  decoration.strokes[0].points[0] = { x: 10_000, y: 10_000 }
  const result = evaluateDecorationCandidate({
    design: project.designs[0],
    decoration,
    palette: project.palettes.find((palette) => palette.id === decoration.paletteSpecId)!,
  })

  assert.equal(result.disposition, 'reject')
  assert.ok(result.findings.some((finding) => finding.code === 'geometry_outside_cookie'))
})

test('cutter parameter rebasing preserves AI decoration and updates the shared physical scale', () => {
  const design = designSpecFromLegacyOutline(PresetShapes.star(), { name: 'Star' })
  const project = createAIEnhancedCookieProject(design, generation(), { title: 'Star', physicalScale: 1 })
  const rebasedDesign = { ...design, profile: { ...design.profile, revision: 'rebased-test' } }
  const rebased = rebaseCookieProjectDesign(project, rebasedDesign, 1.6)

  assert.ok(rebased)
  assert.equal(rebased?.metadata?.generationId, project.metadata?.generationId)
  assert.equal(rebased?.metadata?.physicalScale, 1.6)
  assert.deepEqual(rebased?.decorations, project.decorations)
  assert.notEqual(rebased?.contentHash, project.contentHash)
})
