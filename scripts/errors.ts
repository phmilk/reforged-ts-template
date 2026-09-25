/**
 * A failure the author can act on (a config mistake, a map saved without Lua,
 * a compile error): the command prints its message without a stack trace and
 * exits non-zero. Any other error is a bug and prints with its stack.
 */
export class AuthorError extends Error {
  override name = "AuthorError";
}
