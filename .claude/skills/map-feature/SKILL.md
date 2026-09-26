---
name: map-feature
description: Add a feature to the map's code the Map project's way, from idea to a tested, lint-clean module under src. Use when asked to add a feature, implement a mechanic, or build a new system.
---

# Map feature

A feature lands as one module under `src`, started from an Init stage, tested on the harness and green on `pnpm check`. `AGENTS.md` holds the rules these steps apply: Runtime constraints, Lint and Testing.

1. **Read the context.** Read `CONTEXT.md` and the Your project section of `AGENTS.md`, then name the feature's concept in those terms. A concept new to the map goes under "Your map's terms" in `CONTEXT.md`.
2. **Place the module.** One module per concept under `src`, named after it (`src/respawn.ts`, `src/shop/`); extend the concept's module when it already has one. Import it from `src/main.ts`, or from a module `src/main.ts` imports: the bundle runs from `src/main.ts`, so a module nothing imports never runs.
3. **Start it from an Init stage.** Module top level only registers callbacks; every Handle is created inside one. `Init.onGameStart(() => { ... }, "respawn")` suits gameplay. The earlier stages, `onGlobals`, `onTriggers` and `onInitTriggers` (each after the Blizzard function of that name), are for work that must be ready before the game starts.
4. **Subscribe through Event descriptors.** React to the game with `on(UnitEvents.death, handler)` and the other `*Events` descriptors. `on()` returns a Subscription: keep it where the feature ends (a round, a unit's life) and call `destroy()` on it there.
5. **Reach for the library.** Wrappers (`Unit`, `Timer`, `MapPlayer`, `Frame`) in place of the Natives they wrap, with their TSDoc read in `node_modules/reforged-ts/dist`; `SyncedMap`, `SyncedSet`, `HandleMap` or `HandleSet` for every collection the code iterates; `MapPlayer.runLocal` for what one player sees.
6. **Test on the harness.** Cover the logic that needs no game in `tests/lua/<concept>.test.ts`, shaped like `tests/lua/main.test.ts`: import the module, start the game, fire the triggers and timers, assert on the Native calls and the printed lines.
7. **Run `pnpm check`** until it is green.
8. **Report** what only the game can verify, with `pnpm test:map` or the `run-in-game` skill: pathing, combat, rendering, object data, timings, multiplayer sync.
