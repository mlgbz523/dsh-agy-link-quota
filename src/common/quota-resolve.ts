// Antigravity-Manager-style quota resolution, adapted to dsh-agy-link's
// family model. Pure functions only: no I/O, no Date.now() unless injected.
import type { FamilyQuotaInfo } from './pool-types.ts'

export type LockReason = 'weekly_exhausted' | 'five_hour_exhausted' | null

export interface EffectiveQuota {
  /** Fraction the UI must show as THE number (bottleneck window). */
  fraction: number
  /** Which window produced `fraction`. */
  window: '5h' | 'weekly'
  /** Reset time OF THAT WINDOW (not of the other one). */
  resetTime?: string
  /** null = usable; non-null means Google will reject calls in this family. */
  lock: LockReason
  /** Both windows, for the detail rows. */
  fiveHour?: { fraction: number; resetTime?: string }
  weekly?: { fraction: number; resetTime?: string }
}

/** AM's <= 0.001 weekly-exhaustion sentinel, and the 5h/5% rotation thresholds. */
export const WEEKLY_HARD_EMPTY = 0.001
export const LOW_QUOTA_5H = 0.10
export const LOW_QUOTA_WEEKLY = 0.05

function cleanFraction(val: unknown): number | undefined {
  if (typeof val !== 'number' || Number.isNaN(val)) return undefined
  return Math.min(1, Math.max(0, val))
}

function isExpired(resetTime?: string, now = Date.now()): boolean {
  if (!resetTime) return false
  const t = Date.parse(resetTime)
  return !Number.isNaN(t) && t <= now
}

/**
 * Port of Antigravity-Manager's `chosen_bucket`:
 *   - weekly <= 0.001 -> weekly wins outright (it is a hard block)
 *   - else pick the SMALLER fraction (the binding constraint)
 *   - tie -> weekly (longer to recover, so it is the honest number)
 */
export function resolveEffectiveQuota(
  info: FamilyQuotaInfo | undefined,
  now = Date.now(),
): EffectiveQuota | null {
  if (!info) return null

  const raw5h = cleanFraction(info.remainingFraction)
  const rawWeekly = cleanFraction(info.weeklyFraction)

  if (raw5h === undefined && rawWeekly === undefined) {
    return null
  }

  const reset5h = info.resetTime
  const resetWeekly = info.weeklyResetTime

  const fiveHourDetail = raw5h !== undefined ? { fraction: raw5h, resetTime: reset5h } : undefined
  const weeklyDetail = rawWeekly !== undefined ? { fraction: rawWeekly, resetTime: resetWeekly } : undefined

  // 1. Only 5h exists
  if (rawWeekly === undefined) {
    const expired = isExpired(reset5h, now)
    const lock: LockReason = (!expired && raw5h! <= LOW_QUOTA_5H) ? 'five_hour_exhausted' : null
    return {
      fraction: raw5h!,
      window: '5h',
      resetTime: reset5h,
      lock,
      fiveHour: fiveHourDetail,
      weekly: undefined,
    }
  }

  // 2. Only weekly exists
  if (raw5h === undefined) {
    const expired = isExpired(resetWeekly, now)
    const lock: LockReason = (!expired && rawWeekly <= LOW_QUOTA_WEEKLY) ? 'weekly_exhausted' : null
    return {
      fraction: rawWeekly,
      window: 'weekly',
      resetTime: resetWeekly,
      lock,
      fiveHour: undefined,
      weekly: weeklyDetail,
    }
  }

  // 3. Both exist: apply Antigravity-Manager's chosen_bucket logic
  const expired5h = isExpired(reset5h, now)
  const expiredWeekly = isExpired(resetWeekly, now)

  const effective5h = expired5h ? 1.0 : raw5h
  const effectiveWeekly = expiredWeekly ? 1.0 : rawWeekly

  // Weekly hard-empty: if weekly <= WEEKLY_HARD_EMPTY (and not expired) -> weekly wins outright
  if (!expiredWeekly && rawWeekly <= WEEKLY_HARD_EMPTY) {
    return {
      fraction: rawWeekly,
      window: 'weekly',
      resetTime: resetWeekly,
      lock: 'weekly_exhausted',
      fiveHour: fiveHourDetail,
      weekly: weeklyDetail,
    }
  }

  // Compare effective fractions: pick the binding constraint (smaller fraction)
  // Tie -> weekly (takes longer to recover, so it is the honest number)
  let selectedWindow: '5h' | 'weekly'
  if (effective5h < effectiveWeekly) {
    selectedWindow = '5h'
  } else {
    selectedWindow = 'weekly'
  }

  const chosenFraction = selectedWindow === '5h' ? raw5h : rawWeekly
  const chosenReset = selectedWindow === '5h' ? reset5h : resetWeekly

  // Lock determination
  let lock: LockReason = null
  if (!expiredWeekly && rawWeekly <= LOW_QUOTA_WEEKLY) {
    lock = 'weekly_exhausted'
  } else if (!expired5h && raw5h <= LOW_QUOTA_5H) {
    lock = 'five_hour_exhausted'
  }

  return {
    fraction: chosenFraction,
    window: selectedWindow,
    resetTime: chosenReset,
    lock,
    fiveHour: fiveHourDetail,
    weekly: weeklyDetail,
  }
}
