export function KeybindingRow({ command, keys }: { command: string; keys: string | null }) {
  return (
    <div className='border-border flex items-center gap-3 border-b px-3 py-2 last:border-b-0'>
      <span className='text-foreground min-w-0 flex-1 truncate text-sm'>{command}</span>
      <span className='text-muted-foreground font-mono text-xs'>{keys ?? 'Unbound'}</span>
    </div>
  )
}
