# Platform TUI

The TUI connects to the existing Platform server. It provides editable settings, commands,
file browsing with previews, and address navigation. Agent sessions and workbench surfaces
follow the sequencing in [the TUI strategy](../../docs/tui-plan.md).

Run from the repository root:

```sh
bun run dev:tui
bun run dev:tui --origin http://127.0.0.1:3001
```

The launcher attaches to `VITE_SERVER_URL`, or `FS_HOST`/`PORT`. Dev/prod launchers register
`platform-tui://local` in the server's exact origin allowlist. An older running server needs
its normal launcher restarted to accept that origin. Custom launchers must include it in
`SERVER_ALLOWED_ORIGINS`.

## Keyboard controls

These are the defaults. Settings overrides take effect immediately, including displayed hints.

| Action                                  | Keys                 |
| --------------------------------------- | -------------------- |
| Command palette                         | F1 or Ctrl+K, then P |
| File picker                             | Ctrl+P               |
| Settings                                | Ctrl+K, then S       |
| Views                                   | Ctrl+K, then V       |
| Back / Forward                          | Ctrl+K, then B / N   |
| Edit / change scope / reset setting     | F2 / F3 / F4         |
| Retry / discard failed settings changes | F5 / F6              |
| Confirm an editing dialog               | F2                   |
| Change focus                            | Tab / Shift+Tab      |
| Close or return                         | Escape               |
| Reconnect                               | Ctrl+R               |
| Quit / suspend to shell                 | Ctrl+C / Ctrl+Z      |

Type to search settings. Up and Down move immediately while search keeps accepting text.
Every selectable list wraps in both directions. Tab moves between search, list, and details.
When settings have issues, Tab also reaches their scrollable panel. Arrows scroll the focused
panel. In the file picker, Tab completes the path, Shift+Tab moves between filter, path, and
places, and Enter opens a directory or preview. A narrow
terminal shows the preview in place of the file list; the dismiss shortcut returns to the list.
Every dialog follows `workspace.dismiss`, including its footer hint. Rebinding or disabling that
command changes dismissal everywhere.

The palette uses the shared prefixes: `>` for commands, `view`, `color`, and `theme`.
Unprefixed text opens filtered file browsing. Other recognized modes explain which later
surface they need. Open Address and Copy Address preserve the settings filter or file location.
Switching between those address modes starts a fresh dialog with the appropriate input.
Copy uses the terminal's OSC 52 clipboard support, with the address displayed for manual copying.
Opening a settings editor closes the file picker so the two dialogs cannot overlap.

Edit the Keybindings overrides setting to select a command and record its shortcut. The recorder
shows collisions and terminal restrictions, and can disable a command or restore its defaults.
Enhanced Ctrl+Shift+P is enabled only when the terminal advertises Kitty keyboard support.

Ctrl+Z suspends the foreground TUI job, including its launcher. Run `fg` in the shell to resume.
Suspension is unavailable when the TUI shares its process group with an enclosing shell.
Ctrl+C and SIGTERM restore terminal modes and close the application.

## Settings and connection

Settings use the server's semantic mutations, scope restrictions, optimistic projection, and
live event stream. A failed change stays visible with retry/discard actions. Workspace settings
cannot select executables or bind keys. Secret values remain in the server's secret store.

The issues panel identifies settings that were not applied by key, scope, and reason. Syntax
errors identify the broken file and explain that the last valid settings or defaults remain in
effect. Tab into the panel to scroll its repair instructions. Details distinguish ignored entries
from the effective value. The warning clears when the server accepts a corrected value.

Choose **Edit settings JSON in external editor** from the palette to edit the current scope.
`editor.externalEditor` selects one executable path; a blank value uses this host's `EDITOR`,
then `vi`. Arguments and shell expressions are not parsed. The TUI suspends while the editor
runs and saves through a revision check. Conflicts retain the draft and require explicit reload.
Temporary files have mode 0600 under `/work/tmp` and are removed when editing finishes.
Closing an editor ends its request lifetime. A late completion cannot close a newer editor or
discard its draft. A semantic save already submitted to the server may still complete.

`Live` means the WebSocket handshake matches the environment verified over HTTP. On disconnect,
cached settings remain read-only and network-dependent actions become unavailable. Reconnect
verifies identity again before restoring live writes. A replacement database at the same origin
is refused. Settings remain authoritative on the server.

Recent commands and the last picker directory use a mode-0600 SQLite database per environment at
`~/.platform/tui/<environment-id>.sqlite`. WAL and per-key writes preserve unrelated changes from
simultaneous TUI processes. Transactions merge their recent-command histories. The earlier JSON
convenience cache is not migrated. If a cache is invalid, delete the file named in the error and
press Ctrl+R to retry.

`workbench.colorTheme` selects light, dark, or terminal-derived system colors.
`workbench.palette` selects Graphite or Sage. Syntax uses shared Shiki theme registration.
Truecolor degrades to 256 or 16 colors according to terminal capabilities; `NO_COLOR` uses
terminal defaults. `workbench.reduceMotion` slows the shared loaders.

## Frames and development

```sh
bun run dev:tui --headless-frame /work/tmp/platform-tui.txt --width 100 --height 30
```

A failed connection still writes an error frame and exits 1; a live frame exits 0. Interactive
mode requires a TTY other than `TERM=dumb`. The supported minimum is 40 columns by 12 rows.

Tests use real in-process Elysia routes, isolated settings/databases, and OpenTUI's native renderer.
They never open a socket to the Platform server.

Permanent PTY tests also exercise direct and repository-launcher startup, Ctrl+Z and `fg`, external
editor handoff, Ctrl+C, SIGTERM, and protection of a shared shell process group. These checks use
Python 3 and Bash on supported POSIX hosts.

```sh
cd apps/tui
bun --bun vitest run
bun run typecheck
bun run build
```

The build checks the generated terminal palette before emitting Bun modules. After shared UI
token changes, run `bun run theme:generate`. Standalone binaries belong to the distribution slice.

Use `Select` from `@/components/select` for lists. It owns wrapping and arrow routing from search
inputs; lint rejects raw `<select>` elements elsewhere. Prompts own Enter submission and supply
the native value, including input that arrived before React committed its next render.

See the [foundation record](../../docs/tui-foundation.md) and
[binding audit](../../docs/tui-bindings.md) for implementation and verification details.
