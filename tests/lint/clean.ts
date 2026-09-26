// Lint-clean map code: the configuration test
// (tests/pipeline/eslint-config.test.ts) expects no problem in this file.
import { Init } from "reforged-ts";

export const startingGold = 500;

Init.onGameStart(() => {
  // Created in an Init stage, not in the Lua root.
  const ticker = CreateTimer();
  TimerStart(ticker, 60, true, () => {
    print("A minute passed");
  });

  // Game state for every player; only the message is local.
  const owner = Player(0);
  SetPlayerState(owner, PLAYER_STATE_RESOURCE_GOLD, startingGold);
  if (GetLocalPlayer() === owner) {
    print("Gold granted");
  }

  // eslint-disable-next-line reforged/no-unsafe-natives -- a disable comment with a justification is accepted
  TriggerSleepAction(0);
});
