# The library's release gate

_Template maintenance: this file serves the development of the Template itself. Delete it in a generated Map project (see the Template maintenance section of `AGENTS.md`)._

The Template is the Map project the library tests its releases against: no release of `phmilk/reforged-ts` reaches npm unless the Template builds, lints and passes its tests against the packed packages. The gate lives in the library (`pnpm release:template-gate`, described in the library's `docs/release.md`, "The Template gate"); this file is what it expects from this repository, and how to reproduce it here.

## What the gate does to a Template checkout

1. **The clone.** It clones the Template at the Template branch of the release's Release channel (the library's ADR 0031): `main` for a release from the library's `master`, `next` for one from its Next branch. A missing branch stops the release.
2. **The install.** It writes one `overrides` entry into the clone's `pnpm-workspace.yaml` per package the release publishes, pointing at that package's tarball (`file:<tarball>`), then runs `pnpm install --no-frozen-lockfile`: the overrides change the committed lockfile's configuration, so a frozen install would refuse them. It checks that the Template's direct dependencies resolved to the packed versions. A package the release does not publish comes from npm.
3. **The commands.** It runs the scripts `build --mode release`, `lint` and `test`, by name and in that order, and stops at the first one that fails or is missing.

What that asks of the Template:

- The three scripts keep their names, and `build` accepts `--mode release`.
- The install needs no manual step: `prepare` writes `src/generated`, so the build and the type-aware lint find it.
- No game, no network beyond the registry, no absolute path in a committed file (`tests/pipeline/absolute-paths.test.ts`). The gate runs on Ubuntu; the Template also supports Windows, where the clone's path must stay short (vitest fails at startup past 260 characters).
- The overrides live in `pnpm-workspace.yaml`, the one place pnpm 12 (`packageManager`) reads settings from; the gate keeps the file's other settings and comments. A pnpmfile that replaced them would make the Template resolve other versions than the packed ones, which the gate reports as an install failure. `.pnpmfile.cjs` is inert without `.local-packages/`, which a clone never has.

The overrides, the lockfile they produce and the build output stay in the throwaway clone. None of it is ever committed here.

During the alpha phase the install prints unmet-peer warnings: the library's packages declare their peer ranges as `^1.0.0`, which no `1.0.0-alpha.N` satisfies. The install still succeeds (exit 0) and the gate goes on. The fix, prerelease-aware peer ranges, belongs in the library.

## The ranges and the lockfile

`package.json` declares the seven library packages as `^<latest released version>`: on each library release the sync (`scripts/sync.ts`) sets them to the versions it released. During the build phase each is at a caret range on its latest alpha (`^1.0.0-alpha.N`), the alphas being published under npm's `latest` dist-tag. A caret range on a prerelease admits later prereleases of the same `major.minor.patch` only (`^1.0.0-alpha.0` matches `1.0.0-alpha.3`, not `1.1.0-alpha.0`), and any later release of that major.

The lockfile is committed, from a plain `pnpm install` against the registry after the library's first `next` publish; `pnpm install --frozen-lockfile` installs it on a fresh clone. The sync workflow keeps it following the ranges: after the sync it runs `pnpm update` on the seven library packages (a non-frozen `pnpm install` would keep a locked version the new range no longer admits), checks the result with `pnpm install --frozen-lockfile`, and commits the refreshed lockfile in the same sync pull request.

## Installing tarballs without committing them

Two ways, both leaving every committed file as it is.

**`pnpm use:local <checkout>`**, the daily one (see the README, "Developing against a local checkout of the library"). It builds and packs the seven packages of a reforged-ts checkout into `.local-packages/` (ignored) and installs them through the committed pnpm hook `.pnpmfile.cjs`, which is inert without that folder. It installs without the lockfile (`--no-lockfile`), so the committed one stays as it is. `pnpm use:local --reset` goes back to the registry, reinstalling from the committed lockfile.

```sh
pnpm use:local ../reforged-ts
pnpm build --mode release && pnpm lint && pnpm test
pnpm use:local --reset
```

**The gate's own way**, to reproduce a release gate run exactly. From the library checkout, with a throwaway clone of the Template outside it:

```sh
pnpm run build
pnpm changeset pack --out-dir ../pack
git clone --branch main https://github.com/phmilk/reforged-ts-template.git ../t
pnpm release:template-gate --template ../t --pack-dir ../pack
```

Clone the branch under test in place of `main` (the release itself clones the Template branch of its channel). Without the library's gate script, the same sequence by hand in the clone: add an `overrides` entry per tarball to its `pnpm-workspace.yaml` (`reforged-ts: file:<path to the tarball>`), then `pnpm install --no-frozen-lockfile`, `pnpm build --mode release`, `pnpm lint`, `pnpm test`. Delete the clone afterwards.

Never make that change in a working copy you commit from: a committed override points every Map project at a file that exists on one machine only (the absolute-path test fails on an absolute one, as the gate writes). The same goes for a lockfile written while the overrides or `use:local` were in effect.

## One branch per Release channel

- `main` follows the library's stable line, its `master`. A release from `master` gates it, the Creation CLI it packs downloads it, and its sync opens its pull request against it.
- `next` exists only while a library major is in preparation: it is cut from `main` when the library cuts its Next branch, a release from the library's `next` gates it and syncs it, and it is merged into `main` before the library's `next` merges into `master`, then deleted. The library's `docs/release.md`, "Release channels", holds the procedure.
- No branch or tag is moved by hand before a release, and there is no `v<major>` line. The `v1` tag stays where it was last moved until a Ticket of phmilk/reforged-ts#1062 deletes it, once no Creation CLI on `latest` downloads it. The Template is public, so the gate clones it without a token.
