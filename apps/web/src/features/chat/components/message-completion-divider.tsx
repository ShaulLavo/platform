export function MessageCompletionDivider({
  completionSummary,
}: {
  completionSummary: string | null
}) {
  return (
    <div className='my-3 flex items-center gap-3'>
      <span className='bg-border h-px flex-1' />
      <span className='border-border bg-background text-muted-foreground/80 rounded-full border px-2.5 py-1 text-[10px] tracking-[0.14em] uppercase'>
        {completionSummary ? `Response • ${completionSummary}` : 'Response'}
      </span>
      <span className='bg-border h-px flex-1' />
    </div>
  )
}
