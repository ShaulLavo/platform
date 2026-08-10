import { LexicalComposer, type InitialConfigType } from '@lexical/react/LexicalComposer'
import type {
  ChatAttachmentUpload,
  InteractionMode,
  ModelSelection,
  RuntimeMode,
} from '@workspace/contracts'
import type { LexicalEditor } from 'lexical'
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { cn } from '@workspace/ui/lib/utils'

import {
  $setChatInputText,
  clearChatInputEditor,
  readChatInputText,
  replaceChatInputEditorRange,
} from '../lib/chat-input-editor-actions'
import {
  chatInputUploadAttachments,
  imageFilesFromTransfer,
  stageChatInputImageFiles,
} from '../lib/chat-input-attachments'
import {
  activeChatInputCommandItem,
  chatInputCommandItemByOffset,
  chatInputCommandItems,
  chatInputCommandMenuEmptyLabel,
  type ChatInputCommandItem,
  type ChatInputTrigger,
} from '../lib/chat-input-logic'
import { useProjectEntrySearch } from '../hooks/use-project-entry-search'
import { ChatModelPickerProvider } from '../providers/model-picker-provider'
import {
  readChatInputDraftPrompt,
  selectChatInputDraftImages,
  useChatInputDraftStore,
  type ChatInputDraftStore,
  type ChatInputDraftTarget,
} from '../state/chat-input-draft-store'
import { ChatInputAttachmentList } from './chat-input-attachment-list'
import { ChatInputActions } from './chat-input-actions'
import { ChatInputCommandMenu } from './chat-input-command-menu'
import { ChatInputEditor } from './chat-input-editor'
import { CHAT_INPUT_EDITOR_NODES } from './chat-input-mention-node'

export type ChatInputSubmitPayload = {
  attachments: ChatAttachmentUpload[]
  interactionMode: InteractionMode
  modelSelection: ModelSelection
  runtimeMode: RuntimeMode
  text: string
}

