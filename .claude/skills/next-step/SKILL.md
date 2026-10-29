---
name: next-step
description: Print the next steps of the main flow, at most five numbered lines from the real state of the work, its issue, its Spec and its pull request. Use at the end of every /grill-with-docs, /write-spec, /split-spec and implement, or when explicitly asked for the next steps.
metadata:
  upstream: ask-matt
  upstream-hash: d1c5b4151720e96135154bd593ac4986a1030a2bc81e2aaf129f8b11224af9a9
---

# Next steps

A Skill variant of the Upstream skill `ask-matt`, with the steps of its whole main flow in this repository's names, that an Agent may invoke ([Skill variants](https://github.com/phmilk/reforged-ts/blob/master/docs/agents/development-loop.md#skill-variants)). It runs at every hand-over of that flow: the end of `/grill-with-docs`, `/write-spec`, `/split-spec`, `/implement` and `/implement-spec`, as the skill-target check reminds the Agent when it lets one through, and whenever the Collaborator asks what comes next. It answers with the next steps only. Where the work stands is read from GitHub and the clone; the session supplies only what they cannot show, which skill just ended and whether `/code-review` ran on the branch's last commits.

The vocabulary is the glossary's, under "Domain docs" in [`AGENTS.md`](../../../AGENTS.md#domain-docs). The protocol is the [Claim section](https://github.com/phmilk/reforged-ts/blob/master/docs/agents/issue-tracker.md#claim) of the library's tracker doc. `gh` acts on the repository of the clone it runs in: give `-R <owner>/<repo>` for an issue of the other Board repository. The commands `pnpm spec:frontier` and `pnpm spec:check` run from a clone of the library, followed by `phmilk/reforged-ts-template` for a Spec of the Template.

## Steps

1. **Read the state.** First the skill that just ended in this session: `/grill-with-docs`, `/write-spec`, `/split-spec`, or an implement (`/implement`, `/implement-spec`, or a project skill that replaces `/implement`); with none, an implement when the branch has commits ahead of its base, else the Collaborator's question. Then what that hand-over needs:
   - **After `/grill-with-docs`:** nothing more; there is no issue yet.
   - **After `/write-spec`:** the Spec it published.
   - **After `/split-spec`:** the Spec it split and its Frontier, `pnpm spec:frontier <spec>`.
   - **After an implement:** the issue just worked, or the one the Collaborator names: `gh issue view <n> --json number,state,title,labels,body`, its body for the criteria still unchecked and the "check whether…" without their `Outcome:` line. Its parent, `gh api repos/<owner>/<repo>/issues/<n>/parent` (a 404: no parent), and when the parent is labelled `spec`, that Spec's Frontier: `pnpm spec:frontier <spec>`. The branch, `git branch --show-current`, and its pull request: `gh pr view --json number,state,autoMergeRequest`. Whether `/code-review` ran on the branch's last commits: its two reports in this session, since it posts nothing to GitHub.

   Done when the hand-over is known and each of its reads is done, or known to be absent.

2. **Choose the steps.** `ask-matt`'s main flow, in this repository's names, from the hand-over just reached:
   - **After `/grill-with-docs`:** `/write-spec`, which turns the session into a Spec. Done there: one step.
   - **After `/write-spec`:** `/split-spec <spec>`, which splits it into Tickets with its Coverage table. Done there: one step.
   - **After `/split-spec`:** the Claim of the Frontier's first Ticket you may take, with its Spec, `gh issue edit <ticket> --add-assignee @me` then `gh issue edit <spec> --add-assignee @me` ([Claim](https://github.com/phmilk/reforged-ts/blob/master/docs/agents/issue-tracker.md#claim)), then `/clear` and `/implement <ticket>`. With no Ticket you may take, name the one that unblocks the Frontier instead.
   - **After an implement:** the steps below.

   From where an implement ends, the code closes out with `/code-review`, the work goes up as a pull request opened by `/ship`, and the next Ticket starts after `/clear`; when a Spec's Tickets are all delivered, its close follows. Keep the steps not yet done, in this order:
   - `/code-review <fixed point>`, when the branch's commits since its base have not been reviewed;
   - `gh issue edit <n> --body-file <file>`, when the reviewed Ticket's body still has an unchecked criterion or a "check whether…" without its `Outcome:` line: check each one the review confirmed, and write each outcome. `pnpm spec:check` counts them at the Spec's close ([A Spec's coverage](https://github.com/phmilk/reforged-ts/blob/master/docs/agents/issue-tracker.md#a-specs-coverage));
   - `/ship`, when the branch has no pull request, or a draft: it opens it with its `## Review` section and turns on auto-merge unless a human is needed, so the pull request merges once the required checks pass ([ADR 0026](https://github.com/phmilk/reforged-ts/blob/master/docs/adr/0026-an-implement-ends-with-its-pull-request-opened-by-ship.md), [ADR 0021](https://github.com/phmilk/reforged-ts/blob/master/docs/adr/0021-an-agent-merges-its-own-pull-request-behind-the-required-checks-and-a-code-review.md)); `gh pr merge --auto --squash` alone, when it is open without auto-merge and its body names nothing that waits for a human;
   - `/clear`, once the pull request is open;
   - `/implement <n>`, for the first Ticket of the Frontier you may take, other than the one just worked;
   - when the Spec has no open Ticket left once this pull request merges: `pnpm spec:check <spec>`, then, on green, `gh issue close <spec> --comment "..."` ([Closing a Spec](https://github.com/phmilk/reforged-ts/blob/master/docs/agents/issue-tracker.md#claim), ADR 0023). The board comments the same verdict on the Spec once its Tickets are all closed, as a reminder: it closes nothing, so the close is still this step.

   An issue outside a Spec stops after `/clear`. Done when the list holds at most five steps, the first one runnable now.

3. **Print them.** In the conversation's language, one heading line, `Next step:` for one step and `Next steps:` for several (`Próximo passo:` or `Próximos passos:` in Portuguese), then at most five numbered lines and nothing else, each one naming the skill or command to run with its argument:

   ```text
   Next steps:
   1. /code-review origin/master
   2. /ship
   3. /clear
   4. /implement 744
   ```

   Done when the list is printed.

## Done

The steps are printed when each comes from the state read in step 1, none is already done, and the list is the heading line and at most five numbered lines, with nothing else around them.
