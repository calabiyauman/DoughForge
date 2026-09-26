import assert from 'node:assert/strict'
import test from 'node:test'
import {
  SOURCE_OUTLINE_PLANE_OFFSET,
  includeDesignPathsInPreviewFraming,
  projectDesignPathToPreview
} from '../lib/geometry/designOutlinePreview'
import type { PreviewPlacement } from '../lib/geometry/previewPlacement'

const placement: PreviewPlacement = {
  translation: [3, 7, -4],
  target: [0, 5, 0],
  dimensions: [20, 10, 30]
}

test('maps fitted design XY to preview XZ using the final mesh translation', () => {
  const points = projectDesignPathToPreview(
    [{ x: 10, y: 5 }, { x: -2, y: 8 }],
    placement,
    false
  )

  assert.deepEqual(points, [
    [13, SOURCE_OUTLINE_PLANE_OFFSET, 1],
    [1, SOURCE_OUTLINE_PLANE_OFFSET, 4]
  ])
})

test('keeps the diagnostic on the build plane instead of inheriting vertical mesh placement', () => {
  const [point] = projectDesignPathToPreview([{ x: 0, y: 0 }], placement, false)

  assert.equal(point[1], SOURCE_OUTLINE_PLANE_OFFSET)
  assert.notEqual(point[1], placement.translation[1])
})

test('closes contour overlays once without closing open strokes', () => {
  const source = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 2 }]
  const closed = projectDesignPathToPreview(source, placement, true)
  const open = projectDesignPathToPreview(source, placement, false)

  assert.equal(closed.length, 4)
  assert.deepEqual(closed[closed.length - 1], closed[0])
  assert.equal(open.length, 3)

  const alreadyClosed = projectDesignPathToPreview([...source, source[0]], placement, true)
  assert.equal(alreadyClosed.length, 4)
})

test('frames source paths outside the surviving mesh without changing alignment', () => {
  const framing = includeDesignPathsInPreviewFraming(placement, [{
    points: [
      { x: -20, y: -10 },
      { x: 40, y: 30 }
    ]
  }])

  assert.deepEqual(framing.translation, placement.translation)
  assert.deepEqual(framing.dimensions, [60, 10, 41])
  assert.deepEqual(framing.target, [13, 5, 5.5])
})
