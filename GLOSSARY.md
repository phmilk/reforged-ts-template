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

**Seed**:
A file the Template ships that becomes the Map project author's own after generation (`AGENTS.md`, `GLOSSARY.md`, the Agent skills); the Template refreshes its copy on each library release, a generated Map project never does.
_Avoid_: template file, scaffold, boilerplate file

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

**Map folder**:
The folder the World Editor saves a map into, named after the map with its `.w3m` or `.w3x` suffix; it holds the map's data (terrain, Object data, placed units, its `war3map.lua`). A Map project has exactly one.
_Avoid_: map directory, map project (a Map project is the repository), w3x (the packed archive)

**Editor global**:
A global the World Editor declares in a map folder's `war3map.lua`: a `gg_` one for something placed or created in the editor (`gg_unit_H002_0255`, `gg_trg_Melee_Initialization`), or a `udg_` one for a variable of the Variable Editor (`udg_SpawnType`).
_Avoid_: GUI global, editor variable

**Object data**:
A map's definitions of its types of object (units, items, abilities, buffs, destructables, doodads, upgrades), stored in its `war3map.w3u`, `.w3t`, `.w3a`, `.w3h`, `.w3b`, `.w3d` and `.w3q` files, their `war3mapSkin` counterparts (which hold a Custom object's name), and the strings they reference in `war3map.wts`.
_Avoid_: object editor data, w3o

**Game data set**:
The set of Built-in objects a map plays with, which its Game Data Set (Default, Custom, Melee) and its Game Data Version (Reign of Chaos, The Frozen Throne, Forsaken Kingdom) in its options select together; the sets differ in which objects exist and in their stats.
_Avoid_: data set (alone), game data, balance

**Built-in object**:
A type of object the game ships in a Patch, the same in every map that selects the same Game data set (`hfoo`); one a map's Object data modifies keeps its Rawcode and is still a Built-in object.
_Avoid_: native object (a Native is something else), melee object, standard object

**Custom object**:
A type of object that exists only in one map's Object data (`h000`), new or derived from a Built-in object.
_Avoid_: map object, custom unit

**Editor form**:
Object data as the 3.0 World Editor itself saves it (localizable strings as `TRIGSTR` references into a sorted and commented `war3map.wts`, each field in the file the editor keeps it in, every object in both files, new string numbers above every existing one), which a World Editor save leaves byte for byte.
_Avoid_: canonical form

**Object definition**:
A type of object declared in a Map project's code rather than authored in an editor: a new Custom object, or a change to a Built-in object the map folder does not already change. It belongs to the code alone, never also to the map folder.
_Avoid_: code object, compiletime object

**Object sync**:
Writing a Map project's Object definitions into its map folder's Object data, so that the World Editor and the Studio show them before a build.
_Avoid_: inject, export, object generation

**Object manifest**:
The Map project's record of which Rawcodes belong to its Object definitions and what an Object sync last wrote for each, and of the objects a sync removed, so a later one can replace, remove or detect a change made outside the code, and tell a removed object a stale World Editor save brought back from a new one.
_Avoid_: lock file, provenance field

**Object adoption**:
Handing an object of the map folder (a Custom object, or a Built-in object the map folder changes) to the code: it becomes an Object definition and enters the Object manifest, while the map folder stays as it was.
_Avoid_: import, convert, export

**Object release**:
The reverse of an Object adoption: an object that belongs to an Object definition goes back to the map folder as the code last defined it, and leaves the code and the Object manifest.
_Avoid_: eject, release (a library release is something else)

<!-- reforged-ts:terms:end -->

## Your map's terms

_None yet._
