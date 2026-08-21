import type { EditorPlugin, EditorTheme, EditorViewContributionContext } from '@singapor/core'
import { HOVER_REQUEST_DEBOUNCE_MS, createTooltipController } from '@singapor/lsp-plugin/tooltip'

import type { DiffQueryTarget } from '@/features/editor/utils/diff-language-query'

export type DiffHoverOptions = {
  /** Decides whether this point may be asked about, and where it is in the file. */
  readonly resolve: (offset: number) => DiffQueryTarget
  /** Issues the request. Resolves to markup, or null when there is nothing to show. */
  readonly hover: (target: Extract<DiffQueryTarget, { kind: 'ask' }>) => Promise<string | null>
  readonly theme: () => EditorTheme | null
}

/**
 * Hover over a diff row, answered by a language server that already holds the file.
 *
 * Owns its tooltip and its pointer handling, and owns no document and no connection. Everything
 * that could be WRONG — whether this point is a real line of a real file, and whether that file is
 * still the text the server holds — lives behind `resolve`, so there is one place to get it right
 * rather than one per feature. That is the shape both prior arts missed: VS Code ships an enabled,
 * permanently no-opping "Go to definition" on `git:` documents, and Zed guards deleted-hunk
 * positions in two files and not in hover.
 *
 * The cursor follows the same answer, so a row that cannot be asked about does not look like one
 * that can.
 */
export function createDiffHoverPlugin(options: DiffHoverOptions): EditorPlugin {
  return {
    name: 'platform-diff-hover',
    activate: (context) =>
      context.registerViewContribution({
        createContribution: (viewContext) => createContribution(viewContext, options),
      }),
  }
}

function createContribution(context: EditorViewContributionContext, options: DiffHoverOptions) {
  const element = context.scrollElement
  const tooltip = createTooltipController({
    document: element.ownerDocument,
    reentryElement: element,
    // The scroll element carries the `--editor-*` block, so the tooltip inherits whichever theme
    // the diff is currently painted in.
    themeSource: element,
  })
  let timer: ReturnType<typeof setTimeout> | null = null
  let generation = 0

  const cancel = (): void => {
    if (timer !== null) clearTimeout(timer)
    timer = null
    // Bumped so a reply already in flight cannot land after the pointer has moved on.
    generation += 1
  }

  const handleMouseMove = (event: MouseEvent): void => {
    cancel()
    const offset = context.textOffsetFromPoint(event.clientX, event.clientY)
    if (offset === null) return tooltip.scheduleHide()

    const target = options.resolve(offset)
    element.style.cursor = target.kind === 'ask' ? '' : 'default'
    if (target.kind !== 'ask') return tooltip.scheduleHide()

    const current = generation
    timer = setTimeout(() => {
      timer = null
      void options
        .hover(target)
        .then((markup) => {
          if (current !== generation) return
          if (!markup) return tooltip.scheduleHide()

          const anchor = context.getRangeClientRect(offset, offset)
          if (!anchor) return tooltip.scheduleHide()

          tooltip.show({ anchor, diagnostics: [], hoverText: markup, theme: options.theme() })
        })
        .catch(() => tooltip.hide())
    }, HOVER_REQUEST_DEBOUNCE_MS)
  }

  const handleLeave = (): void => {
    cancel()
    tooltip.scheduleHide()
  }

  element.addEventListener('mousemove', handleMouseMove)
  element.addEventListener('mouseleave', handleLeave)

  return {
    update: () => undefined,
    dispose: () => {
      cancel()
      element.removeEventListener('mousemove', handleMouseMove)
      element.removeEventListener('mouseleave', handleLeave)
      element.style.cursor = ''
      tooltip.dispose()
    },
  }
}
