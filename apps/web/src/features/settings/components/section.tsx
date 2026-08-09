import type { ReactNode } from 'react'

export function Section({
  children,
  description,
  title,
}: {
  children: ReactNode
  description: string
  title: string
}) {
  return (
    <section className='flex flex-col gap-2'>
      <header className='flex flex-col gap-0.5'>
        <h3 className='text-foreground text-sm font-medium'>{title}</h3>
        <p className='text-muted-foreground text-xs'>{description}</p>
      </header>
      <div className='border-border flex flex-col rounded-md border'>{children}</div>
    </section>
  )
}
