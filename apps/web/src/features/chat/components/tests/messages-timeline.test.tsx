import { fireEvent, screen } from '@testing-library/react'
import { messageIdSchema, type OrchestrationMessage } from '@workspace/contracts'
import * as v from 'valibot'
import { afterEach, beforeEach } from 'vitest'

import { MessagesTimeline } from '@/features/chat/components/messages-timeline'
import { ChatTimelineActionsProvider } from '@/features/chat/providers/timeline-actions-provider'
import type { ChatThread } from '@/features/chat/state/chat-projection-store'
import { EditorStateProvider } from '@/features/editor/editor-state-provider'
import { TIMELINE_ANCHOR_OFFSET_PX } from '@/features/chat/utils/timeline-scroll-anchoring'
import { expect, test } from '../../../../../test/fixtures'
import { chatMessage, thread as threadFactory } from '../../../../../test/factories/chat'
import { renderWithProviders } from '../../../../../test/render'

const VIEWPORT_HEIGHT = 600
const ROW_HEIGHT = 80

// happy-dom has no layout engine, so the handful of numbers the scroll decisions
// read are stubbed. Everything else — the virtualizer, the listeners, the
// follow-mode machine — is the real thing.
let clientHeight = VIEWPORT_HEIGHT
// Null means "derive it from the virtualized content", which is what a real
// scroll container does; the gesture tests override it to fake a long history.
let scrollHeightOverride: number | null = null

// happy-dom declares each of these on a different prototype in the chain, and
// the nearer one wins, so they have to be replaced where they actually live.
const originalClientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight')
const originalOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')
const originalScrollHeight = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollHeight')
const originalRect = Object.getOwnPropertyDescriptor(Element.prototype, 'getBoundingClientRect')

beforeEach(() => {
  clientHeight = VIEWPORT_HEIGHT
  scrollHeightOverride = null
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get: () => clientHeight,
  })
  // The virtualizer sizes its scroll box from offsetHeight, and renders nothing
  // at all while that is zero.
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get(this: HTMLElement) {
      return this.hasAttribute('data-index') ? ROW_HEIGHT : clientHeight
    },
  })
  Object.defineProperty(Element.prototype, 'scrollHeight', {
    configurable: true,
    get(this: Element) {
      if (scrollHeightOverride !== null) return scrollHeightOverride

      return virtualContentHeight(this)
    },
  })
  Object.defineProperty(Element.prototype, 'getBoundingClientRect', {
    configurable: true,
    value(this: Element) {
      // Virtualized rows report a fixed height; everything else is viewport
      // sized, which is what the virtualizer measures its scroll box against.
      return stubRect(this.hasAttribute('data-index') ? ROW_HEIGHT : clientHeight)
    },
    writable: true,
  })
})

afterEach(() => {
  restoreLayoutProperty(HTMLElement.prototype, 'clientHeight', originalClientHeight)
  restoreLayoutProperty(HTMLElement.prototype, 'offsetHeight', originalOffsetHeight)
  restoreLayoutProperty(Element.prototype, 'scrollHeight', originalScrollHeight)
  restoreLayoutProperty(Element.prototype, 'getBoundingClientRect', originalRect)
})

test('the jump-to-latest control stays out of the way while the transcript follows', () => {
  renderTimeline([userMessage('u1', 'First question')])

  expect(screen.getByText('First question')).toBeInTheDocument()
  expect(jumpToLatest()).toHaveClass('opacity-0')
})

test('scrolling up mid-stream stops the transcript following', () => {
  renderTimeline([userMessage('u1', 'First question')])
  scrollHeightOverride = 4000

  fireEvent.wheel(transcript(), { deltaY: -140 })

  expect(jumpToLatest()).not.toHaveClass('opacity-0')
})

test('an upward wheel with nothing above to read keeps following', () => {
  renderTimeline([userMessage('u1', 'First question')])
  scrollHeightOverride = VIEWPORT_HEIGHT - 40

  fireEvent.wheel(transcript(), { deltaY: -140 })

  expect(jumpToLatest()).toHaveClass('opacity-0')
})

test('wheeling down toward the live edge is not a navigation gesture', () => {
  renderTimeline([userMessage('u1', 'First question')])
  scrollHeightOverride = 4000

  fireEvent.wheel(transcript(), { deltaY: 140 })

  expect(jumpToLatest()).toHaveClass('opacity-0')
})

