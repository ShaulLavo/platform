import { useQuery } from '@tanstack/react-query'
import { LexicalComposer, type InitialConfigType } from '@lexical/react/LexicalComposer'
import type {
  ChatAttachment,
  InteractionMode,
  ModelSelection,
  RuntimeMode,
} from '@workspace/contracts'
import type { LexicalEditor } from 'lexical'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@workspace/ui/lib/utils'

import {
  $setChatInputText,
  clearChatInputEditor,
  readChatInputText,
  replaceChatInputEditorTextRange,
} from '../lib/chat-input-editor-actions'
import {
  chatInputAttachmentMetadata,
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
import { projectEntrySearchQueryOptions } from '../lib/project-entry-query'
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

export type ChatInputSubmitPayload = {
  attachments: ChatAttachment[]
  interactionMode: InteractionMode
  modelSelection: ModelSelection
  runtimeMode: RuntimeMode
  text: string
}

export function ChatInput({
  busy,
  disabled,
  draftKey,
  error,
  interactionMode,
  modelSelection,
  modelSelectionLocked = false,
  onStop,
  onSubmit,
  rootPath,
  runtimeMode,
}: {
  busy: boolean
  disabled: boolean
  draftKey: string
  error: string | null
  interactionMode: InteractionMode
  modelSelection: ModelSelection
  modelSelectionLocked?: boolean
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
  const modelSelectionSelector = useMemo(
    () => (state: ChatInputDraftStore) => state.getDraft(draftTarget).modelSelection,
    [draftTarget],
  )
  const images = useChatInputDraftStore(imagesSelector)
  const draftModelSelection = useChatInputDraftStore(modelSelectionSelector)
  const addImages = useChatInputDraftStore((store) => store.addImages)
  const clearStoredDraft = useChatInputDraftStore((store) => store.clearDraft)
  const removeImage = useChatInputDraftStore((store) => store.removeImage)
  const setInteractionMode = useChatInputDraftStore((store) => store.setInteractionMode)
  const setModelSelection = useChatInputDraftStore((store) => store.setModelSelection)
  const editorRef = useRef<LexicalEditor | null>(null)
  const submitButtonRef = useRef<HTMLButtonElement | null>(null)
  const initialDraft = useMemo(() => readChatInputDraftPrompt(draftTarget), [draftTarget])
  const [activeCommandItemId, setActiveCommandItemId] = useState<string | null>(null)
  const [attachmentError, setAttachmentError] = useState<string | null>(null)
  const [editorFocused, setEditorFocused] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [trigger, setTrigger] = useState<ChatInputTrigger | null>(null)
  const hasAttachments = images.length > 0
  const activeModelSelection = draftModelSelection ?? modelSelection
  const sendDisabled = disabled || submitting || (!hasAttachments && !initialDraft.trim())
  const statusLabel = attachmentError ?? error ?? (busy ? 'Working' : null)
  const projectEntriesQuery = useQuery(
    projectEntrySearchQueryOptions({
      enabled: trigger?.kind === 'mention',
      query: trigger?.kind === 'mention' ? trigger.query : '',
      rootPath,
    }),
  )
  const commandMenuItems = useMemo(
    () => chatInputCommandItems(trigger, projectEntriesQuery.data?.entries ?? []),
    [projectEntriesQuery.data?.entries, trigger],
  )
  const commandMenuEmptyLabel = chatInputCommandMenuEmptyLabel(trigger)
  const initialConfig = useMemo<InitialConfigType>(
    () => ({
      editorState: () => {
        $setChatInputText(initialDraft)
      },
      namespace: `platform-chat-input:${inputKey}`,
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
    const attachments = chatInputAttachmentMetadata(draft.images)
    if (!text && attachments.length === 0) return false

    setSubmitting(true)
    try {
      const sent = await onSubmit({
        attachments,
        interactionMode: draft.interactionMode ?? interactionMode,
        modelSelection: draft.modelSelection ?? modelSelection,
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
  const handleModelSelectionChange = useCallback(
    (nextModelSelection: ModelSelection) => {
      if (modelSelectionLocked) return

      setModelSelection(draftTarget, nextModelSelection)
    },
    [draftTarget, modelSelectionLocked, setModelSelection],
  )
  const handleCommandItemSelect = useCallback(
    (item: ChatInputCommandItem) => {
      const editor = editorRef.current
      if (!editor || !trigger) return

      const nextText = replaceChatInputEditorTextRange(editor, {
        rangeEnd: trigger.rangeEnd,
        rangeStart: trigger.rangeStart,
        replacement: item.replacement,
      })
      useChatInputDraftStore.getState().setPrompt(draftTarget, nextText)
      if (item.type === 'slash-command') setInteractionMode(draftTarget, item.value)

      setTrigger(null)
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

  return (
    <div className='shrink-0 px-3 pt-2 pb-3'>
      <form
        className='relative mx-auto w-full max-w-3xl'
        onSubmit={(event) => event.preventDefault()}
      >
        {trigger ? (
          <ChatInputCommandMenu
            activeItemId={activeCommandItemId}
            emptyLabel={commandMenuEmptyLabel}
            isLoading={projectEntriesQuery.isFetching}
            items={commandMenuItems}
            triggerKind={trigger.kind}
            onActiveItemChange={setActiveCommandItemId}
            onSelect={handleCommandItemSelect}
          />
        ) : null}
        <LexicalComposer initialConfig={initialConfig} key={inputKey}>
          <div
            className={cn(
              'border-border/80 bg-background/90 overflow-hidden rounded-md border shadow-[0_16px_42px_color-mix(in_oklch,var(--foreground)_7%,transparent)] backdrop-blur transition-[border-color,box-shadow]',
              editorFocused && 'border-blue-500/70 ring-2 ring-blue-500/20',
            )}
          >
            <ChatInputEditor
              busy={busy}
              disabled={disabled || submitting}
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
              disabled={disabled || submitting}
              onRemove={handleRemoveImage}
            />
            <ChatInputActions
              busy={busy}
              disabled={disabled}
              modelSelection={activeModelSelection}
              modelSelectionLocked={modelSelectionLocked}
              sendButtonRef={submitButtonRef}
              sendDisabled={sendDisabled}
              statusLabel={statusLabel}
              onModelSelectionChange={handleModelSelectionChange}
              onStop={onStop}
              onSubmit={handleSubmit}
            />
          </div>
        </LexicalComposer>
      </form>
    </div>
  )
}
