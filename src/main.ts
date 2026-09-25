import { Init, on, Reforged, Timer, UnitEvents } from "reforged-ts";
import { devMode } from "./generated/env";

// First statement: the mode decides whether the library's runtime Guards run.
// `pnpm build` generates devMode = true, `pnpm build --mode release` false.
Reforged.configure({ devMode });

// An Init stage: the game has started. Create Handles from an Init stage,
// never while the script loads.
Init.onGameStart(() => {
  print("reforged-ts-template: game started");

  // A Subscription: a handler on an Event descriptor. on() returns it; call
  // destroy() on it to end the Subscription.
  on(UnitEvents.death, ({ unit }) => {
    print(`${unit.name} died`);
  });

  // A repeating Timer, every 60 seconds. Timer.every returns it; pause() or
  // destroy() it to stop.
  let minutes = 0;
  Timer.every(60, () => {
    minutes += 1;
    print(`${minutes} min played`);
  });
});
