---
name: ship-spec
description: Run a split Spec from its Frontier to its close, each Ticket claimed, implemented in its own worktree and shipped with auto-merge. Use when explicitly asked to ship a Spec.
---

# Ship a Spec

An Agent skill both Board repositories share, which invokes `/tdd`, `/code-review`, `/diagnosing-bugs` and `/ship` by name, copies no steps of an Upstream skill and records no `upstream`, so it is not a Skill variant ([Skill variants](https://github.com/phmilk/reforged-ts/blob/master/docs/agents/development-loop.md#skill-variants)). `/ship-spec <spec>` takes a split Spec of the library and runs it to its close: it claims each Ticket of the Frontier the login may take as its work starts, has an implementer Subagent work it in its own worktree and ship it, starts what each merge unblocked, and closes the Spec on a green coverage check. Each pull request merges by auto-merge behind the required checks, after `/code-review` and its fixes ([ADR 0021](https://github.com/phmilk/reforged-ts/blob/master/docs/adr/0021-an-agent-merges-its-own-pull-request-behind-the-required-checks-and-a-code-review.md)). `implement`, `implement-spec` and `to-tickets` (which `split-spec` replaces) are human-only, so for what it takes from them it holds steps of its own, below.

The vocabulary is the glossary's, under "Domain docs" in [`AGENTS.md`](../../../AGENTS.md#domain-docs) (Spec, Ticket, Frontier, Claim, Coverage table, Subagent). The protocol is the [Claim section](https://github.com/phmilk/reforged-ts/blob/master/docs/agents/issue-tracker.md#claim) of the library's tracker doc, the Subagent rules are the development loop doc's [Subagents](https://github.com/phmilk/reforged-ts/blob/master/docs/agents/development-loop.md#subagents), and both bind every step below. Run it from a clone of the library: `pnpm spec:frontier` and `pnpm spec:check` live there. A Ticket of the Template is worked in a checkout of the Template beside that clone, as [`template-tickets.md`](template-tickets.md) says; read it before the first Template Ticket of a run.

## Pointers only

Your own context holds pointers: the Spec's number, its Tickets' numbers, each one's worktree, branch, implementer Subagent id and pull request, and the run's ledger (below). The Spec's body and a Ticket's criteria are read by whoever works on them, never carried here. Each implementer starts from its Ticket, with the prompt of [`implementer.md`](implementer.md).

The **ledger** is the end comment in the making: one line per merged pull request, per stop with its reason, and the coverage verdict. Add to it as each event happens.

## Steps

1. **Check the Spec.** Read `gh issue view <spec> --json state,labels,body` and its sub-issues, `gh api repos/phmilk/reforged-ts/issues/<spec>/sub_issues --paginate`. The Spec is labelled `spec`, open, has at least one sub-issue, and its body has a `## Coverage table` section. When any of these fails, stop and say so: the issue is not a split Spec, and its split is `/split-spec <spec>`, a human's decision with its quiz. Never split it yourself. Done when the four hold, or you stopped naming `/split-spec <spec>`.
2. **Clear a stale lock.** Remove the check lock only when it is stale ([The check lock](#the-check-lock)): a live one is another run's, on another Spec, and stays. Done when no stale lock is left.
3. **Read the Frontier.** `pnpm spec:frontier <spec>`. It prints three lists for the `gh` login: takeable now, held by the login (each with its open pull requests), and held by other logins (with their assignees). Read the Frontier only through it, so that this skill, the skill-target check and `next-step` agree. Done when you hold the three lists.
4. **Resume what the login holds.** For each held Ticket:
   - **With an open pull request:** carry it on from that pull request, never restarting it: watch it as step 7 does. When auto-merge is off and its body says what waits for a human, it is a stop already made: put it in the ledger.
   - **Without one:** read the Ticket's last "Stopping" comment and what came after it. When a human answered what was pending, start it as step 5 does, from its branch when one exists (`git branch --list '*/<ticket>-*'`, in the Template's checkout for a Template Ticket) rather than from the default branch. A Template Ticket stopped for a library version resumes as [Resuming it](template-tickets.md#a-library-version-not-yet-published) says. Otherwise its stop stands: put it in the ledger.

   Done when each held Ticket is in flight or in the ledger.

5. **Start the takeable Tickets**, as many as [Three in flight](#three-in-flight) allows (in flight: from its Claim to its merge or its stop). Take them in the order the Frontier prints; a Probe Ticket waits while another Probe Ticket is in flight. A Ticket of the Template takes the differences of [`template-tickets.md`](template-tickets.md) at each sub-step. For each one:
   1. **Read it**, `gh issue view <ticket> --json title,body`, for the stops [Where a human is needed](#where-a-human-is-needed) names.
   2. **Claim it with its Spec, in one command**, as its work starts and never ahead: `gh issue edit <ticket> <spec> --add-assignee @me`. Read it back: a second login on the Ticket means it was taken meanwhile: withdraw (`gh issue edit <ticket> <spec> --remove-assignee @me`, the Spec only when you hold no other Ticket of it), comment why, and skip it.
   3. **A stop before the work:** a Ticket that needs a Probe run on a machine without the game, or a Template Ticket that needs a library version not yet published ([A library version not yet published](template-tickets.md#a-library-version-not-yet-published)), gets its "Stopping" comment now ([Stopping](#stopping)) and no worktree.
   4. **Make its worktree** from `origin/master` (a Template Ticket's, from the Template's `origin/main`: [Its worktree](template-tickets.md#its-worktree)), then check its base:

      ```sh
      git fetch origin master
      git worktree add .claude/worktrees/<ticket> -b <type>/<ticket>-<slug> origin/master
      git -C .claude/worktrees/<ticket> merge-base --is-ancestor origin/master HEAD
      ```

      `<type>` is the Conventional Commits type of the work, `<slug>` a few kebab-case words of the Ticket's title.

   5. **Spawn its implementer**, an unnamed Subagent with the prompt of [`implementer.md`](implementer.md), its placeholders filled. Keep its id.

   Done when no more may be in flight, or every takeable Ticket is in flight or in the ledger.

6. **Hear each implementer's report.** It ends one of two ways:
   - **Shipped:** its pull request is open, with auto-merge on. Watch it (step 7).
   - **Stopped:** it names why (an ambiguous criterion with its options, a red `pnpm check` after one fix, a conflict it could not resolve by intent, something only a human can check). Make the stop ([Stopping](#stopping)).

   Before relaying anything, check the real state: the worktree's commits, `gh pr view <pr> --json state,isDraft,autoMergeRequest`. Done when each report is matched to the state it claims.

7. **Watch each pull request** until it merges or stops, with a Monitor (or a background command with a bounded runtime) on `gh pr view <pr> --json state,mergeStateStatus,statusCheckRollup`, never a turn ended on a wait with nothing to wake you:
   - **Merged:** put it in the ledger, remove its worktree and branch (`git worktree remove .claude/worktrees/<ticket>`, `git branch -D <branch>`, through the Template's checkout for a Template Ticket), and go to step 3: the Tickets its merge unblocked start from the new default branch.
   - **`DIRTY`:** another merge conflicts with it. Continue its implementer by its id: merge `origin/master` (the Template's `origin/main` for a Template Ticket) into the branch, resolved by intent ([Merge conflicts](#merge-conflicts)), run the checks the merge touches, push.
   - **A required check red:** settle it as [A red CI](#a-red-ci) says: one rerun of a known flake, or one fix, then a stop.
   - **Auto-merge off,** its body naming what waits for a human: stop the Ticket.

   Done when the pull request is merged or its Ticket stopped.

8. **Loop.** After a stop, start no new Ticket: every other Ticket in flight runs to its own end (merged or stopped), then go to step 9. Otherwise, after each merge, step 3 again. When the Frontier lists no takeable Ticket, nothing is in flight, and Tickets remain open: those held by other logins, named with their assignees in the ledger, are the run's stop. Done when nothing is in flight and the Frontier holds nothing this run will start.
9. **Close, or leave the close.** Read the Spec's open sub-issues.
   - **No Ticket open:** run `pnpm spec:check <spec>`. On green (exit 0), close the Spec with the end comment, as the Claim section's "Closing a Spec" does: `gh issue close <spec> --comment "$(cat <file>)"`. On red (exit 1), leave the Spec open and post the end comment (`gh issue comment <spec> --body-file <file>`) with every gap the check printed: a gap goes back to a human and `/split-spec`, so create no Ticket.
   - **Any Ticket open** (held by another login, stopped, or not started after a stop): post the end comment on the Spec and leave it open; whoever merges the last Ticket closes it ([Closing a Spec](https://github.com/phmilk/reforged-ts/blob/master/docs/agents/issue-tracker.md#claim)).

   Then remove every worktree of the run that is left, and the check lock when it is stale. Done when the end comment is on the Spec and printed in the chat, word for word.

## The end comment

Written to a file, posted on the Spec as step 9 says, and printed in the chat, from the ledger:

```markdown
## ship-spec

### Merged

- #<pr>: #<ticket> <title>

### Left open

- #<ticket> <title>: @<assignee>, or no assignee

### Stops

- #<ticket>: <the reason>, <where its branch and pull request stand>

### Coverage

<`pnpm spec:check <spec>` green, and the Spec closed; or red, with each gap it printed; or not run, with the Tickets still open>
```

Each section says "None." when empty. A Template Ticket or pull request is written in full, `phmilk/reforged-ts-template#<n>`, since a bare `#<n>` on the Spec links into the library.

## Where a human is needed

The repository's rules name where a human is needed; there, the Ticket stops ([Stopping](#stopping)):

- **A Probe run** ([`probe/README.md`](https://github.com/phmilk/reforged-ts/blob/master/probe/README.md#what-stays-for-a-human)): a Ticket whose fact only the game can settle needs native Windows with the game installed. Without it, the Ticket stops before its work (step 5). With it, a Probe Ticket runs one at a time: no other Probe Ticket is in flight while one is, since the game runs one Probe run at once.
- **A screen check or multiplayer:** the implementer works the Ticket to its pull request, and `/ship` leaves auto-merge off with the check that waits for a human in its body; then the Ticket stops.
- **An ambiguous criterion:** a criterion the Ticket, the Spec, the docs and the ADRs leave open to more than one reading that is not a Judgement call. The implementer stops and reports the options; the Ticket stops with them as the question, and nothing is guessed.

## Stopping

A stop is per Ticket. It leaves the Claim protocol's "Stopping" comment on the Ticket, unless the implementer's report says it posted one (`/ship` does on a red `pnpm check`), with `gh issue comment <ticket> --body-file <file>`: what is pending (the question, the check, the red job), where the branch stands (its name, its last commit, pushed or not) and where the pull request stands (its number, auto-merge on or off, or none). Then remove its worktree (its branch stays, for the next run), and add the stop to the ledger. A run with a stop starts no new Ticket and ends at step 9 once the others in flight end. Run again, `/ship-spec <spec>` resumes from GitHub's state (step 4).

## A red CI

Only this run's pull requests are its business: those its implementers opened and those step 4 resumed. A red check on any other pull request, the release pull request (`changeset-release/master`) and the Template's sync pull request among them, is left alone, catalogued flake or not. The catalogue lists library jobs only, so a red check of a Template pull request goes to branch 2. On one of its own, read the red run (`gh pr checks <pr>` for its link) and take the first branch that holds:

1. **A known flake:** the failure matches the [known-flake catalogue](known-flakes.md), and the run is at its first attempt (`gh run view <run> --json attempt`). Rerun its failed jobs once, `gh run rerun <run> --failed`, and keep watching. A run past its first attempt has had its rerun: never a second.
2. **Caused by the code:** any other failure, a catalogued flake back after its rerun included, on a pull request with no fix for a red CI yet: among the branch's own commits, none carries the trailer (after `git fetch origin master <branch>`, `git log origin/master..origin/<branch> --grep "^Red-CI-run:"` prints nothing; for a Template Ticket, `main` for `master`, through the Template's checkout). The squash commits on the default branch carry the messages of every pull request merged before, so the whole history would read as fixed. Continue its implementer by its id, or, when step 4 resumed it, spawn a fix-only implementer as [`implementer.md`](implementer.md), "The fix-only prompt", says. Either way give it the failed check's name and its run's link: one `/diagnosing-bugs` pass, one fix pushed. Keep watching: the fix's run is read again from branch 1, so a catalogued flake on it still gets its one rerun.
3. **Still red after the fix:** any other red, on a pull request that has its fix: stop the Ticket ([Stopping](#stopping)), with the failed check's name and its run's link.

A red required check is never merged past: auto-merge waits for it.

## Merge conflicts

A conflict is resolved by intent, never by picking lines: read what each side meant, this branch's from its Ticket and its commits, the other side's from the merged pull request that brought it (`git log origin/master` on the conflicted files, then `gh pr view <pr>`), and write the resolution that keeps both intents. Then run the checks the merged files touch. When the two intents contradict, or you cannot tell what one side meant, abort (`git merge --abort`) and stop the Ticket with the conflicted files and the two pull requests in its "Stopping" comment.

## The check lock

The full `pnpm check` of every worktree, the Template's included, runs one at a time, under a lock the worktrees share: a folder in the library clone's common git folder, which `mkdir` creates atomically on every platform and no worktree tracks. Read its absolute path once, from the library's clone, and give it to each implementer: from a Template worktree, `git rev-parse` would name the Template's folder, a second lock. The implementer takes it before the first step of the check and releases it after the last, whatever the result; `/ship`'s check is held the same way:

```sh
lock="$(git rev-parse --path-format=absolute --git-common-dir)/ship-spec-check.lock"          # in the library's clone
until mkdir "$lock" 2>/dev/null; do sleep 15; done; echo "<spec> <ticket>" > "$lock/holder"   # take it
rm -rf "$lock"                                                                                # release it
```

A wait that reaches its ten-minute timeout is run again. Another run of `ship-spec`, on another Spec in the same clone, shares the lock, so a lock is **stale** only when one of these holds, and only then removed (`rm -rf "$lock"`):

- its holder names this run's Spec and a Ticket of it not in flight now (at step 2, none is): remove it when you remove that Ticket's worktree, or at step 2;
- its folder is older than the longest check: the `check` script's commands at ten minutes each, with a margin, two hours: `find "$lock" -maxdepth 0 -mmin +120` prints it. A lock with no holder file yet, between its `mkdir` and its `echo`, is judged by the folder's age alone.

## Three in flight

At most three Tickets are in flight, no setting changes it. On the machine this skill was measured on (16 threads), `object-sync.test.ts` alone takes 27 s, and more parallel worktrees starve the tests into timeouts. The CI timeouts of #658 were diagnosed as the Windows runner stalling for the whole machine, not as this repository's load, so the limit stays three.

## Done

The run is done when the Spec was refused with `/split-spec <spec>` named, or every Ticket it started is merged or stopped with its "Stopping" comment, no worktree of the run is left, and the end comment is on the Spec and in the chat: with the Spec closed on a green `pnpm spec:check <spec>`, or left open with its reason.
