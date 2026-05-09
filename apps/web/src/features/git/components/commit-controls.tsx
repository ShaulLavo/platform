import { CheckIcon } from "@phosphor-icons/react"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import type { KeyboardEvent } from "react"

import { useCommitAction } from "../hooks"

export function CommitControls({
  branch,
  rootPath,
  stagedCount,
}: {
  branch: string
  rootPath: string
  stagedCount: number
}) {
  const commit = useCommitAction(rootPath, stagedCount)

  function handleCommitKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!event.metaKey && !event.ctrlKey) return
    if (event.key !== "Enter") return

    event.preventDefault()
    commit.submit()
  }

  return (
    <>
      <div className="shrink-0 px-2 pt-1.5">
        <div className="h-8 border border-input bg-background focus-within:border-ring focus-within:ring-1 focus-within:ring-ring/50 dark:bg-input/30">
          <Input
            aria-label="Commit message"
            className="h-full border-0 bg-transparent px-2.5 text-xs font-medium shadow-none focus-visible:border-0 focus-visible:ring-0"
            disabled={commit.isPending}
            onChange={(event) => commit.setMessage(event.currentTarget.value)}
            onKeyDown={handleCommitKeyDown}
            placeholder={`Commit Changes (⌘↵ on "${branch}")`}
            value={commit.message}
          />
        </div>
      </div>
      <div className="shrink-0 px-2 pt-3">
        <Button
          className="h-8 w-full text-sm"
          disabled={!commit.canSubmit || commit.isPending}
          onClick={commit.submit}
          type="button"
          variant="default"
        >
          <CheckIcon className="size-4" />
          Commit
          <span className="text-primary-foreground/65">⌘↵</span>
        </Button>
      </div>
    </>
  )
}
