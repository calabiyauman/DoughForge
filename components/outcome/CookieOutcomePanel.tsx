'use client'

import { useId, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import {
  Check,
  ChevronRight,
  Clock3,
  Download,
  Droplets,
  Eye,
  Layers3,
  ListOrdered,
  PackageCheck,
  Palette,
  Pencil,
  Ruler,
  ShoppingBag,
  Sparkles,
} from 'lucide-react'
import clsx from 'clsx'
import CookieShapePreview from './CookieShapePreview'
import { formatMoney } from './geometry'
import type {
  CookieOutcomePanelProps,
  CookieOutcomeView,
  OutcomeColorRecipe,
} from './types'

const VIEWS: Array<{
  id: CookieOutcomeView
  label: string
  icon: typeof Eye
}> = [
  { id: 'decorated', label: 'Decorated', icon: Eye },
  { id: 'guide', label: 'Guide', icon: ListOrdered },
  { id: 'palette', label: 'Palette', icon: Palette },
  { id: 'kit', label: 'Kit', icon: PackageCheck },
]

const STATUS_LABELS: Record<CookieOutcomePanelProps['outcome']['lifecycle'], string> = {
  concept: 'Concept',
  'production-validation': 'Production check',
  'ready-to-order': 'Ready to order',
  approved: 'Approved',
  ordered: 'Ordered',
  archived: 'Archived',
}

const STATUS_CLASSES: Record<CookieOutcomePanelProps['outcome']['lifecycle'], string> = {
  concept: 'border-violet-200 bg-violet-50 text-violet-700',
  'production-validation': 'border-amber-200 bg-amber-50 text-amber-800',
  'ready-to-order': 'border-emerald-200 bg-emerald-50 text-emerald-700',
  approved: 'border-sky-200 bg-sky-50 text-sky-700',
  ordered: 'border-indigo-200 bg-indigo-50 text-indigo-700',
  archived: 'border-stone-200 bg-stone-100 text-stone-600',
}

function recipeLabel(recipe: OutcomeColorRecipe, gelNames: Map<string, string>): string {
  const label = recipe.additions
    .map((addition) => {
      const gelName = gelNames.get(addition.gelSkuId) ?? 'gel'
      const unit = addition.amount === 1
        ? addition.unit.replace(/s$/, '')
        : addition.unit
      return `${addition.amount} ${unit} ${gelName}`
    })
    .join(' + ')
  return label || 'Untinted white icing'
}

export default function CookieOutcomePanel({
  outcome,
  view,
  defaultView = 'decorated',
  onViewChange,
  onOrderKit,
  onDownloadGuide,
  onEditDesign,
  className,
}: CookieOutcomePanelProps) {
  const rawPanelId = useId()
  const panelId = `cookie-outcome-${rawPanelId.replace(/[^a-zA-Z0-9_-]/g, '')}`
  const [uncontrolledView, setUncontrolledView] = useState<CookieOutcomeView>(defaultView)
  const activeView = view ?? uncontrolledView
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const gelById = useMemo(
    () => new Map(outcome.palette.gelSkus.map((gel) => [gel.id, gel])),
    [outcome.palette.gelSkus]
  )
  const gelNames = useMemo(
    () => new Map(outcome.palette.gelSkus.map((gel) => [gel.id, gel.name])),
    [outcome.palette.gelSkus]
  )
  const recipeByColorId = useMemo(
    () => new Map(outcome.palette.recipes.map((recipe) => [recipe.colorId, recipe])),
    [outcome.palette.recipes]
  )
  const orderedSteps = useMemo(
    () => [...outcome.decoration.steps].sort((first, second) => first.sequence - second.sequence),
    [outcome.decoration.steps]
  )
  const kitTotal = useMemo(
    () =>
      outcome.kit.components.reduce(
        (total, component) => total + (component.unitPrice ?? 0) * component.quantity,
        0
      ),
    [outcome.kit.components]
  )
  const isOrderable = outcome.kit.status === 'orderable'

  const selectView = (nextView: CookieOutcomeView) => {
    if (view === undefined) setUncontrolledView(nextView)
    onViewChange?.(nextView)
  }

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | undefined
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % VIEWS.length
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + VIEWS.length) % VIEWS.length
    if (event.key === 'Home') nextIndex = 0
    if (event.key === 'End') nextIndex = VIEWS.length - 1
    if (nextIndex === undefined) return

    event.preventDefault()
    selectView(VIEWS[nextIndex].id)
    tabRefs.current[nextIndex]?.focus()
  }

  return (
    <section
      className={clsx(
        'overflow-hidden rounded-[1.75rem] border border-stone-200/90 bg-[#fbfaf8] text-stone-900 shadow-[0_24px_70px_-35px_rgba(69,26,3,0.45)]',
        className
      )}
      aria-labelledby={`${panelId}-title`}
    >
      <header className="border-b border-stone-200/80 px-5 py-5 sm:px-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-500 text-white shadow-sm">
              <Sparkles className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-700">
                Cookie outcome
              </p>
              <h2
                id={`${panelId}-title`}
                className="mt-1 truncate text-xl font-semibold tracking-tight text-stone-950 sm:text-2xl"
              >
                {outcome.title}
              </h2>
              {outcome.description ? (
                <p className="mt-1 max-w-2xl text-sm leading-6 text-stone-600">
                  {outcome.description}
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            {outcome.generation?.source === 'ai' ? (
              <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">
                AI ranked{typeof outcome.generation.score === 'number' ? ` ${outcome.generation.score}/100` : ''}
              </span>
            ) : null}
            <span
              className={clsx(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold',
                STATUS_CLASSES[outcome.lifecycle]
              )}
            >
              {isOrderable ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : null}
              {STATUS_LABELS[outcome.lifecycle]}
            </span>
            <span className="rounded-full border border-stone-200 bg-white px-3 py-1 text-xs font-medium capitalize text-stone-700">
              {outcome.difficulty}
            </span>
            <span className="rounded-full border border-stone-200 bg-white px-3 py-1 text-xs font-medium text-stone-500">
              Rev {outcome.revisionNumber}
            </span>
          </div>
        </div>

        <div
          className="mt-5 grid grid-cols-4 rounded-2xl border border-stone-200 bg-white p-1 shadow-sm"
          role="tablist"
          aria-label="Cookie outcome views"
        >
          {VIEWS.map((item, index) => {
            const Icon = item.icon
            const selected = activeView === item.id
            return (
              <button
                key={item.id}
                ref={(element) => {
                  tabRefs.current[index] = element
                }}
                type="button"
                id={`${panelId}-${item.id}-tab`}
                role="tab"
                aria-selected={selected}
                aria-controls={selected ? `${panelId}-${item.id}-panel` : undefined}
                tabIndex={selected ? 0 : -1}
                onClick={() => selectView(item.id)}
                onKeyDown={(event) => handleTabKeyDown(event, index)}
                className={clsx(
                  'flex min-h-11 items-center justify-center gap-2 rounded-xl px-2 py-2 text-xs font-semibold transition sm:text-sm',
                  selected
                    ? 'bg-stone-900 text-white shadow-sm'
                    : 'text-stone-500 hover:bg-stone-50 hover:text-stone-900'
                )}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                <span className="hidden xs:inline sm:inline">{item.label}</span>
              </button>
            )
          })}
        </div>
      </header>

      <div className="grid min-h-[34rem] lg:grid-cols-[minmax(0,1.22fr)_minmax(20rem,0.78fr)]">
        <div className="relative flex min-h-[24rem] flex-col overflow-hidden border-b border-stone-200 bg-[radial-gradient(circle_at_50%_25%,#fff_0%,#f7f2ea_48%,#ede6dc_100%)] p-5 lg:min-h-[36rem] lg:border-b-0 lg:border-r lg:p-8">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
                {activeView === 'guide' ? 'Registered guide view' : 'Registered outcome preview'}
              </p>
              <p className="mt-1 text-sm text-stone-600">
                {activeView === 'guide'
                  ? 'Numbers sit directly on the generated icing regions.'
                  : outcome.generation?.source === 'ai'
                    ? `Selected from ${outcome.generation.candidateCount ?? 1} structured AI decoration candidate${(outcome.generation.candidateCount ?? 1) === 1 ? '' : 's'}.`
                    : 'Rendered from the cutter contour and registered decoration geometry.'}
              </p>
            </div>
            {onEditDesign ? (
              <button
                type="button"
                onClick={() => onEditDesign(outcome)}
                className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border border-stone-200 bg-white/90 px-3 text-sm font-semibold text-stone-700 shadow-sm transition hover:border-violet-200 hover:text-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
              >
                <Pencil className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">Edit design</span>
              </button>
            ) : null}
          </div>

          <div className="relative min-h-0 flex-1 py-3 sm:py-5">
            <CookieShapePreview
              design={outcome.design}
              regions={outcome.decoration.regions}
              strokes={outcome.decoration.strokes}
              lettering={outcome.decoration.lettering}
              steps={outcome.decoration.steps}
              colors={outcome.palette.colors}
              view={activeView}
            />
          </div>

          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <div className="rounded-2xl border border-white/80 bg-white/75 px-3 py-3 shadow-sm backdrop-blur-sm">
              <Ruler className="h-4 w-4 text-violet-600" aria-hidden="true" />
              <p className="mt-2 text-xs text-stone-500">Finished size</p>
              <p className="mt-0.5 text-sm font-semibold text-stone-900">
                {outcome.design.sizeMm.width.toFixed(0)} × {outcome.design.sizeMm.height.toFixed(0)} mm
              </p>
            </div>
            <div className="rounded-2xl border border-white/80 bg-white/75 px-3 py-3 shadow-sm backdrop-blur-sm">
              <Layers3 className="h-4 w-4 text-violet-600" aria-hidden="true" />
              <p className="mt-2 text-xs text-stone-500">Icing regions</p>
              <p className="mt-0.5 text-sm font-semibold text-stone-900">
                {outcome.decoration.regions.length} registered
              </p>
            </div>
            <div className="rounded-2xl border border-white/80 bg-white/75 px-3 py-3 shadow-sm backdrop-blur-sm">
              <Clock3 className="h-4 w-4 text-violet-600" aria-hidden="true" />
              <p className="mt-2 text-xs text-stone-500">Decorating time</p>
              <p className="mt-0.5 text-sm font-semibold text-stone-900">
                {outcome.estimatedMinutes ? `${outcome.estimatedMinutes} min` : 'Not estimated'}
              </p>
            </div>
          </div>
        </div>

        <div
          id={`${panelId}-${activeView}-panel`}
          role="tabpanel"
          aria-labelledby={`${panelId}-${activeView}-tab`}
          className="min-w-0 bg-white px-5 py-6 sm:px-7"
        >
          {activeView === 'decorated' ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-700">
                What you will make
              </p>
              <h3 className="mt-2 text-xl font-semibold tracking-tight text-stone-950">
                A matched result, not just a cutter
              </h3>
              <p className="mt-2 text-sm leading-6 text-stone-600">
                The cutter, icing map, color recipes, and guide all share this exact registered design.
              </p>

              <dl className="mt-6 divide-y divide-stone-100 rounded-2xl border border-stone-200 bg-stone-50/60 px-4">
                <div className="flex items-center justify-between gap-4 py-3.5">
                  <dt className="text-sm text-stone-500">Design</dt>
                  <dd className="text-right text-sm font-semibold text-stone-900">{outcome.design.name}</dd>
                </div>
                <div className="flex items-center justify-between gap-4 py-3.5">
                  <dt className="text-sm text-stone-500">Decoration plan</dt>
                  <dd className="text-right text-sm font-semibold text-stone-900">{outcome.decoration.name}</dd>
                </div>
                <div className="flex items-center justify-between gap-4 py-3.5">
                  <dt className="text-sm text-stone-500">Palette</dt>
                  <dd className="text-right text-sm font-semibold text-stone-900">{outcome.palette.name}</dd>
                </div>
                {outcome.decoration.lettering.length > 0 ? (
                  <div className="flex items-center justify-between gap-4 py-3.5">
                    <dt className="text-sm text-stone-500">Lettering</dt>
                    <dd className="text-right text-sm font-semibold text-stone-900">
                      {outcome.decoration.lettering.map((item) => `${item.text} · ${item.style.replace(/-/g, ' ')}`).join(' / ')}
                    </dd>
                  </div>
                ) : null}
                <div className="flex items-center justify-between gap-4 py-3.5">
                  <dt className="text-sm text-stone-500">Yield</dt>
                  <dd className="text-right text-sm font-semibold text-stone-900">
                    {outcome.yieldCount ? `${outcome.yieldCount} cookies` : 'Flexible'}
                  </dd>
                </div>
              </dl>

              <button
                type="button"
                onClick={() => selectView('guide')}
                className="mt-6 flex min-h-12 w-full items-center justify-between rounded-2xl border border-violet-200 bg-violet-50 px-4 text-left text-sm font-semibold text-violet-800 transition hover:bg-violet-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
              >
                See how to decorate it
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          ) : null}

          {activeView === 'guide' ? (
            <div>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-700">
                    Decorating guide
                  </p>
                  <h3 className="mt-2 text-xl font-semibold tracking-tight text-stone-950">
                    {outcome.decoration.steps.length} ordered steps
                  </h3>
                </div>
                {onDownloadGuide ? (
                  <button
                    type="button"
                    onClick={() => onDownloadGuide(outcome)}
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-stone-200 px-3 text-sm font-semibold text-stone-700 transition hover:border-violet-200 hover:text-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
                  >
                    <Download className="h-4 w-4" aria-hidden="true" />
                    Guide
                  </button>
                ) : null}
              </div>

              <ol className="mt-5 space-y-3">
                {orderedSteps.map((step) => (
                    <li key={step.id} className="rounded-2xl border border-stone-200 p-4">
                      <div className="flex gap-3">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-stone-900 text-sm font-bold text-white">
                          {step.sequence}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="text-sm font-semibold text-stone-950">{step.title}</h4>
                            <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-600">
                              {step.technique}
                            </span>
                          </div>
                          <p className="mt-1.5 text-sm leading-5 text-stone-600">{step.instructions}</p>
                          <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-medium text-stone-600">
                            {step.icingConsistency ? (
                              <span className="rounded-lg bg-sky-50 px-2 py-1 text-sky-700">
                                {step.icingConsistency} icing
                              </span>
                            ) : null}
                            {step.dryTimeMinutes ? (
                              <span className="rounded-lg bg-amber-50 px-2 py-1 text-amber-800">
                                Dry {step.dryTimeMinutes} min
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </li>
                ))}
              </ol>
            </div>
          ) : null}

          {activeView === 'palette' ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-700">
                Matched gel palette
              </p>
              <h3 className="mt-2 text-xl font-semibold tracking-tight text-stone-950">
                {outcome.palette.colors.length} project colors
              </h3>
              <p className="mt-2 text-sm leading-6 text-stone-600">
                Recipes are measured against white royal icing. Allow colors to rest before adjusting.
              </p>

              <div className="mt-5 space-y-3">
                {outcome.palette.colors.map((color) => {
                  const recipe = recipeByColorId.get(color.id)
                  return (
                    <article key={color.id} className="rounded-2xl border border-stone-200 p-4">
                      <div className="flex items-center gap-3">
                        <span
                          className="h-11 w-11 shrink-0 rounded-xl border border-black/10 shadow-inner"
                          style={{ backgroundColor: color.hex }}
                          aria-hidden="true"
                        />
                        <div className="min-w-0 flex-1">
                          <h4 className="truncate text-sm font-semibold text-stone-950">{color.name}</h4>
                          <p className="mt-0.5 font-mono text-xs uppercase text-stone-500">{color.hex}</p>
                        </div>
                        {color.role ? (
                          <span className="rounded-full bg-stone-100 px-2 py-1 text-[11px] font-medium text-stone-600">
                            {color.role}
                          </span>
                        ) : null}
                      </div>
                      {recipe ? (
                        <div className="mt-3 rounded-xl bg-stone-50 px-3 py-2.5 text-xs leading-5 text-stone-600">
                          <span className="font-semibold text-stone-800">For {recipe.baseIcingGrams}g icing:</span>{' '}
                          {recipeLabel(recipe, gelNames)}
                          {recipe.restMinutes ? ` · rest ${recipe.restMinutes} min` : ''}
                        </div>
                      ) : null}
                    </article>
                  )
                })}
              </div>

              {outcome.palette.gelSkus.length > 0 ? (
                <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
                    <Droplets className="h-4 w-4" aria-hidden="true" />
                    {outcome.palette.gelSkus.length} sealed gel colors in this kit
                  </div>
                  <p className="mt-1.5 text-xs leading-5 text-emerald-800">
                    {outcome.palette.gelSkus.map((gel) => `${gel.brand} ${gel.name}`).join(' · ')}
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}

          {activeView === 'kit' ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-700">
                Complete project kit
              </p>
              <h3 className="mt-2 text-xl font-semibold tracking-tight text-stone-950">
                {outcome.kit.name}
              </h3>
              <p className="mt-2 text-sm leading-6 text-stone-600">
                Everything is tied to revision {outcome.revisionNumber}, so the tools, guide, and colors stay matched.
              </p>

              <ul className="mt-5 divide-y divide-stone-100 rounded-2xl border border-stone-200 px-4">
                {outcome.kit.components.map((component) => {
                  const gel = component.kind === 'gel' ? gelById.get(component.gelSkuId ?? '') : undefined
                  const price = (component.unitPrice ?? 0) * component.quantity
                  return (
                    <li key={component.id} className="flex items-start gap-3 py-3.5">
                      <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-violet-50 text-violet-700">
                        <Check className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-stone-900">
                          {component.quantity > 1 ? `${component.quantity}× ` : ''}{component.name}
                        </p>
                        {component.description || gel ? (
                          <p className="mt-0.5 text-xs leading-5 text-stone-500">
                            {component.description ?? `${gel?.brand} · ${gel?.sku}`}
                          </p>
                        ) : null}
                      </div>
                      <span className="shrink-0 text-sm font-medium text-stone-700">
                        {component.included || price === 0
                          ? 'Included'
                          : formatMoney(price, outcome.kit.currency)}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          ) : null}
        </div>
      </div>

      <footer className="border-t border-stone-200 bg-stone-950 px-5 py-4 text-white sm:px-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/10">
              <ShoppingBag className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-xs text-stone-400">Complete project kit</p>
              <p className="text-lg font-semibold">
                {kitTotal > 0 ? formatMoney(kitTotal, outcome.kit.currency) : 'Price at checkout'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onOrderKit?.(outcome)}
            disabled={!isOrderable || !onOrderKit}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-5 text-sm font-semibold text-white shadow-lg shadow-fuchsia-950/20 transition hover:from-violet-400 hover:to-fuchsia-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-stone-950 disabled:cursor-not-allowed disabled:from-stone-700 disabled:to-stone-700 disabled:text-stone-400 disabled:shadow-none"
          >
            <PackageCheck className="h-4 w-4" aria-hidden="true" />
            {isOrderable ? 'Order complete kit' : 'Complete production check'}
          </button>
        </div>
      </footer>
    </section>
  )
}
