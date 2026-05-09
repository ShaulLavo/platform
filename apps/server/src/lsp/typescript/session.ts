import { existsSync, statSync } from "node:fs"
import path from "node:path"

import { isRecord } from "@workspace/contracts"
import ts from "typescript"
import type * as lsp from "vscode-languageserver-protocol"

const JSON_RPC_VERSION = "2.0"
const METHOD_NOT_FOUND = -32601
const INVALID_PARAMS = -32602
const INTERNAL_ERROR = -32603
const TEXT_DOCUMENT_SYNC_INCREMENTAL = 2
const DEFAULT_DIAGNOSTIC_DELAY_MS = 150
const TYPE_SCRIPT_EXTENSIONS = new Set([".cts", ".mts", ".ts", ".tsx"])

export type TypeScriptLspSessionOptions = {
  root: string
  workspaceRoot?: string
  diagnosticDelayMs?: number
  send(message: string): void
}

type OpenDocument = {
  uri: lsp.DocumentUri
  fileName: string
  languageId: string
  version: number
  text: string
}

type JsonRpcError = {
  code: number
  message: string
  data?: unknown
}

type ProjectConfig = {
  configFileName: string | null
  compilerOptions: ts.CompilerOptions
  fileNames: readonly string[]
}

type TextDocumentPositionRequest = {
  uri: lsp.DocumentUri
  fileName: string
  position: lsp.Position
}

export class TypeScriptLspSession {
  private readonly root: string
  private readonly workspaceRoot: string
  private readonly sendMessage: (message: string) => void
  private readonly documents = new Map<lsp.DocumentUri, OpenDocument>()
  private readonly diagnosticTimers = new Map<lsp.DocumentUri, ReturnType<typeof setTimeout>>()
  private readonly scriptVersions = new Map<string, number>()
  private compilerOptionsOverride: ts.CompilerOptions = {}
  private diagnosticDelayMs: number
  private service: ts.LanguageService | null = null
  private projectVersion = 0
  private shutdown = false

  constructor(options: TypeScriptLspSessionOptions) {
    this.root = normalizeNativePath(options.root)
    this.workspaceRoot = normalizeNativePath(options.workspaceRoot ?? options.root)
    this.sendMessage = options.send
    this.diagnosticDelayMs = options.diagnosticDelayMs ?? DEFAULT_DIAGNOSTIC_DELAY_MS
  }

  handleMessage(data: string | ArrayBuffer | Uint8Array): void {
    const message = parseIncomingMessage(data)
    if (!message) return

    if (isRequestMessage(message)) {
      void this.handleRequest(message)
      return
    }

    if (isNotificationMessage(message)) this.handleNotification(message)
  }

  dispose(): void {
    for (const timer of this.diagnosticTimers.values()) clearTimeout(timer)
    this.diagnosticTimers.clear()
    this.documents.clear()
    this.disposeService()
  }

  private async handleRequest(message: lsp.RequestMessage): Promise<void> {
    try {
      const result = await this.requestResult(message)
      this.postResponse(message.id ?? null, result)
    } catch (error) {
      this.postResponseError(message.id ?? null, error)
    }
  }

  private handleNotification(message: lsp.NotificationMessage): void {
    try {
      this.routeNotification(message)
    } catch (error) {
      this.postLogMessage(error)
    }
  }

  private async requestResult(message: lsp.RequestMessage): Promise<unknown> {
    if (message.method === "initialize") return this.initialize(message.params)
    if (message.method === "shutdown") return this.shutdownResult()
    if (message.method === "textDocument/hover") return this.hover(message.params)
    if (message.method === "textDocument/definition") return this.definition(message.params)
    if (message.method === "textDocument/completion") return this.completion(message.params)
    if (message.method === "textDocument/signatureHelp") return this.signatureHelp(message.params)
    if (message.method === "textDocument/references") return this.references(message.params)
    if (message.method === "textDocument/documentSymbol") return this.documentSymbols(message.params)
    if (message.method === "textDocument/prepareRename") return this.prepareRename(message.params)
    if (message.method === "textDocument/rename") return this.rename(message.params)
    if (message.method === "textDocument/codeAction") return this.codeActions(message.params)

    throw rpcError(METHOD_NOT_FOUND, `Method not implemented: ${message.method}`)
  }

  private routeNotification(message: lsp.NotificationMessage): void {
    if (message.method === "initialized") return
    if (message.method === "$/cancelRequest") return
    if (message.method === "editor/typescript/setWorkspaceFiles") return
    if (message.method === "exit") return this.dispose()
    if (message.method === "textDocument/didOpen") return this.didOpen(message.params)
    if (message.method === "textDocument/didChange") return this.didChange(message.params)
    if (message.method === "textDocument/didClose") return this.didClose(message.params)
  }

  private initialize(params: unknown): lsp.InitializeResult {
    const options = initializationOptions(params)
    this.compilerOptionsOverride = options.compilerOptions ?? {}
    this.diagnosticDelayMs = options.diagnosticDelayMs ?? DEFAULT_DIAGNOSTIC_DELAY_MS
    this.invalidateService()

    return {
      capabilities: {
        textDocumentSync: {
          openClose: true,
          change: TEXT_DOCUMENT_SYNC_INCREMENTAL,
        },
        diagnosticProvider: {
          interFileDependencies: true,
          workspaceDiagnostics: false,
        },
        hoverProvider: true,
        definitionProvider: true,
        completionProvider: {
          triggerCharacters: [".", '"', "'", "`", "/", "@", "<"],
          resolveProvider: false,
        },
        signatureHelpProvider: {
          triggerCharacters: ["(", ",", "<"],
          retriggerCharacters: [")"],
        },
        referencesProvider: true,
        documentSymbolProvider: true,
        renameProvider: {
          prepareProvider: true,
        },
        codeActionProvider: true,
      },
      serverInfo: {
        name: "platform-typescript-lsp",
        version: ts.version,
      },
    }
  }

