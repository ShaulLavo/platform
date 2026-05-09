import type { TypeScriptLspDefinitionTarget } from "@editor/typescript-lsp"

export function selectionForDefinition(
  filePath: string,
  text: string,
  target: TypeScriptLspDefinitionTarget | null | undefined
) {
  if (!target) return null
  if (target.path !== filePath) return null

  const anchor = offsetForPosition(text, target.range.start)
  const head = offsetForPosition(text, target.range.end)
  return { anchor, head }
}

export function rowStartOffset(text: string, row: number) {
  if (row <= 0) return 0

  let offset = 0
  for (let index = 0; index < row; index += 1) {
    const nextLine = text.indexOf("\n", offset)
    if (nextLine === -1) return text.length

    offset = nextLine + 1
  }

  return offset
}

function offsetForPosition(
  text: string,
  position: TypeScriptLspDefinitionTarget["range"]["start"]
) {
  let line = 0
  let lineStart = 0

  for (let index = 0; index < text.length; index += 1) {
    if (line >= position.line) break
    if (text[index] !== "\n") continue
    line += 1
    lineStart = index + 1
  }

  if (line < position.line) return text.length
  return Math.min(text.length, lineStart + position.character)
}
