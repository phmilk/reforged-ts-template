/** @noSelfInFile */

// The starter source's test, on the reforged-test harness: Lua 5.3 with the
// game's Natives stubbed (the package's stubs, then tests/stubs/*.lua) and the
// editor's globals stubbed (src/generated/editor-globals.lua). Each `it` is
// one vitest test; the `it`s of one file share one Lua state. A Native no stub
// defines fails with "Native X is not stubbed": add it to a stub file in
// tests/stubs.
//
// Nothing fires on its own here: the test starts the game by calling the
// editor's entry point, and fires the trigger and the timer with the stubs'
// helpers.

import { describe, expect, it, stubCalls } from "reforged-test/lua";
import { MapPlayer, Unit } from "reforged-ts";
import "../../src/main";

const globals = _G as unknown as Record<string, unknown>;

/**
 * Records the arguments of every call to the Native `name` from now on; the
 * stub still runs and logs the call.
 */
function recordCalls(name: string): unknown[][] {
  const calls: unknown[][] = [];
  const native = globals[name] as (...args: unknown[]) => unknown;
  globals[name] = (...args: unknown[]) => {
    calls.push(args);
    return native(...args);
  };
  return calls;
}

// What the source prints, one entry per print call.
const printed: string[] = [];
globals.print = (...args: unknown[]) => {
  printed.push(args.map((arg) => tostring(arg)).join("\t"));
};

const registrations = recordCalls("TriggerRegisterPlayerUnitEvent");
const timerStarts = recordCalls("TimerStart");

// The game starts. The harness does not load the editor's script, so the test
// defines Blizzard's MarkGameStarted and calls it as the game does. The
// library wraps it when it is defined; the call runs the Init stages the
// editor's script would have run, then the game start callbacks.
globals.MarkGameStarted = () => {};
(globals.MarkGameStarted as () => void)();

describe("the starter source", () => {
  it("prints its line when the game starts", () => {
    expect(printed).toEqual(["reforged-ts-template: game started"]);
  });

  it("runs the Subscription's handler when a unit dies", () => {
    // UnitEvents.death registers one Trigger for the death of any player's unit.
    const deaths = registrations.filter(([, , event]) => event === EVENT_PLAYER_UNIT_DEATH);
    expect(deaths.length > 0).toBe(true);
    const trigger = deaths[0]?.[0] as trigger;
    const owner = MapPlayer.fromIndex(0);
    if (owner === undefined) throw "no player in slot 0";
    const footman = Unit.create(owner, FourCC("hfoo"), 0, 0);
    printed.length = 0;

    __stub_fire_trigger(trigger, { GetTriggerUnit: footman.handle });

    expect(printed).toEqual(["hfoo died"]);
  });

  it("starts a Timer repeating every 60 seconds", () => {
    // The library starts timers of its own (game time, host detection) at the
    // same stages; the starter's is the one repeating every 60 seconds.
    const repeating = timerStarts.filter(([, timeout, periodic]) => timeout === 60 && periodic === true);
    expect(repeating.length).toBe(1);
    const timer = repeating[0]?.[0] as timer;
    expect(stubCalls()).toContainCall(`TimerStart(${__stub_format(timer)}, 60, true, <function>)`);
    printed.length = 0;

    __stub_fire_timer(timer);
    __stub_fire_timer(timer);

    expect(printed).toEqual(["1 min played", "2 min played"]);
  });
});
