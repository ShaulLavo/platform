import { Component, type ErrorInfo, type ReactNode } from 'react'

import { log } from '@/lib/client-logging'

type MarkdownRenderErrorBoundaryProps = {
  readonly children: ReactNode
  readonly fallback: ReactNode
  readonly language: string
}

type MarkdownRenderErrorBoundaryState = {
  readonly failed: boolean
}

/**
 * A grammar or theme that trips the highlighter must not take the transcript
 * down with it — the block falls back to plain text and the turn keeps rendering.
 */
export class MarkdownRenderErrorBoundary extends Component<
  MarkdownRenderErrorBoundaryProps,
  MarkdownRenderErrorBoundaryState
> {
  state: MarkdownRenderErrorBoundaryState = { failed: false }

  static getDerivedStateFromError(): MarkdownRenderErrorBoundaryState {
    return { failed: true }
  }

  componentDidCatch(error: unknown, errorInfo: ErrorInfo) {
    log.error({
      action: 'chat.markdown.render_failed',
      area: 'chat',
      componentStack: errorInfo.componentStack ?? null,
      error: error instanceof Error ? error.message : String(error),
      language: this.props.language,
    })
  }

  render() {
    if (this.state.failed) return this.props.fallback

    return this.props.children
  }
}