  private shutdownResult(): null {
    this.shutdown = true
    this.dispose()
    return null
  }

  private didOpen(params: unknown): void {
    const textDocument = textDocumentItem(params)
    if (!textDocument) return

    const fileName = this.fileNameForUri(textDocument.uri)
    if (!fileName) return
    if (!isTypeScriptFileName(fileName)) return

    this.documents.set(textDocument.uri, {
      uri: textDocument.uri,
      fileName,
      languageId: textDocument.languageId,
      version: textDocument.version,
      text: textDocument.text,
    })
    this.bumpScriptVersion(fileName)
    this.invalidateService()
    this.scheduleDiagnostics(textDocument.uri)
  }

  private didChange(params: unknown): void {
    const change = didChangeParams(params)
    if (!change) return

    const current = this.documents.get(change.uri)
    if (!current) return

    const text = applyContentChanges(current.text, change.contentChanges)
    const document = { ...current, version: change.version, text }
    this.documents.set(change.uri, document)
    this.bumpScriptVersion(document.fileName)
    if (isProjectMetadataFile(document.fileName)) this.invalidateService()
    this.scheduleDiagnostics(document.uri)
  }

  private didClose(params: unknown): void {
    const uri = didCloseUri(params)
    if (!uri) return

    const document = this.documents.get(uri)
    this.documents.delete(uri)
    this.clearScheduledDiagnostics(uri)
    if (document) this.bumpScriptVersion(document.fileName)
    this.invalidateService()
    this.postDiagnostics(uri, document?.version ?? null, [])
  }

  private hover(params: unknown): lsp.Hover | null {
    const request = this.textDocumentPosition(params)
    if (!request) return null

    const document = this.documentText(request.fileName)
    if (document === null) return null

    const service = this.ensureService()
    const offset = lspPositionToOffset(document, request.position)
    const quickInfo = service.getQuickInfoAtPosition(request.fileName, offset)
    if (!quickInfo) return null

    return hoverFromQuickInfo(document, quickInfo)
  }

  private definition(params: unknown): lsp.Location[] {
    const request = this.textDocumentPosition(params)
    if (!request) return []

    const document = this.documentText(request.fileName)
    if (document === null) return []

    const service = this.ensureService()
    const offset = lspPositionToOffset(document, request.position)
    const definitions =
      service.getDefinitionAndBoundSpan(request.fileName, offset)?.definitions ??
      service.getDefinitionAtPosition(request.fileName, offset) ??
      []

    return definitions.flatMap((definition) => this.locationForDefinition(definition))
  }

  private completion(params: unknown): lsp.CompletionList {
    const request = this.textDocumentPosition(params)
    if (!request) return completionList([])

    const text = this.documentText(request.fileName)
    if (text === null) return completionList([])

    const offset = lspPositionToOffset(text, request.position)
    const completions = this.ensureService().getCompletionsAtPosition(request.fileName, offset, {
      includeCompletionsForModuleExports: true,
      includeCompletionsWithInsertText: true,
    })
    if (!completions) return completionList([])

    return completionList(completions.entries.map(completionItem))
  }

  private signatureHelp(params: unknown): lsp.SignatureHelp | null {
    const request = this.textDocumentPosition(params)
    if (!request) return null

    const text = this.documentText(request.fileName)
    if (text === null) return null

    const offset = lspPositionToOffset(text, request.position)
    const help = this.ensureService().getSignatureHelpItems(request.fileName, offset, undefined)
    if (!help) return null

    return signatureHelp(help)
  }

  private references(params: unknown): lsp.Location[] {
    const request = this.textDocumentPosition(params)
    if (!request) return []

    const text = this.documentText(request.fileName)
    if (text === null) return []

    const offset = lspPositionToOffset(text, request.position)
    const references = this.ensureService().getReferencesAtPosition(request.fileName, offset) ?? []
    return references.flatMap((reference) => this.locationForTextSpan(reference.fileName, reference.textSpan))
  }

  private documentSymbols(params: unknown): lsp.DocumentSymbol[] {
    const document = textDocumentIdentifier(params)
    if (!document) return []

    const fileName = this.fileNameForUri(document.uri)
    if (!fileName) return []

    const text = this.documentText(fileName)
    if (text === null) return []

    const tree = this.ensureService().getNavigationTree(fileName)
    return tree.childItems?.flatMap((item) => this.documentSymbol(item, text)) ?? []
  }

  private prepareRename(params: unknown): lsp.Range | { range: lsp.Range; placeholder: string } | null {
    const request = this.textDocumentPosition(params)
    if (!request) return null

    const text = this.documentText(request.fileName)
    if (text === null) return null

    const offset = lspPositionToOffset(text, request.position)
    const info = this.ensureService().getRenameInfo(request.fileName, offset, {})
    if (!info.canRename) return null

    return {
      range: rangeFromTextSpan(text, info.triggerSpan),
      placeholder: info.displayName,
    }
  }

