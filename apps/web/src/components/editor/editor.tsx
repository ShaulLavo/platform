import "@editor/core/style.css"
import "@editor/find/style.css"
import "@editor/minimap/style.css"
import { EditorHost, useEditor } from "@editor/react"
import "@editor/scope-lines/style.css"
import type {
  TypeScriptLspDefinitionTarget,
  TypeScriptLspDiagnosticSummary,
  TypeScriptLspStatus,
} from "@editor/typescript-lsp"
import { createTypeScriptLspPlugin } from "@editor/typescript-lsp/websocket"

import { createEditorPlugins } from "@/components/editor/editor-plugins"
import type { CachedEditorDocument } from "@/components/editor/editor-state"
import type { EditorStatusBarState } from "@/components/editor/editor-status-bar"
import { languageIdForFilePath } from "@/components/editor/file-path"
import { useTheme } from "@/components/theme-provider"
import { useEditorStatusBarState } from "@/components/editor/use-editor-status-bar-state"
import { fsServerUrl } from "@/lib/fs-client"
import type {
  EditorPlugin,
  EditorScrollPosition,
  EditorViewSnapshot,
} from "@editor/core"
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react"

type EditorProps = {
  document: CachedEditorDocument
  rootPath: string
  definitionTarget?: TypeScriptLspDefinitionTarget | null
  onDirtyChange?: (path: string, dirty: boolean) => void
  onOpenDefinition?: (target: TypeScriptLspDefinitionTarget) => void | boolean
  onScrollPositionChange?: (
    path: string,
    scrollPosition: NonNullable<CachedEditorDocument["scrollPosition"]>
  ) => void
  onStatusChange?: (status: EditorStatusBarState) => void
}

const editorThemeRefreshByShikiTheme = {
  "github-dark": {},
  "github-light": {},
}

export function Editor({
  definitionTarget,
  document: cachedDocument,
  rootPath,
  onDirtyChange,
  onOpenDefinition,
  onScrollPositionChange,
  onStatusChange,
}: EditorProps) {
  const { theme } = useTheme()
  const resolvedTheme = useResolvedTheme(theme)
  const shikiTheme = resolvedTheme === "dark" ? "github-dark" : "github-light"
  const [shikiThemeSource] = useState(() => createShikiThemeSource(shikiTheme))
  const shikiThemeResolver = useMemo(
    () => shikiThemeSource.getTheme,
    [shikiThemeSource]
  )
  const scrollPersistenceRef = useRef<ScrollPersistenceState>({
    onChange: onScrollPositionChange,
    path: cachedDocument.path,
  })
  const editorThemeRefresh = editorThemeRefreshByShikiTheme[shikiTheme]
  const [typeScriptStatus, setTypeScriptStatus] =
    useState<TypeScriptLspStatus>("idle")
  const [typeScriptDiagnostics, setTypeScriptDiagnostics] =
    useState<TypeScriptLspDiagnosticSummary | null>(null)
  const typeScriptLsp = useMemo(
    () =>
      createTypeScriptLspPlugin({
        rootUri: fileUriForPath(rootPath),
        webSocketRoute: typeScriptLspRoute(rootPath),
        onStatusChange: setTypeScriptStatus,
        onDiagnostics: setTypeScriptDiagnostics,
        onOpenDefinition,
        onError: (error) => console.warn("[typescript-lsp]", error),
      }),
    [onOpenDefinition, rootPath]
  )
  const scrollPersistencePlugin = useMemo<EditorPlugin>(
    () => ({
      name: "platform-scroll-persistence",
      activate: (context) =>
        context.registerViewContribution({
          createContribution: ({ scrollElement }) => {
            const persister = createScrollPositionPersister(
              scrollPersistenceRef,
              scrollElement
            )
            scrollElement.addEventListener("scroll", persister.handleScroll, {
              passive: true,
            })

            return {
              update: (snapshot) =>
                persistSnapshotScrollPosition(
                  scrollPersistenceRef.current,
                  snapshot,
                  persister.activeDocumentChanged
                ),
              dispose: () =>
                scrollElement.removeEventListener(
                  "scroll",
                  persister.handleScroll
                ),
            }
          },
        }),
    }),
    []
  )
  const plugins = useMemo(
    () => [
      ...createEditorPlugins(typeScriptLsp, shikiThemeResolver),
      scrollPersistencePlugin,
    ],
    [scrollPersistencePlugin, shikiThemeResolver, typeScriptLsp]
  )
  const document = useMemo(
    () => ({
      documentId: cachedDocument.path,
      languageId: languageIdForFilePath(cachedDocument.path),
      revision: cachedDocument.revision,
      scrollPosition: cachedDocument.scrollPosition,
      session: cachedDocument.session,
      text: cachedDocument.session.getText(),
    }),
    [cachedDocument]
  )

  useLayoutEffect(() => {
    shikiThemeSource.setTheme(shikiTheme)
  }, [shikiTheme, shikiThemeSource])

  useLayoutEffect(() => {
    scrollPersistenceRef.current = {
      onChange: onScrollPositionChange,
      path: cachedDocument.path,
    }
  }, [cachedDocument.path, onScrollPositionChange])

  const controller = useEditor({
    cursorLineHighlight: {
      gutterNumber: true,
      gutterBackground: ["fold-gutter"],
      rowBackground: true,
    },
    document,
    plugins,
    theme: editorThemeRefresh,
  })
  const editorState = controller.useState()
  const selection = selectionForDefinition(
    cachedDocument.path,
    document.text,
    definitionTarget
  )

  useEditorStatusBarState({
    charCount: editorState?.length ?? document.text.length,
    filePath: cachedDocument.path,
    onChange: onStatusChange,
    state: editorState,
    typeScriptDiagnostics,
    typeScriptStatus,
  })

  useEffect(() => {
    onDirtyChange?.(
      cachedDocument.path,
      editorState?.isDirty ?? cachedDocument.session.isDirty()
    )
  }, [cachedDocument, editorState?.isDirty, onDirtyChange])

  useLayoutEffect(() => {
    return () => {
      const scrollPosition =
        controller.getEditor()?.getScrollPosition() ??
        scrollPositionFromSnapshot(controller.getSnapshot())
      if (!scrollPosition) return

      onScrollPositionChange?.(cachedDocument.path, scrollPosition)
    }
  }, [cachedDocument.path, controller, onScrollPositionChange])

  useEffect(() => {
    if (!selection) return
    controller.commands.setSelection(
      selection.anchor,
      selection.head,
      selection.anchor
    )
  }, [controller, selection])

  return (
    <div className="flex h-full w-full min-w-0 flex-1 bg-background">
      <EditorHost className="app-editor-host" controller={controller} />
    </div>
  )
}