export function ChatInput({
  busy,
  commandStatusLabel,
  disabled,
  draftKey,
  error,
  interactionMode,
  modelSelection,
  modelSelectionLocked = false,
  onPersistModelSelection,
  onStop,
  onSubmit,
  rootPath,
  runtimeMode,
}: {
  busy: boolean
  commandStatusLabel?: string | null
  disabled: boolean
  draftKey: string
  error: string | null
  interactionMode: InteractionMode
  modelSelection: ModelSelection | null
  modelSelectionLocked?: boolean
  onPersistModelSelection: (modelSelection: ModelSelection) => void
  onStop: () => void
  onSubmit: (payload: ChatInputSubmitPayload) => Promise<boolean>
  rootPath: string
  runtimeMode: RuntimeMode
}) {
  const inputKey = `${rootPath}:${draftKey}`
  const draftTarget = useMemo<ChatInputDraftTarget>(
    () => ({ draftKey, rootPath }),
    [draftKey, rootPath],
  )
  const imagesSelector = useMemo(
    () => (state: ChatInputDraftStore) => selectChatInputDraftImages(state, draftTarget),
    [draftTarget],
  )
  const images = useChatInputDraftStore(imagesSelector)
  const addImages = useChatInputDraftStore((store) => store.addImages)
  const clearStoredDraft = useChatInputDraftStore((store) => store.clearDraft)
  const removeImage = useChatInputDraftStore((store) => store.removeImage)
  const setInteractionMode = useChatInputDraftStore((store) => store.setInteractionMode)
  const editorRef = useRef<LexicalEditor | null>(null)
  const submitButtonRef = useRef<HTMLButtonElement | null>(null)
  const initialDraft = useMemo(() => readChatInputDraftPrompt(draftTarget), [draftTarget])
  const [activeCommandItemId, setActiveCommandItemId] = useState<string | null>(null)
  const [attachmentError, setAttachmentError] = useState<string | null>(null)
  const [dropTargetActive, setDropTargetActive] = useState(false)
  const [editorFocused, setEditorFocused] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [trigger, setTrigger] = useState<ChatInputTrigger | null>(null)
  const hasAttachments = images.length > 0
  const composerDisabled = disabled || submitting
  const sendDisabled = disabled || submitting || (!hasAttachments && !initialDraft.trim())
  const statusLabel =
    attachmentError ?? error ?? (submitting ? 'Sending' : (commandStatusLabel ?? busyLabel(busy)))
  const projectEntries = useProjectEntrySearch({
    enabled: trigger?.kind === 'mention',
    query: trigger?.kind === 'mention' ? trigger.query : '',
    rootPath,
  })
  const commandMenuItems = useMemo(
    () => chatInputCommandItems(trigger, projectEntries.entries),
    [projectEntries.entries, trigger],
  )
  const commandMenuEmptyLabel = chatInputCommandMenuEmptyLabel(trigger)
  const initialConfig = useMemo<InitialConfigType>(
    () => ({
      editorState: () => {
        $setChatInputText(initialDraft)
      },
      namespace: `platform-chat-input:${inputKey}`,
      nodes: CHAT_INPUT_EDITOR_NODES,
      onError: (error) => {
        throw error
      },
    }),
    [inputKey, initialDraft],
  )

  useEffect(() => {
    const activeItemStillPresent = commandMenuItems.some((item) => item.id === activeCommandItemId)
    if (activeItemStillPresent) return

    setActiveCommandItemId(commandMenuItems[0]?.id ?? null)
  }, [activeCommandItemId, commandMenuItems])

  useEffect(() => {
    if (!disabled && !submitting) return

    setEditorFocused(false)
  }, [disabled, submitting])

  const handleEditorReady = useCallback((editor: LexicalEditor | null) => {
    editorRef.current = editor
  }, [])
  const clearDraft = useCallback(() => {
    const editor = editorRef.current
    if (editor) clearChatInputEditor(editor)

    clearStoredDraft(draftTarget)
    setAttachmentError(null)
    setTrigger(null)
    if (submitButtonRef.current) submitButtonRef.current.disabled = true
  }, [clearStoredDraft, draftTarget])

  const handleSubmit = useCallback(async () => {
    if (busy || disabled || submitting) return false

    const editor = editorRef.current
    const text = editor ? readChatInputText(editor).trim() : ''
    const draft = useChatInputDraftStore.getState().getDraft(draftTarget)
    const attachments = chatInputUploadAttachments(draft.images)
    if (!text && attachments.length === 0) return false

    // No ready provider offers a model, so there is nothing legitimate to send.
    const selected = draft.modelSelection ?? modelSelection
    if (!selected) return false

    setSubmitting(true)
    try {
      const sent = await onSubmit({
        attachments,
        interactionMode: draft.interactionMode ?? interactionMode,
        modelSelection: selected,
        runtimeMode: draft.runtimeMode ?? runtimeMode,
        text,
      })
      if (sent) clearDraft()

      return sent
    } finally {
      setSubmitting(false)
    }
  }, [
    busy,
    clearDraft,
    disabled,
    draftTarget,
    interactionMode,
    modelSelection,
    onSubmit,
    runtimeMode,
    submitting,
  ])

  const handleImageFiles = useCallback(
    (files: readonly File[]) => {
      void stageChatInputImageFiles({
        addImages,
        draftTarget,
        // Read live: staging is async, so a second batch dropped mid-compression
        // must count what the first one already added or the cap slips.
        existingImageCount: useChatInputDraftStore.getState().getDraft(draftTarget).images.length,
        files,
        onError: setAttachmentError,
      })
    },
    [addImages, draftTarget],
  )
  const handleRemoveImage = useCallback(
    (imageId: string) => {
      removeImage(draftTarget, imageId)
    },
    [draftTarget, removeImage],
  )
  const handleCommandItemSelect = useCallback(
    (item: ChatInputCommandItem) => {
      const editor = editorRef.current
      if (!editor || !trigger) return

      // The trigger is React state, so it can already describe a prompt that has
      // moved on — a stale or repeated commit is refused rather than spliced in.
      const applied = replaceChatInputEditorRange(editor, {
        expectedText: trigger.text,
        rangeEnd: trigger.rangeEnd,
        rangeStart: trigger.rangeStart,
        replacement: item.replacement,
      })
      setTrigger(null)
      if (!applied) return

      useChatInputDraftStore.getState().setPrompt(draftTarget, applied.text)
      if (item.type === 'slash-command') setInteractionMode(draftTarget, item.value)

      editor.focus()
    },
    [draftTarget, setInteractionMode, trigger],
  )
  const handleCommandMenuCommit = useCallback(() => {
    const item = activeChatInputCommandItem(commandMenuItems, activeCommandItemId)
    if (!item) return false

    handleCommandItemSelect(item)
    return true
  }, [activeCommandItemId, commandMenuItems, handleCommandItemSelect])
  const handleCommandMenuMove = useCallback(
    (offset: number) => {
      const nextItem = chatInputCommandItemByOffset(commandMenuItems, activeCommandItemId, offset)
      if (!nextItem) return false

      setActiveCommandItemId(nextItem.id)
      return true
    },
    [activeCommandItemId, commandMenuItems],
  )

  /** The popover dismissed itself — a press outside it, most of the time. */
  function handleCommandMenuDismiss() {
    setTrigger(null)
  }

  function handleComposerDragOver(event: DragEvent<HTMLElement>) {
    if (composerDisabled) return
    if (!dragCarriesFiles(event)) return

    // Without this the browser navigates to the dropped file and no drop event
    // ever reaches us.
    event.preventDefault()
    setDropTargetActive(true)
  }

  function handleComposerDragLeave(event: DragEvent<HTMLElement>) {
    if (!dragLeftComposer(event)) return

    setDropTargetActive(false)
  }

  function handleComposerDrop(event: DragEvent<HTMLElement>) {
    setDropTargetActive(false)
    if (composerDisabled) return

    const files = imageFilesFromTransfer(event.dataTransfer)
    if (files.length === 0) return

    event.preventDefault()
    handleImageFiles(files)
  }

  return (
    <div className='border-border/60 shrink-0 border-t px-3 pt-2.5 pb-3'>
      <ChatModelPickerProvider
        draftTarget={draftTarget}
        locked={modelSelectionLocked}
        modelSelection={modelSelection}
        persistModelSelection={onPersistModelSelection}
      >
        <form
          className='relative mx-auto w-full max-w-3xl'
          onSubmit={(event) => event.preventDefault()}
        >
          {trigger ? (
            <ChatInputCommandMenu
              activeItemId={activeCommandItemId}
              emptyLabel={commandMenuEmptyLabel}
              isLoading={projectEntries.isSearching}
              items={commandMenuItems}
              triggerKind={trigger.kind}
              onActiveItemChange={setActiveCommandItemId}
              onDismiss={handleCommandMenuDismiss}
              onSelect={handleCommandItemSelect}
            />
          ) : null}
          <LexicalComposer initialConfig={initialConfig} key={inputKey}>
            {/* The whole composer is the drop target, not just the text area:
                dropping on the attachment strip or the action row used to do
                nothing at all. */}
            <div
              className={cn(
                'border-border/80 bg-background relative overflow-hidden rounded-xl border shadow-[0_1px_2px_color-mix(in_oklch,var(--foreground)_5%,transparent)] transition-[border-color,box-shadow]',
                editorFocused && 'border-foreground/25 ring-2 ring-foreground/[0.07]',
                dropTargetActive && 'border-primary',
              )}
              onDragLeave={handleComposerDragLeave}
              onDragOver={handleComposerDragOver}
              onDrop={handleComposerDrop}
            >
              <ChatInputEditor
                busy={busy}
                disabled={composerDisabled}
                draftKey={draftKey}
                hasAttachments={hasAttachments}
                placeholder='Use @ to mention, / for commands.'
                rootPath={rootPath}
                sendButtonRef={submitButtonRef}
                submitting={submitting}
                trigger={trigger}
                onCommandMenuCommit={handleCommandMenuCommit}
                onCommandMenuMove={handleCommandMenuMove}
                onEditorReady={handleEditorReady}
                onFocusChange={setEditorFocused}
                onImageFiles={handleImageFiles}
                onSubmitRequest={handleSubmit}
                onTriggerChange={setTrigger}
              />
              <ChatInputAttachmentList
                attachments={images}
                disabled={composerDisabled}
                onRemove={handleRemoveImage}
              />
              <ChatInputActions
                busy={busy}
                disabled={disabled}
                draftTarget={draftTarget}
                interactionMode={interactionMode}
                runtimeMode={runtimeMode}
                sendButtonRef={submitButtonRef}
                sendDisabled={sendDisabled}
                statusLabel={statusLabel}
                onSelectImageFiles={handleImageFiles}
                onStop={onStop}
                onSubmit={handleSubmit}
              />
              {dropTargetActive ? (
                /* Pointer-events-none is load-bearing: an overlay that swallowed
                   the drag would fire dragleave the moment it appeared. */
                <div className='bg-primary/10 pointer-events-none absolute inset-0 flex items-center justify-center'>
                  <span className='text-muted-foreground text-xs'>Drop images to attach</span>
                </div>
              ) : null}
            </div>
          </LexicalComposer>
        </form>
      </ChatModelPickerProvider>
    </div>
  )
}

function busyLabel(busy: boolean) {
  return busy ? 'Working' : null
}

/** Text and element drags must keep their normal behaviour inside the editor. */
function dragCarriesFiles(event: DragEvent<HTMLElement>) {
  return event.dataTransfer.types.includes('Files')
}

/**
 * A dragleave also fires when the pointer crosses between the composer's own
 * children, which would flicker the overlay off and on. Only a leave whose next
 * target is outside the composer really ends the drag.
 */
function dragLeftComposer(event: DragEvent<HTMLElement>) {
  const nextTarget = event.relatedTarget
  if (!(nextTarget instanceof Node)) return true

  return !event.currentTarget.contains(nextTarget)
}
