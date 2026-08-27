import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'
import ts from 'typescript-language-service'
import type * as lsp from 'vscode-languageserver-protocol'

import { handleCodeAction } from '../handlers/code-action'
import { handleInitialize } from '../handlers/initialize'
import { handleRename } from '../handlers/rename'
import { workspaceEditFromFileTextChanges } from '../handlers/workspace-edit'
import { TypeScriptLspSession } from '../session'
import type {
  OpenDocument,
  SessionContext,
  SessionInitializationOptions,
  WorkspaceEditClientCapabilities,
} from '../shared/context'

type JsonMessage = Record<string, unknown>

const roots: string[] = []
const sessions: TypeScriptLspSession[] = []

const ADVERTISED_WORKSPACE_EDIT_CAPABILITY = {
  changeAnnotationSupport: { groupsOnLabel: true },
  documentChanges: true,
  failureHandling: 'undo',
  normalizesLineEndings: true,
  resourceOperations: ['create', 'rename', 'delete'],
} as const

const CAPABLE_WORKSPACE_EDIT = {
  changeAnnotationSupport: true,
  documentChanges: true,
  resourceOperations: ['create', 'rename', 'delete'],
} as const satisfies WorkspaceEditClientCapabilities

afterEach(async () => {
  for (const session of sessions.splice(0)) session.dispose()
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('TypeScript WorkspaceEdit producer', () => {
  it('emits an exact exported-symbol rename for one dirty open and one unopened file', async () => {
    const valueDiskText = 'export const value = 1\n'
    const valueOpenText = 'export const value = 2\n'
    const useText = "import { value } from './value'\nconsole.log(value)\n"
    const root = await fixtureRoot({
      'src/use.ts': useText,
      'src/value.ts': valueDiskText,
      'tsconfig.json': JSON.stringify({ include: ['src'] }),
    })
    const { messages, session } = sessionForRoot(root)
    initializeSession(session)
    openDocument(session, 'file:///src/value.ts', valueOpenText, 5)

    const rename = await request(session, messages, 2, 'textDocument/rename', {
      newName: 'nextValue',
      position: { line: 0, character: 14 },
      textDocument: { uri: 'file:///src/value.ts' },
    })

    expect(rename.result).toEqual({
      documentChanges: [
        {
          edits: [
            {
              newText: 'nextValue',
              range: {
                end: { character: 18, line: 0 },
                start: { character: 13, line: 0 },
              },
            },
          ],
          textDocument: { uri: 'file:///src/value.ts', version: 5 },
        },
        {
          edits: [
            {
              newText: 'nextValue',
              range: {
                end: { character: 14, line: 0 },
                start: { character: 9, line: 0 },
              },
            },
            {
              newText: 'nextValue',
              range: {
                end: { character: 17, line: 1 },
                start: { character: 12, line: 1 },
              },
            },
          ],
          textDocument: { uri: 'file:///src/use.ts', version: null },
        },
      ],
    })
    await expect(readFile(path.join(root, 'src/value.ts'), 'utf8')).resolves.toBe(valueDiskText)
    await expect(readFile(path.join(root, 'src/use.ts'), 'utf8')).resolves.toBe(useText)
  })

  it('converts a readonly two-target FileTextChanges batch completely in first-seen order', async () => {
    const aText = 'export const value = 1\n'
    const bText = 'console.log(value)\n'
    const root = await fixtureRoot({ 'src/a.ts': aText, 'src/b.ts': bText })
    const aFileName = path.join(root, 'src/a.ts')
    const bFileName = path.join(root, 'src/b.ts')
    const documents = new Map<lsp.DocumentUri, OpenDocument>([
      [
        'file:///src/a.ts',
        {
          fileName: aFileName,
          languageId: 'typescript',
          text: aText,
          uri: 'file:///src/a.ts',
          version: 7,
        },
      ],
    ])
    const input = [
      {
        fileName: aFileName,
        textChanges: [{ newText: 'nextValue', span: { length: 5, start: 13 } }],
      },
      {
        fileName: bFileName,
        textChanges: [{ newText: 'nextValue', span: { length: 5, start: 12 } }],
      },
    ] as const satisfies readonly ts.FileTextChanges[]

    const edit = workspaceEditFromFileTextChanges(
      contextForRoot(root, { documents, workspaceEditCapabilities: CAPABLE_WORKSPACE_EDIT }),
      input,
    )

    expect(edit).toEqual({
      documentChanges: [
        {
          edits: [
            {
              newText: 'nextValue',
              range: {
                end: { character: 18, line: 0 },
                start: { character: 13, line: 0 },
              },
            },
          ],
          textDocument: { uri: 'file:///src/a.ts', version: 7 },
        },
        {
          edits: [
            {
              newText: 'nextValue',
              range: {
                end: { character: 17, line: 0 },
                start: { character: 12, line: 0 },
              },
            },
          ],
          textDocument: { uri: 'file:///src/b.ts', version: null },
        },
      ],
    })
    await expect(readFile(aFileName, 'utf8')).resolves.toBe(aText)
    await expect(readFile(bFileName, 'utf8')).resolves.toBe(bText)
  })

  it('wires a real spelling diagnostic code action through the complete producer', async () => {
    const text = 'const count = 1\nconsole.log(cout)\n'
    const root = await fixtureRoot({ 'src/index.ts': text })
    const { messages, session } = sessionForRoot(root)
    initializeSession(session)
    openDocument(session, 'file:///src/index.ts', text, 9)

    const published = await waitForMessage(messages, 'textDocument/publishDiagnostics')
    const publishedParams = published.params as {
      diagnostics: lsp.Diagnostic[]
      uri: string
      version: number
    }
    const diagnostic = publishedParams.diagnostics.find((item) => item.code === 2552)
    expect(diagnostic).toEqual(
      expect.objectContaining({
        code: 2552,
        range: {
          end: { character: 16, line: 1 },
          start: { character: 12, line: 1 },
        },
      }),
    )
    const spellingDiagnostic = diagnostic as lsp.Diagnostic

    const response = await request(session, messages, 2, 'textDocument/codeAction', {
      context: { diagnostics: [spellingDiagnostic] },
      range: spellingDiagnostic.range,
      textDocument: { uri: 'file:///src/index.ts' },
    })

    expect(response.result).toEqual([
      {
        diagnostics: [spellingDiagnostic],
        edit: {
          documentChanges: [
            {
              edits: [
                {
                  newText: 'count',
                  range: {
                    end: { character: 16, line: 1 },
                    start: { character: 12, line: 1 },
                  },
                },
              ],
              textDocument: { uri: 'file:///src/index.ts', version: 9 },
            },
          ],
        },
        kind: 'quickfix',
        title: "Change spelling to 'count'",
      },
    ])
    await expect(readFile(path.join(root, 'src/index.ts'), 'utf8')).resolves.toBe(text)
  })

  it('emits create before edits for an isNewFile change', async () => {
    const root = await fixtureRoot({})
    const fileName = path.join(root, 'src/new.ts')

    const edit = workspaceEditFromFileTextChanges(
      contextForRoot(root, { workspaceEditCapabilities: CAPABLE_WORKSPACE_EDIT }),
      [
        {
          fileName,
          isNewFile: true,
          textChanges: [{ newText: 'export const value = 1\n', span: { length: 0, start: 0 } }],
        },
      ],
    )

    expect(edit).toEqual({
      documentChanges: [
        { kind: 'create', uri: 'file:///src/new.ts' },
        {
          edits: [
            {
              newText: 'export const value = 1\n',
              range: {
                end: { character: 0, line: 0 },
                start: { character: 0, line: 0 },
              },
            },
          ],
          textDocument: { uri: 'file:///src/new.ts', version: null },
        },
      ],
    })
  })

  it('rejects isNewFile when the client omitted create resource support', async () => {
    const root = await fixtureRoot({})
    const capabilities = {
      ...CAPABLE_WORKSPACE_EDIT,
      resourceOperations: ['rename', 'delete'],
    } as const satisfies WorkspaceEditClientCapabilities

    const edit = workspaceEditFromFileTextChanges(
      contextForRoot(root, { workspaceEditCapabilities: capabilities }),
      [
        {
          fileName: path.join(root, 'src/new.ts'),
          isNewFile: true,
          textChanges: [{ newText: 'new text', span: { length: 0, start: 0 } }],
        },
      ],
    )

    expect(edit).toBeNull()
  })

  it('emits complete legacy changes for an incapable text-only client', async () => {
    const root = await fixtureRoot({ 'src/a.ts': 'value\n', 'src/b.ts': 'value\n' })
    const capabilities = {
      changeAnnotationSupport: false,
      documentChanges: false,
      resourceOperations: [],
    } as const satisfies WorkspaceEditClientCapabilities

    const edit = workspaceEditFromFileTextChanges(
      contextForRoot(root, { workspaceEditCapabilities: capabilities }),
      [
        {
          fileName: path.join(root, 'src/a.ts'),
          textChanges: [{ newText: 'next', span: { length: 5, start: 0 } }],
        },
        {
          fileName: path.join(root, 'src/b.ts'),
          textChanges: [{ newText: 'next', span: { length: 5, start: 0 } }],
        },
      ],
    )

    expect(edit).toEqual({
      changes: {
        'file:///src/a.ts': [
          {
            newText: 'next',
            range: {
              end: { character: 5, line: 0 },
              start: { character: 0, line: 0 },
            },
          },
        ],
        'file:///src/b.ts': [
          {
            newText: 'next',
            range: {
              end: { character: 5, line: 0 },
              start: { character: 0, line: 0 },
            },
          },
        ],
      },
    })
  })

  it('initialization retains the exact workspace edit capability matrix', async () => {
    const root = await fixtureRoot({})
    let applied: SessionInitializationOptions | null = null
    const ctx = contextForRoot(root, {
      applyInitializationOptions: (options) => {
        applied = options
      },
    })

    handleInitialize(ctx, {
      capabilities: {
        workspace: { workspaceEdit: ADVERTISED_WORKSPACE_EDIT_CAPABILITY },
      },
      initializationOptions: { diagnosticDelayMs: 0 },
    })

    expect(applied).toEqual({
      compilerOptions: undefined,
      diagnosticDelayMs: 0,
      workspaceEditCapabilities: CAPABLE_WORKSPACE_EDIT,
    })
  })

  it('rejects an entire rename when one location is outside root or unreadable', async () => {
    const root = await fixtureRoot({ 'src/index.ts': 'const value = 1\n' })
    const outsideRoot = await fixtureRoot({ 'outside.ts': 'value\n' })
    const fileName = path.join(root, 'src/index.ts')
    let extraFileName = path.join(outsideRoot, 'outside.ts')
    const languageService = {
      findRenameLocations: () => [
        { fileName, textSpan: { length: 5, start: 6 } },
        { fileName: extraFileName, textSpan: { length: 5, start: 0 } },
      ],
    } as unknown as ts.LanguageService
    const ctx = contextForRoot(root, {
      languageService,
      workspaceEditCapabilities: CAPABLE_WORKSPACE_EDIT,
    })

    expect(
      handleRename(ctx, {
        newName: 'next',
        position: { character: 7, line: 0 },
        textDocument: { uri: 'file:///src/index.ts' },
      }),
    ).toBeNull()

    extraFileName = path.join(root, 'src/missing.ts')
    expect(
      handleRename(ctx, {
        newName: 'next',
        position: { character: 7, line: 0 },
        textDocument: { uri: 'file:///src/index.ts' },
      }),
    ).toBeNull()
  })

  it('omits an entire code action when one file change cannot be represented', async () => {
    const root = await fixtureRoot({ 'src/index.ts': 'const value = 1\n' })
    const fileName = path.join(root, 'src/index.ts')
    const languageService = codeFixLanguageService([
      {
        fileName,
        textChanges: [{ newText: 'next', span: { length: 5, start: 6 } }],
      },
      {
        fileName: path.join(root, 'src/missing.ts'),
        textChanges: [{ newText: 'next', span: { length: 0, start: 0 } }],
      },
    ])
    const ctx = contextForRoot(root, {
      languageService,
      workspaceEditCapabilities: CAPABLE_WORKSPACE_EDIT,
    })

    const actions = handleCodeAction(ctx, {
      context: { diagnostics: [diagnostic(1)] },
      range: zeroRange(),
      textDocument: { uri: 'file:///src/index.ts' },
    })

    expect(actions).toEqual([])
  })

  it('rejects the whole producer result for a negative or out-of-bounds TypeScript span', async () => {
    const root = await fixtureRoot({ 'src/index.ts': 'value\n' })
    const fileName = path.join(root, 'src/index.ts')
    const ctx = contextForRoot(root, { workspaceEditCapabilities: CAPABLE_WORKSPACE_EDIT })
    const invalidSpans = [
      { length: 1, start: -1 },
      { length: -1, start: 0 },
      { length: 7, start: 0 },
      { length: 0, start: 7 },
    ]

    for (const span of invalidSpans) {
      expect(
        workspaceEditFromFileTextChanges(ctx, [
          { fileName, textChanges: [{ newText: 'next', span }] },
        ]),
      ).toBeNull()
    }
  })

  it('resolves aliased native paths to one atomic open text and version record', async () => {
    const root = await fixtureRoot({ 'src/index.ts': 'x\n' })
    const openText = 'export const openValue = 1\n'
    const documents = new Map<lsp.DocumentUri, OpenDocument>([
      [
        'file:///src/index.ts',
        {
          fileName: `${root}/src/../src/index.ts`,
          languageId: 'typescript',
          text: openText,
          uri: 'file:///src/index.ts',
          version: 11,
        },
      ],
    ])

    const edit = workspaceEditFromFileTextChanges(
      contextForRoot(root, { documents, workspaceEditCapabilities: CAPABLE_WORKSPACE_EDIT }),
      [
        {
          fileName: `${root}/src/./index.ts`,
          textChanges: [{ newText: 'nextValue', span: { length: 9, start: 13 } }],
        },
      ],
    )

    expect(edit).toEqual({
      documentChanges: [
        {
          edits: [
            {
              newText: 'nextValue',
              range: {
                end: { character: 22, line: 0 },
                start: { character: 13, line: 0 },
              },
            },
          ],
          textDocument: { uri: 'file:///src/index.ts', version: 11 },
        },
      ],
    })
  })

  it('passes the owned mutable diagnostic container without copying', async () => {
    const root = await fixtureRoot({ 'src/index.ts': 'const value = 1\n' })
    const fileName = path.join(root, 'src/index.ts')
    const diagnostics = [diagnostic(1)]
    const ctx = contextForRoot(root, {
      languageService: codeFixLanguageService([
        {
          fileName,
          textChanges: [{ newText: 'next', span: { length: 5, start: 6 } }],
        },
      ]),
      workspaceEditCapabilities: CAPABLE_WORKSPACE_EDIT,
    })

    const actions = handleCodeAction(ctx, {
      context: { diagnostics },
      range: zeroRange(),
      textDocument: { uri: 'file:///src/index.ts' },
    })

    expect(actions).toHaveLength(1)
    expect((actions[0] as lsp.CodeAction).diagnostics).toBe(diagnostics)
  })
})

function contextForRoot(
  root: string,
  options: {
    readonly applyInitializationOptions?: (options: SessionInitializationOptions) => void
    readonly documents?: Map<lsp.DocumentUri, OpenDocument>
    readonly languageService?: ts.LanguageService
    readonly workspaceEditCapabilities?: WorkspaceEditClientCapabilities
  } = {},
): SessionContext {
  return {
    applyInitializationOptions: options.applyInitializationOptions ?? vi.fn(),
    bumpScriptVersion: vi.fn(),
    clearScheduledDiagnostics: vi.fn(),
    compilerOptionsOverride: {},
    documents: options.documents ?? new Map(),
    getLanguageService: () => options.languageService ?? ({} as ts.LanguageService),
    getProjectVersion: () => '0',
    invalidateForFileContentChange: vi.fn(),
    invalidateForProjectConfigChange: vi.fn(),
    postDiagnostics: vi.fn(),
    postLogMessage: vi.fn(),
    postResponse: vi.fn(),
    postResponseError: vi.fn(),
    root,
    scheduleDiagnostics: vi.fn(),
    workspaceEditCapabilities: options.workspaceEditCapabilities ?? CAPABLE_WORKSPACE_EDIT,
    workspaceRoot: root,
  }
}

function codeFixLanguageService(changes: ts.FileTextChanges[]): ts.LanguageService {
  return {
    getCodeFixesAtPosition: () => [
      {
        changes,
        description: 'Apply fix',
        fixName: 'test-fix',
      },
    ],
  } as unknown as ts.LanguageService
}

function diagnostic(code: number): lsp.Diagnostic {
  return { code, message: 'diagnostic', range: zeroRange() }
}

function zeroRange(): lsp.Range {
  return {
    end: { character: 0, line: 0 },
    start: { character: 0, line: 0 },
  }
}

function sessionForRoot(root: string) {
  const messages: JsonMessage[] = []
  const session = new TypeScriptLspSession({
    diagnosticDelayMs: 0,
    root,
    send: (message) => messages.push(JSON.parse(message) as JsonMessage),
    workspaceRoot: root,
  })
  sessions.push(session)
  return { messages, session }
}

function initializeSession(session: TypeScriptLspSession): void {
  send(session, {
    id: 1,
    jsonrpc: '2.0',
    method: 'initialize',
    params: {
      capabilities: {
        workspace: { workspaceEdit: ADVERTISED_WORKSPACE_EDIT_CAPABILITY },
      },
      initializationOptions: { diagnosticDelayMs: 0 },
    },
  })
}

function openDocument(
  session: TypeScriptLspSession,
  uri: string,
  text: string,
  version: number,
): void {
  notify(session, 'textDocument/didOpen', {
    textDocument: { languageId: 'typescript', text, uri, version },
  })
}

function notify(session: TypeScriptLspSession, method: string, params: unknown): void {
  send(session, { jsonrpc: '2.0', method, params })
}

function send(session: TypeScriptLspSession, message: JsonMessage): void {
  session.handleMessage(JSON.stringify(message))
}

async function request(
  session: TypeScriptLspSession,
  messages: readonly JsonMessage[],
  id: number,
  method: string,
  params: unknown,
) {
  send(session, { id, jsonrpc: '2.0', method, params })
  return waitForResponse(messages, id)
}

async function waitForResponse(messages: readonly JsonMessage[], id: number) {
  return waitFor(() => messages.find((message) => message.id === id))
}

async function waitForMessage(messages: readonly JsonMessage[], method: string) {
  return waitFor(() => messages.find((message) => message.method === method))
}

async function waitFor<T>(read: () => T | undefined): Promise<T> {
  for (let index = 0; index < 50; index += 1) {
    const value = read()
    if (value !== undefined) return value
    await Bun.sleep(10)
  }

  throw new Error('timed out waiting for LSP message')
}

async function fixtureRoot(files: Readonly<Record<string, string>>) {
  const root = await mkdtemp(path.join(tmpdir(), 'platform-ts-workspace-edit-'))
  roots.push(root)
  for (const [relativePath, contents] of Object.entries(files)) {
    const fileName = path.join(root, relativePath)
    await mkdir(path.dirname(fileName), { recursive: true })
    await writeFile(fileName, contents, 'utf8')
  }
  return root
}
