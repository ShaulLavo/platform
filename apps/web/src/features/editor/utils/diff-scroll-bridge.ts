import type { EditorPlugin, EditorViewContributionUpdateKind } from '@singapor/core'

export type DiffScrollPosition = {
  readonly top: number
  readonly left: number
}

/** The update kinds that can move the viewport. Anything else cannot have scrolled the pane. */
const SCROLL_KINDS = new Set<EditorViewContributionUpdateKind>(['viewport', 'layout'])

/**
 * Reports where a pane has scrolled to, so the host can mirror it onto the other one.
 *
 * Split-pane scroll sync is host work: `EditorViewContributionContext.setScrollTop` is
 * vertical-only, and a diff has to mirror both axes, which only `Editor.setScrollPosition` can do.
 * The host still needs to hear about a scroll, and a view contribution's `update` hook is where the
 * editor already announces one — `Editor.handleViewportChange` drives it on every scroll frame.
 *
 * It has to be that hook and not a `scroll` listener on the element, which is the obvious thing to
 * reach for and is wrong twice over. The virtualizer redefines `scrollTop` on the scroll element to
 * return its own *logical* offset, and it updates that offset in a `requestAnimationFrame` it
 * schedules from the very same scroll event — so a listener reads the offset from before the scroll
 * it is being told about. `Editor.getScrollPosition()` reads the same field and is stale in exactly
 * the same way. The pane would then be mirrored one frame behind, and any gesture whose whole delta
 * arrives in a single event — a click on the scrollbar track, a keyboard page — would move one pane
 * and never the other, leaving the two silently out of step until the next gesture.
 *
 * `snapshot.viewport` is folded in before contributions are updated, so it is the one reading that
 * is true at the time we are told.
 */
export function createDiffScrollBridgePlugin(
  onScroll: (position: DiffScrollPosition) => void,
): EditorPlugin {
  return {
    name: 'platform-diff-scroll-bridge',
    activate: (context) =>
      context.registerViewContribution({
        createContribution: () => ({
          update: (snapshot, kind) => {
            if (!SCROLL_KINDS.has(kind)) return

            onScroll({ left: snapshot.viewport.scrollLeft, top: snapshot.viewport.scrollTop })
          },
          dispose: () => undefined,
        }),
      }),
  }
}
