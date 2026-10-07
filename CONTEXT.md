# Map project

This file is the Map project's domain glossary. The first section holds the terms of the reforged-ts library and is refreshed in the Template by the Template's sync workflow on each library release; once a Map project is generated from the Template, the file belongs to its author and is never updated automatically. Add the map's own terms in the last section.

<!-- reforged-ts:terms:start -->

## Library terms

**Native**:
A function, type or constant the game exposes to map scripts in Lua (`CreateUnit`, `unit`, `bj_MAX_PLAYERS`).
_Avoid_: game API, JASS function, builtin

**Handle**:
The game's opaque reference to an engine object (`unit`, `timer`, `framehandle`); the thing a Wrapper holds. Its numeric id is a property of the handle, not the handle itself.
_Avoid_: object, pointer, id

**Wrapper**:
A library class that owns one Handle and exposes its Natives as typed members (`Unit`, `Timer`, `Frame`).
_Avoid_: handle class, model, entity

**System**:
A library utility that wraps no Handle, even when it uses some for its own work (`sync`, `host`, `file`, `binary`, `base64`, `gametime`).
_Avoid_: helper, module, util

**Event descriptor**:
A value that knows how to register one game event on a Trigger and how to read that event's payload from the trigger context.
_Avoid_: event type, event enum, listener spec

**Subscription**:
What `on()` returns for one handler and one Event descriptor: it holds the one Trigger `on()` created for them, is owned by the caller and is ended with `destroy()`, which destroys that Trigger only.
_Avoid_: listener, binding, registration

**Init stage**:
One of the four points of a map's initialization (globals, triggers, init triggers, game start) where library and Map project callbacks run, each under `pcall`.
_Avoid_: hook, lifecycle event, main/config

**Map project**:
A repository generated from the Template that consumes the library to produce a playable map; the Template fixes the versions of its Toolchain and of the reforged-ts packages.
_Avoid_: consumer, user code, game project

**Template**:
The starter repository a Map project is generated from.
_Avoid_: boilerplate, starter kit, example map

**Toolchain**:
The tools that turn a Map project's TypeScript into a Lua map script: TypeScript, typescript-to-lua, lint and build.
_Avoid_: build system, pipeline, stack

**Patch**:
A released version of the game, identified by its Build (3.0.0.24268). Typings and library releases are tied to a Patch.
_Avoid_: version, update, release (a library release is not a game patch)

**Rawcode**:
The four-character id of one type of object (`hfoo`, `AHbz`), which a map script holds as an integer (`FourCC("hfoo")`).
_Avoid_: object id, type id, fourcc

**Object kind**:
Which of the seven families a type of object belongs to: unit (heroes included), item, ability, buff, destructable, doodad or upgrade; each Rawcode names an object of one Object kind.
_Avoid_: object type, category, rawcode type

**Editor global**:
A global the World Editor declares in a map folder's `war3map.lua`: a `gg_` one for something placed or created in the editor (`gg_unit_H002_0255`, `gg_trg_Melee_Initialization`), or a `udg_` one for a variable of the Variable Editor (`udg_SpawnType`).
_Avoid_: GUI global, editor variable

<!-- reforged-ts:terms:end -->

## Your map's terms

_None yet._