  private rename(params: unknown): lsp.WorkspaceEdit | null {
    const request = renameParams(params)
    if (!request) return null

    const fileName = this.fileNameForUri(request.uri)
    if (!fileName) return null

    const text = this.documentText(fileName)
    if (text === null) return null

    const offset = lspPositionToOffset(text, request.position)
    const locations =
      this.ensureService().findRenameLocations(fileName, offset, false, false, true) ?? []
    return this.workspaceEditFromRenameLocations(locations, request.newName)
  }

  private codeActions(params: unknown): lsp.CodeAction[] {
    const request = codeActionParams(params)
    if (!request) return []

    const fileName = this.fileNameForUri(request.uri)
    if (!fileName) return []

    const text = this.documentText(fileName)
    if (text === null) return []

    const start = lspPositionToOffset(text, request.range.start)
    const end = lspPositionToOffset(text, request.range.end)
    const errorCodes = request.diagnostics.flatMap(diagnosticCode)
    if (errorCodes.length === 0) return []

    const fixes = this.ensureService().getCodeFixesAtPosition(
      fileName,
      start,
      end,
      errorCodes,
      {},
      {},
    )
    return fixes.flatMap((fix) => this.codeActionFromFix(fix, request.diagnostics))
  }

  private ensureService(): ts.LanguageService {
    if (this.service) return this.service

    const config = this.projectConfig()
    const host = this.languageServiceHost(config)
    this.service = ts.createLanguageService(host, ts.createDocumentRegistry())
    return this.service
  }

  private projectConfig(): ProjectConfig {
    const configFileName = this.projectConfigFileName()
    if (!configFileName) return this.inferredProjectConfig()

    const parsed = this.parseProjectConfig(configFileName, true)
    if (!parsed) return this.inferredProjectConfig()

    return {
      configFileName,
      compilerOptions: parsed.options,
      fileNames: this.rootFileNames(parsed.fileNames),
    }
  }

  private inferredProjectConfig(): ProjectConfig {
    return {
      configFileName: null,
      compilerOptions: {
        ...defaultCompilerOptions(),
        ...this.compilerOptionsOverride,
      },
      fileNames: this.rootFileNames([]),
    }
  }

  private rootFileNames(configFileNames: readonly string[]): readonly string[] {
    const files = new Set(configFileNames.map(normalizeNativePath))
    for (const document of this.documents.values()) files.add(document.fileName)
    return [...files].filter((fileName) => isTypeScriptFileName(fileName) && this.isInsideRoot(fileName))
  }

  private projectConfigFileName(): string | null {
    for (const document of this.sortedDocuments()) {
      const config = this.configFileNameForDocument(document.fileName)
      if (config) return config
    }

    const rootConfig = path.join(this.root, "tsconfig.json")
    return existsSync(rootConfig) ? normalizeNativePath(rootConfig) : null
  }

  private configFileNameForDocument(fileName: string): string | null {
    const configFileName = this.nearestConfigFile(fileName)
    if (!configFileName) return null

    const parsed = this.parseProjectConfig(configFileName, false)
    if (!parsed) return configFileName

    const referencedConfig = this.referencedConfigFileNameForDocument(parsed, configFileName, fileName)
    return referencedConfig ?? configFileName
  }

  private referencedConfigFileNameForDocument(
    parsed: ts.ParsedCommandLine,
    configFileName: string,
    fileName: string,
  ): string | null {
    for (const reference of parsed.projectReferences ?? []) {
      const referenceConfig = referencedConfigFileName(configFileName, reference)
      if (!this.isInsideRoot(referenceConfig)) continue
      if (this.configIncludesFile(referenceConfig, fileName)) return referenceConfig
    }

    return null
  }

  private configIncludesFile(configFileName: string, fileName: string): boolean {
    const parsed = this.parseProjectConfig(configFileName, false)
    if (!parsed) return false

    const normalized = normalizeNativePath(fileName)
    return parsed.fileNames.some((candidate) => samePath(candidate, normalized))
  }

  private parseProjectConfig(
    configFileName: string,
    reportDiagnostics: boolean,
  ): ts.ParsedCommandLine | undefined {
    const parsed = ts.getParsedCommandLineOfConfigFile(
      configFileName,
      this.compilerOptionsOverride,
      this.parseConfigHost(),
    )
    if (reportDiagnostics && parsed) this.reportConfigDiagnostics(parsed.errors)
    return parsed
  }

  private sortedDocuments(): readonly OpenDocument[] {
    return [...this.documents.values()].toSorted((left, right) =>
      left.fileName.localeCompare(right.fileName),
    )
  }

  private nearestConfigFile(fileName: string): string | null {
    let directory = path.dirname(fileName)
    while (this.isInsideRoot(directory)) {
      const config = path.join(directory, "tsconfig.json")
      if (existsSync(config)) return normalizeNativePath(config)
      if (samePath(directory, this.root)) return null
      directory = path.dirname(directory)
    }

    return null
  }

  private parseConfigHost(): ts.ParseConfigFileHost {
    return {
      useCaseSensitiveFileNames: ts.sys.useCaseSensitiveFileNames,
      getCurrentDirectory: () => this.root,
      fileExists: (fileName) => this.fileExists(fileName),
      readFile: (fileName) => this.readFile(fileName),
      readDirectory: (rootDir, extensions, excludes, includes, depth) =>
        this.readDirectory(rootDir, extensions, excludes, includes, depth),
      onUnRecoverableConfigFileDiagnostic: (diagnostic) =>
        this.reportConfigDiagnostics([diagnostic]),
    }
  }

