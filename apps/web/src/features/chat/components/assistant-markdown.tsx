import { useEditorColorTheme } from '@/features/editor/hooks/use-editor-color-theme'
import { cjk } from '@streamdown/cjk'
import { math } from '@streamdown/math'
import { mermaid } from '@streamdown/mermaid'
import { cn } from '@workspace/ui/lib/utils'
import { useMemo } from 'react'
import { Streamdown, type Components } from 'streamdown'

import { normalizeAgentMarkdown } from '../lib/agent-markdown'
import {
  createStreamdownEditorCodePlugin,
  streamdownThemesForEditorTheme,
} from '../lib/streamdown-editor-theme'
import { AssistantMarkdownStreamingCode } from './assistant-markdown-streaming-code'

const baseStreamdownPlugins = { cjk, math, mermaid }
const streamingComponents = {
  code: AssistantMarkdownStreamingCode,
} satisfies Components

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
  const streamdownThemes = useMemo(
    () => streamdownThemesForEditorTheme(editorTheme, colorMode),
    [colorMode, editorTheme],
  )
  const streamdownPlugins = useMemo(
    () => ({
      ...baseStreamdownPlugins,
      code: createStreamdownEditorCodePlugin(streamdownThemes, editorTheme),
    }),
    [editorTheme, streamdownThemes],
  )
  const renderedText = useMemo(() => normalizeAgentMarkdown(text), [text])

  return (
    <Streamdown
      animated={streaming}
      caret={streaming ? 'block' : undefined}
      className={cn(
        'max-w-full min-w-0 break-words whitespace-pre-wrap [&_[data-streamdown=code-block-body]]:!border-0 [&_[data-streamdown=code-block]]:max-w-full [&_[data-streamdown=code-block]]:!border-0 [&_[data-streamdown=code-block]]:!bg-transparent [&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
        className,
      )}
      components={streaming ? streamingComponents : undefined}
      isAnimating={streaming}
      mode='streaming'
      plugins={streamdownPlugins}
      shikiTheme={streamdownThemes}
    >
      {renderedText}
    </Streamdown>
  )
}
