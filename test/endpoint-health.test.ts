import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EndpointHealthTracker } from '../src/host/endpoint-health.ts'

test('EndpointHealthTracker: healthy endpoints preserve original order', () => {
  const tracker = new EndpointHealthTracker(60_000)
  const endpoints = ['https://ep-1.com', 'https://ep-2.com', 'https://ep-3.com']
  const ordered = tracker.order(endpoints)
  assert.deepEqual(ordered, endpoints)
})

test('EndpointHealthTracker: failing endpoint is demoted to tail', () => {
  const tracker = new EndpointHealthTracker(60_000)
  const endpoints = ['https://ep-1.com', 'https://ep-2.com', 'https://ep-3.com']
  tracker.markFailure('https://ep-1.com')

  const ordered = tracker.order(endpoints)
  assert.deepEqual(ordered, ['https://ep-2.com', 'https://ep-3.com', 'https://ep-1.com'])
})

test('EndpointHealthTracker: failure expires after observation window', () => {
  const tracker = new EndpointHealthTracker(60_000)
  const endpoints = ['https://ep-1.com', 'https://ep-2.com']
  const t0 = 100_000
  tracker.markFailure('https://ep-1.com', t0)

  // 30s later: still failing
  assert.deepEqual(tracker.order(endpoints, t0 + 30_000), ['https://ep-2.com', 'https://ep-1.com'])

  // 61s later: recovered
  assert.deepEqual(tracker.order(endpoints, t0 + 61_000), ['https://ep-1.com', 'https://ep-2.com'])
})

test('EndpointHealthTracker: markSuccess restores health immediately', () => {
  const tracker = new EndpointHealthTracker(60_000)
  const endpoints = ['https://ep-1.com', 'https://ep-2.com']
  tracker.markFailure('https://ep-1.com')
  assert.equal(tracker.isHealthy('https://ep-1.com'), false)

  tracker.markSuccess('https://ep-1.com')
  assert.equal(tracker.isHealthy('https://ep-1.com'), true)
  assert.deepEqual(tracker.order(endpoints), endpoints)
})

test('EndpointHealthTracker: isolated instances do not share state', () => {
  const tracker1 = new EndpointHealthTracker(60_000)
  const tracker2 = new EndpointHealthTracker(60_000)
  const endpoints = ['https://ep-1.com', 'https://ep-2.com']

  tracker1.markFailure('https://ep-1.com')
  assert.deepEqual(tracker1.order(endpoints), ['https://ep-2.com', 'https://ep-1.com'])
  assert.deepEqual(tracker2.order(endpoints), ['https://ep-1.com', 'https://ep-2.com'])
})
