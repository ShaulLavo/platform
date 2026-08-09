import type { InteractionMode, RuntimeMode } from '@workspace/contracts'
import { createContext } from 'react'

/**
 * The composer's two mode pickers, as domain actions rather than setters. Each
 * one is both a draft override for the next turn and a thread-level change, so
 * the sidebar and any second client see the same mode this composer shows.
 */
export type ChatComposerModes = {
  /** True once the thread command is accepted; the local pick stands either way. */
  readonly selectInteractionMode: (interactionMode: InteractionMode) => Promise<boolean>
  /** True once the thread command is accepted; the local pick stands either way. */
  readonly selectRuntimeMode: (runtimeMode: RuntimeMode) => Promise<boolean>
}

export const ChatComposerModesContext = createContext<ChatComposerModes | null>(null)
