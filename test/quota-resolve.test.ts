import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  resolveEffectiveQuota,
  WEEKLY_HARD_EMPTY,
  LOW_QUOTA_5H,
  LOW_QUOTA_WEEKLY,
} from '../src/common/quota-resolve.ts'
import { buildQuotaGroupViews, classifyGroupFamilies } from '../src/common/quota-groups.ts'
import type { FamilyQuotaInfo } from '../src/common/pool-types.ts'

test('resolveEffectiveQuota: 3p weekly exhausted gold sample resolves to weekly bottleneck with lock', () => {
  const fixturePath = join(import.meta.dirname, 'fixtures/official-quota-3p-drained.json')
  const data = JSON.parse(readFileSync(fixturePath, 'utf8'))
  const group3p = data.summary.groups.find((g: any) => g.displayName === 'Claude and GPT models')
  assert.ok(group3p)

  const views = buildQuotaGroupViews([group3p])
  assert.equal(views.length, 1)
  const v0 = views[0]!
  assert.deepEqual(v0.families, ['anthropic', 'openai'])
  assert.equal(v0.fiveHour?.fraction, 1)
  assert.equal(v0.weekly?.fraction, 0.0065532)

  const familyQuota: FamilyQuotaInfo = {
    remainingFraction: v0.fiveHour?.fraction,
    resetTime: v0.fiveHour?.resetTime,
    weeklyFraction: v0.weekly?.fraction,
    weeklyResetTime: v0.weekly?.resetTime,
  }

  // Anchor fixed now before reset
  const fixedNow = Date.parse('2026-10-18T00:00:00Z')
  const resolved = resolveEffectiveQuota(familyQuota, fixedNow)

  assert.ok(resolved)
  assert.equal(resolved.fraction, 0.0065532)
  assert.equal(resolved.window, 'weekly')
  assert.equal(resolved.resetTime, '2026-10-18T18:04:46Z')
  assert.equal(resolved.lock, 'weekly_exhausted')
  assert.equal(resolved.fiveHour?.fraction, 1)
  assert.equal(resolved.weekly?.fraction, 0.0065532)
})

test('resolveEffectiveQuota: gold sample Gemini (5h full + weekly 96%) resolves to weekly constraint without lock', () => {
  const fixturePath = join(import.meta.dirname, 'fixtures/official-quota-3p-drained.json')
  const data = JSON.parse(readFileSync(fixturePath, 'utf8'))
  const groupGemini = data.summary.groups.find((g: any) => g.displayName === 'Gemini Models')
  assert.ok(groupGemini)

  const views = buildQuotaGroupViews([groupGemini])
  const v = views[0]!
  assert.deepEqual(v.families, ['google'])

  const familyQuota: FamilyQuotaInfo = {
    remainingFraction: v.fiveHour?.fraction,
    resetTime: v.fiveHour?.resetTime,
    weeklyFraction: v.weekly?.fraction,
    weeklyResetTime: v.weekly?.resetTime,
  }

  const fixedNow = Date.parse('2026-10-18T00:00:00Z')
  const resolved = resolveEffectiveQuota(familyQuota, fixedNow)

  assert.ok(resolved)
  assert.equal(resolved.fraction, 0.9558268)
  assert.equal(resolved.window, 'weekly')
  assert.equal(resolved.resetTime, '2026-10-22T20:31:37Z')
  assert.equal(resolved.lock, null)
})

test('resolveEffectiveQuota: weekly 80% and 5h 40% picks 5h bottleneck', () => {
  const future = new Date(Date.now() + 10_000_000).toISOString()
  const q: FamilyQuotaInfo = {
    remainingFraction: 0.40,
    resetTime: future,
    weeklyFraction: 0.80,
    weeklyResetTime: future,
  }
  const resolved = resolveEffectiveQuota(q)
  assert.ok(resolved)
  assert.equal(resolved.fraction, 0.40)
  assert.equal(resolved.window, '5h')
  assert.equal(resolved.lock, null)
})

test('resolveEffectiveQuota: tie between 5h and weekly breaks to weekly', () => {
  const future = new Date(Date.now() + 10_000_000).toISOString()
  const q: FamilyQuotaInfo = {
    remainingFraction: 0.50,
    resetTime: '2026-10-20T10:00:00Z',
    weeklyFraction: 0.50,
    weeklyResetTime: '2026-10-25T10:00:00Z',
  }
  const resolved = resolveEffectiveQuota(q)
  assert.ok(resolved)
  assert.equal(resolved.fraction, 0.50)
  assert.equal(resolved.window, 'weekly')
  assert.equal(resolved.resetTime, '2026-10-25T10:00:00Z')
})

test('resolveEffectiveQuota: only 5h exists', () => {
  const future = new Date(Date.now() + 10_000_000).toISOString()
  const q: FamilyQuotaInfo = {
    remainingFraction: 0.75,
    resetTime: future,
  }
  const resolved = resolveEffectiveQuota(q)
  assert.ok(resolved)
  assert.equal(resolved.fraction, 0.75)
  assert.equal(resolved.window, '5h')
  assert.equal(resolved.weekly, undefined)
  assert.equal(resolved.lock, null)
})

