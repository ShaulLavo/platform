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
      <span className='text-diff-added tabular-nums'>+{additions}</span>
      <span className='text-muted-foreground/70 mx-0.5'>/</span>
      <span className='text-diff-removed tabular-nums'>-{deletions}</span>
      {showParentheses ? <span className='text-muted-foreground/70'>)</span> : null}
    </>
  )
}
