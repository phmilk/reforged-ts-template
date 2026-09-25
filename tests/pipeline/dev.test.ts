import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { afterEach, describe, expect, it } from "vitest";
import { debounce, watchFolders, type Timers } from "../../scripts/dev.ts";
import { copyProject, ENTRY_MODULE, makeTempDir } from "./helpers.ts";

/** A manual clock: timers fire only when the test advances time. */
function fakeTimers(): Timers & { advance(ms: number): void } {
  let now = 0;
  let next = 0;
  const pending = new Map<number, { at: number; callback: () => void }>();
  return {
    setTimeout(callback, ms) {
      pending.set(++next, { at: now + ms, callback });
      return next;
    },
    clearTimeout(handle) {
      pending.delete(handle as number);
    },
    advance(ms) {
      now += ms;
      for (const [id, timer] of [...pending].sort((a, b) => a[1].at - b[1].at)) {
        if (timer.at <= now) {
          pending.delete(id);
          timer.callback();
        }
      }
    },
  };
}

describe("debounce", () => {
  it("runs once, a window after the last call of a burst", () => {
    const timers = fakeTimers();
    let runs = 0;
    const trigger = debounce(() => runs++, 300, timers);

    for (let i = 0; i < 10; i++) {
      trigger();
      timers.advance(100);
    }
    expect(runs).toBe(0);
    timers.advance(199);
    expect(runs).toBe(0);
    timers.advance(1);
    expect(runs).toBe(1);

    trigger();
    timers.advance(300);
    expect(runs).toBe(2);
  });
});

describe("watchFolders", () => {
  const closers: Array<{ close(): void }> = [];
  afterEach(() => closers.splice(0).forEach((watcher) => watcher.close()));

  it("turns a burst of file changes into one call and drops changes under ignored folders", async () => {
    const dir = makeTempDir();
    fs.mkdirSync(path.join(dir, "nested", "deep"), { recursive: true });
    fs.mkdirSync(path.join(dir, "generated"));
    let calls = 0;
    closers.push(watchFolders({ folders: [dir], ignore: [path.join(dir, "generated")], debounceMs: 100, onChange: () => calls++ }));
    await sleep(100);

    for (let i = 0; i < 20; i++) fs.writeFileSync(path.join(dir, "nested", "deep", `f${i % 3}.ts`), `// ${i}\n`);
    await sleep(500);
    expect(calls).toBe(1);

    fs.writeFileSync(path.join(dir, "generated", "env.ts"), "export {};\n");
    fs.rmSync(path.join(dir, "generated"), { recursive: true });
    fs.mkdirSync(path.join(dir, "generated"));
    fs.writeFileSync(path.join(dir, "generated", "env.ts"), "export {};\n");
    await sleep(500);
    expect(calls).toBe(1);
  });
});

describe("watchFolders on a folder deleted and created again", () => {
  it("keeps watching the new folder", async () => {
    const parent = makeTempDir();
    const folder = path.join(parent, "map.w3m");
    fs.mkdirSync(folder);
    let calls = 0;
    const watcher = watchFolders({ folders: [folder], ignore: [], debounceMs: 100, onChange: () => calls++ });
    try {
      await sleep(100);
      // The way an editor may save: remove the folder and write a new one in its place.
      fs.rmSync(folder, { recursive: true });
      fs.mkdirSync(folder);
      fs.writeFileSync(path.join(folder, "war3map.lua"), "-- 1\n");
      await sleep(500);
      expect(calls).toBe(1);

      // The new folder is watched, not the deleted one.
      fs.writeFileSync(path.join(folder, "war3map.lua"), "-- 2\n");
      await sleep(500);
      expect(calls).toBe(2);

      // Missing for a while, then back: a change on removal, one on return, and the new folder is watched.
      fs.rmSync(folder, { recursive: true });
      await sleep(500);
      expect(calls).toBe(3);
      fs.mkdirSync(folder);
      await sleep(500);
      expect(calls).toBe(4);
      fs.writeFileSync(path.join(folder, "war3map.lua"), "-- 3\n");
      await sleep(500);
      expect(calls).toBe(5);
    } finally {
      watcher.close();
    }
  });
});

/** `node scripts/dev.ts` in a throwaway project, with its output collected as it arrives. */
class DevProcess {
  output = "";
  private readonly child: ChildProcess;
  constructor(cwd: string, args: string[] = []) {
    this.child = spawn(process.execPath, ["scripts/dev.ts", ...args], { cwd, stdio: ["ignore", "pipe", "pipe"] });
    this.child.stdout!.on("data", (chunk: Buffer) => (this.output += chunk.toString("utf8")));
    this.child.stderr!.on("data", (chunk: Buffer) => (this.output += chunk.toString("utf8")));
  }
  count(pattern: RegExp): number {
    return this.output.match(new RegExp(pattern.source, pattern.flags + "g"))?.length ?? 0;
  }
  /** Waits until `pattern` has appeared `times` times in the output. */
  async waitFor(pattern: RegExp, times: number, timeoutMs = 30_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (this.count(pattern) < times) {
      if (this.child.exitCode !== null) throw new Error(`dev exited (${this.child.exitCode}):\n${this.output}`);
      if (Date.now() > deadline) throw new Error(`timed out waiting for ${times} x ${pattern}:\n${this.output}`);
      await sleep(50);
    }
  }
  /** Resolves with the exit code once the process has exited and its output is drained. */
  exited(): Promise<number | null> {
    if (this.child.exitCode !== null && this.child.stdout!.readableEnded && this.child.stderr!.readableEnded) return Promise.resolve(this.child.exitCode);
    return new Promise((resolve) => this.child.on("close", (code) => resolve(code)));
  }
  stop(): void {
    this.child.kill();
  }
}

