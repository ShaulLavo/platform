import { fsServerUrl } from "@/lib/fs-client"

export type DocumentSymbolRange = {
  start: { line: number; character: number }
  end: { line: number; character: number }
}

export type FlatDocumentSymbol = {
  containerName: string | null
  kind: number
  name: string
  range: DocumentSymbolRange
  selectionRange: DocumentSymbolRange
}

type DocumentSymbol = {
  children?: readonly DocumentSymbol[]
  kind: number
  name: string
  range: DocumentSymbolRange
  selectionRange: DocumentSymbolRange
}

type JsonRpcResponse = {
  error?: { message?: string }
  id?: number | string | null
  result?: unknown
}

export async function fetchDocumentSymbols({
  path,
  rootPath,
  signal,
  text,
}: {
  path: string
  rootPath: string
  signal?: AbortSignal
  text?: string | null
}): Promise<readonly FlatDocumentSymbol[]> {
  if (!supportsTypeScriptSymbols(path)) return []

  const symbols = await requestDocumentSymbols({ path, rootPath, signal, text })
  return flattenDocumentSymbols(symbols)
}

function requestDocumentSymbols({
  path,
  rootPath,
  signal,
  text,
}: {
  path: string
  rootPath: string
  signal?: AbortSignal
  text?: string | null
}) {
  return new Promise<readonly DocumentSymbol[]>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("Document symbol request aborted"))
      return
    }

    const socket = new WebSocket(typeScriptLspRoute(rootPath))
    const requestId = 1
    let settled = false

    const finish = (callback: () => void) => {
      if (settled) return

      settled = true
      signal?.removeEventListener("abort", abort)
      socket.close()
      callback()
    }
    const abort = () =>
      finish(() => reject(new Error("Document symbol request aborted")))

    signal?.addEventListener("abort", abort, { once: true })
    socket.addEventListener("open", () => {
      sendOpenDocument(socket, path, text)
      socket.send(
        JSON.stringify({
          id: requestId,
          jsonrpc: "2.0",
          method: "textDocument/documentSymbol",
          params: { textDocument: { uri: fileUriForPath(path) } },
        })
      )
    })
    socket.addEventListener("message", (event) => {
      const response = parseJsonRpcResponse(event.data)
      if (!response || response.id !== requestId) return
      if (response.error) {
        finish(() =>
          reject(new Error(response.error?.message ?? "Document symbol failed"))
        )
        return
      }

      finish(() => resolve(documentSymbolsFromResult(response.result)))
    })
    socket.addEventListener("error", () =>
      finish(() => reject(new Error("Document symbol socket failed")))
    )
    socket.addEventListener("close", () =>
      finish(() => reject(new Error("Document symbol socket closed")))
    )
  })
}

function sendOpenDocument(
  socket: WebSocket,
  path: string,
  text: string | null | undefined
) {
  if (text === null || text === undefined) return

  socket.send(
    JSON.stringify({
      jsonrpc: "2.0",
      method: "textDocument/didOpen",
      params: {
        textDocument: {
          languageId: languageIdForPath(path),
          text,
          uri: fileUriForPath(path),
          version: 1,
        },
      },
    })
  )
}

function flattenDocumentSymbols(
  symbols: readonly DocumentSymbol[],
  containerName: string | null = null
): readonly FlatDocumentSymbol[] {
  return symbols.flatMap((symbol) => [
    {
      containerName,
      kind: symbol.kind,
      name: symbol.name,
      range: symbol.range,
      selectionRange: symbol.selectionRange,
    },
    ...flattenDocumentSymbols(symbol.children ?? [], symbol.name),
  ])
}

function documentSymbolsFromResult(result: unknown): readonly DocumentSymbol[] {
  if (!Array.isArray(result)) return []

  return result.flatMap((value) => {
    if (!isDocumentSymbol(value)) return []

    return [value]
  })
}

function isDocumentSymbol(value: unknown): value is DocumentSymbol {
  if (!value || typeof value !== "object") return false
  if (!("name" in value) || typeof value.name !== "string") return false
  if (!("kind" in value) || typeof value.kind !== "number") return false
  if (!("range" in value) || !isRange(value.range)) return false
  if (!("selectionRange" in value) || !isRange(value.selectionRange))
    return false

  return !("children" in value) || Array.isArray(value.children)
}

function isRange(value: unknown): value is DocumentSymbolRange {
  if (!value || typeof value !== "object") return false
  if (!("start" in value) || !isPosition(value.start)) return false
  return "end" in value && isPosition(value.end)
}

function isPosition(value: unknown) {
  if (!value || typeof value !== "object") return false
  if (!("line" in value) || typeof value.line !== "number") return false
  return "character" in value && typeof value.character === "number"
}

function parseJsonRpcResponse(value: unknown): JsonRpcResponse | null {
  if (typeof value !== "string") return null

  try {
    const parsed = JSON.parse(value) as unknown
    if (!parsed || typeof parsed !== "object") return null

    return parsed as JsonRpcResponse
  } catch {
    return null
  }
}

function supportsTypeScriptSymbols(path: string) {
  return /\.[cm]?[jt]sx?$/u.test(path)
}

function typeScriptLspRoute(rootPath: string) {
  const url = new URL("/lsp/typescript", fsServerUrl)
  if (url.protocol === "http:") url.protocol = "ws:"
  if (url.protocol === "https:") url.protocol = "wss:"
  url.searchParams.set("root", rootPath)
  return url
}

function fileUriForPath(path: string) {
  const normalized = path.replace(/^\/+/, "")
  return `file:///${normalized.split("/").map(encodeURIComponent).join("/")}`
}

function languageIdForPath(path: string) {
  if (path.endsWith(".tsx")) return "typescriptreact"
  if (path.endsWith(".jsx")) return "javascriptreact"
  if (path.endsWith(".js") || path.endsWith(".mjs") || path.endsWith(".cjs"))
    return "javascript"

  return "typescript"
}