test('jumping to the latest message re-arms follow', () => {
  renderTimeline([userMessage('u1', 'First question')])
  scrollHeightOverride = 4000
  fireEvent.wheel(transcript(), { deltaY: -140 })

  fireEvent.click(jumpToLatest())

  expect(jumpToLatest()).toHaveClass('opacity-0')
})

test('sending a message reserves room so it can sit at the top', () => {
  const { rerender } = renderTimeline([userMessage('u1', 'First question')])
  // An opened thread reserves nothing: its content ends where its last row does.
  expect(contentHeight()).toBeLessThan(2 * ROW_HEIGHT)

  rerender(timelineOf([userMessage('u1', 'First question'), userMessage('u2', 'Second question')]))

  // The sent message now has a viewport's worth of space beneath it to park
  // against — a transcript that pinned to the bottom would reserve nothing.
  expect(contentHeight()).toBeGreaterThan(VIEWPORT_HEIGHT)
})

test('sending a message parks it at the top instead of pinning to the bottom', () => {
  const history = conversation(13)
  const { rerender } = renderTimeline(history)
  fireEvent.scroll(transcript())
  // An opened thread sits at the live edge: its last row is down at the bottom.
  expect(rowOffsetInViewport(history.length - 1)).toBeGreaterThan(VIEWPORT_HEIGHT / 2)

  const sent = [...history, userMessage('u14', 'Fourteenth question')]
  rerender(timelineOf(sent))
  fireEvent.scroll(transcript())

  expect(rowOffsetInViewport(sent.length - 1)).toBe(TIMELINE_ANCHOR_OFFSET_PX)
})

function transcript() {
  return screen.getByRole('log', { name: 'Messages' })
}

/** Where a virtualized row's top sits relative to the viewport top, in pixels. */
function rowOffsetInViewport(index: number) {
  const row = transcript().querySelector(`[data-index="${index}"]`)
  if (!(row instanceof HTMLElement)) return null

  const translated = /translateY\((-?[\d.]+)px\)/.exec(row.style.transform)
  if (!translated?.[1]) return null

  return Number.parseFloat(translated[1]) - transcript().scrollTop
}

function virtualContentHeight(element: Element) {
  const content = element.firstElementChild
  if (!(content instanceof HTMLElement)) return 0

  return Number.parseFloat(content.style.height) || 0
}

function conversation(count: number) {
  return Array.from({ length: count }, (_unused, index) =>
    userMessage(`u${index + 1}`, `Question ${index + 1}`),
  )
}

function jumpToLatest() {
  return screen.getByRole('button', { name: 'Scroll to latest message' })
}

function contentHeight() {
  return virtualContentHeight(transcript())
}

function userMessage(id: string, text: string): OrchestrationMessage {
  const ordinal = Number.parseInt(id.slice(1), 10)

  return chatMessage({
    createdAt: new Date(Date.UTC(2026, 4, 28, 0, 0, ordinal)).toISOString(),
    id: v.parse(messageIdSchema, id),
    role: 'user',
    text,
  })
}

function timelineOf(messages: readonly OrchestrationMessage[]) {
  const thread: ChatThread = threadFactory({
    latestTurn: null,
    messages: [...messages],
  })

  // Message rows reach for the editor stores through their real providers, so
  // the timeline is mounted under the same ones the app gives it.
  return (
    <EditorStateProvider>
      <ChatTimelineActionsProvider revertToCheckpoint={() => {}}>
        <MessagesTimeline optimisticMessages={[]} thread={thread} />
      </ChatTimelineActionsProvider>
    </EditorStateProvider>
  )
}

function renderTimeline(messages: readonly OrchestrationMessage[]) {
  return renderWithProviders(timelineOf(messages))
}

function stubRect(height: number): DOMRect {
  return {
    bottom: height,
    height,
    left: 0,
    right: 800,
    toJSON: () => ({}),
    top: 0,
    width: 800,
    x: 0,
    y: 0,
  }
}

function restoreLayoutProperty(
  target: object,
  name: string,
  descriptor: PropertyDescriptor | undefined,
) {
  if (!descriptor) {
    Reflect.deleteProperty(target, name)
    return
  }

  Object.defineProperty(target, name, descriptor)
}
