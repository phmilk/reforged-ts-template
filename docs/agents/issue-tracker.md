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

A Claim marks an issue as taken by one login: it is held while that login is among the issue's assignees. It binds every Collaborator (a person with push access to this repository or the library's) and every Agent a Collaborator runs: an Agent writes as the Collaborator's login, so its Claim is the Collaborator's. The assignee is the source; the board is a view of it. A Spec has no Claim of its own: its Tickets are claimed, and its assignees are the logins that hold or delivered them ([ADR 0023](https://github.com/phmilk/reforged-ts/blob/master/docs/adr/0023-a-spec-carries-every-login-on-its-tickets-and-the-last-tickets-merger-closes-it.md)).

The rules are the library's, in one place: [Claim](https://github.com/phmilk/reforged-ts/blob/master/docs/agents/issue-tracker.md#claim), with the coverage rule and the Coverage table's format under its [A Spec's coverage](https://github.com/phmilk/reforged-ts/blob/master/docs/agents/issue-tracker.md#a-specs-coverage). Read them before claiming, releasing, taking over or stopping with an issue open, before opening a pull request that closes one, and before splitting or closing a Spec; the library also draws an issue's life from its creation to its close. They bind this repository as written: this repository and the library are the protocol's two Board repositories.

What is the Template's own:

- **The check here.** `.github/workflows/claim.yml` calls the library's reusable `claim-check.yml`, so the check `claim / check` runs here as the library's "The check" describes, on the issues of this repository that a pull request closes. Its token writes only in this repository: for a Ticket here whose Spec is in the library, it comments on the Ticket the command that joins the Spec instead of assigning the author to it.
- **A Ticket here of a Spec in the library.** `gh issue edit` takes the issues of one repository only, so the Ticket and its Spec are claimed in two commands on one line, by their URLs: `gh issue edit <ticket-url> --add-assignee @me && gh issue edit <spec-url> --add-assignee @me`. A release takes the same line with `--remove-assignee @me`.
- **The coverage check.** It runs from a clone of the library: `pnpm spec:check <spec> phmilk/reforged-ts-template` for a Spec of this repository, `pnpm spec:check <spec>` for one of the library's. In that clone `gh` acts on the library, so closing a Spec of this repository on green names it: `gh issue close <spec> -R phmilk/reforged-ts-template --comment "..."`.

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
