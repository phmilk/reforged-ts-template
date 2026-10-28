# Issue tracker: GitHub

_Template maintenance: this file serves the development of the Template itself. Delete it in a generated Map project (see the Template maintenance section of `AGENTS.md`)._

Issues and specs for this repo live as GitHub issues. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`, filtering comments by `jq` and also fetching labels.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`
- **Claim an issue**: `gh issue edit <number> --add-assignee @me`, before any work on it and before any other write, a Ticket with its Spec; release it with `--remove-assignee @me` (see "Claim").

Infer the repo from `git remote -v`; `gh` does this automatically when run inside a clone.

## Where issues live

- **The Template** (build pipeline, starter, its CI and docs): this repo, `phmilk/reforged-ts-template`. Its issues moved here from the library on 2026-09-25; the old numbers there redirect here.
- **The library, the Typings, the harness and the lint plugin**: `phmilk/reforged-ts`, which also holds the wayfinder maps, the ADRs the Template follows (the Claim protocol is its ADR 0016, amended for Specs by its ADR 0023), the coverage check `pnpm spec:check` and the reusable `claim-check.yml` workflow that this repository's `claim.yml` calls.
- Refer to an issue in the other repo with its full form, `phmilk/reforged-ts#46`; a bare `#12` means this repo. Sub-issues and "blocked by" edges work across the two repos.

## Claim

The Claim protocol is the library's, in one place: [Claim](https://github.com/phmilk/reforged-ts/blob/master/docs/agents/issue-tracker.md#claim). Read it before claiming, releasing or taking over an issue, before opening a pull request that closes one, and before closing a Spec; it also draws an issue's life from its creation to its close. It binds this repository as written: this repository and the library are its two Board repositories.

What is the Template's own:

- **The check here.** `.github/workflows/claim.yml` calls the library's reusable `claim-check.yml`, so the check `claim / check` runs here as the library's "The check" describes, on the issues of this repository that a pull request closes. Its token writes only in this repository: for a Ticket here whose Spec is in the library, it comments on the Ticket the command that joins the Spec instead of assigning the author to it. The ruleset on `main` requires the check.
- **A Ticket and its Spec in different repositories.** `gh issue edit` takes the issues of one repository only, so a Ticket here of a Spec in the library, or the reverse, is claimed in two commands on one line, by their URLs: `gh issue edit <ticket-url> --add-assignee @me && gh issue edit <spec-url> --add-assignee @me`. A release takes the same line with `--remove-assignee @me`.
- **Closing a Spec of this repository.** The coverage check runs from a clone of the library, with this repository named: `pnpm spec:check <spec> phmilk/reforged-ts-template`. In that clone `gh` acts on the library, so the close on green names this repository: `gh issue close <spec> -R phmilk/reforged-ts-template --comment "..."`.

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.)_

When set to `yes`, PRs run through the same labels and states as issues, using the `gh pr` equivalents:

- **Read a PR**: `gh pr view <number> --comments` and `gh pr diff <number>` for the diff.
- **List external PRs for triage**: `gh pr list --state open --json number,title,body,labels,author,authorAssociation,comments` then keep only `authorAssociation` of `CONTRIBUTOR`, `FIRST_TIME_CONTRIBUTOR`, or `NONE` (drop `OWNER`/`MEMBER`/`COLLABORATOR`).
- **Comment / label / close**: `gh pr comment`, `gh pr edit --add-label`/`--remove-label`, `gh pr close`.

GitHub shares one number space across issues and PRs, so a bare `#42` may be either: resolve with `gh pr view 42` and fall back to `gh issue view 42`.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`, and read its assignees: an assigned Ticket or issue is taken, whatever its labels, and a Spec carries the logins of its Tickets. Claim it before working on it (see "Claim").
