export function DebugPanel({ stateEvents }: { readonly stateEvents: readonly string[] }) {
  return (
    <aside
      aria-label='Shell proof drag debug log'
      className='bg-card/95 border-border text-muted-foreground absolute right-3 bottom-3 z-30 flex max-h-56 w-96 max-w-[calc(100%-1.5rem)] flex-col overflow-hidden rounded-md border shadow-lg'
      role='log'
    >
      <div className='border-border text-foreground shrink-0 border-b px-3 py-2 text-xs font-medium'>
        Drag debug
      </div>
      <div className='min-h-0 flex-1 overflow-auto p-2 text-[11px] leading-5 tabular-nums'>
        {stateEvents.length > 0 ? (
          stateEvents.map((event) => (
            <div className='truncate' key={event}>
              {event}
            </div>
          ))
        ) : (
          <div>No drag events</div>
        )}
      </div>
    </aside>
  )
}