  private languageServiceHost(config: ProjectConfig): ts.LanguageServiceHost {
    return {
      getCompilationSettings: () => config.compilerOptions,
      getCurrentDirectory: () => this.root,
      getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
      getDirectories: (directoryName) => this.getDirectories(directoryName),
      getNewLine: () => ts.sys.newLine,
      getProjectVersion: () => String(this.projectVersion),
      getScriptFileNames: () => [...config.fileNames],
      getScriptSnapshot: (fileName) => this.scriptSnapshot(fileName),
      getScriptVersion: (fileName) => this.scriptVersion(fileName),
      readDirectory: (rootDir, extensions, excludes, includes, depth) =>
        this.readDirectory(rootDir, extensions, excludes, includes, depth),
      readFile: (fileName) => this.readFile(fileName),
      fileExists: (fileName) => this.fileExists(fileName),
      directoryExists: (directoryName) => this.directoryExists(directoryName),
      realpath: (fileName) => this.realpath(fileName),
      useCaseSensitiveFileNames: () => ts.sys.useCaseSensitiveFileNames,
    }
  }

  private scriptSnapshot(fileName: string): ts.IScriptSnapshot | undefined {
    const text = this.readFile(fileName)
    return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text)
  }

  private readFile(fileName: string): string | undefined {
    const normalized = normalizeNativePath(fileName)
    const openDocument = this.documentForFileName(normalized)
    if (openDocument) return openDocument.text
    if (!this.canReadFile(normalized)) return undefined
    return ts.sys.readFile(normalized)
  }

  private fileExists(fileName: string): boolean {
    const normalized = normalizeNativePath(fileName)
    if (this.documentForFileName(normalized)) return true
    if (!this.canReadFile(normalized)) return false
    return ts.sys.fileExists(normalized)
  }

  private readDirectory(
    rootDir: string,
    extensions?: readonly string[],
    excludes?: readonly string[],
    includes?: readonly string[],
    depth?: number,
  ): string[] {
    const normalized = normalizeNativePath(rootDir)
    if (!this.canReadDirectory(normalized)) return []
    return ts.sys
      .readDirectory(normalized, extensions, excludes, includes, depth)
      .map(normalizeNativePath)
      .filter((fileName) => this.canReadFile(fileName))
  }

  private directoryExists(directoryName: string): boolean {
    const normalized = normalizeNativePath(directoryName)
    if (!this.canReadDirectory(normalized)) return false
    return ts.sys.directoryExists(normalized)
  }

  private getDirectories(directoryName: string): string[] {
    const normalized = normalizeNativePath(directoryName)
    if (!this.canReadDirectory(normalized)) return []
    return ts.sys.getDirectories(normalized).map(normalizeNativePath)
  }

  private realpath(fileName: string): string {
    const normalized = normalizeNativePath(fileName)
    const real = normalizeNativePath(ts.sys.realpath?.(normalized) ?? normalized)
    if (this.canReadFile(real)) return real
    if (this.canReadDirectory(real)) return real
    return normalized
  }

  private scriptVersion(fileName: string): string {
    const normalized = normalizeNativePath(fileName)
    const openDocument = this.documentForFileName(normalized)
    if (openDocument) return String(openDocument.version)

    const cached = this.scriptVersions.get(normalized)
    if (cached !== undefined) return String(cached)

    const version = fileMtimeVersion(normalized)
    this.scriptVersions.set(normalized, version)
    return String(version)
  }

  private canReadFile(fileName: string): boolean {
    if (this.isInsideRoot(fileName)) return true
    if (isInsidePath(this.workspaceRoot, fileName)) return true
    return isInsidePath(typeScriptLibDirectory(), fileName)
  }

  private canReadDirectory(directoryName: string): boolean {
    if (this.isInsideRoot(directoryName)) return true
    if (isInsidePath(this.workspaceRoot, directoryName)) return true
    return isInsidePath(typeScriptLibDirectory(), directoryName)
  }

  private isInsideRoot(candidate: string): boolean {
    return isInsidePath(this.root, candidate)
  }

  private fileNameForUri(uri: lsp.DocumentUri): string | null {
    const fileName = documentUriToFileName(uri)
    if (!fileName) return null
    if (this.isInsideRoot(fileName)) return fileName

    const workspaceFileName = documentUriToWorkspaceFileName(this.workspaceRoot, uri)
    if (!workspaceFileName) return null
    if (!this.isInsideRoot(workspaceFileName)) return null
    return workspaceFileName
  }

  private textDocumentPosition(params: unknown): TextDocumentPositionRequest | null {
    const request = textDocumentPositionParams(params)
    if (!request) return null

    const fileName = this.fileNameForUri(request.uri)
    if (!fileName) return null

    return { ...request, fileName }
  }

  private documentText(fileName: string): string | null {
    return this.readFile(fileName) ?? null
  }

  private documentForFileName(fileName: string): OpenDocument | null {
    for (const document of this.documents.values()) {
      if (samePath(document.fileName, fileName)) return document
    }

    return null
  }

  private scheduleDiagnostics(uri: lsp.DocumentUri): void {
    this.clearScheduledDiagnostics(uri)
    const timer = setTimeout(() => {
      this.diagnosticTimers.delete(uri)
      this.publishDiagnostics(uri)
    }, this.diagnosticDelayMs)
    this.diagnosticTimers.set(uri, timer)
  }

  private clearScheduledDiagnostics(uri: lsp.DocumentUri): void {
    const timer = this.diagnosticTimers.get(uri)
    if (!timer) return

    clearTimeout(timer)
    this.diagnosticTimers.delete(uri)
  }

  private publishDiagnostics(uri: lsp.DocumentUri): void {
    const document = this.documents.get(uri)
    if (!document) return

    try {
      const diagnostics = this.collectDiagnostics(document.fileName)
      this.postDiagnostics(uri, document.version, diagnostics)
    } catch (error) {
      this.postLogMessage(error)
    }
  }

  private collectDiagnostics(fileName: string): readonly lsp.Diagnostic[] {
    const service = this.ensureService()
    return [
      ...service.getSyntacticDiagnostics(fileName),
      ...service.getSemanticDiagnostics(fileName),
      ...service.getSuggestionDiagnostics(fileName),
    ].map((diagnostic) => tsDiagnosticToLspDiagnostic(diagnostic, this.readFile(diagnosticFileName(diagnostic, fileName)) ?? ""))
  }

  private locationForDefinition(definition: ts.DefinitionInfo): readonly lsp.Location[] {
    return this.locationForTextSpan(definition.fileName, definition.textSpan)
  }

  private locationForTextSpan(fileName: string, span: ts.TextSpan): readonly lsp.Location[] {
    const normalized = normalizeNativePath(fileName)
    if (!this.isInsideRoot(normalized)) return []

    const text = this.documentText(normalized)
    if (text === null) return []

    return [
      {
        uri: this.documentUriForFileName(normalized),
        range: rangeFromTextSpan(text, span),
      },
    ]
  }

  private documentSymbol(item: ts.NavigationTree, fallbackText: string): readonly lsp.DocumentSymbol[] {
    const span = item.spans[0]
    if (!span) return []

    const range = rangeFromTextSpan(fallbackText, span)
    return [
      {
        name: item.text || "<anonymous>",
        kind: symbolKind(item.kind),
        range,
        selectionRange: range,
        children: item.childItems?.flatMap((child) => this.documentSymbol(child, fallbackText)),
      },
    ]
  }

  private workspaceEditFromRenameLocations(
    locations: readonly ts.RenameLocation[],
    newName: string,
  ): lsp.WorkspaceEdit {
    const changes: Record<lsp.DocumentUri, lsp.TextEdit[]> = {}
    for (const location of locations) {
      this.appendTextChange(changes, location.fileName, {
        span: location.textSpan,
        newText: `${location.prefixText ?? ""}${newName}${location.suffixText ?? ""}`,
      })
    }

    return { changes }
  }

  private codeActionFromFix(
    fix: ts.CodeFixAction,
    diagnostics: readonly lsp.Diagnostic[],
  ): readonly lsp.CodeAction[] {
    const edit = this.workspaceEditFromFileTextChanges(fix.changes)
    if (!edit) return []

    return [
      {
        title: fix.description,
        kind: "quickfix",
        diagnostics: [...diagnostics],
        edit,
      },
    ]
  }

  private workspaceEditFromFileTextChanges(
    changes: readonly ts.FileTextChanges[],
  ): lsp.WorkspaceEdit | null {
    const result: Record<lsp.DocumentUri, lsp.TextEdit[]> = {}
    for (const change of changes) this.appendFileTextChanges(result, change)
    if (Object.keys(result).length === 0) return null
    return { changes: result }
  }

  private appendFileTextChanges(
    changes: Record<lsp.DocumentUri, lsp.TextEdit[]>,
    fileChange: ts.FileTextChanges,
  ): void {
    for (const textChange of fileChange.textChanges) {
      this.appendTextChange(changes, fileChange.fileName, textChange)
    }
  }

  private appendTextChange(
    changes: Record<lsp.DocumentUri, lsp.TextEdit[]>,
    fileName: string,
    textChange: ts.TextChange,
  ): void {
    const normalized = normalizeNativePath(fileName)
    if (!this.isInsideRoot(normalized)) return

    const text = this.documentText(normalized)
    if (text === null) return

    const uri = this.documentUriForFileName(normalized)
    const edits = changes[uri] ?? []
    edits.push({
      range: rangeFromTextSpan(text, textChange.span),
      newText: textChange.newText,
    })
    changes[uri] = edits
  }

  private documentUriForFileName(fileName: string): lsp.DocumentUri {
    const normalized = normalizeNativePath(fileName)
    if (!isInsidePath(this.workspaceRoot, normalized)) return fileNameToDocumentUri(normalized)

    const relativePath = path.relative(this.workspaceRoot, normalized)
    return relativePathToDocumentUri(relativePath)
  }

  private bumpScriptVersion(fileName: string): void {
    const current = this.scriptVersions.get(fileName) ?? fileMtimeVersion(fileName)
    this.scriptVersions.set(fileName, current + 1)
    this.projectVersion += 1
  }

  private invalidateService(): void {
    this.projectVersion += 1
    this.disposeService()
  }

  private disposeService(): void {
    this.service?.dispose()
    this.service = null
  }

  private reportConfigDiagnostics(diagnostics: readonly ts.Diagnostic[]): void {
    for (const diagnostic of diagnostics) this.postLogMessage(tsDiagnosticMessage(diagnostic))
  }

  private postDiagnostics(
    uri: lsp.DocumentUri,
    version: number | null,
    diagnostics: readonly lsp.Diagnostic[],
  ): void {
    const params: lsp.PublishDiagnosticsParams = {
      uri,
      diagnostics: [...diagnostics],
    }
    if (version !== null) params.version = version
    this.postNotification("textDocument/publishDiagnostics", params)
  }

  private postResponse(id: lsp.RequestMessage["id"] | null, result: unknown): void {
    this.postMessage({ jsonrpc: JSON_RPC_VERSION, id, result })
  }

  private postResponseError(id: lsp.RequestMessage["id"] | null, error: unknown): void {
    this.postMessage({
      jsonrpc: JSON_RPC_VERSION,
      id,
      error: responseError(error),
    })
  }

  private postNotification(method: string, params: unknown): void {
    if (this.shutdown && method !== "window/logMessage") return
    this.postMessage({ jsonrpc: JSON_RPC_VERSION, method, params })
  }

  private postLogMessage(error: unknown): void {
    this.postNotification("window/logMessage", {
      type: 2,
      message: errorMessage(error),
    })
  }

  private postMessage(message: unknown): void {
    this.sendMessage(JSON.stringify(message))
  }
}

