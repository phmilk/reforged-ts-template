/** @noSelfInFile */

// The helpers of the reforged-test stubs. They are Lua globals the shipped
// stub files define, not Natives, so the Typings do not declare them.

/**
 * A firing context: what each event response Native answers while a trigger
 * fires, keyed by the Native's name (`{ GetTriggerUnit: unit.handle }`). A
 * Native the context leaves out answers nil.
 */
type StubContext = {
  readonly [
    N in keyof typeof globalThis
  ]?: (typeof globalThis)[N] extends () => infer R ? NonNullable<R> : never;
};

/**
 * Fires the trigger as one event would, with `context` as the firing context:
 * its conditions, then its actions if every condition returned true. Returns
 * whether the actions ran.
 */
declare function __stub_fire_trigger(whichTrigger: trigger, context?: StubContext): boolean;

/** Runs the handler `TimerStart` stored for this timer, once. */
declare function __stub_fire_timer(whichTimer: timer): void;

/** One value as the call log renders it: a handle as `timer#1048577`. */
declare function __stub_format(value: unknown): string;
