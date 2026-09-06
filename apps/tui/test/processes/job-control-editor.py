#!/usr/bin/env python3
import json
import pathlib
import sys

filename = pathlib.Path(sys.argv[1])
document = json.loads(filename.read_text())
print("EDITOR_ACTIVE", flush=True)
sys.stdin.readline()
document["editor.fontSize"] = 24
filename.write_text(json.dumps(document))
