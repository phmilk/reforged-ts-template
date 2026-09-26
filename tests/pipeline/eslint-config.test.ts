import fs from "node:fs";
import path from "node:path";
import { ESLint, type Linter } from "eslint";
import reforged from "eslint-plugin-reforged";
import { beforeAll, describe, expect, it } from "vitest";
import { copyProject, ROOT } from "./helpers.ts";

// The flat config as ESLint loads it (eslint.config.mjs), run on map code: the
// fixtures in tests/lint are copied into the source folder of a copy of the
// Template and linted there, as a file of the map is by `pnpm lint`.
const FIXTURES = path.join(ROOT, "tests", "lint");

let project: string;
let eslint: ESLint;

beforeAll(() => {
  project = copyProject();
  for (const name of fs.readdirSync(FIXTURES)) {
    fs.copyFileSync(
      path.join(FIXTURES, name),
      path.join(project, "src", `lint-${name}`),
    );
  }
  eslint = new ESLint({ cwd: project });
});

/** The rule id and line of each problem ESLint reports for the fixture `name`, in report order. */
async function lint(name: string): Promise<[string | null, number][]> {
  const results = await eslint.lintFiles([
    path.join(project, "src", `lint-${name}`),
  ]);
  return results.flatMap((result) =>
    result.messages.map((message): [string | null, number] => [
      message.ruleId,
      message.line,
    ]),
  );
}

/** The 1-based line of the fixture `name` that contains `text`. */
function lineOf(name: string, text: string): number {
  const lines = fs.readFileSync(path.join(FIXTURES, name), "utf8").split("\n");
  const index = lines.findIndex((line) => line.includes(text));
  if (index === -1) throw new Error(`${name} has no line with ${text}`);
  return index + 1;
}

describe("the ESLint config", () => {
  it("reports the reforged rules, an unjustified disable comment and a misformatted line", async () => {
    const at = (text: string) => lineOf("findings.ts", text);
    expect(await lint("findings.ts")).toEqual([
      ["reforged/no-handles-at-module-top-level", at("CreateTimer()")],
      ["prettier/prettier", at("export const  startingGold")],
      ["reforged/no-game-state-in-local-branch", at("SetPlayerState(")],
      [
        "@eslint-community/eslint-comments/require-description",
        at("eslint-disable-next-line"),
      ],
    ]);
  }, 120_000);

  it("reports nothing on clean map code, a justified disable comment included", async () => {
    expect(await lint("clean.ts")).toEqual([]);
  }, 120_000);

  it("turns on every recommended rule of eslint-plugin-reforged, at its severity, in the source folder", async () => {
    const config = (await eslint.calculateConfigForFile(
      path.join(project, "src", "main.ts"),
    )) as Linter.Config;
    const recommended = Object.assign(
      {},
      ...reforged.configs.recommended.map((entry) => entry.rules ?? {}),
    ) as Record<string, unknown>;
    expect(Object.keys(recommended).length).toBeGreaterThan(0);
    for (const [rule, severity] of Object.entries(recommended)) {
      // ESLint normalizes an entry to [severity, ...options], severity as a number.
      const [actual] = [config.rules?.[rule]].flat();
      expect(actual, rule).toBe(
        { off: 0, warn: 1, error: 2 }[String(severity)],
      );
    }
  });
});
