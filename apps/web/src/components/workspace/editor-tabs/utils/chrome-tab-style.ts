import { cn } from '@workspace/ui/lib/utils'

export const CHROME_TAB_CLOSE_BURST_MS = 45
export const CHROME_TAB_CLOSE_BURST_EASE = 'cubic-bezier(0.23, 1, 0.32, 1)'
export const CHROME_TAB_TRANSITION = `flex-basis ${CHROME_TAB_CLOSE_BURST_MS}ms ${CHROME_TAB_CLOSE_BURST_EASE}, margin-left ${CHROME_TAB_CLOSE_BURST_MS}ms ${CHROME_TAB_CLOSE_BURST_EASE}, max-width ${CHROME_TAB_CLOSE_BURST_MS}ms ${CHROME_TAB_CLOSE_BURST_EASE}, min-width ${CHROME_TAB_CLOSE_BURST_MS}ms ${CHROME_TAB_CLOSE_BURST_EASE}, opacity ${CHROME_TAB_CLOSE_BURST_MS}ms ${CHROME_TAB_CLOSE_BURST_EASE}, width ${CHROME_TAB_CLOSE_BURST_MS}ms ${CHROME_TAB_CLOSE_BURST_EASE}`
export const CHROME_TAB_SLOT_TRANSITION = `max-width ${CHROME_TAB_CLOSE_BURST_MS}ms ${CHROME_TAB_CLOSE_BURST_EASE}, min-width ${CHROME_TAB_CLOSE_BURST_MS}ms ${CHROME_TAB_CLOSE_BURST_EASE}, width ${CHROME_TAB_CLOSE_BURST_MS}ms ${CHROME_TAB_CLOSE_BURST_EASE}`

export function chromeTabRootClassName({
  active,
  className,
}: {
  active: boolean
  className?: string
}) {
  return cn(
    'group group/chrome-tab relative flex items-center overflow-hidden rounded-[6px] text-xs text-muted-foreground/70 outline-none focus-visible:outline-none',
    'transition-colors duration-150 ease-[cubic-bezier(0.23,1,0.32,1)]',
    active ? 'text-foreground' : 'hover:text-foreground/85',
    className,
  )
}
