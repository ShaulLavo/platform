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

/** Where a syntax error is, so the JSON view can put a squiggle on it. */
export const settingsParseErrorSchema = v.object({
  message: v.string(),
  offset: v.number(),
  length: v.number(),
})

/** A source span in the exact settings document bytes carried beside it. */
export const settingsTextRangeSchema = v.object({
  offset: v.number(),
  length: v.number(),
})

/**
 * The layer's file, as bytes.
 *
 * Carried on the snapshot rather than fetched separately so that the JSON view
 * and the page agree by construction: one broadcast, one revision, one answer to
 * "is this document broken". A second round trip could land either side of a
 * write and show a document that never existed.
 *
 * `parseErrors` being non-empty is also what says `raw` above is the *last good*
 * parse rather than what these bytes mean — the two disagree exactly while the
 * file is broken, which is the state the banner exists to explain.
 */
export const settingsLayerFileSchema = v.object({
  text: v.string(),
  revision: v.string(),
  parseErrors: v.array(settingsParseErrorSchema),
  keyRanges: v.record(v.string(), settingsTextRangeSchema),
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
  /**
   * Absent only for `policy`, which is an environment variable and has no file
   * to edit.
   *
   * Present for a writable layer whose file does not exist yet, with an empty
   * `text` and an empty `revision` — that is not a missing value, it is the
   * state a fresh install is in, and it is exactly when the JSON view has to be
   * able to open a blank document and create the file. `present` above is what
   * distinguishes "no file" from "a file someone emptied"; this field answers
   * the different question of what the bytes are.
   */
  file: v.optional(settingsLayerFileSchema),
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

export type SettingsLayerFile = v.InferOutput<typeof settingsLayerFileSchema>
export type SettingsLayerSnapshot = v.InferOutput<typeof settingsLayerSnapshotSchema>
export type SettingsParseError = v.InferOutput<typeof settingsParseErrorSchema>
export type SettingsTextRange = v.InferOutput<typeof settingsTextRangeSchema>
export type SettingsSnapshot = v.InferOutput<typeof settingsSnapshotSchema>
export type SettingsEdit = v.InferOutput<typeof settingsEditSchema>
export type SettingsWriteRequest = v.InferOutput<typeof settingsWriteRequestSchema>
export type SettingsWriteTarget = v.InferOutput<typeof settingsWriteTargetSchema>