test('resolveEffectiveQuota: only weekly exists', () => {
  const future = new Date(Date.now() + 10_000_000).toISOString()
  const q: FamilyQuotaInfo = {
    weeklyFraction: 0.75,
    weeklyResetTime: future,
  }
  const resolved = resolveEffectiveQuota(q)
  assert.ok(resolved)
  assert.equal(resolved.fraction, 0.75)
  assert.equal(resolved.window, 'weekly')
  assert.equal(resolved.fiveHour, undefined)
  assert.equal(resolved.lock, null)
})

test('resolveEffectiveQuota: both windows missing returns null', () => {
  const q: FamilyQuotaInfo = {}
  const resolved = resolveEffectiveQuota(q)
  assert.equal(resolved, null)
  assert.equal(resolveEffectiveQuota(undefined), null)
})

test('resolveEffectiveQuota: weekly <= 0.001 sentinel triggers hard weekly lock', () => {
  const future = new Date(Date.now() + 10_000_000).toISOString()
  const q: FamilyQuotaInfo = {
    remainingFraction: 1.0,
    resetTime: future,
    weeklyFraction: 0.0005,
    weeklyResetTime: future,
  }
  const resolved = resolveEffectiveQuota(q)
  assert.ok(resolved)
  assert.equal(resolved.fraction, 0.0005)
  assert.equal(resolved.window, 'weekly')
  assert.equal(resolved.lock, 'weekly_exhausted')
})

test('resolveEffectiveQuota: weekly exactly 0.001 triggers weekly lock', () => {
  const future = new Date(Date.now() + 10_000_000).toISOString()
  const q: FamilyQuotaInfo = {
    remainingFraction: 1.0,
    resetTime: future,
    weeklyFraction: WEEKLY_HARD_EMPTY,
    weeklyResetTime: future,
  }
  const resolved = resolveEffectiveQuota(q)
  assert.ok(resolved)
  assert.equal(resolved.fraction, WEEKLY_HARD_EMPTY)
  assert.equal(resolved.window, 'weekly')
  assert.equal(resolved.lock, 'weekly_exhausted')
})

test('resolveEffectiveQuota: expired window treats fraction as 1.0 in comparison without altering raw value', () => {
  const past = new Date(Date.now() - 60_000).toISOString()
  const future = new Date(Date.now() + 10_000_000).toISOString()
  const q: FamilyQuotaInfo = {
    remainingFraction: 0.05, // Expired 5h window
    resetTime: past,
    weeklyFraction: 0.70, // Active weekly
    weeklyResetTime: future,
  }
  const resolved = resolveEffectiveQuota(q)
  assert.ok(resolved)
  // Expired 5h treats effective 5h as 1.0, so weekly (0.70) is smaller and selected
  assert.equal(resolved.fraction, 0.70)
  assert.equal(resolved.window, 'weekly')
  assert.equal(resolved.lock, null)
  assert.equal(resolved.fiveHour?.fraction, 0.05) // Raw value preserved
})

test('resolveEffectiveQuota: clamps out-of-range values and ignores NaN', () => {
  const future = new Date(Date.now() + 10_000_000).toISOString()
  const q: FamilyQuotaInfo = {
    remainingFraction: 1.5,
    weeklyFraction: -0.2,
    resetTime: future,
    weeklyResetTime: future,
  }
  const resolved = resolveEffectiveQuota(q)
  assert.ok(resolved)
  assert.equal(resolved.fiveHour?.fraction, 1.0)
  assert.equal(resolved.weekly?.fraction, 0.0)
  assert.equal(resolved.fraction, 0.0)
  assert.equal(resolved.window, 'weekly')

  const nanQuota: FamilyQuotaInfo = {
    remainingFraction: Number.NaN,
    weeklyFraction: Number.NaN,
  }
  assert.equal(resolveEffectiveQuota(nanQuota), null)
})

test('classifyGroupFamilies: Claude and GPT group maps to anthropic and openai', () => {
  const group = {
    displayName: 'Claude and GPT models',
    description: 'Models within this group: Claude Opus, Claude Sonnet, GPT-OSS',
  }
  const families = classifyGroupFamilies(group)
  assert.deepEqual(families, ['anthropic', 'openai'])
})

test('classifyGroupFamilies: Argon checked before Gemini and maps to argon family', () => {
  const group = {
    displayName: 'Gemini 4 Argon',
    description: 'Argon quota tier',
  }
  const families = classifyGroupFamilies(group)
  assert.deepEqual(families, ['argon'])
})

test('classifyGroupFamilies: unknown group returns empty array (does not default to google)', () => {
  const group = {
    displayName: 'Custom Enterprise Suite',
    description: 'Special access pool',
  }
  const families = classifyGroupFamilies(group)
  assert.deepEqual(families, [])
})
