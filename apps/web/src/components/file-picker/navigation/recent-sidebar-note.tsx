import type { ReactNode } from 'react'

export function RecentSidebarNote({ children }: { children: ReactNode }) {
  return <div className='text-muted-foreground/80 px-2 py-1 text-xs'>{children}</div>
}
