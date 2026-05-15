import path from "node:path"

const languageIdsByExtension: Readonly<Record<string, string>> = {
  ".astro": "astro",
  ".bash": "shellscript",
  ".c": "c",
  ".c++": "cpp",
  ".cc": "cpp",
  ".cjs": "javascript",
  ".clj": "clojure",
  ".cljs": "clojure",
  ".cljc": "clojure",
  ".cpp": "cpp",
  ".cs": "csharp",
  ".css": "css",
  ".cts": "typescript",
  ".cxx": "cpp",
  ".dart": "dart",
  ".dockerfile": "dockerfile",
  ".edn": "clojure",
  ".ex": "elixir",
  ".exs": "elixir",
  ".fs": "fsharp",
  ".fsi": "fsharp",
  ".fsscript": "fsharp",
  ".fsx": "fsharp",
  ".gleam": "gleam",
  ".go": "go",
  ".gql": "graphql",
  ".graphql": "graphql",
  ".h": "c",
  ".hh": "cpp",
  ".hpp": "cpp",
  ".hs": "haskell",
  ".html": "html",
  ".hxx": "cpp",
  ".java": "java",
  ".jl": "julia",
  ".js": "javascript",
  ".jsx": "javascriptreact",
  ".json": "json",
  ".jsonc": "jsonc",
  ".kt": "kotlin",
  ".kts": "kotlin",
  ".lhs": "haskell",
  ".lua": "lua",
  ".mjs": "javascript",
  ".ml": "ocaml",
  ".mli": "ocaml",
  ".mts": "typescript",
  ".nix": "nix",
  ".php": "php",
  ".prisma": "prisma",
  ".py": "python",
  ".pyi": "python",
  ".rake": "ruby",
  ".rb": "ruby",
  ".rs": "rust",
  ".ru": "ruby",
  ".svelte": "svelte",
  ".swift": "swift",
  ".tex": "latex",
  ".tf": "terraform",
  ".tfvars": "terraform-vars",
  ".ts": "typescript",
  ".tsx": "typescriptreact",
  ".typ": "typst",
  ".typc": "typst",
  ".vue": "vue",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".zig": "zig",
  ".zon": "zig",
  ".zsh": "shellscript",
}

const languageIdsByBasename: Readonly<Record<string, string>> = {
  dockerfile: "dockerfile",
  makefile: "makefile",
}

export function fileExtension(filePath: string) {
  const basename = path.basename(filePath).toLowerCase()
  if (basename === "dockerfile") return "Dockerfile"

  return path.extname(filePath)
}

export function languageIdForFilePath(filePath: string) {
  const basename = path.basename(filePath).toLowerCase()
  const basenameLanguage = languageIdsByBasename[basename]
  if (basenameLanguage) return basenameLanguage

  return languageIdsByExtension[path.extname(filePath).toLowerCase()] ?? "plaintext"
}
