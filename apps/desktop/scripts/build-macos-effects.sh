#!/usr/bin/env bash
set -euo pipefail

# Compiles the native macOS vibrancy bridge into a dylib loaded by src/bun/index.ts
# over Bun FFI. Run automatically before `electrobun dev`/`build` (see package.json).

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_FILE="$ROOT_DIR/native/macos/window-effects.mm"
OUT_FILE="$ROOT_DIR/src/bun/libMacWindowEffects.dylib"

mkdir -p "$(dirname "$OUT_FILE")"

# Off macOS: emit an empty placeholder so the bundler copy step and the Bun FFI
# existence check both have a file. The Bun side no-ops when not on darwin.
if [[ "$(uname -s)" != "Darwin" ]]; then
	: >"$OUT_FILE"
	echo "Non-macOS host: wrote placeholder $OUT_FILE"
	exit 0
fi

if [[ ! -f "$SRC_FILE" ]]; then
	echo "Missing source: $SRC_FILE" >&2
	exit 1
fi

xcrun clang++ -dynamiclib -fobjc-arc -framework Cocoa "$SRC_FILE" -o "$OUT_FILE"
echo "Built $OUT_FILE"
