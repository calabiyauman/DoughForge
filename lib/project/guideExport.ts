import type { Point2D, Transform2D } from '../design/types'
import type { CookieProjectRevision } from './types'

type Bounds = { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number }

function escapeHtml(value: unknown): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function applyTransform(point: Point2D, transform: Transform2D): Point2D {
  const [a, b, c, d, e, f] = transform
  return { x: a * point.x + c * point.y + e, y: b * point.x + d * point.y + f }
}

function scalePoint(point: Point2D, scale: number): Point2D {
  return { x: point.x * scale, y: point.y * scale }
}

function boundsFor(points: Point2D[]): Bounds {
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY }
}

function svgPath(points: Point2D[], bounds: Bounds, close = true): string {
  if (points.length === 0) return ''
  const commands = points.map((point, index) => {
    const y = bounds.minY + bounds.maxY - point.y
    return `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(3)} ${y.toFixed(3)}`
  })
  return `${commands.join(' ')}${close ? ' Z' : ''}`
}

function compoundSvgPath(outer: Point2D[], holes: Point2D[][], bounds: Bounds): string {
  return [svgPath(outer, bounds), ...holes.map((hole) => svgPath(hole, bounds))].join(' ')
}

function slug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'cookie-project'
}

export function printableGuideFilename(project: CookieProjectRevision): string {
  return `${slug(project.brief.title)}-decoration-guide.html`
}

