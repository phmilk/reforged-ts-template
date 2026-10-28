---
name: next-step
description: Print the next steps after an implement, at most five numbered lines from the real state of the issue, its Spec and its pull request. Use at the end of every implement, or when explicitly asked for the next steps.
metadata:
  upstream: ask-matt
  upstream-hash: d1c5b4151720e96135154bd593ac4986a1030a2bc81e2aaf129f8b11224af9a9
---

# Next steps

A Skill variant of the Upstream skill `ask-matt`, with the steps of its main flow from where an implement ends, that an Agent may invoke ([Skill variants](https://github.com/phmilk/reforged-ts/blob/master/docs/agents/development-loop.md#skill-variants)). It runs at the end of every `/implement` and `/implement-spec`, as the skill-target check reminds the Agent when it lets one through, and whenever the Collaborator asks what comes next. It answers with the next steps only. Where the work stands is read from GitHub and the clone; the session supplies only what they cannot show, whether `/code-review` ran on the branch's last commits.

The vocabulary is the glossary's, under "Domain docs" in [`AGENTS.md`](../../../AGENTS.md#domain-docs). The protocol is the [Claim section](https://github.com/phmilk/reforged-ts/blob/master/docs/agents/issue-tracker.md#claim) of the library's tracker doc. `gh` acts on the repository of the clone it runs in: give `-R <owner>/<repo>` for an issue of the other Board repository. The commands `pnpm spec:frontier` and `pnpm spec:check` run from a clone of the library, followed by `phmilk/reforged-ts-template` for a Spec of the Template.

## Steps

1. **Read the state.** The issue just worked, or the one the Collaborator names: `gh issue view <n> --json number,state,title,labels`. Its parent, `gh api repos/<owner>/<repo>/issues/<n>/parent` (a 404: no parent), and when the parent is labelled `spec`, that Spec's Frontier: `pnpm spec:frontier <spec>`. The branch, `git branch --show-current`, and its pull request: `gh pr view --json number,state,autoMergeRequest`. Whether `/code-review` ran on the branch's last commits: its two reports in this session, since it posts nothing to GitHub. Done when each of these is read, or known to be absent.
2. **Choose the steps.** `ask-matt`'s main flow, from where an implement ends: the code closes out with `/code-review`, the work goes up as a pull request shaped by `/pr`, and the next Ticket starts after `/clear`; when a Spec's Tickets are all delivered, its close follows. Keep the steps not yet done, in this order:
   - `/code-review <fixed point>`, when the branch's commits since its base have not been reviewed;
   - `/pr, then gh pr merge --auto --squash`, one step, when the branch has no pull request: the pull request merges once the required checks pass ([ADR 0021](https://github.com/phmilk/reforged-ts/blob/master/docs/adr/0021-an-agent-merges-its-own-pull-request-behind-the-required-checks-and-a-code-review.md)); `gh pr merge --auto --squash` alone, when it exists without auto-merge;
   - `/clear`, once the pull request is open;
   - `/implement <n>`, for the first Ticket of the Frontier you may take, other than the one just worked;
   - when the Spec has no open Ticket left once this pull request merges: `pnpm spec:check <spec>`, then, on green, `gh issue close <spec> --comment "..."` ([Closing a Spec](https://github.com/phmilk/reforged-ts/blob/master/docs/agents/issue-tracker.md#claim), ADR 0023).

   An issue outside a Spec stops after `/clear`. Done when the list holds at most five steps, the first one runnable now.

3. **Print them.** At most five numbered lines and nothing else, in the conversation's language, each one naming the skill or command to run with its argument:

   ```text
   1. /code-review origin/master
   2. /pr, then gh pr merge --auto --squash
   3. /clear
   4. /implement 744
   ```

   Done when the list is printed.

## Done

The steps are printed when each comes from the state read in step 1, none is already done, and the list is at most five numbered lines with nothing around them.
