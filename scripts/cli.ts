import path from "node:path";
import { pathToFileURL } from "node:url";
import { AuthorError } from "./errors.ts";

/**
 * Prints a command's failure: an AuthorError as `<command> failed: <message>`
 * (no stack trace), anything else (a bug) with its stack.
 */
export function printFailure(command: string, error: unknown): void {
  console.error(
    error instanceof AuthorError
      ? `${command} failed: ${error.message}`
      : error,
  );
}

/**
 * Runs `main` when the module at `moduleUrl` (pass `import.meta.url`) is the
 * script Node was started with, and does nothing when it is imported. A
 * failure is printed with `printFailure` and sets exit code 1.
 * (`import.meta.main` would do the check, but needs Node 24.2; the floor is 24.0.)
 */
export async function runAsEntry(
  moduleUrl: string,
  command: string,
  main: () => void | Promise<void>,
): Promise<void> {
  if (
    !process.argv[1] ||
    pathToFileURL(path.resolve(process.argv[1])).href !== moduleUrl
  )
    return;
  try {
    await main();
  } catch (error) {
    printFailure(command, error);
    process.exitCode = 1;
  }
}
