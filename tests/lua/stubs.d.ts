/** @noSelfInFile */

// The firing helpers of the reforged-test stubs. They are Lua globals the
// shipped stub files define, not Natives, so the Typings do not declare them.

/** Runs the handler `TimerStart` stored for this timer, once. */
declare function __stub_fire_timer(whichTimer: timer): void;

/** Runs the trigger's actions once each, in the order they were added. */
declare function __stub_fire_trigger(whichTrigger: trigger): void;
