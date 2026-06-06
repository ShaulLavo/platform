#!/usr/bin/env python3
"""Move colocated test files into a sibling tests/ folder and fix relative imports."""
import os
import re
import subprocess
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

# Module-loading contexts whose relative string specifiers must gain one '../'.
# Group 1 = prefix up to and including the opening quote; group 2 = the specifier.
SPEC_RE = re.compile(
    r"((?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|"
    r"\bvi\.mock\s*\(\s*|\bvi\.doMock\s*\(\s*|\bvi\.importActual\s*\(\s*|"
    r"\bjest\.mock\s*\(\s*)['\"])(\.\.?/[^'\"]*)"
)


def bump(spec: str) -> str:
    if spec.startswith("./"):
        return "../" + spec[2:]
    if spec.startswith("../"):
        return "../" + spec
    return spec


def rewrite(content: str) -> str:
    return SPEC_RE.sub(lambda m: m.group(1) + bump(m.group(2)), content)


def main(files):
    moved = []
    for rel in files:
        src = os.path.join(ROOT, rel)
        d = os.path.dirname(src)
        base = os.path.basename(src)
        tests_dir = os.path.join(d, "tests")
        dst = os.path.join(tests_dir, base)
        if os.path.exists(dst):
            print(f"SKIP exists: {rel}", file=sys.stderr)
            continue
        os.makedirs(tests_dir, exist_ok=True)
        subprocess.run(["git", "mv", src, dst], cwd=ROOT, check=True)
        with open(dst, "r", encoding="utf-8") as f:
            content = f.read()
        new = rewrite(content)
        if new != content:
            with open(dst, "w", encoding="utf-8") as f:
                f.write(new)
        moved.append((rel, os.path.relpath(dst, ROOT)))
    for a, b in moved:
        print(f"{a} -> {b}")
    print(f"\nMoved {len(moved)} files.")


if __name__ == "__main__":
    main([l.strip() for l in sys.stdin if l.strip()])