function defaultCompilerOptions(): ts.CompilerOptions {
  return {
    target: ts.ScriptTarget.ES2023,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    jsx: ts.JsxEmit.ReactJSX,
    strict: true,
    noEmit: true,
    allowJs: true,
    checkJs: false,
    allowImportingTsExtensions: true,
    esModuleInterop: true,
    skipLibCheck: true,
    resolveJsonModule: true,
  }
}

function hoverFromQuickInfo(text: string, quickInfo: ts.QuickInfo): lsp.Hover {
  const display = ts.displayPartsToString(quickInfo.displayParts ?? [])
  const documentation = ts.displayPartsToString(quickInfo.documentation ?? [])
  const tags = quickInfo.tags?.map(tagText).filter(Boolean) ?? []

  return {
    contents: {
      kind: "markdown",
      value: hoverMarkdown(display, documentation, tags),
    },
    range: rangeFromTextSpan(text, quickInfo.textSpan),
  }
}

function hoverMarkdown(display: string, documentation: string, tags: readonly string[]): string {
  const sections: string[] = []
  if (display) sections.push(["```ts", display, "```"].join("\n"))
  if (documentation) sections.push(documentation)
  if (tags.length > 0) sections.push(tags.join("\n"))
  return sections.join("\n\n")
}

function tagText(tag: ts.JSDocTagInfo): string {
  const text = ts.displayPartsToString(tag.text ?? [])
  return text ? `@${tag.name} ${text}` : `@${tag.name}`
}

