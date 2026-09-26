import type { CookieProjectLifecycle } from './types'

const LIFECYCLE_TRANSITIONS: Record<CookieProjectLifecycle, readonly CookieProjectLifecycle[]> = {
  concept: ['production-validation', 'archived'],
  'production-validation': ['concept', 'ready-to-order', 'archived'],
  'ready-to-order': ['production-validation', 'approved', 'archived'],
  approved: ['ordered', 'archived'],
  ordered: ['archived'],
  archived: []
}

export function allowedProjectLifecycleTransitions(
  lifecycle: CookieProjectLifecycle
): readonly CookieProjectLifecycle[] {
  return LIFECYCLE_TRANSITIONS[lifecycle]
}

export function canTransitionProjectLifecycle(
  from: CookieProjectLifecycle,
  to: CookieProjectLifecycle
): boolean {
  return from === to || LIFECYCLE_TRANSITIONS[from].includes(to)
}
