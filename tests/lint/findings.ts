// Breaks the lint on purpose, once per marked line: the configuration test
// (tests/pipeline/eslint-config.test.ts) expects exactly these problems.
import { Init } from "reforged-ts";

// A Handle created at module top level, in the Lua root.
export const ticker = CreateTimer(); // finding: handle at top level

// A misformatted line.
export const  startingGold = 500; // finding: prettier

Init.onGameStart(() => {
  const owner = Player(0);
  if (GetLocalPlayer() === owner) {
    // Game state changed on one client only: a desync.
    SetPlayerState(owner, PLAYER_STATE_RESOURCE_GOLD, startingGold); // finding: game state in a local branch
  }

  // A disable comment without a `--` justification.
  // eslint-disable-next-line reforged/no-unsafe-natives
  TriggerSleepAction(1);
});
