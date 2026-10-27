import { spawn } from "node:child_process";
import path from "node:path";
import { build, builtMessage } from "./build.ts";
import { runAsEntry } from "./cli.ts";
import { CONFIG_FILE, loadLaunchConfig, type GameLaunch } from "./config.ts";
import { AuthorError } from "./errors.ts";

/**
 * Confirmed in game on 3.0.0.24268 (#32): `-launch` skips the menus and
 * `-editor` reuses the saved login (without it 3.0 asks for one). 3.0.0 also
 * loaded an unpacked map folder given to `-loadfile`; 3.0.1.24371 no longer
 * does (it shows the login, then its menu), but opens a packed map at once
 * with these same arguments (phmilk/reforged-ts#642), so the game is given
 * the archive the build packs.
 */
export const LAUNCH_ARGS: readonly string[] = [
  "-launch",
  "-editor",
  "-windowmode",
  "windowed",
];

/** A process to start: what `spawn` takes, without spawning, so it can be tested. */
export interface LaunchCommand {
  command: string;
  args: string[];
  /** Variables added to the inherited environment. */
  env: Record<string, string>;
}

/**
 * The command that opens the game on the map `archive` (absolute):
 * `<exe> -loadfile <archive> -launch -editor -windowmode windowed <extra args>`.
 * With a Wine path the executable becomes Wine's first argument, the archive a
 * `Z:` path (Wine maps `Z:` to `/`) and the prefix goes in `WINEPREFIX`.
 */
export function launchCommand(
  game: GameLaunch,
  archive: string,
): LaunchCommand {
  if (game.winePath === undefined) {
    return {
      command: game.executable,
      args: ["-loadfile", archive, ...LAUNCH_ARGS, ...game.extraArgs],
      env: {},
    };
  }
  return {
    command: game.winePath,
    args: [
      game.executable,
      "-loadfile",
      `Z:${archive.split(path.sep).join("/")}`,
      ...LAUNCH_ARGS,
      ...game.extraArgs,
    ],
    env: game.winePrefix === undefined ? {} : { WINEPREFIX: game.winePrefix },
  };
}

/** Starts the game detached (it outlives this script). A missing program is an AuthorError, not a stack trace. */
export function startGame(command: LaunchCommand): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command.command, command.args, {
      detached: true,
      stdio: "ignore",
      env: { ...process.env, ...command.env },
    });
    child.once("error", (error: NodeJS.ErrnoException) => {
      reject(
        error.code === "ENOENT"
          ? new AuthorError(
              `Could not start "${command.command}": no such file. Check \`gameExecutable\` / \`winePath\` in ${CONFIG_FILE}.`,
            )
          : error,
      );
    });
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

/**
 * Command line: `node scripts/launch.ts [--mode dev|release]` (`pnpm test:map`).
 * Finds the game first (so a missing game fails before building), builds, then
 * opens the game on the packed archive.
 */
await runAsEntry(import.meta.url, "test:map", async () => {
  const config = await loadLaunchConfig(
    path.resolve(CONFIG_FILE),
    process.argv.slice(2),
  );
  const result = build(config);
  console.log(builtMessage(config, result));
  await startGame(launchCommand(config.game, result.archive));
  console.log(
    `Launched ${config.game.executable} on ${path.relative(config.root, result.archive)}`,
  );
});
