import type { DesignSpec } from './types'
import { assertValidDesignSpec } from './validation'

export interface SerializeDesignSpecOptions {
  /** Number of spaces used to format JSON. Omit or use zero for compact JSON. */
  space?: number
}

export function serializeDesignSpec(
  design: DesignSpec,
  options: SerializeDesignSpecOptions = {}
): string {
  assertValidDesignSpec(design)
  const space = Math.max(0, Math.min(10, options.space ?? 0))
  return JSON.stringify(design, null, space)
}

export function parseDesignSpec(serialized: string): DesignSpec {
  const value: unknown = JSON.parse(serialized)
  assertValidDesignSpec(value)
  return value
}
