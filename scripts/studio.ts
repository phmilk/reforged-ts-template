// `pnpm studio`: the Studio of reforged-ts (`reforged-studio`) on the map
// folder, with the game and the World Editor the other commands find. The
// Studio edits Object data through `reforged-map` and takes turns with the
// World Editor; while it runs, `.reforged-studio.json` at the root (ignored
// by git) says where.
import path from "node:path";
import { MapFolderError } from "reforged-map";
import {
  InstallNotFoundError,
  startStudio,
  type Studio,
  type StudioOptions,
} from "reforged-studio";
import { runAsEntry } from "./cli.ts";
import { CONFIG_FILE, loadStudioConfig, type StudioConfig } from "./config.ts";
import { AuthorError } from "./errors.ts";

/** What starts the Studio: `reforged-studio`'s `startStudio`, injected by tests. */
export type StartStudio = (options: StudioOptions) => Promise<Studio>;

/**
 * Starts the Studio on `config`'s map folder, with the game `pnpm test:map`
 * finds and the World Editor beside it, and opens its page in the browser.
 * A map folder or an install the Studio cannot read is an AuthorError with
 * its message, which names what to fix. A game run through Wine is one too:
 * the Studio reads the install's files from this machine, and the path of
 * a Wine launch is the Windows side's.
 */
export async function runStudio(
  config: StudioConfig,
  start: StartStudio = startStudio,
): Promise<Studio> {
  if (config.game.winePath !== undefined)
    throw new AuthorError(
      `the Studio does not read a game run through Wine (\`winePath\` in ${CONFIG_FILE}): run \`pnpm exec reforged-studio --map <map folder> --game <the game's executable on this machine>\` instead.`,
    );
  try {
    return await start({
      projectRoot: config.root,
      mapFolder: config.mapFolder,
      gameExecutable: config.game.executable,
      ...(config.worldEditorExecutable !== undefined && {
        worldEditorExecutable: config.worldEditorExecutable,
      }),
      open: true,
    });
  } catch (error) {
    if (
      error instanceof MapFolderError ||
      error instanceof InstallNotFoundError
    )
      throw new AuthorError(error.message);
    throw error;
  }
}

/**
 * Command line: `node scripts/studio.ts` (`pnpm studio`), run from the
 * repository root. Runs until Ctrl+C, which stops the Studio; when a Studio
 * already runs on the map folder, it opens that one's page and ends.
 */
await runAsEntry(import.meta.url, "studio", async () => {
  if (process.argv.length > 2)
    throw new AuthorError("Usage: pnpm studio (it takes no arguments).");
  const config = await loadStudioConfig(path.resolve(CONFIG_FILE));
  const studio = await runStudio(config);
  if (!studio.started) {
    console.log(
      `A Studio already runs on this map folder, at ${studio.url}/objects.`,
    );
    return;
  }
  console.log(
    `The Studio runs at ${studio.url}/objects. Press Ctrl+C to stop it.`,
  );
  const stop = () => {
    void studio.close().then(() => process.exit(0));
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
});
