import * as v from 'valibot'
import { SETTING_IDS, settingsValuesSchema } from './keys'
import { SETTINGS_LAYER_ORDER } from './resolve'

export const settingIdSchema = v.picklist(SETTING_IDS)

export const settingsLayerIdSchema = v.picklist(SETTINGS_LAYER_ORDER)

/** A layer a client may write to. Policy is read-only by definition. */
export const settingsWriteTargetSchema = v.picklist(['user', 'workspace'] as const)

export const settingsDiagnosticSchema = v.object({
  kind: v.picklist(['unknown-key', 'scope-not-allowed', 'invalid-value'] as const),
  id: v.string(),
  layer: settingsLayerIdSchema,
  detail: v.optional(v.string()),
})

/**
 * One layer as the client sees it: the unfiltered contents, so the page can
 * render "set here but not applied" without a second round trip.
 */
export const settingsLayerSnapshotSchema = v.object({
  id: settingsLayerIdSchema,
  /** Absent when the layer has no file — no workspace open, no policy configured. */
  present: v.boolean(),
  raw: v.record(v.string(), v.unknown()),
})

/**
 * `revision` is a content hash of the user file's bytes, never a counter.
 *
 * A counter is bumped by our own reloads, so it cannot tell "unchanged" from
 * "changed back", and it cannot detect a hand-edit that lands between the
 * store's read and its rename. A hash does both, and doubles as the value the
 * watcher compares to suppress the echo of our own write.
 */
export const settingsSnapshotSchema = v.object({
  values: settingsValuesSchema,
  layers: v.array(settingsLayerSnapshotSchema),
  diagnostics: v.array(settingsDiagnosticSchema),
  revision: v.string(),
})

/**
 * One key edit. An omitted `value` is a reset: the write path deletes the key
 * from the target file rather than writing the default into it, which is what
 * keeps settings.json short and keeps defaults live across builds.
 */
export const settingsEditSchema = v.object({
  key: settingIdSchema,
  value: v.optional(v.unknown()),
  target: settingsWriteTargetSchema,
})

export const settingsWriteRequestSchema = v.object({
  edits: v.array(settingsEditSchema),
  /**
   * The revision the edits were computed against. The store refuses the write
   * when the file moved underneath, rather than silently overwriting whatever
   * arrived in between.
   */
  baseRevision: v.optional(v.string()),
})

export type SettingsLayerSnapshot = v.InferOutput<typeof settingsLayerSnapshotSchema>
export type SettingsSnapshot = v.InferOutput<typeof settingsSnapshotSchema>
export type SettingsEdit = v.InferOutput<typeof settingsEditSchema>
export type SettingsWriteRequest = v.InferOutput<typeof settingsWriteRequestSchema>
export type SettingsWriteTarget = v.InferOutput<typeof settingsWriteTargetSchema>
