import * as v from 'valibot'

export const defaultPreviewText = 'The quick brown fox jumps 0123'
const fontNamePattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u

const fontNameSchema = v.pipe(
  v.string(),
  v.minLength(1),
  v.maxLength(128),
  v.regex(fontNamePattern),
)

export const fontPreviewQuerySchema = v.object({
  text: v.optional(v.pipe(v.string(), v.maxLength(256))),
})

export const fontNameParamsSchema = v.object({
  name: fontNameSchema,
})

export const fontBatchBodySchema = v.object({
  names: v.pipe(v.array(fontNameSchema), v.minLength(1), v.maxLength(20)),
})

export function isValidFontName(name: string) {
  return fontNamePattern.test(name)
}
