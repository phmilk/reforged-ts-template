# Template Tickets

A Ticket of the Spec in `phmilk/reforged-ts-template`, which `pnpm spec:frontier` prints in full form (`phmilk/reforged-ts-template#<n>`), is worked the way [`SKILL.md`](SKILL.md) works a library Ticket, with the differences below. Every `gh issue` and `gh pr` call on it carries `-R phmilk/reforged-ts-template`, and every `git` call on its checkout or worktree carries `-C <path>`. Its default branch is `main`.

## The checkout beside the library's

The Template's checkout sits beside the library's clone, in the same parent folder, and is the one this run uses for every Template Ticket. `<clone>` is the library's main clone (not one of its worktrees):

```sh
clone="$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")"
template="$(dirname "$clone")/reforged-ts-template"
[ -d "$template/.git" ] || gh repo clone phmilk/reforged-ts-template "$template"
git -C "$template" remote get-url origin   # names phmilk/reforged-ts-template
```

The checkout's own branch and files are the Collaborator's: the run never switches, resets or commits in it, and works each Ticket in a worktree of it.

## Its worktree

A Template Ticket's worktree is made from `origin/main`, in a folder beside the checkout, outside both repositories, since the Template's `.gitignore` and lint configuration do not ignore `.claude/worktrees/`:

```sh
git -C "$template" fetch origin main
git -C "$template" worktree add "$template-worktrees/<ticket>" -b <type>/<ticket>-<slug> origin/main
git -C "$template-worktrees/<ticket>" merge-base --is-ancestor origin/main HEAD
```

It is removed as a library worktree is, through the Template's checkout: `git -C "$template" worktree remove "$template-worktrees/<ticket>"`, then `git -C "$template" branch -D <branch>` once its pull request merged.

## Its Claim

`gh issue edit` takes the issues of one repository only, so the Ticket and its Spec are claimed by their URLs, in two commands on one line, as the [Claim section](https://github.com/phmilk/reforged-ts/blob/master/docs/agents/issue-tracker.md#claim) says ("A Spec's assignees"):

```sh
gh issue edit https://github.com/phmilk/reforged-ts-template/issues/<ticket> --add-assignee @me && gh issue edit https://github.com/phmilk/reforged-ts/issues/<spec> --add-assignee @me
```

A withdrawal takes the same two commands with `--remove-assignee @me`.

## A library version not yet published

The library releases before the Template consumes a new version: the release publishes to npm, then its dispatch opens the Template's sync pull request ([`docs/release.md`](https://github.com/phmilk/reforged-ts/blob/master/docs/release.md#the-template-dispatch), "The Template dispatch"). A Template Ticket that builds on a library change is blocked by the library Ticket that makes it (native blocked-by edges work across the two repositories). Once that Ticket merges, the Template Ticket is on the Frontier, yet the change may sit on `master` unpublished. Find out, after the Claim and before any worktree, for each library blocker of the Template Ticket:

1. **Its blockers in the library**, closed ones (an open one keeps it off the Frontier):

   ```sh
   gh api repos/phmilk/reforged-ts-template/issues/<ticket>/dependencies/blocked_by \
     --jq '.[] | select(.repository_url | endswith("/phmilk/reforged-ts")) | .number'
   ```

2. **The merged pull requests that closed each one**, and their merge commits on `master`:

   ```sh
   gh api graphql -F n=<blocker> -f query='query($n: Int!) { repository(owner: "phmilk", name: "reforged-ts") { issue(number: $n) { closedByPullRequestsReferences(first: 10, includeClosedPrs: true) { nodes { number merged mergeCommit { oid } } } } } }'
   ```

   Keep the nodes with `merged: true`. A blocker closed with none needs no version.

3. **The packages each merge changes**, from the changesets it added, after `git fetch origin master --tags`: `git diff-tree --no-commit-id --name-only --diff-filter=A -r <oid> -- .changeset/` lists them (not those under `.changeset/pre/`), and `git show <oid>:<file>` gives each one's frontmatter, one `"<package>": <bump>` line per package. Keep the packages the Template's `package.json` on `origin/main` depends on, and those the Ticket names (a package the Template takes up for the first time). An empty changeset needs no version.
4. **The first version of each package that carries the merge**, `<package>@<version>`, from the first branch that holds:
   - **Released:** `git tag --contains <oid> --list '<package>@*' | sort -V | head -1` prints a tag; the release workflow tags a package when it publishes it. The version is the tag's.
   - **Not on `master`:** `git merge-base --is-ancestor <oid> origin/master` fails (merged into another branch): unpublished, and the version is the next release of the package after its last tag, named so.
   - **Versioned:** the changeset is gone from `origin/master`'s `.changeset/` (`git cat-file -e origin/master:<file>` fails), consumed by a Version Packages pull request. The version is the package's in the commit that consumed it: `git log origin/master --diff-filter=A --format=%H -1 -- .changeset/pre/<id>.md` (outside pre mode, `--diff-filter=D -- <file>`), then `git show <that commit>:packages/<package>/package.json`.
   - **Pending:** the changeset is still on `origin/master`. The version is the one Changesets plans, read in a throwaway detached worktree of `origin/master` with the clone's own Changesets (installed by `pnpm install` in the clone), which needs no install there:

     ```sh
     status="$(mktemp -d)/master"
     git worktree add --detach "$status" origin/master
     (cd "$status" && node "$clone/node_modules/@changesets/cli/bin.js" status --output status.json)
     ```

     The version is the `newVersion` of the package's entry under `releases` in `$status/status.json`. Remove the worktree afterwards (`git worktree remove --force "$status"`).

5. **Published or not:** `npm view <package>@<version> version` prints the version when npm holds it; an error (`E404`) means it does not.
   When npm holds every version, work the Ticket. A version the Template's `origin/main` does not install yet (its sync pull request not merged, or a package it takes up for the first time) is installed by the implementer as part of the Ticket's work, at the range the sync writes (`pnpm add <package>@^<version>`), and its pull request says so. When any version is unpublished, the Ticket stops before its work, like a Probe Ticket on a machine without the game ([Stopping](SKILL.md#stopping)): its "Stopping" comment names each unpublished `<package>@<version>`, the library pull request it carries in full form (`phmilk/reforged-ts#<pr>`, since a bare `#<pr>` on a Template issue links into the Template), and that it resumes once the maintainer's release publishes it; no worktree and no branch. The version is recomputed at each run, never read back from that comment, since more changesets may land meanwhile.

**Resuming it.** Held by the login with no pull request, a Ticket stopped for an unpublished version needs no human answer: step 4 of [`SKILL.md`](SKILL.md) runs the check above again, and starts the Ticket as step 5 does once npm holds every version; otherwise its stop stands, in the ledger with the versions still unpublished.

An implementer that finds, in its work, that it needs a library change no blocker names stops and reports the change, and the Ticket stops with it as its question: which library Ticket delivers it is a human's call.

## Its implementer and pull request

Its implementer gets the prompt of [`implementer.md`](implementer.md) with the Template's values in its placeholders: its repository, `main`, its worktree's path, and the absolute paths of the library's skill and check lock, since the Template's copy of the shared skills may lag behind the library's. It runs `/ship` from its worktree, so its pull request opens in the Template, against `main`, and merges by auto-merge (squash), as the Template's repository settings allow (phmilk/reforged-ts-template#137). The Template has no `.changeset/` folder, so it carries no changeset.

Its required checks are the Template's own, and a red one is settled as [A red CI](SKILL.md#a-red-ci) says.
