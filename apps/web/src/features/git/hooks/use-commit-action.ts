import { useGitState } from "../state"
import { useCommitMutation } from "./use-commit-mutation"
import { useCommitPending } from "./use-commit-pending"

export function useCommitAction(rootPath: string, stagedCount: number) {
  const message = useGitState((state) => state.commitMessage)
  const setMessage = useGitState((state) => state.setCommitMessage)
  const resetMessage = useGitState((state) => state.resetCommitMessage)
  const commit = useCommitMutation(rootPath)
  const isPending = useCommitPending(rootPath)
  const trimmedMessage = message.trim()
  const canSubmit = trimmedMessage.length > 0 && stagedCount > 0

  function submit() {
    if (!canSubmit) return
    if (isPending) return

    commit.mutate(trimmedMessage, {
      onSuccess: resetMessage,
    })
  }

  return {
    canSubmit,
    isPending,
    message,
    setMessage,
    submit,
  }
}
