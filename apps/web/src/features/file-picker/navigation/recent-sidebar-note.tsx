import type { ReactNode } from 'react'

export function RecentSidebarNote({ children }: { children: ReactNode }) {
  return (
    <div className='text-muted-foreground/80 compact:px-1.5 compact:py-0.5 px-2 py-1 text-xs'>
      {children}
    </div>
  )
}
