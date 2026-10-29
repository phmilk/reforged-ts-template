---
name: ship
description: Push an implement's branch and open its pull request, with a Review section and auto-merge unless a human is needed. Use at the end of every implement, or when explicitly asked to ship a branch.
---

# Ship a branch

An Agent skill both Board repositories share, which invokes `/code-review` and `/pr` by name and copies no steps of theirs ([ADR 0026](https://github.com/phmilk/reforged-ts/blob/master/docs/adr/0026-an-implement-ends-with-its-pull-request-opened-by-ship.md)). It takes the branch `/implement` or `/implement-spec` leaves, or any branch the Collaborator asks to ship, and carries it to a pull request that merges once the required checks pass ([ADR 0021](https://github.com/phmilk/reforged-ts/blob/master/docs/adr/0021-an-agent-merges-its-own-pull-request-behind-the-required-checks-and-a-code-review.md)). The repository's rules are the Collaborator's standing request to push and open the pull request; when the Collaborator said otherwise in this session, stop before the push and say what is ready.

The vocabulary is the glossary's, under "Domain docs" in [`AGENTS.md`](../../../AGENTS.md#domain-docs) (Judgement call, Open decision), and `/pr`'s for the Merge Danger and its Door. The protocol is the [Claim section](https://github.com/phmilk/reforged-ts/blob/master/docs/agents/issue-tracker.md#claim) of the library's tracker doc. `<default>` below is the repository's default branch, `gh repo view --json defaultBranchRef --jq .defaultBranchRef.name` (`master` in the library, `main` in the Template), and `<n>` the issue the work closes.

## Steps

1. **Review.** Before anything else, `git fetch origin <default>`, then look in this session for a `/code-review` report whose diff ends at the branch's last commit (`git rev-parse HEAD`). With none, run `/code-review origin/<default>` now. Fix what it finds, then run one more round on the fix commits alone, its fixed point the last commit before them, and fix what that one finds: no third round ([Subagents](https://github.com/phmilk/reforged-ts/blob/master/docs/agents/development-loop.md#subagents), "Fixes, and one more round"). A finding left unfixed for a reason is a Judgement call, and one that is not the Agent's to settle is an Open decision. Write down each round as you go: its fixed point and its fix commits' short hashes. A commit made after the last round only to turn `pnpm check` green or add the changeset (step 3), or to merge `origin/<default>` (step 6), needs no round of its own. Done when every commit of the work is covered by a round and every finding is fixed or written down as a Judgement call or an Open decision.
2. **Leave the default branch.** When `git branch --show-current` prints `<default>`, move the commits to a new branch and put `<default>` back where the remote has it:

   ```sh
   git switch -c <type>/<n>-<slug>
   git branch -f <default> origin/<default>
   ```

   `<type>` is the Conventional Commits type of the work (`feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `ci`, `chore`), `<slug>` a few kebab-case words of the issue's title. Done when the current branch is not `<default>`, holds every commit of the work, and `git rev-parse <default> origin/<default>` prints one hash twice; when `git branch -f` refuses because another worktree has `<default>` checked out, leave it and say so in the report. `<default>` is never pushed.

3. **Check.** Run `pnpm check`. When it is red, make one fix, commit it and run it again. Still red: open nothing, and leave the "Stopping" comment of the [Claim](https://github.com/phmilk/reforged-ts/blob/master/docs/agents/issue-tracker.md#claim) on the issue (`gh issue comment <n> --body-file <file>`): what fails, the branch, and that it is not pushed. Then stop. When the repository has a `.changeset/` folder and the branch adds no changeset, add one before the push ([`docs/release.md`](https://github.com/phmilk/reforged-ts/blob/master/docs/release.md), "Adding a changeset"): the empty one, `pnpm changeset add --empty`, when nothing published changes. Done when `pnpm check` is green on the last commit and the changeset is committed where the repository takes one.
4. **Decide auto-merge.** Auto-merge stays off when any of these holds, and each one that holds is a reason the body gives:
   - something waits for a human: the issue asks for a screen check, multiplayer, or a Probe run on a machine without the game ([`probe/README.md`](https://github.com/phmilk/reforged-ts/blob/master/probe/README.md#what-stays-for-a-human));
   - an Open decision is written down;
   - the Door you give in the body's Merge Danger is one-way.

   A Judgement call never holds the merge. Done when auto-merge is on or off, with its reasons when off.

5. **Write the body.** Write it with `/pr`, then append, in this order:

   ```markdown
   Closes #<n>

   ## Review

   - Round 1: `/code-review <fixed point>`; fix commits <hashes, or none>.
   - Round 2: `/code-review <fixed point>`; fix commits <hashes, or none>.

   ### Judgement calls

   - <the choice>: <its reason>.

   ### Open decisions

   - <the choice, and the options a human picks from>.

   ### Waits for a human

   - <what waits, and so why auto-merge is off>.
   ```

   `Closes` names every issue the pull request closes; after `/implement-spec`, each Ticket, never the Spec. "Judgement calls" says "None." when there is none; "Open decisions" appears only when there is one, and "Waits for a human" only when auto-merge is off, with each reason of step 4. Done when every round of step 1 has its line and every reason of step 4 is in the body.

6. **Open.** Push the branch, `git push -u origin HEAD`. After `/implement-spec`, its draft exists: replace its body and mark it ready, `gh pr edit <pr> --body-file <file>` then `gh pr ready <pr>`. Otherwise open it, `gh pr create --base <default> --title "<type>(<scope>): <what it does> (#<n>)" --body-file <file>`, `<scope>` the area the work touches as recent titles name it (`git log --oneline -10`); `<pr>` is the number in the URL it prints, or the draft's, `gh pr view --json number --jq .number`. Read `gh pr view <pr> --json mergeStateStatus --jq .mergeStateStatus`, up to three times a few seconds apart while it prints `UNKNOWN`. When it prints `DIRTY`, fetch and merge `origin/<default>` into the branch, run step 3 again and push. Done when the pull request is open, not a draft, and not `DIRTY`.
7. **Turn on auto-merge.** When step 4 left it on: `gh pr merge <pr> --auto --squash`. The merge goes through auto-merge alone: never `--admin`, never the API's merge endpoint (ADR 0021). Done when `gh pr view <pr> --json autoMergeRequest --jq .autoMergeRequest.mergeMethod` prints `SQUASH`, or step 4 turned it off and the body says why.

## Done

The branch is shipped when it is off the default branch, reviewed, green and with its changeset where the repository takes one, its pull request is open and ready with a body from `/pr` and a filled `## Review` section, and auto-merge is on or the body says why it is off. Or, with `pnpm check` red after one fix, nothing is open and the issue carries the "Stopping" comment.
