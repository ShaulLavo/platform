import { describe, expect, it } from 'bun:test'
import { FileTree as PierreFileTree } from '@pierre/trees'
import type { FileTreeDirectoryHandle, FileTreeItemHandle } from '@pierre/trees'

import {
  loadExpandedDirectories,
  syncTreePaneState,
  visibleTreeItemCount,
} from '@/components/workspace/tree-pane-state'
import type { TreeEntry, TreeResult } from '@/lib/file-system-types'
import { mergeDirectoryLoad, treeModel } from '@/lib/tree-model'

describe('syncTreePaneState', () => {
  it('continues expanding newly loaded ancestors for the selected file', () => {
    const root = 'repo'
    const selectedFilePath = 'repo/src/components/Button.tsx'
    const initialModel = treeModel(tree(root, [directory('repo/src')]), root)
    const fileTree = new PierreFileTree({
      flattenEmptyDirectories: true,
      initialExpansion: 'closed',
      paths: initialModel.paths,
    })
    const loadPasses: string[][] = []

    try {
      const previousPaths = syncTreePaneState({
        loadExpandedDirectoriesForCurrentModel: (currentTree) => {
          loadPasses.push(expandedDirectories(currentTree))
        },
        model: initialModel,
        previousPaths: initialModel.paths,
        rootPath: root,
        selectedFilePath,
        tree: fileTree,
      })
      const loadedModel = mergeDirectoryLoad(
        initialModel,
        root,
        tree('repo/src', [directory('repo/src/components')]),
        'src',
      )

      syncTreePaneState({
        loadExpandedDirectoriesForCurrentModel: (currentTree) => {
          loadPasses.push(expandedDirectories(currentTree))
        },
        model: loadedModel,
        previousPaths,
        rootPath: root,
        selectedFilePath,
        tree: fileTree,
      })

      expect(loadPasses).toEqual([['src/'], ['src/', 'src/components/']])
    } finally {
      fileTree.cleanUp()
    }
  })

  it('loads expanded symlink directory targets', () => {
    const root = 'repo'
    const model = treeModel(tree(root, [symlinkDirectory('repo/vendor')]), root)
    const fileTree = new PierreFileTree({
      flattenEmptyDirectories: true,
      initialExpansion: 'closed',
      paths: model.paths,
    })
    const loadedPaths: string[] = []

    try {
      getDirectory(fileTree, 'vendor/').expand()

      syncTreePaneState({
        loadExpandedDirectoriesForCurrentModel: (currentTree) => {
          loadExpandedDirectories(currentTree, model, (_entry, path) => loadedPaths.push(path))
        },
        model,
        previousPaths: model.paths,
        rootPath: root,
        selectedFilePath: null,
        tree: fileTree,
      })

      expect(loadedPaths).toEqual(['vendor/'])
    } finally {
      fileTree.cleanUp()
    }
  })

  it('keeps focus inside a nested lazy directory after flattened children load', () => {
    const root = 'repo'
    const initialModel = mergeDirectoryLoad(
      treeModel(tree(root, [directory('repo/src')]), root),
      root,
      tree('repo/src', [directory('repo/src/components'), file('repo/src/index.ts')]),
      'src',
    )
    const fileTree = new PierreFileTree({
      flattenEmptyDirectories: true,
      initialExpansion: 'closed',
      paths: initialModel.paths,
    })

    try {
      getDirectory(fileTree, 'src/').expand()
      fileTree.focusPath('src/components/')
      getDirectory(fileTree, 'src/components/').expand()

      const loadedModel = mergeDirectoryLoad(
        initialModel,
        root,
        tree('repo/src/components', [directory('repo/src/components/ui')]),
        'src/components',
      )

      const focusChanges = focusChangesDuring(fileTree, () =>
        syncTreePaneState({
          loadExpandedDirectoriesForCurrentModel: () => {},
          model: loadedModel,
          previousPaths: initialModel.paths,
          rootPath: root,
          selectedFilePath: null,
          tree: fileTree,
        }),
      )

      expect(focusChanges).toContain('src/components/ui/')
      expect(fileTree.getFocusedPath()).toBe('src/components/ui/')
    } finally {
      fileTree.cleanUp()
    }
  })

  it('keeps focus inside a root lazy directory after flattened children load', () => {
    const root = 'repo'
    const initialModel = treeModel(
      tree(root, [directory('repo/docs'), directory('repo/src')]),
      root,
    )
    const fileTree = new PierreFileTree({
      flattenEmptyDirectories: true,
      initialExpansion: 'closed',
      paths: initialModel.paths,
    })

    try {
      fileTree.focusPath('src/')
      getDirectory(fileTree, 'src/').expand()

      const loadedModel = mergeDirectoryLoad(
        initialModel,
        root,
        tree('repo/src', [directory('repo/src/components')]),
        'src',
      )
      const focusChanges = focusChangesDuring(fileTree, () =>
        syncTreePaneState({
          loadExpandedDirectoriesForCurrentModel: () => {},
          model: loadedModel,
          previousPaths: initialModel.paths,
          rootPath: root,
          selectedFilePath: null,
          tree: fileTree,
        }),
      )

      expect(focusChanges).toContain('src/components/')
      expect(fileTree.getFocusedPath()).toBe('src/components/')
    } finally {
      fileTree.cleanUp()
    }
  })

  it('keeps a lazy directory expanded after its single child directory flattens into the visible row', () => {
    const root = 'repo'
    const initialModel = treeModel(tree(root, [directory('repo/src')]), root)
    const fileTree = new PierreFileTree({
      flattenEmptyDirectories: true,
      initialExpansion: 'closed',
      paths: initialModel.paths,
    })

    try {
      getDirectory(fileTree, 'src/').expand()

      const loadedModel = mergeDirectoryLoad(
        initialModel,
        root,
        tree('repo/src', [directory('repo/src/components')]),
        'src',
      )

      syncTreePaneState({
        loadExpandedDirectoriesForCurrentModel: () => {},
        model: loadedModel,
        previousPaths: initialModel.paths,
        rootPath: root,
        selectedFilePath: null,
        tree: fileTree,
      })

      expect(getDirectory(fileTree, 'src/components/').isExpanded()).toBe(true)
    } finally {
      fileTree.cleanUp()
    }
  })

  it('does not re-expand a collapsed flattened directory during later child syncs', () => {
    const root = 'repo'
    const initialModel = treeModel(tree(root, [directory('repo/src')]), root)
    const loadedModel = mergeDirectoryLoad(
      initialModel,
      root,
      tree('repo/src', [directory('repo/src/components')]),
      'src',
    )
    const fileTree = new PierreFileTree({
      flattenEmptyDirectories: true,
      initialExpansion: 'closed',
      paths: initialModel.paths,
    })

    try {
      getDirectory(fileTree, 'src/').expand()
      syncTreePaneState({
        loadExpandedDirectoriesForCurrentModel: () => {},
        model: loadedModel,
        previousPaths: initialModel.paths,
        rootPath: root,
        selectedFilePath: null,
        tree: fileTree,
      })
      getDirectory(fileTree, 'src/components/').collapse()

      const nestedModel = mergeDirectoryLoad(
        loadedModel,
        root,
        tree('repo/src/components', [directory('repo/src/components/ui')]),
        'src/components',
      )

      syncTreePaneState({
        loadExpandedDirectoriesForCurrentModel: () => {},
        model: nestedModel,
        previousPaths: loadedModel.paths,
        rootPath: root,
        selectedFilePath: null,
        tree: fileTree,
      })

      expect(getDirectory(fileTree, 'src/components/ui/').isExpanded()).toBe(false)
    } finally {
      fileTree.cleanUp()
    }
  })
})

