# The known-flake catalogue

The failures of a required check that `ship-spec` reruns once, read when a check of one of its pull requests is red (step 7 of [`SKILL.md`](SKILL.md)). Each entry is a timeout of a named test on a named job, from the diagnosis of [#658](https://github.com/phmilk/reforged-ts/issues/658): the windows runner stalls now and then for the whole machine, and the tests whose limit is the smallest multiple of their usual duration time out first. A failure no entry matches gets no rerun: it is caused by the code until a diagnosis shows otherwise, and a new entry comes only from such a diagnosis, never from a run that passed on retry. The test `test/conventions/known-flakes.test.ts` holds each entry to ci.yml's checks and to the test files.

## Entries

| Job            | File                                                  | Test                                                                                                                         | Its timeout                                                       | Failed run (#658)                                                                                                                 |
| -------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `ci (windows)` | `release/test/cli.test.ts`                            | `release:check-changeset` › "fails with one line per package changed without a changeset"                                    | vitest's: `Test timed out in <n>ms`                               | [39633383218](https://github.com/phmilk/reforged-ts/actions/runs/39633383218/job/119337230894)                                    |
| `ci (windows)` | `release/test/matrix.test.ts`                         | `release:version` › "stamps the library's major.minor into the plugin's docs field and the README links of a stable release" | vitest's: `Test timed out in <n>ms`                               | [38732570567](https://github.com/phmilk/reforged-ts/actions/runs/38732570567), beside real failures, which made that run no match |
| `ci (windows)` | `packages/reforged-map/test/world-editor.test.ts`     | `the real World Editor check` › "returns no window for a temporary folder"                                                   | the check's: `powershell.exe timed out after <n> ms`, or vitest's | [40159519509](https://github.com/phmilk/reforged-ts/actions/runs/40159519509/job/121067951738)                                    |
| `ci (windows)` | `packages/reforged-map/test/object-data-text.test.ts` | `git diff of the map folder` › "prints the one line of the field a commit changed in war3map.w3u, under its object"          | vitest's: `Test timed out in <n>ms`                               | [40642973714](https://github.com/phmilk/reforged-ts/actions/runs/40642973714/job/122665164696)                                    |

The limits in milliseconds change with the tests (#658's fix raised two), so an entry matches the timeout's message, whatever its number.

## A match

Read the red run's failed jobs and their logs: `gh run view <run> --json attempt,jobs` and `gh run view <run> --log-failed`. The failure matches the catalogue when all of these hold:

- every red required check of the pull request is a failed job of this run and the job of an entry: a red `ci (ubuntu)`, or a red `claim / check`, is no match;
- in each failed job, the step that failed is `test`, and every test that failed names an entry of that job, by its file and its titles;
- each of those tests failed by its entry's timeout message, not by an assertion or an error of its own.

Anything else, a catalogued test that failed otherwise included, is no match.
