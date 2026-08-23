export function EmptyRow({ children }: { children: string }) {
  return (
    <p className='text-muted-foreground compact:px-2 compact:py-3 px-3 py-4 text-xs'>{children}</p>
  )
}
