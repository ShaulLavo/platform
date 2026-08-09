/**
 * Every `git-diff:` document — snapshot and checkpoint alike — is currently
 * unrenderable. `fileBackedDocumentPath` rejects the id so no file snapshot
 * loads, no live document is ever created for one, and `FileEditorBody` falls
 * through to `null`. Selecting such a document opens a correctly titled tab
 * onto an empty pane.
 *
 * Menus that would open one mark the item `unavailable` with this text rather
 * than dispatching into the void. Delete this module and the three call sites
 * when a diff viewer renders these documents again.
 */
export const DIFF_VIEWER_MISSING = 'No diff viewer'