const BUILT = /^Built dist[\\/]reforged-ts-template\.w3m \(\d+ bytes, mode dev\)$/m;
const FAILED = /^Build failed: /m;

describe("node scripts/dev.ts (pnpm dev)", () => {
  let dev: DevProcess | undefined;
  afterEach(() => dev?.stop());

  it("builds on start, rebuilds on changes in the source and map folders, survives a compile error, and never retriggers itself", async () => {
    const project = copyProject();
    dev = new DevProcess(project);
    await dev.waitFor(/^Watching src and maps[\\/]reforged-ts-template\.w3m for changes/m, 1);
    expect(dev.count(BUILT)).toBe(1);

    // The build's own writes (output folder) and generated files do not retrigger: no loop.
    fs.mkdirSync(path.join(project, "src", "generated"), { recursive: true });
    fs.writeFileSync(path.join(project, "src", "generated", "env.ts"), "export const devMode: boolean = true;\n");
    fs.writeFileSync(path.join(project, "dist", "scratch.txt"), "x");
    await sleep(1500);
    expect(dev.count(BUILT)).toBe(1);
    expect(dev.count(/Change detected/)).toBe(0);

    // A burst in the source folder: one rebuild.
    const entry = path.join(project, "src", "main.ts");
    const original = fs.readFileSync(entry, "utf8");
    for (let i = 0; i < 5; i++) fs.writeFileSync(entry, `${original}// edit ${i}\n`);
    await dev.waitFor(BUILT, 2);
    await sleep(1000);
    expect(dev.count(BUILT)).toBe(2);
    expect(fs.readFileSync(path.join(project, "dist", "bundle.lua"), "utf8")).toContain(ENTRY_MODULE);

    // A change in the map folder (as an editor save would make): a rebuild.
    fs.appendFileSync(path.join(project, "maps", "reforged-ts-template.w3m", "war3map.lua"), "\n-- saved again\n");
    await dev.waitFor(BUILT, 3);

    // A compile error prints the diagnostics and the watch keeps running.
    const broken = path.join(project, "src", "broken.ts");
    fs.writeFileSync(broken, 'export const n: number = "not a number";\n');
    await dev.waitFor(FAILED, 1);
    expect(dev.output).toMatch(/src[\\/]broken\.ts\(1,14\): error TS2322/);

    // The fix rebuilds without a restart.
    fs.writeFileSync(broken, "export const n: number = 1;\n");
    await dev.waitFor(BUILT, 4);
    await sleep(1000);
    expect(dev.count(BUILT)).toBe(4);
    expect(dev.count(FAILED)).toBe(1);
  });

  it("rebuilds after the map folder is deleted and created again, and keeps watching the new one", async () => {
    const project = copyProject();
    const mapFolder = path.join(project, "maps", "reforged-ts-template.w3m");
    const saved = makeTempDir();
    fs.cpSync(mapFolder, saved, { recursive: true });
    dev = new DevProcess(project);
    await dev.waitFor(/^Watching /m, 1);
    expect(dev.count(BUILT)).toBe(1);

    fs.rmSync(mapFolder, { recursive: true });
    fs.cpSync(saved, mapFolder, { recursive: true });
    fs.appendFileSync(path.join(mapFolder, "war3map.lua"), "\n-- saved as a new folder\n");
    await dev.waitFor(BUILT, 2);
    expect(fs.readFileSync(path.join(project, "dist", "staging", "reforged-ts-template.w3m", "war3map.lua"), "utf8")).toContain("-- saved as a new folder");

    // A later save into the recreated folder is still seen.
    fs.appendFileSync(path.join(mapFolder, "war3map.lua"), "\n-- saved again\n");
    await dev.waitFor(BUILT, 3);
    expect(dev.count(FAILED)).toBe(0);
  });

  it("takes --mode from the command line like pnpm build", async () => {
    const project = copyProject();
    dev = new DevProcess(project, ["--mode", "release"]);
    await dev.waitFor(/^Built dist[\\/]reforged-ts-template\.w3m \(\d+ bytes, mode release\)$/m, 1);
    expect(fs.readFileSync(path.join(project, "src", "generated", "env.ts"), "utf8")).toContain("devMode: boolean = false");
  });

  it("exits 1 on an invalid --mode without watching", async () => {
    const project = copyProject();
    dev = new DevProcess(project, ["--mode", "fast"]);
    expect(await dev.exited()).toBe(1);
    expect(dev.output).toMatch(FAILED);
    expect(dev.output).not.toMatch(/Watching/);
  });
});
