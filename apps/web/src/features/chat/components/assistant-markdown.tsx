import { useEditorColorTheme } from '@/features/editor/hooks/use-editor-color-theme'
import { cjk } from '@streamdown/cjk'
import { math } from '@streamdown/math'
import { mermaid } from '@streamdown/mermaid'
import { cn } from '@workspace/ui/lib/utils'
import { useMemo, type ClipboardEvent, type ComponentProps } from 'react'
import { Streamdown, type Components } from 'streamdown'

import { useOpenFileReference } from '../hooks/use-open-file-reference'
import { normalizeAgentMarkdown } from '../lib/agent-markdown'
import { chatMarkdownClipboardPayload } from '../lib/markdown-clipboard'
import { remarkFileLinkChips } from '../lib/markdown-file-link-chips'
import { remarkNormalizeListItemIndentation } from '../lib/markdown-list-indentation'
import {
  createStreamdownEditorCodePlugin,
  streamdownEditorThemeKey,
  streamdownThemesForEditorTheme,
} from '../lib/streamdown-editor-theme'
import { MarkdownCodeHighlighterContext } from '../providers/markdown-code-highlighter-context'
import { MarkdownFileLinkContext } from '../providers/markdown-file-link-context'
import { AssistantMarkdownCodeBlock } from './assistant-markdown-code-block'
import { AssistantMarkdownInlineCode } from './assistant-markdown-inline-code'

const markdownComponents = { inlineCode: AssistantMarkdownInlineCode } as unknown as Components
type StreamdownProps = ComponentProps<typeof Streamdown>

export function AssistantMarkdown({
  className,
  streaming = false,
  text,
}: {
  className?: string
  streaming?: boolean
  text: string
}) {
  const { colorMode, editorTheme } = useEditorColorTheme()
  const { openFileReference, rootPath } = useOpenFileReference()
  const streamdownThemes = useMemo(
    () => streamdownThemesForEditorTheme(editorTheme, colorMode),
    [colorMode, editorTheme],
  )
  const codePlugin = useMemo(
    () => createStreamdownEditorCodePlugin(streamdownThemes, editorTheme),
    [editorTheme, streamdownThemes],
  )
  const streamdownPlugins = useMemo(
    () => ({
      cjk,
      code: codePlugin,
      math,
      mermaid,
      // Mermaid stays on Streamdown's diagram path; every other grammar renders
      // through the chat's own cached, streaming-aware code block.
      renderers: [
        {
          component: AssistantMarkdownCodeBlock,
          language: codePlugin.getSupportedLanguages().filter((language) => language !== 'mermaid'),
        },
      ],
    }),
    [codePlugin],
  )
  const themeKey = streamdownEditorThemeKey(editorTheme, colorMode)
  const highlighter = useMemo(
    () => ({
      highlight: (
        input: { readonly code: string; readonly language: string },
        onResult: Parameters<typeof codePlugin.highlight>[1],
      ) =>
        codePlugin.highlight(
          {
            code: input.code,
            language: input.language as Parameters<typeof codePlugin.highlight>[0]['language'],
            themes: streamdownThemes,
          },
          onResult,
        ),
      themeKey,
    }),
    [codePlugin, streamdownThemes, themeKey],
  )
  const fileLinkActions = useMemo(
    () => ({ openFileReference, rootPath }),
    [openFileReference, rootPath],
  )
  const remarkPlugins = useMemo(
    () => [remarkNormalizeListItemIndentation, remarkFileLinkChips(rootPath)],
    [rootPath],
  )
  const renderedText = useMemo(() => normalizeAgentMarkdown(text), [text])

  // Re-emit the rendered view as markdown so copying a selection keeps links,
  // emphasis, lists and fences instead of flattening to text.
  function handleCopy(event: ClipboardEvent<HTMLDivElement>) {
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed) return

    const payload = chatMarkdownClipboardPayload(selection)
    if (!payload) return

    event.preventDefault()
    event.clipboardData.setData('text/plain', payload.text)
    event.clipboardData.setData('text/html', payload.html)
  }

  return (
    <div className='min-w-0' data-chat-markdown='true' onCopy={handleCopy}>
      <MarkdownFileLinkContext value={fileLinkActions}>
        <MarkdownCodeHighlighterContext value={highlighter}>
          <Streamdown
            animated={streaming}
            caret={streaming ? 'block' : undefined}
            className={cn(
              'max-w-full min-w-0 break-words whitespace-pre-wrap [&_[data-streamdown=code-block-body]]:!border-0 [&_[data-streamdown=code-block]]:max-w-full [&_[data-streamdown=code-block]]:!border-0 [&_[data-streamdown=code-block]]:!bg-transparent [&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
              className,
            )}
            components={markdownComponents}
            isAnimating={streaming}
            mode='streaming'
            plugins={streamdownPlugins as unknown as StreamdownProps['plugins']}
            remarkPlugins={remarkPlugins}
            shikiTheme={streamdownThemes as unknown as StreamdownProps['shikiTheme']}
          >
            {renderedText}
          </Streamdown>
        </MarkdownCodeHighlighterContext>
      </MarkdownFileLinkContext>
    </div>
  )
}
