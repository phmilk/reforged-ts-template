// The starter source's test, on reforged-test/map. Each test runs in a Test
// game of its own: the test starts the game with startGame(), acts in it with
// Game actions and game.advanceTime, and checks what the player observes. The guide:
// https://phmilk.github.io/reforged-ts/docs/next/guides/testing-your-map

import { describe, expect, it, startGame } from "reforged-test/map";
import { MapPlayer, Unit } from "reforged-ts";
import "../../src/main";
import "./unit-names";

// The line the starter prints when the game starts.
const STARTED = "reforged-ts-template: game started";

describe("the starter source", () => {
  it("prints its line when the game starts", () => {
    const game = startGame();
    expect(game.printed).toEqual([STARTED]);
  });

  it("prints the name of a unit that dies", () => {
    const game = startGame();
    const host = MapPlayer.fromIndex(0);
    if (host === undefined) throw new Error("no player in slot 0");
    const footman = Unit.create(host, FourCC("hfoo"), 0, 0);

    game.kill(footman);

    expect(game.printed).toEqual([STARTED, "Footman died"]);
  });

  it("counts the minutes played", () => {
    const game = startGame();

    game.advanceTime(120);

    expect(game.printed).toEqual([STARTED, "1 min played", "2 min played"]);
  });
});
