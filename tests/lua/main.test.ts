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

// The line the starter prints when the game starts.
const STARTED = "reforged-ts-template: game started";

// Starts the game: defines Blizzard's MarkGameStarted and calls it, as the editor's script and the game would.
function startGame(): void {
  globals.MarkGameStarted = () => {};
  MarkGameStarted();
}

// The library wraps MarkGameStarted when it is defined, so the call runs the
// Init stages the editor's script would have run, then the game start
// callbacks. A callback that fails prints one line from the library.
startGame();
const printedAtGameStart = [...printed];

/**
 * Fails, naming the game start callback of src/main.ts, when it did not run to
 * its end: the Subscription and the Timer are made there.
 */
function expectGameStartCallbackRan(): void {
  if (printedAtGameStart.length !== 1 || printedAtGameStart[0] !== STARTED) {
    const output =
      printedAtGameStart.length === 0
        ? "nothing"
        : printedAtGameStart.join(" | ");
    throw `the game start callback of src/main.ts did not run to its end; printed at game start: ${output}`;
  }
}

describe("the starter source", () => {
  it("prints its line when the game starts", () => {
    expect(printedAtGameStart).toEqual([STARTED]);
  });

  it("runs the Subscription's handler when a unit dies", () => {
    expectGameStartCallbackRan();
    // UnitEvents.death registers one Trigger for the death of any player's
    // unit, once per player slot; the library registers no death of its own.
    const deathTriggers: trigger[] = [];
    for (const [registered, , event] of registrations) {
      if (
        event === EVENT_PLAYER_UNIT_DEATH &&
        !deathTriggers.includes(registered as trigger)
      ) {
        deathTriggers.push(registered as trigger);
      }
    }
    if (deathTriggers.length !== 1) {
      throw `expected the starter's one Trigger on EVENT_PLAYER_UNIT_DEATH, got ${deathTriggers.length}`;
    }
    const trigger = deathTriggers[0];
    const owner = MapPlayer.fromIndex(0);
    if (owner === undefined) throw "no player in slot 0";
    const footman = Unit.create(owner, FourCC("hfoo"), 0, 0);
    printed.length = 0;

    __stub_fire_trigger(trigger, { GetTriggerUnit: footman.handle });

    expect(printed).toEqual(["hfoo died"]);
  });

  it("starts a Timer repeating every 60 seconds", () => {
    expectGameStartCallbackRan();
    // The library starts timers of its own (game time, host detection) at the
    // same stages; the starter's is the one repeating every 60 seconds.
    const repeating = timerStarts.filter(
      ([, timeout, periodic]) => timeout === 60 && periodic === true,
    );
    if (repeating.length !== 1) {
      throw `expected the starter's one Timer repeating every 60 seconds, got ${repeating.length}`;
    }
    const timer = repeating[0][0] as timer;
    expect(stubCalls()).toContainCall(
      `TimerStart(${__stub_format(timer)}, 60, true, <function>)`,
    );
    printed.length = 0;

    __stub_fire_timer(timer);
    __stub_fire_timer(timer);

    expect(printed).toEqual(["1 min played", "2 min played"]);
  });
});
