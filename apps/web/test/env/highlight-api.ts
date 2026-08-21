import { onTestFinished } from 'vitest'

/**
 * happy-dom ships no CSS Custom Highlight API, and the editor registers a selection highlight the
 * moment it mounts — so anything rendering a real `Editor` needs this first.
 *
 * Restores on test exit rather than leaving the stub on `globalThis`, because a worker runs many
 * files: a leaked stub makes a later test that should have skipped highlighting quietly paint, and
 * a leaked `Map` carries one file's highlight names into the next.
 *
 * Typed through `Record<string, unknown>` because `globalThis.CSS` is declared non-optional, so
 * neither installing it nor deleting it type-checks against the real lib definition.
 */
export function stubHighlightApi(): void {
  const globals = globalThis as unknown as Record<string, unknown>
  const hadHighlight = 'Highlight' in globals
  const previousHighlight = globals.Highlight
  const hadCss = 'CSS' in globals

  class HighlightStub extends Set<unknown> {}
  globals.Highlight = HighlightStub
  if (!globals.CSS) globals.CSS = {}
  const css = globals.CSS as Record<string, unknown>
  const hadHighlights = 'highlights' in css
  const previousHighlights = css.highlights
  css.highlights = new Map()

  onTestFinished(() => {
    if (hadHighlight) globals.Highlight = previousHighlight
    else delete globals.Highlight

    if (!hadCss) {
      delete globals.CSS
      return
    }
    if (hadHighlights) css.highlights = previousHighlights
    else delete css.highlights
  })
}
