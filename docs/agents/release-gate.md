# The library's release gate

_Template maintenance: this file serves the development of the Template itself. Delete it in a generated Map project (see the Template maintenance section of `AGENTS.md`)._

The Template is the library's Reference consumer: no release of `phmilk/reforged-ts` reaches npm unless the Template builds, lints and passes its tests against the packed packages. The gate lives in the library (`pnpm release:template-gate`, described in the library's `docs/release.md`, "The Template gate"); this file is what it expects from this repository, and how to reproduce it here.

## What the gate does to a Template checkout

1. **The clone.** It clones the Template at `v<major>` of the library version it releases. Every 1.x, alphas included, maps to `v1`. A tag and a branch both work. There is no fallback to `main`: a missing ref stops the release.
2. **The install.** It writes one `pnpm.overrides` entry into the clone's `package.json` per package the release publishes, pointing at that package's tarball (`file:<tarball>`), then runs `pnpm install --no-frozen-lockfile`. It checks that the Template's direct dependencies resolved to the packed versions. A package the release does not publish comes from npm.
3. **The commands.** It runs the scripts `build --mode release`, `lint` and `test`, by name and in that order, and stops at the first one that fails or is missing.

What that asks of the Template:

- The three scripts keep their names, and `build` accepts `--mode release`.
- The install needs no manual step: `prepare` writes `src/generated`, so the build and the type-aware lint find it.
- No game, no network beyond the registry, no absolute path in a committed file (`tests/pipeline/absolute-paths.test.ts`). The gate runs on Ubuntu; the Template also supports Windows, where the clone's path must stay short (vitest fails at startup past 260 characters).
- The overrides live in `package.json`, which pnpm 10 reads (`packageManager`). pnpm 11 ignores `pnpm.overrides` there, and an `overrides` key in a `pnpm-workspace.yaml` would replace them: the gate reports either as an install failure.

The overrides, the lockfile they produce and the build output stay in the throwaway clone. None of it is ever committed here.

## The ranges and the lockfile

`package.json` declares the four library packages on the `next` channel: `^1.0.0-alpha.0`, which matches every `1.0.0-alpha.N` and every 1.x (a plain `^1.0.0` matches no prerelease). On each release the sync (`scripts/sync.ts`) sets them to `^<released version>`, which stays on the same major.

The lockfile is committed after the library's first `next` publish, from a plain `pnpm install` against the registry. Until then the packages return 404 on npm and no lockfile is committed.

## Installing tarballs without committing them

Two ways, both leaving every committed file as it is.

**`pnpm use:local <checkout>`**, the daily one (see the README, "Developing against a local checkout of the library"). It builds and packs the four packages of a reforged-ts checkout into `.local-packages/` (ignored) and installs them through the committed pnpm hook `.pnpmfile.cjs`, which is inert without that folder. No lockfile is written. `pnpm use:local --reset` goes back to the registry.

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

Clone the branch under test in place of `main` (the release itself clones `v<major>`). Without the library's gate script, the same sequence by hand in the clone: add a `pnpm.overrides` entry per tarball to its `package.json` (`"reforged-ts": "file:<path to the tarball>"`), then `pnpm install --no-frozen-lockfile`, `pnpm build --mode release`, `pnpm lint`, `pnpm test`. Delete the clone afterwards.

Never make that change in a working copy you commit from: a committed override points every Map project at a file that exists on one machine only (the absolute-path test fails on an absolute one, as the gate writes). The same goes for a lockfile written while the overrides or `use:local` were in effect.

## One line per library major

- `main` tracks the current library major.
- When a new library major starts, a branch named after the previous major (`v1` at library 2.0) is cut from `main` and kept for that line; `main` moves on to the new major.
- The gate clones `v<major>`, so each major always has its ref.

**Maintainer step, before the library's first gated release:** the `v1` ref does not exist yet, and the gate stops at the clone without it. Create it on the Template commit that supports the release, as a tag (`git tag v1 <commit> && git push origin v1`) or a branch. A tag has to be moved each time `main` moves on during 1.x, and is replaced by the `v1` branch at library 2.0 (delete the tag first: a tag and a branch of the same name are ambiguous). While the Template is private the gate also needs the library's `TEMPLATE_READ_TOKEN` secret.
