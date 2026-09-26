---
name: run-in-game
description: Build the map and run it in Warcraft III, then report what the game showed. Use when asked to run the map, test it in game, launch the game or play the build.
---

# Run in game

The game runs on the author's machine, detached from the terminal: you start it, the author watches it, and together you report what it showed.

1. **Build.** Run `pnpm build`, in dev mode, so the library's runtime Guards run; use `pnpm build --mode release` only when asked for the release build. A compile or pack error stops here: fix it before launching.
2. **Launch.** Run `pnpm test:map` (add `--mode release` for the release build). It builds again, then starts the game on the staged map folder under `dist/staging`, windowed, with the flags that skip the menus and reuse the Battle.net login saved on the machine. When it cannot find the game, the author sets the `WC3_EXECUTABLE` environment variable to the game's executable, never a path in `reforged.config.ts`.
3. **Look.** Ask the author to watch the screen for what the feature should show, and for the lines the map prints: each `print` shows as on-screen text. Files the map writes with the library's `File` land in `Documents\Warcraft III\CustomMapData` under the author's user folder, as preload files: read them there after the run, the text is in the `Preload` calls.
4. **Keep `%` out of the World Editor.** A `%` in any script pasted into the World Editor (custom script code, a trigger's custom script) crashes the editor on save. In a snippet you give the author to paste, build the character at run time with `string.char(37)`. The map's code in `src` is appended by the build and never passes through the editor.
5. **Share the build.** `pnpm build` prints the path of the packed archive under `dist/`. `pnpm test:map` opens the staged folder, which the game's map list never shows. Only the archive shows there, once copied into the game's Maps folder (`Documents\Warcraft III\Maps`); the archive is also the file a player receives.
6. **Outside Windows,** the game runs through Wine: set `winePath` in `reforged.config.ts` (`"wine"` or a path to it), `WINEPREFIX` for a prefix other than Wine's default, and `WC3_EXECUTABLE` to the path of the game's executable inside the prefix, when the Battle.net install locations do not find it.
7. **Report.** Give the mode you ran, the printed lines as the author read them, and every line starting with `reforged-ts:`: in dev mode the Guards print the pitfall they caught, and a failing callback prints `reforged-ts: <what> failed: <error>`. Say what worked, what did not, and which line of `src` each error points to.
