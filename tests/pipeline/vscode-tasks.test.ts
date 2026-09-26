import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import * as ts from "typescript";
import { afterEach, describe, expect, it } from "vitest";
import { copyProject, makeTempDir, ROOT } from "./helpers.ts";

interface Task {
  label: string;
  isBackground?: boolean;
  problemMatcher?: {
    background?: { beginsPattern: string; endsPattern: string };
  };
}

/** `.vscode/tasks.json` as VS Code reads it: JSON with comments. */
function readTasks(): Task[] {
  const file = path.join(ROOT, ".vscode", "tasks.json");
  const result = ts.parseConfigFileTextToJson(
    file,
    fs.readFileSync(file, "utf8"),
  );
  if (result.error)
    throw new Error(
      ts.flattenDiagnosticMessageText(result.error.messageText, "\n"),
    );
  return (result.config as { tasks: Task[] }).tasks;
}

/**
 * `node scripts/dev.ts` with stdout and stderr written to one file, so the
 * lines keep the order the watcher printed them in, as in VS Code's terminal
 * (two pipes would not).
 */
function startDev(cwd: string) {
  const log = path.join(makeTempDir(), "dev.log");
  const fd = fs.openSync(log, "w");
  const child = spawn(process.execPath, ["scripts/dev.ts"], {
    cwd,
    stdio: ["ignore", fd, fd],
  });
  fs.closeSync(fd);
  const lines = () => fs.readFileSync(log, "utf8").split(/\r?\n/);
  return {
    lines,
    /** Waits until `pattern` matches `times` lines. */
    async waitFor(pattern: RegExp, times: number): Promise<void> {
      const deadline = Date.now() + 30_000;
      while (lines().filter((line) => pattern.test(line)).length < times) {
        if (child.exitCode !== null || Date.now() > deadline)
          throw new Error(
            `waiting for ${String(times)} x ${String(pattern)}:\n${lines().join("\n")}`,
          );
        await sleep(50);
      }
    },
    stop: () => child.kill(),
  };
}

describe("the VS Code dev task", () => {
  let stop: (() => void) | undefined;
  afterEach(() => stop?.());

  it("brackets every rebuild of pnpm dev with its background patterns, a failing one included", async () => {
    const dev = readTasks().find((task) => task.label === "dev");
    expect(dev?.isBackground).toBe(true);
    const background = dev?.problemMatcher?.background;
    if (!background) throw new Error("the dev task has no background patterns");
    const begins = new RegExp(background.beginsPattern);
    const ends = new RegExp(background.endsPattern);

    const project = copyProject();
    const watcher = startDev(project);
    stop = watcher.stop;
    // The first build runs as the task starts (activeByDefault): only its end is printed.
    await watcher.waitFor(ends, 1);

    const broken = path.join(project, "src", "broken.ts");
    fs.writeFileSync(broken, 'export const n: number = "not a number";\n');
    await watcher.waitFor(ends, 2);
    fs.writeFileSync(broken, "export const n: number = 1;\n");
    await watcher.waitFor(ends, 3);

    // Each rebuild's lines, the compile error's diagnostic included, sit between a begin and an end.
    const kinds = watcher
      .lines()
      .map((line) =>
        begins.test(line)
          ? "begin"
          : ends.test(line)
            ? "end"
            : line.startsWith("Built ")
              ? "built"
              : line.startsWith("Build failed: ")
                ? "failed"
                : /^src[\\/]broken\.ts\(1,14\): error TS2322/.test(line)
                  ? "diagnostic"
                  : undefined,
      )
      .filter((kind) => kind !== undefined);
    expect(kinds).toEqual([
      "built",
      "end",
      "begin",
      "failed",
      "diagnostic",
      "end",
      "begin",
      "built",
      "end",
    ]);
  });
});