function completionList(items: readonly lsp.CompletionItem[]): lsp.CompletionList {
  return { isIncomplete: false, items: [...items] }
}

function completionItem(entry: ts.CompletionEntry): lsp.CompletionItem {
  return {
    label: entry.name,
    kind: completionItemKind(entry.kind),
    sortText: entry.sortText,
    insertText: entry.insertText,
    detail: entry.sourceDisplay ? ts.displayPartsToString(entry.sourceDisplay) : undefined,
  }
}

function signatureHelp(help: ts.SignatureHelpItems): lsp.SignatureHelp {
  return {
    activeParameter: help.argumentIndex,
    activeSignature: help.selectedItemIndex,
    signatures: help.items.map(signatureInformation),
  }
}

function signatureInformation(item: ts.SignatureHelpItem): lsp.SignatureInformation {
  return {
    label: signatureLabel(item),
    documentation: ts.displayPartsToString(item.documentation),
    parameters: item.parameters.map((parameter) => ({
      label: ts.displayPartsToString(parameter.displayParts),
      documentation: ts.displayPartsToString(parameter.documentation),
    })),
  }
}

function signatureLabel(item: ts.SignatureHelpItem): string {
  const prefix = ts.displayPartsToString(item.prefixDisplayParts)
  const suffix = ts.displayPartsToString(item.suffixDisplayParts)
  const separator = ts.displayPartsToString(item.separatorDisplayParts)
  const parameters = item.parameters.map((parameter) => ts.displayPartsToString(parameter.displayParts))
  return `${prefix}${parameters.join(separator)}${suffix}`
}

function tsDiagnosticToLspDiagnostic(diagnostic: ts.Diagnostic, text: string): lsp.Diagnostic {
  return {
    range: diagnosticRange(diagnostic, text),
    severity: diagnosticSeverity(diagnostic.category),
    code: diagnostic.code,
    source: "typescript",
    message: tsDiagnosticMessage(diagnostic),
  }
}

function diagnosticRange(diagnostic: ts.Diagnostic, text: string): lsp.Range {
  const start = diagnostic.start ?? 0
  const length = diagnostic.length ?? 1
  return rangeFromTextSpan(text, { start, length })
}

function diagnosticSeverity(category: ts.DiagnosticCategory): lsp.DiagnosticSeverity {
  if (category === ts.DiagnosticCategory.Error) return 1
  if (category === ts.DiagnosticCategory.Warning) return 2
  if (category === ts.DiagnosticCategory.Suggestion) return 4
  return 3
}

function diagnosticFileName(diagnostic: ts.Diagnostic, fallback: string): string {
  return diagnostic.file?.fileName ? normalizeNativePath(diagnostic.file.fileName) : fallback
}

function tsDiagnosticMessage(diagnostic: ts.Diagnostic): string {
  return ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")
}

function rangeFromTextSpan(text: string, span: ts.TextSpan): lsp.Range {
  const start = clampOffset(span.start, text)
  const end = clampOffset(span.start + span.length, text)
  return {
    start: offsetToLspPosition(text, start),
    end: offsetToLspPosition(text, end),
  }
}

function applyContentChanges(
  text: string,
  changes: readonly lsp.TextDocumentContentChangeEvent[],
): string {
  let nextText = text
  for (const change of changes) nextText = applyContentChange(nextText, change)
  return nextText
}