describe('loadExpandedDirectories', () => {
  it('does not retry an errored directory before expansion history is known', () => {
    const root = 'repo'
    const model = treeModel(tree(root, [directory('repo/src')]), root)
    model.errorByDirectoryPath.set('src', 'Could not load')
    const fileTree = new PierreFileTree({
      flattenEmptyDirectories: true,
      initialExpansion: 'closed',
      paths: model.paths,
    })
    const loadedPaths: string[] = []

    try {
      getDirectory(fileTree, 'src/').expand()
      loadExpandedDirectories(fileTree, model, (_entry, path) => loadedPaths.push(path))

      expect(loadedPaths).toEqual([])
    } finally {
      fileTree.cleanUp()
    }
  })

  it('does not retry an errored directory while it remains expanded', () => {
    const root = 'repo'
    const model = treeModel(tree(root, [directory('repo/src')]), root)
    model.errorByDirectoryPath.set('src', 'Could not load')
    const fileTree = new PierreFileTree({
      flattenEmptyDirectories: true,
      initialExpansion: 'closed',
      paths: model.paths,
    })
    const loadedPaths: string[] = []

    try {
      getDirectory(fileTree, 'src/').expand()
      loadExpandedDirectories(
        fileTree,
        model,
        (_entry, path) => loadedPaths.push(path),
        new Set(['src']),
      )

      expect(loadedPaths).toEqual([])
    } finally {
      fileTree.cleanUp()
    }
  })

  it('retries an errored directory after a fresh expand gesture', () => {
    const root = 'repo'
    const model = treeModel(tree(root, [directory('repo/src')]), root)
    model.errorByDirectoryPath.set('src', 'Could not load')
    const fileTree = new PierreFileTree({
      flattenEmptyDirectories: true,
      initialExpansion: 'closed',
      paths: model.paths,
    })
    const loadedPaths: string[] = []

    try {
      getDirectory(fileTree, 'src/').expand()
      loadExpandedDirectories(fileTree, model, (_entry, path) => loadedPaths.push(path), new Set())

      expect(loadedPaths).toEqual(['src/'])
    } finally {
      fileTree.cleanUp()
    }
  })
})

