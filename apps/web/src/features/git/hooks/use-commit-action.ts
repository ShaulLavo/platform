import { useEditorCommands } from '@/features/editor/state/editor-commands'
import { useGitState } from '../state'
import { useCommitMutation } from './use-commit-mutation'
import { useCommitPending } from './use-commit-pending'

export function useCommitAction(rootPath: string) {
  const { discardCachedEditorDocument, selectFile } = useEditorCommands()
  const message = useGitState((state) => state.commitMessage)
  const setMessage = useGitState((state) => state.setCommitMessage)
  const resetMessage = useGitState((state) => state.resetCommitMessage)
  const commit = useCommitMutation(rootPath)
  const isPending = useCommitPending(rootPath)
  const trimmedMessage = message.trim()

  function submit() {
    if (isPending) return

    commit.mutate(trimmedMessage, {
      onSuccess: (result) => {
        if (result.kind === 'message-file') {
          discardCachedEditorDocument(result.path)
          // TODO: when save is implemented, saving COMMIT_EDITMSG should complete or abort the git commit.
          selectFile(result.path)
          return
        }

        resetMessage()
      },
    })
  }

  return {
    isPending,
    message,
    setMessage,
    submit,
  }
}
