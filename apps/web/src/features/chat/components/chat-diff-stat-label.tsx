export function ChatDiffStatLabel({
  additions,
  deletions,
  showParentheses = false,
}: {
  additions: number
  deletions: number
  showParentheses?: boolean
}) {
  return (
    <>
      {showParentheses ? <span className='text-muted-foreground/70'>(</span> : null}
      <span className='text-emerald-600 dark:text-emerald-400'>+{additions}</span>
      <span className='text-muted-foreground/70 mx-0.5'>/</span>
      <span className='text-red-600 dark:text-red-400'>-{deletions}</span>
      {showParentheses ? <span className='text-muted-foreground/70'>)</span> : null}
    </>
  )
}
