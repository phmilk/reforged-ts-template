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
- **Claim an issue**: `gh issue edit <number> --add-assignee @me`, before any work on it and before any other write; release it with `--remove-assignee @me` (see "Claim").

Infer the repo from `git remote -v`; `gh` does this automatically when run inside a clone.

## Where issues live

- **The Template** (build pipeline, starter, its CI and docs): this repo, `phmilk/reforged-ts-template`. Its issues moved here from the library on 2026-09-25; the old numbers there redirect here.
- **The library, the Typings, the harness and the lint plugin**: `phmilk/reforged-ts`, which also holds the wayfinder maps, the ADRs the Template follows (the Claim protocol is its ADR 0016) and the reusable `claim-check.yml` workflow that this repository's `claim.yml` calls.
- Refer to an issue in the other repo with its full form, `phmilk/reforged-ts#46`; a bare `#12` means this repo. Sub-issues and "blocked by" edges work across the two repos.

## Claim

A Claim marks an issue as taken by one login: it is held while that login is among the issue's assignees. It binds every Collaborator (a person with push access to this repository or the library's) and every Agent a Collaborator runs: an Agent writes as the Collaborator's login, so its Claim is the Collaborator's. The assignee is the source; the board (below) is a view of it.

- **First write.** Before working on an issue, assign yourself: `gh issue edit <n> --add-assignee @me`, before the branch, the first commit, any comment and the pull request. Read the issue back: if it now has two assignees, the later one withdraws (`--remove-assignee @me`) and says so in a comment.
- **Claimable.** An open issue with no assignee that is `ready-for-agent` or `ready-for-human`, a ticket of a wayfinder map on its frontier (no open blocker), or a `ready-for-agent` spec (claimed whole, with its tickets: below). Not claimable: `needs-triage` and `needs-info` (triaged, not claimed) and a map. Triage and splitting are not claimed: their writes are the brief, the labels and the new issues; whoever implements claims. A bug you find and fix at once: open the issue and claim it in one gesture.
- **One login per issue.** An issue assigned to another login is theirs: do not add yourself, do not post a brief on it, do not open a pull request that closes it. A second assignee is added only by the first, for pairing; any other two assignees are a conflict to resolve, not work in pair.
- **One Claim at a time**: an issue, or a spec with its tickets. A Claim means working now, not a reservation: say what you will take next in a comment, and let the native blocked-by order the tickets. A spec with an assignee is being worked whole by that login, in one branch and one pull request (`implement-spec`); a spec with no assignee is worked ticket by ticket. Claiming a spec is one command over the spec and each of its tickets that has no assignee, `gh issue edit <spec> <ticket>... --add-assignee @me`, never inferred from the parent; a ticket already assigned to another login stays theirs. Whoever will split and implement a spec claims it before `to-tickets`, then the tickets the split created; a split made ahead by a login that will not implement is not claimed. Releasing a spec is the reverse: remove yourself from the spec and its tickets, with a comment.
- **Created without an assignee.** An issue created by `to-spec`, `to-tickets`, triage or an issue form has no assignee; whoever starts it claims it then.
- **A pull request names what it delivers**, and the spec only when it delivers the spec's last open ticket; otherwise the spec stays open and claimed until its last ticket closes, and its assignee closes it. A ticket of a claimed spec that the pull request does not deliver stays claimed by the same login until done, or is released.
- **Stale.** A Claim is stale after 3 days without a commit on its pull request and without a comment on the issue or the pull request: a draft opened before any work keeps nothing alive. Any Collaborator may take it over: comment first (what and why), then `gh issue edit <n> --remove-assignee <login> --add-assignee @me`; the abandoned branch and draft are yours to reuse or drop. The maintainer may reassign at any time.
- **Release.** Leaving an issue you will not finish: comment, then `gh issue edit <n> --remove-assignee @me`.
- **Stopping.** Leaving a claimed issue open (a question for a human, red CI, a check only a human can make): comment what is pending and where the branch and the pull request stand. The comment keeps the Claim fresh and tells the next session what to resume.
- **The check.** The `claim` workflow (the check `claim / check`) runs on every pull request when it is opened, edited and pushed, drafts included, and reads the issues of this repository it closes: an unclaimed one is assigned to the author, with a reminder that the Claim comes first; one claimed by another login fails the check, whose comment names the takeover path. On an assignment, a second assignee not added by the first or by the maintainer, and an open pull request by a login outside the assignees, draw a comment on the issue. The check never reverts anything; the ruleset requires it, so a red check blocks the merge. Bots and pull requests that close no issue are outside it.
- **The board.** [The board](https://github.com/users/phmilk/projects/5) over both repositories shows every open issue with a Status derived from GitHub state (Backlog, Ready, Blocked, In progress at an assignee, In review at an open non-draft pull request, Done), written by one reconcile in `phmilk/reforged-ts`; nobody moves a card by hand. Nothing in the protocol requires reading it: the assignee is the source.

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

Run `gh issue view <number> --comments`, and read its assignees: an assigned issue is taken, whatever its labels. Claim it before working on it (see "Claim").
