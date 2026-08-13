> [!NOTE]
> Generated from the settings registry by `bun scripts/generate-settings-reference.ts`.
> Edit `packages/contracts/src/settings/keys.ts`, not this file.

# Settings reference

Settings live in `~/.platform/settings.json`. The file holds only what you have
changed, so anything absent takes the current build's default — which is what lets
a default improve without touching your file.

A workspace can carry its own `.platform/settings.json`. Only settings marked
**window** or **resource** can be set there: a workspace file ships inside a
cloned repository, so anything reaching process spawn, exec, env, or the keymap is
readable only from your own file.

Scopes: **application** — user file only; **machine** — user file only, machine-specific; **resource** — user or workspace; **window** — user or workspace.

Secrets — provider environment values — are **not** in this file. They live in
`~/.platform/secrets.json` with owner-only permissions, so the settings document
stays safe to read, share and export.

## Appearance

| Setting                            | Default    | Scope  | What it does                                                                             |
| ---------------------------------- | ---------- | ------ | ---------------------------------------------------------------------------------------- |
| `workbench.colorTheme`             | `"system"` | window | Light or dark, or follow the operating system.                                           |
| `workbench.surface.opacity`        | `80`       | window | How opaque panels and sidebars are over the wallpaper. 100 turns the glass material off. |
| `workbench.surface.contentOpacity` | `95`       | window | How opaque the terminal background is.                                                   |
| `workbench.surface.blur`           | `12`       | window | Backdrop blur radius, in pixels, behind translucent surfaces.                            |
| `workbench.surface.saturation`     | `160`      | window | Backdrop saturation, as a percentage, behind translucent surfaces.                       |
| `workbench.wallpaper.enabled`      | `true`     | window | Show the desktop wallpaper behind the workbench.                                         |

## Chat

| Setting                       | Default         | Scope       | What it does                                |
| ----------------------------- | --------------- | ----------- | ------------------------------------------- |
| `chat.defaultRuntimeMode`     | `"full-access"` | application | Permission posture a new session starts in. |
| `chat.defaultInteractionMode` | `"default"`     | application | Whether a new session starts in plan mode.  |

## Editor

| Setting                             | Default           | Scope  | What it does                                                                       |
| ----------------------------------- | ----------------- | ------ | ---------------------------------------------------------------------------------- |
| `editor.fontFamily`                 | `"JetBrainsMono"` | window | Font for the editor and, unless overridden, the terminal.                          |
| `editor.fontSize`                   | `13`              | window | Editor font size in pixels.                                                        |
| `editor.lineHeight`                 | `24`              | window | Editor row height in pixels.                                                       |
| `editor.tabSize`                    | `4`               | window | Rendered width of a tab character, in spaces.                                      |
| `editor.diff.viewMode`              | `"stacked"`       | window | Show diffs side by side or stacked.                                                |
| `editor.minimap.enabled`            | `true`            | window | Show the minimap beside the editor. _(restart)_                                    |
| `editor.guides.indentation`         | `true`            | window | Draw indentation guides (scope lines). _(restart)_                                 |
| `editor.syntaxHighlighting.enabled` | `true`            | window | Colour code by syntax. Turning this off makes very large files faster. _(restart)_ |
| `editor.decode.mode`                | `"off"`           | window | Animate a file as it opens, as if it were being written. _(restart)_               |

## Files

| Setting               | Default | Scope  | What it does                                                               |
| --------------------- | ------- | ------ | -------------------------------------------------------------------------- |
| `files.autoSave`      | `"off"` | window | Save edited files automatically, and when.                                 |
| `files.autoSaveDelay` | `1000`  | window | Milliseconds of quiet before an automatic save, when saving after a delay. |

## Keyboard shortcuts

| Setting                 | Default | Scope       | What it does                                                                                 |
| ----------------------- | ------- | ----------- | -------------------------------------------------------------------------------------------- |
| `keybindings.overrides` | `{}`    | application | Command id to hotkey. A missing key keeps the default; an explicit null unbinds the command. |

## Logs

| Setting                 | Default | Scope  | What it does                                      |
| ----------------------- | ------- | ------ | ------------------------------------------------- |
| `logs.defaultTimeRange` | `"1h"`  | window | Time range the logs view opens on.                |
| `logs.slowThresholdMs`  | `500`   | window | How many milliseconds counts as a slow operation. |

## Models

| Setting         | Default | Scope       | What it does                                                                                                     |
| --------------- | ------- | ----------- | ---------------------------------------------------------------------------------------------------------------- |
| `models.hidden` | `[]`    | application | Models the picker must not offer.                                                                                |
| `models.order`  | `[]`    | application | Explicit leading order for the picker. Models named by neither list stay visible after these, in provider order. |

## Providers

| Setting               | Default | Scope       | What it does                                                       |
| --------------------- | ------- | ----------- | ------------------------------------------------------------------ |
| `providers.instances` | `[]`    | application | Configured provider instances, in the order the picker shows them. |

## Search

| Setting                   | Default     | Scope  | What it does                                 |
| ------------------------- | ----------- | ------ | -------------------------------------------- |
| `search.defaultMatchMode` | `"literal"` | window | How a new search interprets the query.       |
| `search.caseSensitive`    | `false`     | window | Match case by default.                       |
| `search.wholeWord`        | `false`     | window | Match whole words by default.                |
| `search.maxResults`       | `200`       | window | How many matches a workspace search returns. |
| `search.quickOpenLimit`   | `80`        | window | How many files the file picker lists.        |

## Terminal

| Setting                              | Default | Scope  | What it does                                            |
| ------------------------------------ | ------- | ------ | ------------------------------------------------------- |
| `terminal.integrated.fontSize`       | `12`    | window | Terminal font size in pixels.                           |
| `terminal.integrated.scrollback`     | `10000` | window | How many lines of output the terminal keeps.            |
| `terminal.integrated.cursorBlinking` | `true`  | window | Blink the terminal cursor while the terminal has focus. |

## Window

| Setting                 | Default | Scope   | What it does                                                      |
| ----------------------- | ------- | ------- | ----------------------------------------------------------------- |
| `window.nativeVibrancy` | `false` | machine | Composite the live macOS desktop behind the window. _(read-only)_ |
| `window.defaultWidth`   | `1440`  | machine | Width the desktop window opens at. _(restart)_                    |
| `window.defaultHeight`  | `960`   | machine | Height the desktop window opens at. _(restart)_                   |
