/**
 * A failure the author can act on: the build prints its message (no stack
 * trace) and exits non-zero.
 */
export class BuildError extends Error {
  override name = "BuildError";
}
