// The names of the units the tests create. The harness holds no object data,
// so no Stub answers GetUnitName: stubNative gives it the answer, in each
// Test game of a test file that imports this module.

import { stubNative } from "reforged-test/map";

const NAMES: ReadonlyMap<number, string> = new Map([
  [FourCC("hfoo"), "Footman"],
]);

stubNative("GetUnitName", (unit) => NAMES.get(GetUnitTypeId(unit)) ?? "");
