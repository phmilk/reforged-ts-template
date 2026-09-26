---
name: map-feature
description: Add a feature to the map's code the Map project's way, from idea to a tested, lint-clean module. Use when asked to add a feature, implement a mechanic, spell, rule or UI, or create a new system.
---

# Map feature

A feature lands as one module under `src`, started from an Init stage, tested on the harness and green on `pnpm check`. Use the terms of `CONTEXT.md` in code, comments and your report.

1. **Read the context.** Read `CONTEXT.md` and the Your project section of `AGENTS.md`. Name the feature's concept in the map's terms; when the concept is new to the map, add it under "Your map's terms" in `CONTEXT.md`.
2. **Place the module.** Put the feature in one module under `src`, named after the concept (`src/respawn.ts`, `src/shop/`). Extend the concept's existing module when it has one. Import the module from `src/main.ts`, or from a module it imports: the bundle starts at `src/main.ts`, so a module nothing imports is left out of the map.
3. **Start it from an Init stage.** At module top level, only register: `Init.onGameStart(() => { ... }, "respawn")` for gameplay, an earlier stage (`onGlobals`, `onTriggers`, `onInitTriggers`) only when the work must exist before the editor's triggers run. Create every Handle inside the callback: top-level code runs while the script loads, before the game is ready.
4. **Subscribe through Event descriptors.** React to the game with `on(UnitEvents.death, handler)` and the other `*Events` descriptors instead of raw trigger Natives. `on()` returns a Subscription: keep it wherever the feature can end (a round, a unit's life) and call `destroy()` on it then.
5. **Prefer the library over raw Natives.**
   - Wrappers (`Unit`, `Timer`, `MapPlayer`, `Frame`) over the Natives they wrap; read a Wrapper's TSDoc in `node_modules/reforged-ts/dist` before using it from memory.
   - `SyncedMap`, `SyncedSet`, `HandleMap` and `HandleSet` for any collection the code iterates: `pairs` order is not guaranteed across clients.
   - `MapPlayer.runLocal(player, () => { ... })` for anything shown to one player, with visuals only inside: create what it needs before the call, on every client.
6. **Test on the harness.** Write a test in `tests/lua/<concept>.test.ts` for the logic that does not need the game, following `tests/lua/main.test.ts`: import the module, start the game, fire triggers and timers with the stubs' helpers, assert on the Native calls and printed lines. A Native no stub defines fails with "Native X is not stubbed": add it to a file in `tests/stubs`. `pnpm test:lua` runs the map's tests alone.
7. **Run `pnpm check`.** Fix every lint, type and test failure until it is green. Silence a lint rule only on one line, with the reason after `--`, and only when the rule is wrong for that line.
8. **Report.** Say what the feature does, which files changed, and what only the game can verify with `pnpm test:map`: pathing, combat, rendering, object data, timings, multiplayer sync. For a hand check, use the `run-in-game` skill.
