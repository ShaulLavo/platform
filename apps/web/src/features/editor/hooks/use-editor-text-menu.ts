import { editorTextMenu } from '@/features/editor/utils/text-menu'

/**
 * The seam every other menu surface uses to bind feature callbacks into its
 * builder. This one has nothing to bind yet: every item on the editor text menu
 * is a registered command, so `useResolvedMenu` supplies the dispatch and the
 * availability rule, and the builder needs no editor state of its own.
 */
export function useEditorTextMenu() {
  return editorTextMenu()
}
