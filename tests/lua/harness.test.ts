/** @noSelfInFile */

// Map logic on the reforged-test harness: Lua 5.3 with the game's Natives
// stubbed (the package's stubs, then tests/stubs/*.lua) and the editor's
// globals stubbed (src/generated/editor-globals.lua). Each `it` is one vitest
// test. A Native no stub defines fails with "Native X is not stubbed": add it
// to a stub file in tests/stubs.

import { describe, expect, it, stubCalls } from "reforged-test/lua";

describe("the harness", () => {
  it("runs Natives on the stubs and logs each call", () => {
    const timer = CreateTimer();
    let fired = 0;
    TimerStart(timer, 2, false, () => {
      fired += 1;
    });

    __stub_fire_timer(timer);

    expect(fired).toBe(1);
    expect(TimerGetTimeout(timer)).toBe(2);
    expect(stubCalls()).toContainCall("TimerStart(timer#1048577, 2, false, <function>)");
  });

  it("declares the editor's globals, nil until the editor script creates them", () => {
    expect(gg_trg_Melee_Initialization).toBeUndefined();
  });
});