describe('visibleTreeItemCount', () => {
  it('counts expanded tree rows instead of every loaded path', () => {
    const root = 'repo'
    const initialModel = mergeDirectoryLoad(
      treeModel(tree(root, [directory('repo/src')]), root),
      root,
      tree('repo/src', [directory('repo/src/components'), file('repo/src/index.ts')]),
      'src',
    )
    const model = mergeDirectoryLoad(
      initialModel,
      root,
      tree('repo/src/components', [file('repo/src/components/Button.tsx')]),
      'src/components',
    )
    const fileTree = new PierreFileTree({
      flattenEmptyDirectories: true,
      initialExpansion: 'closed',
      paths: model.paths,
    })

    try {
      expect(visibleTreeItemCount(fileTree, model)).toBe(1)

      getDirectory(fileTree, 'src/').expand()
      expect(visibleTreeItemCount(fileTree, model)).toBe(3)

      getDirectory(fileTree, 'src/components/').expand()
      expect(visibleTreeItemCount(fileTree, model)).toBe(4)
    } finally {
      fileTree.cleanUp()
    }
  })

  it('counts a flattened directory chain as one visible row', () => {
    const root = 'repo'
    const initialModel = mergeDirectoryLoad(
      treeModel(tree(root, [directory('repo/docs')]), root),
      root,
      tree('repo/docs', [directory('repo/docs/guide')]),
      'docs',
    )
    const model = mergeDirectoryLoad(
      initialModel,
      root,
      tree('repo/docs/guide', [file('repo/docs/guide/intro.md')]),
      'docs/guide',
    )
    const fileTree = new PierreFileTree({
      flattenEmptyDirectories: true,
      initialExpansion: 'closed',
      paths: model.paths,
    })

    try {
      expect(visibleTreeItemCount(fileTree, model)).toBe(1)

      getDirectory(fileTree, 'docs/guide/').expand()
      expect(visibleTreeItemCount(fileTree, model)).toBe(2)
    } finally {
      fileTree.cleanUp()
    }
  })
})

function focusChangesDuring(tree: PierreFileTree, action: () => void) {
  const paths: (string | null)[] = []
  const unsubscribe = tree.subscribe(() => {
    paths.push(tree.getFocusedPath())
  })

  try {
    action()
  } finally {
    unsubscribe()
  }

  return paths
}

function expandedDirectories(tree: PierreFileTree) {
  return ['src/', 'src/components/', 'vendor/'].filter((path) => {
    const item = tree.getItem(path)
    if (!isDirectoryHandle(item)) return false

    return item.isExpanded()
  })
}

function getDirectory(tree: PierreFileTree, path: string): FileTreeDirectoryHandle {
  const item = tree.getItem(path)
  if (!isDirectoryHandle(item)) {
    throw new Error(`Expected ${path} to be a directory`)
  }

  return item
}

function isDirectoryHandle(item: FileTreeItemHandle | null): item is FileTreeDirectoryHandle {
  return item?.isDirectory() === true
}

function tree(path: string, entries: TreeEntry[]): TreeResult {
  return { entries, path }
}

function symlinkDirectory(path: string): TreeEntry {
  return {
    birthtimeMs: 1,
    mtimeMs: 1,
    name: path.split('/').at(-1) ?? path,
    path,
    size: 1,
    targetType: 'directory',
    type: 'symlink',
    version: `test:1:${path}`,
  }
}

function directory(path: string): TreeEntry {
  return {
    birthtimeMs: 1,
    mtimeMs: 1,
    name: path.split('/').at(-1) ?? path,
    path,
    size: 1,
    type: 'directory',
    version: `test:1:${path}`,
  }
}

function file(path: string): TreeEntry {
  return {
    birthtimeMs: 1,
    mtimeMs: 1,
    name: path.split('/').at(-1) ?? path,
    path,
    size: 1,
    type: 'file',
    version: `test:1:${path}`,
  }
}
