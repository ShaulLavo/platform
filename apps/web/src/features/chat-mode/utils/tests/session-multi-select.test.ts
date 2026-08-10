import { threadIdSchema } from '@workspace/contracts'
import * as v from 'valibot'

import {
  sessionClickIntent,
  threadIdRange,
  toggledThreadIds,
} from '@/features/chat-mode/utils/session-multi-select'
import { expect, test } from '../../../../../test/fixtures'

const threadA = v.parse(threadIdSchema, 'thread-a')
const threadB = v.parse(threadIdSchema, 'thread-b')
const threadC = v.parse(threadIdSchema, 'thread-c')
const order = [threadA, threadB, threadC]

test('a plain click opens the row', () => {
  expect(sessionClickIntent({ ctrlKey: false, metaKey: false, shiftKey: false })).toBe('open')
})

test('the platform modifier toggles a single row', () => {
  expect(sessionClickIntent({ ctrlKey: false, metaKey: true, shiftKey: false })).toBe('toggle')
  expect(sessionClickIntent({ ctrlKey: true, metaKey: false, shiftKey: false })).toBe('toggle')
})

test('shift wins over the toggle modifier so a range keeps growing', () => {
  expect(sessionClickIntent({ ctrlKey: false, metaKey: true, shiftKey: true })).toBe('extend')
})

test('toggling adds a row and takes it back out', () => {
  expect(toggledThreadIds([threadA], threadB)).toEqual([threadA, threadB])
  expect(toggledThreadIds([threadA, threadB], threadA)).toEqual([threadB])
})

test('a range spans the rows between the anchor and the target, either direction', () => {
  expect(threadIdRange(order, threadA, threadC)).toEqual(order)
  expect(threadIdRange(order, threadC, threadA)).toEqual(order)
})

test('a range with no anchor is just the row that was clicked', () => {
  expect(threadIdRange(order, null, threadB)).toEqual([threadB])
})

test('an anchor that has been filtered out of the list spans nothing extra', () => {
  expect(threadIdRange([threadB, threadC], threadA, threadC)).toEqual([threadC])
})
