import { CodeBlockCopyButton } from 'streamdown'

import { AssistantMarkdownCodeBody } from './assistant-markdown-code-body'
import { MarkdownRenderErrorBoundary } from './markdown-render-error-boundary'

/**
 * Registered as a Streamdown custom renderer for every highlightable language,
 * which hands us the raw fence text plus whether it is still streaming — the one
 * signal Streamdown's own code component never exposes to a `components` override.
 */
export function AssistantMarkdownCodeBlock({
  code,
  isIncomplete = false,
  language,
}: {
  readonly code: string
  readonly isIncomplete?: boolean
  readonly language: string
}) {
  const text = trimTrailingNewlines(code)

  return (
    <div
      className='border-border bg-sidebar my-4 flex w-full min-w-0 flex-col gap-2 rounded-md border p-2'
      data-incomplete={isIncomplete || undefined}
      data-language={language}
      data-streamdown='code-block'
    >
      <div
        className='text-muted-foreground flex h-8 items-center justify-between text-xs'
        data-language={language}
        data-streamdown='code-block-header'
      >
        <span className='ml-1 font-mono lowercase'>{language}</span>
        <CodeBlockCopyButton code={text} />
      </div>
      <MarkdownRenderErrorBoundary
        fallback={
          <pre
            className='overflow-x-auto rounded-sm bg-transparent p-2 text-xs leading-5'
            data-streamdown='code-block-body'
          >
            <code className='font-mono'>{text}</code>
          </pre>
        }
        language={language}
      >
        <AssistantMarkdownCodeBody code={text} incomplete={isIncomplete} language={language} />
      </MarkdownRenderErrorBoundary>
    </div>
  )
}

function trimTrailingNewlines(value: string) {
  return value.replace(/\n+$/u, '')
}
