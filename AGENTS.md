# Map project

## Overview

This repository is a Map project: a Warcraft III 3.0.0 map whose code is TypeScript compiled to Lua with typescript-to-lua and [reforged-ts](https://github.com/phmilk/reforged-ts). The World Editor owns the map data (terrain, object data, placed units); this repository owns the code, its Object definitions included. Object data changes through the World Editor or through Object definitions and `pnpm objects:sync`; everything else in the map folder changes only through the World Editor. The project vocabulary lives in `GLOSSARY.md`; use its terms.

## Commands

- `pnpm build`: compiles `src` in dev mode (the `mode` `reforged.config.ts` ships with), with the library's runtime checks on, stages the map folder, merges the Object definitions into the staged copy and packs the archive into `dist/`, named `<map folder's name without its suffix>-<version>-dev.<suffix>` from the `version` of `package.json`, without `-<version>` when it has none.
- `pnpm build --mode release`: the same build with the runtime checks off, as players get it: `<map folder's name without its suffix>-<version>.<suffix>`.
- `pnpm dev`: rebuilds on every change to `src` or the map folder, until stopped; with `devObjectSync` on in `reforged.config.ts`, it runs `pnpm objects:sync` before each build.
- `pnpm objects:sync`, `pnpm objects:adopt <rawcode...>` (or `--all`), `pnpm objects:release <rawcode...>`: write the Object definitions into the map folder and the Object manifest, hand objects of the map folder to the code, hand them back (see Object definitions).
- `pnpm test:map`: builds (dev mode unless `--mode release`), then launches the game on the packed archive.
- `pnpm test`: runs the map's tests and the Template's pipeline tests, without the game (see Testing).
- `pnpm check`: lint, type check and tests, stopping at the first failure.

A task is finished when `pnpm check` is green.

## Layout

- `src/`: the map's code; `src/main.ts` is the entry point. New code goes here.
- `src/objects/`: the Object definitions, one `define<Kind>` call per object from `reforged-map/objects`, laid out by adoption as `src/objects/<kind>/<Name>_<rawcode>.ts`. Node modules the build loads, never part of the map's Lua: `tsconfig.objects.json` type-checks them.
- The map folder (`mapFolder` in `reforged.config.ts`): owned by the World Editor, written here only by the `objects:` commands. Never edit the bytes of its files by hand.
  - Read a change to its Object data with `git diff`, which shows each file as text: an object's line names its table and Rawcode (`custom h000 from hfoo`), and each line under it a field and its value (`umvs int = 320`). A `TRIGSTR_nnn` value is a string of `war3map.wts`, whose own diff shows its text. `pnpm install` sets the driver in the clone's git configuration.
- `object-manifest.json`: the Object manifest, the objects the code owns and what the last sync wrote of each. Committed; written only by the `objects:` commands, never by hand.
- `reforged.config.ts`: the typed build configuration. It is committed, so it holds only what every machine shares.
- `pnpm-workspace.yaml`: pnpm's settings. The project runs on pnpm 12 (`packageManager` in `package.json`; `npm install --global pnpm@12` installs it), which reads its settings nowhere else. A new dependency with an install script fails the install until `allowBuilds` lists it.
- `src/generated/`: `env.ts` (the build mode); the Editor globals (`editor-globals.d.ts`, `editor-globals.lua` for the harness), the `gg_` and `udg_` globals of the map folder, which `reforged-map` declares from `war3map.lua` and `war3map.wtg`; and the map's objects, which it reads from the map folder's Object data: `map-objects.d.ts` (a `FourCC` overload per Custom object and per Built-in object the map modifies) and a constants module per Object kind (`custom-units.ts`, `custom-items.ts`, `custom-abilities.ts`, `custom-buffs.ts`, `custom-destructables.ts`, `custom-doodads.ts`, `custom-upgrades.ts`). Rewritten by every install and build. Read-only: change the config or the map instead.
- `tests/lua/`: the map's tests on the harness; `tests/stubs/`: the extra Native stubs they need.
- `dist/` and `dist-test/`: build output (the map, the compiled Lua tests), ignored by git.

## Runtime constraints

- The game runs Lua 5.3 with 32-bit integers that wrap at 2^31; floats are doubles.
- `debug`, `require`, `package`, `io`, `collectgarbage` and `os.getenv` are absent; `load` works.
- `pairs` order is deterministic per game build but not guaranteed: iterate the library's synced collections (`SyncedMap`, `SyncedSet`, `HandleMap`, `HandleSet`).
- The editor's `config` runs before `main`; map code starts from the library's Init stages.
- Create Handles inside an Init stage; module top level runs while the script loads, before the game is ready.
- `os.clock` and the async Natives return local values that differ per client: keep them out of game state.
- A game-state change for one player desyncs the game: local-only code is visuals only, inside `MapPlayer.runLocal`.
- A `%` in a script pasted into the World Editor crashes the editor on save.
- Handle identity is stable across Natives; handle ids are not recycled immediately.
- The measured facts in full: [Runtime facts](https://phmilk.github.io/reforged-ts/docs/guides/runtime-facts).

## Rawcodes

- A Rawcode is typed by its Object kind: `Rawcode<"unit">`, `Rawcode<"unit" | "upgrade">` (either kind), or `Rawcode` alone for any kind. A plain `number` is not a Rawcode.
- `FourCC("hfoo")` is an `UnknownRawcode`, which every Rawcode parameter accepts, unless the map folder has the object (below). To have the compiler check a constant that holds a literal, annotate the constant with its kind: `const HOLY_LIGHT: Rawcode<"ability"> = FourCC("AHhb");`.
- What the game returns (`GetUnitTypeId`, `unit.typeId`, an Event descriptor's `abilityId`) carries its kind into the next call: pass it on without a cast.
- A GUI variable of an object type (`udg_SpawnType`) is declared with its kind from the Variable Editor's type: a Unit-Type is a `Rawcode<"unit">`, an array a `Record<number, Rawcode<"unit">>`. If its kind is wrong, change the variable's type in the World Editor; never cast the variable.
- Custom objects are named by their `Custom<Kind>s` constants, generated from the map folder: `import { CustomUnits } from "./generated/custom-units";`, then `CustomUnits.Captain_h000`. Built-in objects are named by `reforged-builtins`' constants: `import { Units } from "reforged-builtins/units";`, then `Units.Footman_hfoo`. A Custom object's literal, `FourCC("h000")`, is typed by its kind through the generated overload.
- A rename in the World Editor renames the constant and breaks each use: follow the rename to the new name, never cast.
- To find a Custom object's Rawcode by its name, read the generated constants in `src/generated/` (`custom-<kind>s.ts`); a Built-in object's, search `node_modules/reforged-builtins/3.0.0/index.json`.
- `tsconfig.base.json` enables `reforged-map/typescript-plugin` for editors only (the hover of a Rawcode literal); it changes no build, lint or test, and stays in place. Find an object by the generated constants and `reforged-builtins`, not by the hover.
- `as Rawcode<"unit">` is only for a number the compiler cannot know (a save code, a sync message), never to silence a kind error.
- The rules in full: [Rawcodes](https://phmilk.github.io/reforged-ts/docs/guides/rawcodes).

## Object definitions

- A field is keyed by its field id (`uhpm`, as the Object Editor's raw-data view shows it); the hover of the id gives its label. A wrong field or value fails `pnpm typecheck`.
- Name another object with `FourCC("A001")`, never with the generated `Custom<Kind>s` constants or `reforged-builtins`' constants: they exist only in the map's Lua, and the build refuses the import.
- To move an object made in the World Editor into code: `pnpm objects:adopt <rawcode>`. To give one back to the World Editor: `pnpm objects:release <rawcode>`, before deleting its definition.
- Deleting a definition removes its object from the map folder at the next `pnpm objects:sync`, and its placements on the terrain at the World Editor's next save.
- Never edit `object-manifest.json` by hand.
- A sync refused for unsaved edits in the World Editor (its title ends in ` *]`) or for a change made outside the code is shown to the author, never forced (`--force`) on their behalf.
- The feature in full: [Object definitions](https://phmilk.github.io/reforged-ts/docs/guides/object-definitions).

## Lint

`pnpm lint` runs the recommended rules of `eslint-plugin-reforged` on `src` and `tests/lua`, next to the TypeScript and Prettier rules. Each problem links to its rule's page. To tolerate one finding, disable its rule on that line only, with the reason after `--`:

```ts
// eslint-disable-next-line reforged/no-unsafe-natives -- runs in a trigger action, where the sleep is safe
```

A disable comment without a reason fails lint. Saving applies only the automatic fixes; a rule's suggestions change behaviour, so each one is applied deliberately, by a click in the editor or by hand.

## Testing

The map's tests live in `tests/lua` and run on the `reforged-test` harness (`pnpm test:lua` runs them alone): real Lua 5.3 with the Natives stubbed. The stubs record every Native call with its arguments, give each Handle a stable identity and let a test fire triggers and timers. The harness stands in for the Natives only, not for the engine: pathing, combat, rendering and object data are absent, and its integers are 64-bit. A Native no stub defines fails with "Native X is not stubbed": stub it in `tests/stubs`. What only the game can answer is verified with `pnpm test:map`.

## Domain docs

Single-context: `GLOSSARY.md` at the repo root and ADRs under `docs/adr/` (none yet). See `docs/agents/domain.md`.

## Library docs

<!-- reforged-ts:docs:start -->

The documentation of the installed reforged-ts version, as one plain-text file for a language model: [llms.txt](https://phmilk.github.io/reforged-ts/docs/next/llms.txt).

<!-- reforged-ts:docs:end -->

The TSDoc of every Wrapper, System and Native lives in the installed declarations: `node_modules/reforged-ts/dist/**/*.d.ts` and `node_modules/reforged-types/3.0.0/*.d.ts`. Read them before calling an API from memory.

## Agent skills

Each skill is a step list for a recurring task. An agent without skill support reads the file as a document when a request matches its triggers.

- `.claude/skills/map-feature/SKILL.md`: "add a feature", "implement <mechanic>", "new system". From idea to a tested module under `src`.
- `.claude/skills/run-in-game/SKILL.md`: "run the map", "test in game", "launch". Builds, starts the game and reports what it showed.
- The skills the Template shares with the library, the Upstream skills of `mattpocock/skills` (their lock: `skills-lock.json`) and the Skill variants such as `write-spec`: the library's, copied here; the record of the copy, `.claude/shared.lock.json`, names each file.

## Template maintenance

This section, `docs/agents/issue-tracker.md`, `docs/agents/triage-labels.md`, `docs/agents/release-gate.md`, the sync-shape tests (`tests/pipeline/seeds.test.ts`, `tests/pipeline/readme.test.ts` and their helper `tests/pipeline/sync-markers.ts`), the sync script `scripts/sync.ts` with its test `tests/pipeline/sync.test.ts`, the sync workflow `.github/workflows/sync.yml` that runs it, the claim workflow `.github/workflows/claim.yml`, the board caller `.github/workflows/board.yml`, `tests/pipeline/board.test.ts`, the test of both callers, the copy of what the library shares (every file its record `.claude/shared.lock.json` names) with the git attributes `.claude/.gitattributes` that keep its bytes, its test `tests/pipeline/shared-skills.test.ts`, and the detach command `scripts/detach.ts` with its test `tests/pipeline/detach.test.ts` serve the development of the Template itself. `template-maintenance.json` lists them, and `tests/pipeline/detach.test.ts` holds this list equal to it. In a generated Map project, `pnpm template:detach` deletes them, the manifest, this section, the line of Agent skills that names the copy's record, the blocks of `.gitattributes`, `eslint.config.mjs` and `.prettierignore` between the `template-maintenance` markers and the README's "Deletable in a generated project", and keeps the Seeds and Your project below.

- **Issue tracker**: the Template's issues live in `phmilk/reforged-ts-template`'s GitHub Issues and are driven with the `gh` CLI; the library's live in `phmilk/reforged-ts`. Specs carry the `spec` label and their tickets are sub-issues with native "blocked by" dependencies. See `docs/agents/issue-tracker.md`. Before working on an issue, claim it: `gh issue edit <n> --add-assignee @me`, your first write; an issue assigned to another login is theirs (`docs/agents/issue-tracker.md`, "Claim").
- **Triage labels**: the five canonical triage labels are used as-is: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. Two kind labels sit next to them: `spec` on an issue created with `to-spec`, `ticket` on one created with `to-tickets`, and one state label, `needs-split`, which the board derives on an open spec with no ticket. See `docs/agents/triage-labels.md`.
- **Sync markers**: on each library release, the Template's sync sets the six library packages' ranges in `package.json` and rewrites the text between the `reforged-ts:<name>:start` and `reforged-ts:<name>:end` marker comments of `AGENTS.md`, `GLOSSARY.md` and the README, and nothing else. Edit around the markers, never between them.
- **Sync workflow**: `.github/workflows/sync.yml` runs on the library's `reforged-ts-release` dispatch (or by hand, `gh workflow run sync.yml --ref <branch> -f payload="$(cat payload.json)"`, for a dry run). Its job `sync` syncs, refreshes the lockfile, builds in release mode and runs `pnpm check`, with no secret; its job `pull-request`, on `main` alone, then opens a pull request named after the tag, and a maintainer merges it. That job runs in the environment `board`, the one the board caller mints the GitHub App's token in, whose deployment branch policy admits `main` alone: it opens the pull request with the App's token when the repository variable `APP_CLIENT_ID` and the environment's secret `APP_PRIVATE_KEY` are set (the names the library uses), and otherwise with the fine-grained token in the repository secret `SYNC_TOKEN` (contents and pull requests read/write on this repository); with neither, it fails before opening the pull request. A dry run from a branch other than `main` runs the job `sync` in full and stops, green, before the pull request, with a notice saying why; `--ref main` opens it as a release would.
- **Claim workflow**: `.github/workflows/claim.yml` calls the library's reusable `claim-check.yml` on every pull request and on every assignment, guarded by `if: github.repository == 'phmilk/reforged-ts-template'`. It assigns the author to the unclaimed issues a pull request closes and fails on one claimed by another login; the ruleset on `main` requires it, set by hand. It passes the App's key by name, `APP_PRIVATE_KEY: ${{ secrets.APP_PRIVATE_KEY }}` and no other secret, which `claim-check.yml` passes on to `board-dispatch.yml`. It is not synced: the `@master` ref keeps it current.
- **Board caller**: `.github/workflows/board.yml` calls the library's reusable `board-dispatch.yml` on the issue and pull-request events of the library's `board.yml`, guarded by `if: github.repository == 'phmilk/reforged-ts-template'`, so the Claim board reconciles this repository's cards within a minute. The dispatch mints the GitHub App's token from the environment `board` of this repository, whose key the caller passes by name, `APP_PRIVATE_KEY: ${{ secrets.APP_PRIVATE_KEY }}`, and no other secret: an environment secret reaches a called job only when its caller passes it, and is empty otherwise. It is not synced: the `@master` ref keeps it current.
- **Shared skills**: the Upstream skills with their lock, `write-spec`, the session-start hook `.claude/hooks/shadowed-skills.mjs` that warns of personal skills shadowing them, the background-wait check `.claude/hooks/background-wait.mjs`, the skill-target check `.claude/hooks/skill-target.mjs`, which stops `/implement`, `/implement-spec`, `/ship-spec` and `/split-spec` pointed at the wrong issue, and `next-step`, which ends every implement with its next steps, with their registration in the shared project settings `.claude/settings.json`, are written in the library, whose `.claude/shared.json` names them (its ADR 0024). The Template carries a copy, byte for byte, from the commit of `phmilk/reforged-ts` that `.claude/shared.lock.json` records with each file's sha256. Never edit a copied file: `tests/pipeline/shared-skills.test.ts` fails, and the fix goes to the library. The library's weekly skills workflow brings the copy up to date in a pull request on the branch `sync/shared-skills`; for a change that should not wait, run it by hand in the library (`gh workflow run skills-update.yml --ref master`). The shared settings also enable the band of background work from the library's marketplace (`background-band@reforged-ts`), with no file of it copied here.
- **Subagents**: before running Subagents, read the library's [`docs/agents/development-loop.md`, "Subagents"](https://github.com/phmilk/reforged-ts/blob/master/docs/agents/development-loop.md#subagents).
- **Release gate**: the library's release builds, lints and tests the Template against its packed packages, from the `v<major>` ref. See `docs/agents/release-gate.md`.

## Your project

This section belongs to the map's author: the map's own instructions for agents go here.