type ScrollPersistenceState = {
  path: string
  onChange?: (path: string, scrollPosition: EditorScrollPosition) => void
}

function createScrollPositionPersister(
  stateRef: RefObject<ScrollPersistenceState>,
  scrollElement: HTMLElement
) {
  let activePath = stateRef.current.path
  let lastPath = ""
  let lastLeft = -1
  let lastTop = -1

  const handleScroll = () => {
    const state = stateRef.current
    const left = scrollElement.scrollLeft
    const top = scrollElement.scrollTop
    if (activePath === lastPath && left === lastLeft && top === lastTop) {
      return
    }

    lastPath = activePath
    lastLeft = left
    lastTop = top
    state.onChange?.(activePath, { left, top })
  }

  return {
    activeDocumentChanged: (path: string) => {
      activePath = path
    },
    handleScroll,
  }
}

function persistSnapshotScrollPosition(
  state: ScrollPersistenceState,
  snapshot: EditorViewSnapshot,
  activeDocumentChanged: (path: string) => void
) {
  const path = snapshot.documentId ?? state.path
  activeDocumentChanged(path)
  state.onChange?.(path, {
    left: snapshot.viewport.scrollLeft,
    top: snapshot.viewport.scrollTop,
  })
}

function scrollPositionFromSnapshot(
  snapshot: EditorViewSnapshot | null
): EditorScrollPosition | null {
  if (!snapshot) return null

  return {
    left: snapshot.viewport.scrollLeft,
    top: snapshot.viewport.scrollTop,
  }
}

function createShikiThemeSource(initialTheme: string) {
  let theme = initialTheme

  return {
    getTheme: () => theme,
    setTheme: (nextTheme: string) => {
      theme = nextTheme
    },
  }
}

function useResolvedTheme(theme: "dark" | "light" | "system") {
  const [systemTheme, setSystemTheme] = useState<"dark" | "light">(() =>
    systemThemePreference()
  )

  useEffect(() => {
    if (theme !== "system") return

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
    const handleChange = () => setSystemTheme(systemThemePreference())

    mediaQuery.addEventListener("change", handleChange)
    return () => mediaQuery.removeEventListener("change", handleChange)
  }, [theme])

  if (theme === "system") return systemTheme
  return theme
}

function systemThemePreference(): "dark" | "light" {
  if (window.matchMedia("(prefers-color-scheme: dark)").matches) return "dark"
  return "light"
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

function selectionForDefinition(
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
