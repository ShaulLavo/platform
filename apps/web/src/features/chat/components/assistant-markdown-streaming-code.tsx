import { cn } from '@workspace/ui/lib/utils'
import type { ComponentProps, ReactNode } from 'react'

type AssistantMarkdownStreamingCodeProps = ComponentProps<'code'> & {
  'data-block'?: unknown
  node?: unknown
}

export function AssistantMarkdownStreamingCode({
  children,
  className,
  node,
  ...props
}: AssistantMarkdownStreamingCodeProps) {
  void node

  const block = Object.hasOwn(props, 'data-block')
  const codeProps = cleanCodeProps(props)
  if (!block) {
    return (
      <code
        className={cn('rounded bg-muted px-1.5 py-0.5 font-mono text-sm', className)}
        {...codeProps}
      >
        {children}
      </code>
    )
  }

  const language = languageFromClassName(className)
  const code = codeTextFromChildren(children)

  return (
    <div
      className='border-border bg-sidebar my-4 flex w-full flex-col gap-2 rounded-md border p-2'
      data-incomplete='true'
      data-language={language}
      data-streamdown='code-block'
    >
      <div
        className='text-muted-foreground flex h-8 items-center text-xs'
        data-language={language}
        data-streamdown='code-block-header'
      >
        <span className='ml-1 font-mono lowercase'>{language}</span>
      </div>
      <pre
        className='overflow-x-auto rounded-sm bg-transparent p-2 text-xs leading-5'
        data-streamdown='code-block-body'
      >
        <code className={cn('font-mono', className)} {...codeProps}>
          {code}
        </code>
      </pre>
    </div>
  )
}

function cleanCodeProps(
  props: Omit<AssistantMarkdownStreamingCodeProps, 'children' | 'className'>,
) {
  const codeProps = { ...props }

  delete codeProps['data-block']

  return codeProps
}

function languageFromClassName(className: string | undefined) {
  const match = className?.match(/(?:^|\s)language-([^\s]+)/u)

  return match?.[1] ?? 'text'
}

function codeTextFromChildren(children: ReactNode): string {
  if (typeof children === 'string') return trimTrailingNewlines(children)
  if (typeof children === 'number') return String(children)
  if (!Array.isArray(children)) return ''

  return trimTrailingNewlines(children.map(codeTextFromChildren).join(''))
}

function trimTrailingNewlines(value: string) {
  return value.replace(/\n+$/u, '')
}
