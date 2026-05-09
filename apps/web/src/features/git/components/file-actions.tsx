import { ArrowBendUpLeftIcon, MinusIcon, PlusIcon } from "@phosphor-icons/react"

import {
  useDiscardPathMutation,
  useStagePathMutation,
  useUnstagePathMutation,
} from "../hooks"
import type { PanelSection } from "../types"
import { RowActionButton } from "./row-action-button"

export function FileActions({
  path,
  section,
}: {
  path: string
  section: PanelSection
}) {
  if (section === "staged") {
    return (
      <div className="pointer-events-none flex opacity-0 transition-opacity group-hover/row:pointer-events-auto group-hover/row:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100">
        <UnstageFileButton path={path} />
      </div>
    )
  }

  return (
    <div className="pointer-events-none flex opacity-0 transition-opacity group-hover/row:pointer-events-auto group-hover/row:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100">
      <DiscardFileButton path={path} />
      <StageFileButton path={path} />
    </div>
  )
}

function StageFileButton({ path }: { path: string }) {
  const stage = useStagePathMutation(path)

  return (
    <RowActionButton
      disabled={stage.isPending}
      label="Stage file"
      onClick={() => stage.mutate()}
    >
      <PlusIcon />
    </RowActionButton>
  )
}

function UnstageFileButton({ path }: { path: string }) {
  const unstage = useUnstagePathMutation(path)

  return (
    <RowActionButton
      disabled={unstage.isPending}
      label="Unstage file"
      onClick={() => unstage.mutate()}
    >
      <MinusIcon />
    </RowActionButton>
  )
}

function DiscardFileButton({ path }: { path: string }) {
  const discard = useDiscardPathMutation(path)

  return (
    <RowActionButton
      disabled={discard.isPending}
      label="Discard file"
      onClick={() => discard.mutate()}
    >
      <ArrowBendUpLeftIcon />
    </RowActionButton>
  )
}
