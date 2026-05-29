import { EditorColorThemeProvider } from '@/features/editor/hooks/use-editor-color-theme'
import type { OrchestrationMessage } from '@workspace/contracts'
import '@workspace/ui/globals.css'
import { useEffect, useState } from 'react'
import { flushSync } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ThemeProvider } from '@/components/theme-provider'
import type { ChatTurnDiffSummary } from '../state/chat-projection-store'
import { MessageBubble } from './message-bubble'

const THEME_STORAGE_KEY = 'platform-message-bubble-browser-theme'
const EXPECTED_DARK_EDITOR_COLORS = [
  'rgb(110, 231, 183)',
  'rgb(253, 230, 138)',
  'rgb(125, 211, 252)',
]
const EXPECTED_DARK_EDITOR_PROPERTY_COLOR = 'rgb(233, 213, 255)'
const EXPECTED_DARK_EDITOR_TYPE_COLOR = 'rgb(125, 211, 252)'

let root: Root | null = null

afterEach(() => {
  if (root) {
    flushSync(() => root?.unmount())
    root = null
  }

  document.body.innerHTML = ''
  localStorage.removeItem(THEME_STORAGE_KEY)
})

describe('MessageBubble browser rendering', () => {
  it('renders incomplete streamed code without highlight tokens', async () => {
    const container = document.createElement('main')
    container.style.width = '720px'
    document.body.append(container)
    root = createRoot(container)

    flushSync(() => {
      root?.render(
        <ThemeProvider defaultTheme='dark' storageKey={THEME_STORAGE_KEY}>
          <EditorColorThemeProvider>
            <MessageBubble
              message={{
                ...assistantCodeMessage,
                streaming: true,
                text: 'Streaming code:\n\n```html\n<!doctype html>\n<html',
              }}
            />
          </EditorColorThemeProvider>
        </ThemeProvider>,
      )
    })

    await vi.waitFor(() => {
      expect(streamdownCodeBlock()?.dataset.incomplete).toBe('true')
      expect(streamdownCodeText()).toContain('<!doctype html>')
      expect(streamdownTokenSpans()).toHaveLength(0)
    })
  })

  it('keeps assistant code highlighting after streaming completion', async () => {
    localStorage.removeItem(THEME_STORAGE_KEY)
    const container = document.createElement('main')
    container.style.width = '720px'
    document.body.append(container)
    root = createRoot(container)

    flushSync(() => {
      root?.render(
        <ThemeProvider defaultTheme='dark' storageKey={THEME_STORAGE_KEY}>
          <EditorColorThemeProvider>
            <StreamingMessageBubble />
          </EditorColorThemeProvider>
        </ThemeProvider>,
      )
    })

    await vi.waitFor(
      () => {
        const palette = streamdownCodePalette()
        if (!palette) throw new Error('Streamdown code tokens did not render')

        expect(streamdownCodeLanguage()).toBe('html')
        expect(streamdownCodeText()).toContain('<!doctype html>')
        expect(streamdownCodeText()).toContain('--bg')
        expect(streamdownCodeBlockStyle()?.backgroundColor).toBe('rgba(0, 0, 0, 0)')
        expect(streamdownCodeBlockStyle()?.borderTopWidth).toBe('0px')
        expect(streamdownCodeBlockBodyStyle()?.borderTopWidth).toBe('0px')
        expect(palette.tokenCount).toBeGreaterThan(4)
        expect(palette.colors.size).toBeGreaterThan(2)
        expect(EXPECTED_DARK_EDITOR_COLORS.some((color) => palette.colors.has(color))).toBe(true)
        expect(streamdownTokenColor((text) => text.trim() === 'head')).toBe(
          EXPECTED_DARK_EDITOR_TYPE_COLOR,
        )
        expect(streamdownTokenColor((text) => text.includes('--bg:'))).toBe(
          EXPECTED_DARK_EDITOR_PROPERTY_COLOR,
        )
        expect(streamdownTokenColor((text) => text.trim() === '--bg')).toBe(
          EXPECTED_DARK_EDITOR_PROPERTY_COLOR,
        )
      },
      { interval: 100, timeout: 15_000 },
    )
  })

  it('renders assistant changed files below assistant markdown', async () => {
    const container = document.createElement('main')
    container.style.width = '720px'
    document.body.append(container)
    root = createRoot(container)

    flushSync(() => {
      root?.render(
        <ThemeProvider defaultTheme='dark' storageKey={THEME_STORAGE_KEY}>
          <EditorColorThemeProvider>
            <MessageBubble
              message={{
                ...assistantCodeMessage,
                text: 'Changed these files:',
              }}
              turnDiffSummary={assistantChangedFilesSummary}
            />
          </EditorColorThemeProvider>
        </ThemeProvider>,
      )
    })

    await vi.waitFor(() => {
      const bodyText = document.body.textContent ?? ''
      expect(bodyText).toContain('Changed files (3)')
      expect(bodyText).toContain('+20')
      expect(bodyText).toContain('-4')
      expect(bodyText).toContain('message-bubble.tsx')
      expect(bodyText).toContain('chat-timeline-items.ts')
      expect(bodyText.indexOf('Changed these files:')).toBeLessThan(
        bodyText.indexOf('Changed files (3)'),
      )
    })
  })
})

