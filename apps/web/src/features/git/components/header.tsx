import {
  ArrowsClockwiseIcon,
  CaretDownIcon,
  CheckIcon,
  DownloadSimpleIcon,
  UploadSimpleIcon,
} from "@phosphor-icons/react"

import {
  useCommitAction,
  useFetchRemoteMutation,
  usePullRemoteMutation,
  usePushRemoteMutation,
} from "../hooks"
import type { RepositoryInfo } from "../types"
import { aheadBehindLabel } from "../utils"
import { ToolbarButton } from "./toolbar-button"

export function Header({
  repository,
  rootPath,
  stagedCount,
}: {
  repository: RepositoryInfo
  rootPath: string
  stagedCount: number
}) {
  return (
    <header className="flex h-9 shrink-0 items-center gap-1 border-b px-2">
      <CaretDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
      <div className="flex min-w-0 flex-1 items-center gap-1">
        <span className="shrink-0 text-sm font-semibold">Changes</span>
        <span className="min-w-0 truncate text-xs font-normal text-muted-foreground">
          {aheadBehindLabel(repository)}
        </span>
      </div>
      <HeaderCommitButton rootPath={rootPath} stagedCount={stagedCount} />
      <FetchToolbarButton rootPath={rootPath} />
      <PullToolbarButton rootPath={rootPath} />
      <PushToolbarButton rootPath={rootPath} />
    </header>
  )
}

function HeaderCommitButton({
  rootPath,
  stagedCount,
}: {
  rootPath: string
  stagedCount: number
}) {
  const commit = useCommitAction(rootPath, stagedCount)

  return (
    <ToolbarButton
      disabled={!commit.canSubmit || commit.isPending}
      label="Commit"
      onClick={commit.submit}
    >
      <CheckIcon />
    </ToolbarButton>
  )
}

function FetchToolbarButton({ rootPath }: { rootPath: string }) {
  const fetchRemote = useFetchRemoteMutation(rootPath)

  return (
    <ToolbarButton
      disabled={fetchRemote.isPending}
      label="Fetch"
      onClick={() => fetchRemote.mutate()}
    >
      <ArrowsClockwiseIcon />
    </ToolbarButton>
  )
}

function PullToolbarButton({ rootPath }: { rootPath: string }) {
  const pullRemote = usePullRemoteMutation(rootPath)

  return (
    <ToolbarButton
      disabled={pullRemote.isPending}
      label="Pull"
      onClick={() => pullRemote.mutate()}
    >
      <DownloadSimpleIcon />
    </ToolbarButton>
  )
}

function PushToolbarButton({ rootPath }: { rootPath: string }) {
  const pushRemote = usePushRemoteMutation(rootPath)

  return (
    <ToolbarButton
      disabled={pushRemote.isPending}
      label="Push"
      onClick={() => pushRemote.mutate()}
    >
      <UploadSimpleIcon />
    </ToolbarButton>
  )
}