function applyContentChange(text: string, change: lsp.TextDocumentContentChangeEvent): string {
  if (!("range" in change) || !change.range) return change.text

  const start = lspPositionToOffset(text, change.range.start)
  const end = lspPositionToOffset(text, change.range.end)
  return `${text.slice(0, start)}${change.text}${text.slice(end)}`
}

function offsetToLspPosition(text: string, offset: number): lsp.Position {
  const clamped = clampOffset(offset, text)
  let line = 0
  let lineStart = 0

  for (let index = 0; index < clamped; index += 1) {
    if (text[index] !== "\n") continue
    line += 1
    lineStart = index + 1
  }

  return { line, character: clamped - lineStart }
}

function lspPositionToOffset(text: string, position: lsp.Position): number {
  let line = 0
  let lineStart = 0

  for (let index = 0; index < text.length; index += 1) {
    if (line >= position.line) break
    if (text[index] !== "\n") continue
    line += 1
    lineStart = index + 1
  }

  if (line < position.line) return text.length
  return clampOffset(lineStart + position.character, text)
}

function clampOffset(offset: number, text: string): number {
  return Math.min(text.length, Math.max(0, offset))
}

function textDocumentItem(params: unknown): lsp.TextDocumentItem | null {
  if (!isRecord(params)) return null
  if (!isRecord(params.textDocument)) return null

  const textDocument = params.textDocument
  if (typeof textDocument.uri !== "string") return null
  if (typeof textDocument.languageId !== "string") return null
  if (typeof textDocument.version !== "number") return null
  if (typeof textDocument.text !== "string") return null
  return textDocument as unknown as lsp.TextDocumentItem
}

function didChangeParams(params: unknown): {
  uri: lsp.DocumentUri
  version: number
  contentChanges: readonly lsp.TextDocumentContentChangeEvent[]
} | null {
  if (!isRecord(params)) return null
  if (!isRecord(params.textDocument)) return null
  if (!Array.isArray(params.contentChanges)) return null

  const textDocument = params.textDocument
  if (typeof textDocument.uri !== "string") return null
  if (typeof textDocument.version !== "number") return null

  return {
    uri: textDocument.uri,
    version: textDocument.version,
    contentChanges: params.contentChanges as lsp.TextDocumentContentChangeEvent[],
  }
}

function didCloseUri(params: unknown): lsp.DocumentUri | null {
  const document = textDocumentIdentifier(params)
  return document?.uri ?? null
}

function textDocumentIdentifier(params: unknown): lsp.TextDocumentIdentifier | null {
  if (!isRecord(params)) return null
  if (!isRecord(params.textDocument)) return null
  return typeof params.textDocument.uri === "string"
    ? ({ uri: params.textDocument.uri } satisfies lsp.TextDocumentIdentifier)
    : null
}

function textDocumentPositionParams(params: unknown): {
  uri: lsp.DocumentUri
  position: lsp.Position
} | null {
  if (!isRecord(params)) return null
  if (!isRecord(params.textDocument)) return null
  if (!isRecord(params.position)) return null
  if (typeof params.textDocument.uri !== "string") return null
  if (typeof params.position.line !== "number") return null
  if (typeof params.position.character !== "number") return null

  return {
    uri: params.textDocument.uri,
    position: {
      line: params.position.line,
      character: params.position.character,
    },
  }
}

function renameParams(params: unknown): {
  uri: lsp.DocumentUri
  position: lsp.Position
  newName: string
} | null {
  const request = textDocumentPositionParams(params)
  if (!request) return null
  if (!isRecord(params)) return null
  if (typeof params.newName !== "string") return null
  return { ...request, newName: params.newName }
}

function codeActionParams(params: unknown): {
  uri: lsp.DocumentUri
  range: lsp.Range
  diagnostics: readonly lsp.Diagnostic[]
} | null {
  if (!isRecord(params)) return null
  if (!isRecord(params.textDocument)) return null
  if (!isRecord(params.range)) return null
  if (!isRecord(params.context)) return null
  if (typeof params.textDocument.uri !== "string") return null
  if (!isLspRange(params.range)) return null
  if (!Array.isArray(params.context.diagnostics)) return null

  return {
    uri: params.textDocument.uri,
    range: params.range,
    diagnostics: params.context.diagnostics as lsp.Diagnostic[],
  }
}

function isLspRange(value: Record<string, unknown>): value is lsp.Range {
  if (!isRecord(value.start)) return false
  if (!isRecord(value.end)) return false
  if (typeof value.start.line !== "number") return false
  if (typeof value.start.character !== "number") return false
  if (typeof value.end.line !== "number") return false
  return typeof value.end.character === "number"
}

function diagnosticCode(diagnostic: lsp.Diagnostic): readonly number[] {
  if (typeof diagnostic.code === "number") return [diagnostic.code]
  if (typeof diagnostic.code !== "string") return []
  const parsed = Number(diagnostic.code)
  return Number.isInteger(parsed) ? [parsed] : []
}

function initializationOptions(params: unknown): {
  compilerOptions?: ts.CompilerOptions
  diagnosticDelayMs?: number
} {
  if (!isRecord(params)) return {}
  if (!isRecord(params.initializationOptions)) return {}

  const options = params.initializationOptions
  return {
    compilerOptions: isRecord(options.compilerOptions)
      ? (options.compilerOptions as ts.CompilerOptions)
      : undefined,
    diagnosticDelayMs:
      typeof options.diagnosticDelayMs === "number" ? options.diagnosticDelayMs : undefined,
  }
}

