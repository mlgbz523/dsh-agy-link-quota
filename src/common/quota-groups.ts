import type { ModelFamily } from './pool-types.ts'

export interface QuotaSummaryBucket {
  bucketId?: string
  displayName?: string
  window?: string
  resetTime?: string
  description?: string
  remainingFraction?: number
}

export interface QuotaSummaryGroup {
  displayName?: string
  description?: string
  buckets?: QuotaSummaryBucket[]
}

export interface QuotaGroupView {
  displayName: string
  description?: string
  /** Families that DRAW FROM THE SAME POOL. >1 means shared. */
  families: ModelFamily[]
  fiveHour?: { fraction: number; resetTime?: string }
  weekly?: { fraction: number; resetTime?: string }
}

/**
 * Classify a summary group into target model families.
 * CRITICAL (from Antigravity-Manager parity):
 * - Argon MUST be checked before generic Gemini (otherwise Argon pollutes google quota).
 * - Claude / GPT (3P) maps to ['anthropic', 'openai'].
 * - If not matched, returns [] (does NOT blindly fallback to google).
 */
export function classifyGroupFamilies(group: QuotaSummaryGroup): ModelFamily[] {
  const dName = (group.displayName || '').toLowerCase()
  const desc = (group.description || '').toLowerCase()
  const text = `${dName} ${desc}`

  if (text.includes('argon')) {
    return ['argon']
  }
  if (text.includes('claude') || text.includes('gpt')) {
    return ['anthropic', 'openai']
  }
  if (text.includes('gemini')) {
    return ['google']
  }
  return []
}

/** Group official summary groups into UI-level cards, merging shared pools. */
export function buildQuotaGroupViews(groups: QuotaSummaryGroup[]): QuotaGroupView[] {
  if (!Array.isArray(groups)) return []

  const result: QuotaGroupView[] = []

  for (const group of groups) {
    const families = classifyGroupFamilies(group)
    let fiveHour: { fraction: number; resetTime?: string } | undefined
    let weekly: { fraction: number; resetTime?: string } | undefined

    for (const b of group.buckets || []) {
      const w = (b.window || b.bucketId || '').toLowerCase()
      const frac =
        typeof b.remainingFraction === 'number' && Number.isFinite(b.remainingFraction)
          ? Math.min(1, Math.max(0, b.remainingFraction))
          : undefined

      if (frac !== undefined) {
        if (w.includes('5h') || w.includes('five_hour') || w.includes('5-hour')) {
          fiveHour = { fraction: frac, resetTime: b.resetTime }
        } else if (w.includes('weekly') || w.includes('week')) {
          weekly = { fraction: frac, resetTime: b.resetTime }
        }
      }
    }

    result.push({
      displayName: group.displayName || 'Unnamed Group',
      description: group.description,
      families,
      fiveHour,
      weekly,
    })
  }

  return result
}
