import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { StructuredCookieCutterGenerator } from '../lib/generators/StructuredCookieCutterGenerator'
import { SVGParser } from '../lib/parsers/SVGParser'
import { referenceV3Profile } from '../lib/profiles/measuredReferenceV3'
import { installTestDOMParser } from './helpers/TestDOMParser'

interface ReplayMetrics {
  contours: number
  holes: number
  strokes: number
  sourcePoints: number
  parserWarnings: number
  meshVertices: number
  meshFaces: number
  meshComponents: number
  generationWarnings: number
  productionReady: boolean
  readinessReasonCodes: string[]
}

interface ReferenceManifest {
  families: Array<{
    label: string
    items: Array<{ id: string; path: string; format: string }>
  }>
}

interface ReplayBaseline {
  items: Record<string, ReplayMetrics>
}

const referenceRoot = process.env.DOUGHFORGE_REFERENCE_ROOT

test('replays every external SVG reference through import, generation, and mesh audit', {
  skip: referenceRoot ? false : 'DOUGHFORGE_REFERENCE_ROOT is not configured'
}, async () => {
  assert.ok(referenceRoot)
  const manifest = JSON.parse(await readFile(
    path.resolve(process.cwd(), 'reference-corpus/manifest.json'),
    'utf8'
  )) as ReferenceManifest
  const baseline = JSON.parse(await readFile(
    path.resolve(process.cwd(), 'reference-corpus/replay-baseline.json'),
    'utf8'
  )) as ReplayBaseline
  const replayBaseline = baseline.items
  const restoreDOMParser = installTestDOMParser()
  const observed: Record<string, ReplayMetrics> = {}

  try {
    for (const family of manifest.families) {
      for (const item of family.items) {
        if (item.format !== 'svg') continue
        const candidate = path.resolve(referenceRoot, ...item.path.split('/'))
        const relative = path.relative(path.resolve(referenceRoot), candidate)
        assert.ok(
          relative !== '' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative),
          `${item.id} must stay inside DOUGHFORGE_REFERENCE_ROOT`
        )

        const svg = await readFile(candidate, 'utf8')
        const imported = SVGParser.parseOrThrow(svg, {
          name: family.label,
          targetLongEdgeMm: 80,
          curveToleranceMm: 0.1
        })
        const generated = StructuredCookieCutterGenerator.generate({
          design: imported.design,
          profile: referenceV3Profile(),
          smoothCorners: false
        })

        if (!generated.metadata.meshQuality.watertight) {
          console.log(`${item.id} mesh audit: ${JSON.stringify(generated.metadata.meshQuality)}`)
        }

        assert.equal(generated.metadata.skippedElements, 0, item.id)
        assert.equal(generated.metadata.meshQuality.watertight, true, item.id)
        assert.equal(generated.metadata.meshQuality.boundaryEdges, 0, item.id)
        assert.equal(generated.metadata.meshQuality.nonManifoldEdges, 0, item.id)
        assert.equal(generated.metadata.meshQuality.inconsistentWindingEdges, 0, item.id)
        assert.equal(generated.metadata.meshQuality.degenerateTriangles, 0, item.id)
        assert.equal(generated.metadata.meshQuality.duplicateTriangles, 0, item.id)
        assert.equal(generated.metadata.roleHeights.cut, 25.4, item.id)
        observed[item.id] = {
          contours: imported.design.contours.length,
          holes: imported.design.contours.filter(
            (contour) => contour.relationship.kind === 'hole'
          ).length,
          strokes: imported.design.strokes.length,
          sourcePoints: [
            ...imported.design.contours,
            ...imported.design.strokes
          ].reduce((total, element) => total + element.points.length, 0),
          parserWarnings: imported.warnings.length,
          meshVertices: generated.metadata.vertices,
          meshFaces: generated.metadata.faces,
          meshComponents: generated.metadata.meshQuality.connectedComponents,
          generationWarnings: generated.metadata.warnings.length,
          productionReady: generated.metadata.productionReadiness.ready,
          readinessReasonCodes: generated.metadata.productionReadiness.reasons.map(
            (reason) => reason.code
          )
        }
      }
    }
  } finally {
    restoreDOMParser()
  }

  const missingBaselines = Object.keys(observed).filter((id) => !replayBaseline[id])
  if (missingBaselines.length > 0) {
    console.log(`DoughForge replay observations: ${JSON.stringify(observed)}`)
  }
  assert.deepEqual(missingBaselines, [], 'Every SVG reference needs a frozen replay baseline')
  assert.deepEqual(observed, replayBaseline)
})
