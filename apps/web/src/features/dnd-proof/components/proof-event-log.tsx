export function ProofEventLog({ events }: { readonly events: readonly string[] }) {
  return (
    <aside className='bg-card border-border text-muted-foreground rounded-md border p-3 text-xs'>
      <div className='text-foreground mb-2 font-medium'>Optimistic model log</div>
      <ol className='space-y-1'>
        {events.map((event, index) => (
          <li key={`${event}-${index}`}>{event}</li>
        ))}
      </ol>
    </aside>
  )
}