const streamingAssistantChunks = [
  'Here is an HTML helper:',
  '\n\n```html',
  '<!doctype html>',
  '\n<html lang="en">',
  '\n<head>',
  '\n<style>',
  '\n:root {',
  '\n  --bg: #111000;',
  '\n  --panel: var(--bg);',
  '\n}',
  '\n</style>',
  '\n</head>',
  '\n</html>',
  '\n```',
] as const

function StreamingMessageBubble() {
  const [text, setText] = useState(streamingAssistantChunks[0])
  const [streaming, setStreaming] = useState(true)

  useEffect(() => {
    const timers = streamingAssistantChunks.slice(1).map((chunk, index) =>
      window.setTimeout(() => {
        setText((currentText) => `${currentText}${chunk}`)
      }, index + 1),
    )
    const completeTimer = window.setTimeout(
      () => setStreaming(false),
      streamingAssistantChunks.length + 2,
    )

    return () => {
      for (const timer of timers) window.clearTimeout(timer)
      window.clearTimeout(completeTimer)
    }
  }, [])

  return <MessageBubble message={{ ...assistantCodeMessage, streaming, text }} />
}

const assistantCodeMessage = {
  attachments: [],
  createdAt: '2026-05-28T00:00:00.000Z',
  id: 'message-browser-assistant',
  role: 'assistant',
  streaming: false,
  text: [
    'Here is a typed helper:',
    '',
    '```ts',
    'const label: string = "hello"',
    'function greet(name: string) {',
    '  return `${label}, ${name}`',
    '}',
    '```',
  ].join('\n'),
  threadId: 'thread-browser',
  turnId: null,
  updatedAt: '2026-05-28T00:00:00.000Z',
} as OrchestrationMessage

const assistantChangedFilesSummary = {
  assistantMessageId: 'message-browser-assistant',
  checkpointRef: 'checkpoint-browser',
  checkpointTurnCount: 1,
  completedAt: '2026-05-28T00:00:02.000Z',
  files: [
    {
      additions: 12,
      deletions: 4,
      kind: 'modified',
      path: 'src/features/chat/components/message-bubble.tsx',
    },
    {
      additions: 6,
      deletions: 0,
      kind: 'modified',
      path: 'src/features/chat/lib/chat-timeline-items.ts',
    },
    {
      additions: 2,
      deletions: 0,
      kind: 'added',
      path: 'src/features/chat/lib/chat-turn-diff-tree.ts',
    },
  ],
  status: 'ready',
  turnId: 'turn-browser',
} as ChatTurnDiffSummary

function streamdownCodeLanguage() {
  return document
    .querySelector('[data-streamdown="code-block-header"]')
    ?.textContent?.trim()
    .toLowerCase()
}

function streamdownCodeText() {
  return document.querySelector('[data-streamdown="code-block-body"]')?.textContent ?? ''
}

function streamdownCodeBlockStyle() {
  const codeBlock = streamdownCodeBlock()
  if (!(codeBlock instanceof HTMLElement)) return null

  return getComputedStyle(codeBlock)
}

function streamdownCodeBlock() {
  const codeBlock = document.querySelector('[data-streamdown="code-block"]')
  if (!(codeBlock instanceof HTMLElement)) return null

  return codeBlock
}

function streamdownCodeBlockBodyStyle() {
  const codeBlockBody = document.querySelector('[data-streamdown="code-block-body"]')
  if (!(codeBlockBody instanceof HTMLElement)) return null

  return getComputedStyle(codeBlockBody)
}

function streamdownCodePalette() {
  const tokenSpans = streamdownTokenSpans()
  if (tokenSpans.length === 0) return null

  const colors = new Set(tokenSpans.map((span) => getComputedStyle(span).color).filter(Boolean))

  return {
    colors,
    tokenCount: tokenSpans.length,
  }
}

function streamdownTokenColor(predicate: (text: string) => boolean) {
  const tokenSpan = streamdownTokenSpans().find((span) => predicate(span.textContent ?? ''))
  return tokenSpan ? getComputedStyle(tokenSpan).color : null
}

function streamdownTokenSpans() {
  const codeBlock = document.querySelector('[data-streamdown="code-block-body"]')
  if (!(codeBlock instanceof HTMLElement)) return []

  return Array.from(codeBlock.querySelectorAll('span')).filter(isStreamdownTokenSpan)
}

function isStreamdownTokenSpan(element: Element): element is HTMLElement {
  return (
    element instanceof HTMLElement && element.style.getPropertyValue('--sdm-c').trim().length > 0
  )
}