/** Creates a standalone, print-to-PDF guide from one immutable project revision. */
export function createPrintableGuideHtml(project: CookieProjectRevision): string {
  const decoration = project.decorations[0]
  if (!decoration) throw new Error('Cannot create a guide without a decoration plan')
  const designRevision = project.designs.find((item) => item.id === decoration.designRevisionId)
  if (!designRevision) throw new Error('Decoration plan references a missing design revision')
  const palette = project.palettes.find((item) => item.id === decoration.paletteSpecId)
  if (!palette) throw new Error('Decoration plan references a missing palette')
  const design = designRevision.designSpec
  const outer = design.contours.find((contour) => (
    contour.role === 'cut' && contour.relationship.kind === 'outer'
  )) ?? design.contours.find((contour) => contour.relationship.kind === 'outer')
  if (!outer) throw new Error('Cannot create a guide without an outer contour')
  const physicalScaleValue = Number(project.metadata?.physicalScale ?? 1)
  const physicalScale = Number.isFinite(physicalScaleValue) && physicalScaleValue > 0 ? physicalScaleValue : 1
  const scaledOuter = outer.points.map((point) => scalePoint(point, physicalScale))
  const scaledHoles = design.contours
    .filter((contour) => contour.relationship.kind === 'hole' && contour.relationship.outerContourId === outer.id)
    .map((contour) => contour.points.map((point) => scalePoint(point, physicalScale)))
  const bounds = boundsFor(scaledOuter)
  const padding = Math.max(bounds.width, bounds.height) * 0.08
  const viewBox = `${bounds.minX - padding} ${bounds.minY - padding} ${bounds.width + padding * 2} ${bounds.height + padding * 2}`
  const colorById = new Map(palette.colors.map((color) => [color.id, color]))
  const gelById = new Map(palette.gelSkus.map((gel) => [gel.id, gel]))
  const recipeByColorId = new Map(palette.recipes.map((recipe) => [recipe.colorId, recipe]))

  const regionSvg = decoration.regions.map((region) => {
    const transformed = region.outer.map((point) => scalePoint(applyTransform(point, decoration.registration.transform), physicalScale))
    const holes = region.holes.map((hole) => hole.map((point) => scalePoint(applyTransform(point, decoration.registration.transform), physicalScale)))
    const color = colorById.get(region.fillColorId)?.target.hex ?? '#f5f5f4'
    return `<path d="${compoundSvgPath(transformed, holes, bounds)}" fill="${escapeHtml(color)}" fill-rule="evenodd" stroke="#ffffff" stroke-width="0.6" />`
  }).join('')
  const strokeSvg = decoration.strokes.map((stroke) => {
    const transformed = stroke.points.map((point) => scalePoint(applyTransform(point, decoration.registration.transform), physicalScale))
    const color = colorById.get(stroke.colorId)?.target.hex ?? '#292524'
    return `<path d="${svgPath(transformed, bounds, stroke.closed)}" fill="none" stroke="${escapeHtml(color)}" stroke-width="${stroke.width * physicalScale}" stroke-linecap="round" stroke-linejoin="round" />`
  }).join('')
  const letteringSvg = (decoration.lettering ?? []).map((lettering) => {
    const position = scalePoint(applyTransform(lettering.position, decoration.registration.transform), physicalScale)
    const y = bounds.minY + bounds.maxY - position.y
    const color = colorById.get(lettering.colorId)?.target.hex ?? '#292524'
    const family = lettering.style === 'monoline-script' || lettering.style === 'faux-calligraphy'
      ? 'Segoe Script, Brush Script MT, cursive'
      : lettering.style === 'rounded-block'
        ? 'Trebuchet MS, Arial Rounded MT Bold, sans-serif'
        : 'Arial, Helvetica, sans-serif'
    const anchor = lettering.align
    return `<text x="${position.x.toFixed(3)}" y="${y.toFixed(3)}" fill="${escapeHtml(color)}" font-family="${escapeHtml(family)}" font-size="${(lettering.fontSize * physicalScale).toFixed(3)}" font-weight="${lettering.style === 'rounded-block' ? 700 : 600}" font-style="${lettering.style.includes('script') || lettering.style === 'faux-calligraphy' ? 'italic' : 'normal'}" text-anchor="${anchor}" dominant-baseline="central" transform="rotate(${(-lettering.rotationDegrees).toFixed(2)} ${position.x.toFixed(3)} ${y.toFixed(3)})">${escapeHtml(lettering.text)}</text>`
  }).join('')

  const steps = [...decoration.steps]
    .sort((first, second) => first.sequence - second.sequence)
    .map((step) => `<li>
      <span class="number">${step.sequence}</span>
      <div><strong>${escapeHtml(step.title)}</strong><p>${escapeHtml(step.instructions)}</p>
      <small>${escapeHtml(step.technique)}${step.icingConsistency ? ` · ${escapeHtml(step.icingConsistency)} icing` : ''}${step.dryTimeMinutes ? ` · dry ${step.dryTimeMinutes} min` : ''}${step.tool ? ` · ${escapeHtml(step.tool)}` : ''}</small></div>
    </li>`).join('')

  const paletteCards = palette.colors.map((color) => {
    const recipe = recipeByColorId.get(color.id)
    const additions = recipe?.additions.map((addition) => {
      const gel = gelById.get(addition.gelSkuId)
      return `${addition.amount} ${addition.unit}${addition.amount === 1 ? '' : 's'} ${gel?.name ?? 'gel'}`
    }).join(' + ')
    return `<div class="swatch-card"><span class="swatch" style="background:${escapeHtml(color.target.hex)}"></span><div><strong>${escapeHtml(color.name)}</strong><small>${escapeHtml(color.target.hex)}</small>${recipe ? `<p>${recipe.baseIcingGrams}g icing: ${escapeHtml(additions || 'untinted')}</p>` : ''}</div></div>`
  }).join('')

  const kit = project.kits[0]
  const kitItems = kit?.components.map((component) => (
    `<li>${component.quantity} ${escapeHtml(component.unit)} — ${escapeHtml(component.name)}</li>`
  )).join('') ?? ''
  const finishedWidth = Math.max(1, design.target.size.width * physicalScale)
  const finishedHeight = Math.max(1, design.target.size.height * physicalScale)

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(project.brief.title)} — DoughForge guide</title>
<style>
  :root{font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:#292524;background:#f5f5f4}*{box-sizing:border-box}body{margin:0;padding:28px}.page{max-width:900px;margin:0 auto 24px;background:white;padding:38px;border-radius:24px;box-shadow:0 18px 50px #42200620}.eyebrow{color:#7c3aed;font-size:12px;font-weight:800;letter-spacing:.16em;text-transform:uppercase}h1{font-size:32px;margin:8px 0}h2{font-size:20px;margin:28px 0 14px}.meta{color:#78716c}.preview{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(240px,.8fr);gap:28px;align-items:center;margin-top:24px}.cookie{width:100%;height:360px;background:radial-gradient(circle,#fff,#f4eadc);border-radius:20px}.steps{padding:0;list-style:none}.steps li{display:flex;gap:12px;padding:14px 0;border-bottom:1px solid #e7e5e4}.steps p{margin:5px 0;color:#57534e;line-height:1.5}.steps small,.swatch-card small{display:block;color:#78716c}.number{display:grid;place-items:center;flex:0 0 30px;height:30px;border-radius:50%;background:#292524;color:white;font-weight:800}.palette{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}.swatch-card{display:flex;gap:12px;align-items:center;border:1px solid #e7e5e4;border-radius:14px;padding:12px}.swatch{width:42px;height:42px;border-radius:12px;border:1px solid #0002}.swatch-card p{font-size:12px;margin:5px 0 0}.warning{margin-top:18px;padding:14px;border:1px solid #fcd34d;background:#fffbeb;border-radius:12px;color:#92400e;font-size:13px}.actual{display:grid;place-items:center;min-height:70vh}.actual svg{overflow:visible}.actual-note{text-align:center;color:#57534e}.kit{line-height:1.8}@media(max-width:700px){body{padding:0}.page{border-radius:0;padding:22px}.preview{grid-template-columns:1fr}.palette{grid-template-columns:1fr}}@media print{body{background:white;padding:0}.page{box-shadow:none;border-radius:0;max-width:none;margin:0;page-break-after:always;padding:12mm}.page:last-child{page-break-after:auto}.no-print{display:none}}
</style></head><body>
<main class="page"><p class="eyebrow">DoughForge cookie outcome · revision ${project.revisionNumber}</p><h1>${escapeHtml(project.brief.title)}</h1><p class="meta">${escapeHtml(project.brief.prompt)}</p>
<section class="preview"><svg class="cookie" viewBox="${viewBox}" role="img" aria-label="Decorated cookie preview"><defs><filter id="shadow"><feDropShadow dx="0" dy="2" stdDeviation="2" flood-opacity=".24"/></filter></defs><path d="${compoundSvgPath(scaledOuter, scaledHoles, bounds)}" fill="#c98442" fill-rule="evenodd" stroke="#8b4a24" stroke-width="1.4" filter="url(#shadow)"/>${regionSvg}${strokeSvg}${letteringSvg}</svg><div><h2>Decorating sequence</h2><ol class="steps">${steps}</ol></div></section>
<h2>Matched palette</h2><div class="palette">${paletteCards}</div><p class="warning">${escapeHtml(palette.disclaimer ?? 'Prototype palette: verify cured icing swatches before production.')}</p>
${kit ? `<h2>Complete kit</h2><ul class="kit">${kitItems}</ul>` : ''}<p class="meta">Project hash: ${escapeHtml(project.contentHash)}</p></main>
<section class="page actual"><div><p class="eyebrow">Actual-size transfer sheet</p><h1>${escapeHtml(designRevision.name)}</h1><p class="actual-note">Print at 100% scale. Finished target: ${finishedWidth.toFixed(1)} × ${finishedHeight.toFixed(1)} mm.</p><svg width="${finishedWidth}mm" height="${finishedHeight}mm" viewBox="${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}" role="img" aria-label="Actual-size decoration transfer"><path d="${compoundSvgPath(scaledOuter, scaledHoles, bounds)}" fill="none" fill-rule="evenodd" stroke="#111827" stroke-width="0.45"/>${decoration.regions.slice(1).map((region) => `<path d="${compoundSvgPath(region.outer.map((point) => scalePoint(applyTransform(point, decoration.registration.transform), physicalScale)), region.holes.map((hole) => hole.map((point) => scalePoint(applyTransform(point, decoration.registration.transform), physicalScale))), bounds)}" fill="none" fill-rule="evenodd" stroke="#6d28d9" stroke-width="0.35"/>`).join('')}${decoration.strokes.map((stroke) => `<path d="${svgPath(stroke.points.map((point) => scalePoint(applyTransform(point, decoration.registration.transform), physicalScale)), bounds, stroke.closed)}" fill="none" stroke="#6d28d9" stroke-width="0.35"/>`).join('')}${letteringSvg}</svg></div></section>
</body></html>`
}