function completionItemKind(kind: string): lsp.CompletionItemKind {
  if (kind === ts.ScriptElementKind.classElement) return 7
  if (kind === ts.ScriptElementKind.interfaceElement) return 8
  if (kind === ts.ScriptElementKind.memberFunctionElement) return 2
  if (kind === ts.ScriptElementKind.functionElement) return 3
  if (kind === ts.ScriptElementKind.memberVariableElement) return 5
  if (kind === ts.ScriptElementKind.constElement) return 6
  if (kind === ts.ScriptElementKind.letElement) return 6
  if (kind === ts.ScriptElementKind.moduleElement) return 9
  if (kind === ts.ScriptElementKind.keyword) return 14
  return 1
}

function symbolKind(kind: string): lsp.SymbolKind {
  if (kind === ts.ScriptElementKind.moduleElement) return 2
  if (kind === ts.ScriptElementKind.classElement) return 5
  if (kind === ts.ScriptElementKind.enumElement) return 10
  if (kind === ts.ScriptElementKind.interfaceElement) return 11
  if (kind === ts.ScriptElementKind.functionElement) return 12
  if (kind === ts.ScriptElementKind.memberFunctionElement) return 6
  if (kind === ts.ScriptElementKind.memberVariableElement) return 7
  if (kind === ts.ScriptElementKind.constElement) return 13
  if (kind === ts.ScriptElementKind.letElement) return 13
  return 13
}

function referencedConfigFileName(
  parentConfigFileName: string,
  reference: ts.ProjectReference,
): string {
  const basePath = path.resolve(path.dirname(parentConfigFileName), reference.path)
  if (path.extname(basePath) === ".json") return normalizeNativePath(basePath)
  return normalizeNativePath(path.join(basePath, "tsconfig.json"))
}

function documentUriToFileName(uri: string): string | null {
  try {
    const url = new URL(uri)
    if (url.protocol !== "file:") return null
    return normalizeNativePath(decodeURIComponent(url.pathname))
  } catch {
    return null
  }
}

function documentUriToWorkspaceFileName(workspaceRoot: string, uri: string): string | null {
  try {
    const url = new URL(uri)
    if (url.protocol !== "file:") return null

    const relativePath = decodeURIComponent(url.pathname).replace(/^\/+/, "")
    if (relativePath === "") return normalizeNativePath(workspaceRoot)
    return normalizeNativePath(path.join(workspaceRoot, relativePath))
  } catch {
    return null
  }
}

function fileNameToDocumentUri(fileName: string): lsp.DocumentUri {
  const normalized = normalizeNativePath(fileName)
  return `file://${normalized.split("/").map(encodePathPart).join("/")}`
}

function relativePathToDocumentUri(relativePath: string): lsp.DocumentUri {
  const normalized = relativePath.split(path.sep).join("/").replace(/^\/+/, "")
  return `file:///${normalized.split("/").map(encodeURIComponent).join("/")}`
}

function encodePathPart(part: string, index: number): string {
  if (index === 0 && part === "") return ""
  return encodeURIComponent(part)
}

function normalizeNativePath(input: string): string {
  return path.resolve(input).split(path.sep).join("/")
}

function samePath(left: string, right: string): boolean {
  return normalizeNativePath(left) === normalizeNativePath(right)
}

function isInsidePath(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate)
  if (relative === "") return true
  if (relative.startsWith("..")) return false
  return !path.isAbsolute(relative)
}

function typeScriptLibDirectory(): string {
  return normalizeNativePath(path.dirname(ts.getDefaultLibFilePath(defaultCompilerOptions())))
}

function isTypeScriptFileName(fileName: string): boolean {
  return TYPE_SCRIPT_EXTENSIONS.has(path.extname(fileName).toLowerCase())
}

function isProjectMetadataFile(fileName: string): boolean {
  const name = path.basename(fileName)
  return name === "tsconfig.json" || name === "package.json"
}

function fileMtimeVersion(fileName: string): number {
  try {
    return statSync(fileName).mtimeMs
  } catch {
    return 0
  }
}

function parseIncomingMessage(data: string | ArrayBuffer | Uint8Array): unknown {
  const text = incomingText(data)
  if (text === null) return null

  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

function incomingText(data: string | ArrayBuffer | Uint8Array): string | null {
  if (typeof data === "string") return data
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(data)
  if (data instanceof Uint8Array) return new TextDecoder().decode(data)
  return null
}

function isRequestMessage(message: unknown): message is lsp.RequestMessage {
  if (!isRecord(message)) return false
  return "id" in message && typeof message.method === "string"
}

function isNotificationMessage(message: unknown): message is lsp.NotificationMessage {
  if (!isRecord(message)) return false
  return !("id" in message) && typeof message.method === "string"
}

function responseError(error: unknown): JsonRpcError {
  if (isRpcError(error)) return error
  return rpcError(INTERNAL_ERROR, errorMessage(error))
}

function rpcError(code: number, message: string, data?: unknown): JsonRpcError {
  return data === undefined ? { code, message } : { code, message, data }
}

function isRpcError(error: unknown): error is JsonRpcError {
  if (!isRecord(error)) return false
  return typeof error.code === "number" && typeof error.message === "string"
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error
  return "TypeScript LSP operation failed"
}

export const testInternals = {
  INVALID_PARAMS,
  documentUriToFileName,
  documentUriToWorkspaceFileName,
  fileNameToDocumentUri,
  relativePathToDocumentUri,
  lspPositionToOffset,
  offsetToLspPosition,
}
