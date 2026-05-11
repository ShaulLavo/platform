export function HighlightedPreview({
  preview,
  query,
}: {
  preview: string
  query: string
}) {
  const highlight = previewHighlight(preview, query)
  if (!highlight) return <>{preview}</>

  return (
    <>
      {highlight.before}
      <mark className="rounded-sm bg-yellow-200/80 px-0.5 text-yellow-950 dark:bg-yellow-500/30 dark:text-yellow-100">
        {highlight.match}
      </mark>
      {highlight.after}
    </>
  )
}

function previewHighlight(preview: string, query: string) {
  const normalizedPreview = preview.toLocaleLowerCase()
  const normalizedQuery = query.toLocaleLowerCase()
  const index = normalizedPreview.indexOf(normalizedQuery)
  if (index < 0) return null

  const end = index + query.length
  return {
    after: preview.slice(end),
    before: preview.slice(0, index),
    match: preview.slice(index, end),
  }
}
