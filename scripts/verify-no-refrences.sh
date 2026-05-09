#!/usr/bin/env bash
#
# Guards against reintroducing the 'refrences' misspelling anywhere in the
# tracked tree (outside this feature's spec documents, which reference the
# original name for traceability).
#
# Exits 0 when no offending matches exist, 1 otherwise.
#
# Implementation note: this guard's own bookkeeping (the script file itself
# and the single wiring entries in package.json / turbo.json) necessarily
# contains the misspelled token. Those self-references are filtered out so
# only genuine regressions trigger a failure. Any other occurrence — for
# example, someone adding a 'refrences/' folder or renaming a symbol back
# to 'refrences' — will still be caught.

set -uo pipefail

# `git grep` exits 0 when matches are found, 1 when none are found. We
# invert that: matches are a failure. `grep -v` filters the guard's own
# plumbing so only genuine regressions surface. The final pipeline exits
# non-zero iff at least one non-self-reference match remains.
matches=$(git grep -IEn 'refrences' -- ':!.kiro/specs/**' \
  | grep -v -E 'scripts/verify-no-refrences\.sh|verify:spelling' \
  || true)

if [ -n "$matches" ]; then
  echo "$matches" >&2
  echo "" >&2
  echo "verify:spelling: found references to the misspelling 'refrences'." >&2
  echo "                 Use 'references' instead." >&2
  exit 1
fi

exit 0
