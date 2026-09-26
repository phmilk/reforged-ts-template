---
name: run-in-game
description: Build the map, run it in Warcraft III and report what the game showed. Use when asked to run the map, test in game, or launch.
---

# Run in game

The game runs on the author's machine, detached from the terminal: you start it, the author watches it, and together you report what it showed.

1. **Build.** `pnpm build` builds in dev mode, with the library's runtime checks on; `pnpm build --mode release` only when asked for the release build. Fix any compile or pack error before launching.
2. **Launch.** `pnpm test:map`, with the same `--mode`, builds again and starts the game on the staged map folder under `dist/staging`, windowed, with the flags that skip the menus and reuse the Battle.net login saved on the machine. When it cannot find the game, the author sets the `WC3_EXECUTABLE` environment variable to the game's executable: a path of one machine belongs there, since `reforged.config.ts` is committed.
3. **Look.** The author watches the screen for what the feature should show and for the lines the map prints: each `print` shows as on-screen text. Files the map writes with the library's `File` land in the game's custom map data folder, `Documents\Warcraft III\CustomMapData` in the author's user folder, as preload files: after the run, the text is in their `Preload` calls.
4. **Paste `%`-free scripts into the World Editor.** A `%` in a script pasted into the World Editor (custom script code, a trigger's custom script) crashes the editor on save. A snippet for the author to paste builds the character at run time, with `string.char(37)`. The code in `src` is appended by the build, outside the editor.
5. **Share the build.** `pnpm build` prints the path of the packed archive under `dist/`. The game's map list shows the archive, once copied into the game's Maps folder (`Documents\Warcraft III\Maps`), and the staged folder not at all; the archive is also the file a player receives.
6. **On Linux,** the game runs through Wine: set `winePath` in `reforged.config.ts` (`"wine"` or a path to it), and `WC3_EXECUTABLE` to the host path of the game's executable inside the Wine prefix (`WINEPREFIX` too, for a prefix other than Wine's default). `test:map` looks for the game on its own only on Windows and macOS.
7. **Report** the mode you ran, the printed lines as the author read them, and every line starting with `reforged-ts:`: in dev mode the runtime checks print the pitfall they caught, and a failing callback prints `reforged-ts: <what> failed: <error>`. Name the line of `src` each error points to.
