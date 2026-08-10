import { ChatCircleIcon, XIcon } from '@phosphor-icons/react'
import type { DiffFile, DiffRenderRow } from '@singapor/diff'
import { Button } from '@workspace/ui/components/button'
import { useEffect, useRef, useState, type RefObject } from 'react'

import { useAttachToComposer } from '@/features/chat/hooks/use-attach-to-composer'
import {
  diffLineAddress,
  diffLineAddressLabel,
  diffLineSelectionText,
  diffPaneRows,
  diffRowsForAddress,
  diffRowTypeClassName,
  selectedDiffRows,
  toggleExpandedHunk,
  type DiffLineAddress,
  type DiffPaneSide,
} from '../utils/diff-line-selection'

type RowTarget = {
  readonly rowIndex: number
  readonly side: DiffPaneSide
}

/**
 * Turns a line range dragged out in the diff into something the agent can act
 * on, and hands it to the composer.
 *
 * The diff view draws its rows itself and keeps its selection private, so what
 * is read back from it is the one thing it does publish: the row index on each
 * mounted row element. Everything after that — which side of the diff a row is
 * on, which lines it is — is derived from the same projection the view rendered,
 * and cross-checked against the row's own type class before it is trusted.
 */
export function DiffLineCommentAction({
  file,
  hostRef,
}: {
  file: DiffFile
  hostRef: RefObject<HTMLElement | null>
}) {
  const { attachText } = useAttachToComposer()
  const [address, setAddress] = useState<DiffLineAddress | null>(null)
  // Neither belongs in state: the expansion mirror never changes what is drawn,
  // and re-rendering mid-drag on the anchor would only throw the drag away.
  const expandedHunks = useRef<ReadonlySet<number>>(new Set())
  const anchor = useRef<RowTarget | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const rowsFor = (side: DiffPaneSide) => diffPaneRows(file, side, expandedHunks.current)

    const onMouseDown = (event: MouseEvent) => {
      if (event.button !== 0) return

      setAddress(null)
      anchor.current = verifiedRowTarget(event, rowsFor)
    }

    // Capture, so this reads the row under the pointer before the diff view's
    // own click handler re-projects the pane and recycles the row elements.
    const onClick = (event: MouseEvent) => {
      const target = verifiedRowTarget(event, rowsFor)
      if (!target) return

      const row = rowsFor(target.side)[target.rowIndex]
      expandedHunks.current = toggleExpandedHunk(expandedHunks.current, row)
    }

    // On the document because a drag that runs past the last row releases
    // outside the pane, and that is the selection most worth capturing.
    const onMouseUp = (event: MouseEvent) => {
      const start = anchor.current
      anchor.current = null
      if (!start) return

      const head = verifiedRowTarget(event, rowsFor)
      const headRow = head?.side === start.side ? head.rowIndex : start.rowIndex
      const dragged = selectedDiffRows(rowsFor(start.side), start.rowIndex, headRow)
      setAddress(canonicalAddress(diffLineAddress(dragged), rowsFor('stacked')))
    }

    host.addEventListener('click', onClick, true)
    host.addEventListener('mousedown', onMouseDown, true)
    host.ownerDocument.addEventListener('mouseup', onMouseUp)

    return () => {
      host.removeEventListener('click', onClick, true)
      host.removeEventListener('mousedown', onMouseDown, true)
      host.ownerDocument.removeEventListener('mouseup', onMouseUp)
    }
  }, [file, hostRef])

  if (!address) return null

  const ask = () => {
    // Resolved against the stacked projection so the agent gets both sides of
    // the change even when the range was dragged out in one split pane.
    const rows = diffRowsForAddress(diffPaneRows(file, 'stacked', expandedHunks.current), address)
    if (rows.length === 0) return
    if (!attachText('git-diff', diffLineSelectionText(file.path, address, rows))) return

    setAddress(null)
  }

  return (
    <div className='pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-3'>
      <div className='surface-vibrancy border-border pointer-events-auto flex items-center gap-1 rounded-md border p-1 shadow-lg'>
        <span className='text-muted-foreground px-1.5 text-xs tabular-nums'>
          {diffLineAddressLabel(address)}
        </span>
        <Button onClick={ask} size='sm' variant='ghost'>
          <ChatCircleIcon data-icon='inline-start' />
          Ask the agent about these lines
        </Button>
        <Button
          aria-label='Dismiss line selection'
          onClick={() => setAddress(null)}
          size='icon-sm'
          variant='ghost'
        >
          <XIcon />
        </Button>
      </div>
    </div>
  )
}

/**
 * Settles a drag on the address the stacked projection would give it, so the
 * range on the bar is the range that gets sent — a drag through one split pane
 * names only that pane's side until it is resolved against both.
 */
function canonicalAddress(
  address: DiffLineAddress | null,
  stackedRows: readonly DiffRenderRow[],
): DiffLineAddress | null {
  if (!address) return null

  return diffLineAddress(diffRowsForAddress(stackedRows, address))
}

function verifiedRowTarget(
  event: MouseEvent,
  rowsFor: (side: DiffPaneSide) => readonly DiffRenderRow[],
): RowTarget | null {
  const target = event.target
  if (!(target instanceof Element)) return null

  const element = target.closest<HTMLElement>('[data-editor-virtual-row]')
  const side = paneSide(element?.closest('.editor-diff-pane'))
  if (!element || !side) return null

  const rowIndex = Number(element.dataset.editorVirtualRow)
  const row = rowsFor(side)[rowIndex]
  // A projection that no longer describes the pane would address the wrong
  // line, which is worse than offering nothing.
  if (!row || !element.classList.contains(diffRowTypeClassName(row))) return null

  return { rowIndex, side }
}

function paneSide(pane: Element | null | undefined): DiffPaneSide | null {
  if (!pane) return null
  if (pane.classList.contains('editor-diff-pane-old')) return 'old'
  if (pane.classList.contains('editor-diff-pane-new')) return 'new'
  if (pane.classList.contains('editor-diff-pane-stacked')) return 'stacked'

  return null
}
