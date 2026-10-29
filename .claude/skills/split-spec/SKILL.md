---
name: split-spec
description: Split a Spec into Tickets and write its Coverage table. Use when explicitly asked to split a Spec, or when another skill asks for it.
metadata:
  upstream: to-tickets
  replaces: to-tickets
  upstream-hash: 5f871bdc46a9212222214ba399be4965374208af1bd7f48f1271bef72841dd31
---

# Split a Spec

A Skill variant of the Upstream skill `to-tickets`, with its steps, that replaces it (ADR 0027) and that an Agent may invoke ([Skill variants](https://github.com/phmilk/reforged-ts/blob/master/docs/agents/development-loop.md#skill-variants)). It breaks a Spec into **Tickets**, tracer-bullet vertical slices each declaring the Tickets that **block** it, and loses no item of the Spec on the way: every item gets a row in the Spec's **Coverage table**. It runs on an explicit request to split a Spec or on another skill's call; whoever invoked it, its quiz asks the human.

Two paths run through the same steps:

- **A Spec not split** (`needs-split`, no sub-issue): every Ticket is new.
- **A Spec already split** (it has sub-issues, and no Coverage table): its Tickets stay as they are; the table maps the items onto them, and new Tickets are proposed only for the items no existing Ticket carries.

The vocabulary is the glossary's, under "Domain docs" in [`AGENTS.md`](../../../AGENTS.md#domain-docs). The tracker is [`docs/agents/issue-tracker.md`](../../../docs/agents/issue-tracker.md); the library's [A Spec's coverage](https://github.com/phmilk/reforged-ts/blob/master/docs/agents/issue-tracker.md#a-specs-coverage) holds the coverage rule and the Coverage table's format, the one source of both, for a Spec of either repository. The labels are [`docs/agents/triage-labels.md`](../../../docs/agents/triage-labels.md)'s. `gh` acts on the repository of the clone it runs in: give `-R <owner>/<repo>` to a command on an issue of the other Board repository. A split takes no Claim: the Tickets are created with no assignee ([Claim](../../../docs/agents/issue-tracker.md#claim)).

## Steps

1. **Gather context.** Read the Spec, `gh issue view <spec> --comments`, and its sub-issues, `gh api repos/<owner>/<repo>/issues/<spec>/sub_issues --paginate`, each one's body read in full: a sub-issue can live in either Board repository. Done when you hold the Spec's body and, on a Spec already split, every Ticket's acceptance criteria word for word.
2. **Explore the codebase.** Read the code, the glossary and the ADRs where the Spec touches them, unless the conversation already did. Look for prefactoring that makes the implementation easier: "Make the change easy, then make the easy change." Done when every Ticket title and description can speak the glossary's terms and respect the ADRs of its area.
3. **Draft the vertical slices.** On a Spec already split, draft only the Tickets for items step 4 leaves without a row, and come back here from it. Give each Ticket its **blocking edges**: the Tickets, new or existing, that must complete before it can start.

   <vertical-slice-rules>
   - Each slice cuts a narrow but COMPLETE path through every layer (schema, API, UI, tests): vertical, NOT a horizontal slice of one layer
   - A completed slice is demoable or verifiable on its own
   - Each slice is sized to fit in a single fresh context window
   - Any prefactoring should be done first

   </vertical-slice-rules>

   **Wide refactors are the exception to vertical slicing.** A **wide refactor** is one mechanical change (rename a column, retype a shared symbol) whose **blast radius** fans across the whole codebase, so no vertical slice can land green. Sequence it as **expand–contract**: expand (add the new form beside the old); migrate the call sites in batches sized by blast radius, each batch a Ticket blocked by the expand; contract (delete the old form) in a Ticket blocked by every batch. When even the batches cannot stay green alone, they share an integration branch that all block a final integrate-and-verify Ticket.

   Done when each drafted Ticket has its title, its blockers, what it delivers and its acceptance criteria.

4. **Map the coverage.** List the Spec's items and give each one a row, a Ticket and the criterion that proves it, by the coverage rule; where no criterion carries an item whole, write one into a drafted Ticket, or draft a Ticket for it (step 3). Done when every item has a row or stands on the list of items without a row, and each row's criterion carries its item at full strength.
5. **Quiz the human.** Ask the human directly, also when an Agent or another skill invoked you; their answers are the only approval. Show:
   - the Tickets as a numbered list, each with its **Title**, **Blocked by** and **What it delivers**, an existing Ticket marked with its number;
   - the Coverage table, in the doc's format, a drafted Ticket named by its list number;
   - every item left without a row, by name, or "none".

   Ask:
   - Does the granularity feel right? (too coarse / too fine)
   - Are the blocking edges correct: does each Ticket depend only on Tickets that genuinely gate it?
   - Should any Tickets be merged or split further?
   - Does the table meet each part of the coverage rule: every item with its row, both outcomes of each "check whether…", and where each consequence sits?

   Iterate through steps 3 and 4 until the human approves. Done when the human approves the Tickets and the table, with no item left without a row.

6. **Publish the Tickets.** Create each new Ticket in dependency order, blockers first, with the template below and `gh issue create`, its body from a heredoc, in the repository whose code it changes. Give it the labels `ready-for-agent` and `ticket` ([Kind labels](../../../docs/agents/triage-labels.md#kind-labels)), make it a sub-issue of the Spec (`gh api --method POST repos/<owner>/<repo>/issues/<spec>/sub_issues -F sub_issue_id=<database id>`), and add its blocking edges as native dependencies ("Blocking" under the library's [Wayfinding operations](https://github.com/phmilk/reforged-ts/blob/master/docs/agents/issue-tracker.md#wayfinding-operations)). Done when every approved Ticket exists with both labels, no assignee, its Spec as parent and its blockers linked; report each number and link.
7. **Write the Coverage table.** Fill the approved table with the published Tickets, each criterion quoted from its Ticket as published, and write it into the Spec's body in the doc's format, under a line naming the date and the Tickets of the split. Save the body (`gh issue view <spec> --json body --jq .body`), add the section, and write it back with `gh issue edit <spec> --body-file <file>`. Done when the Spec's body read back is the saved body plus the section, byte for byte, and the coverage check lists no item without a row and no row whose Ticket is not a sub-issue. Run the coverage check from a clone of the library, whichever repository holds the Spec, with the command "Closing a Spec" gives under the library's [Claim](https://github.com/phmilk/reforged-ts/blob/master/docs/agents/issue-tracker.md#claim).
8. **Swap the labels.** When the Spec carries `needs-split`, swap it: `gh issue edit <spec> --remove-label needs-split --add-label ready-for-agent`; a Spec with another triage label keeps that one and only loses `needs-split` ([State labels](https://github.com/phmilk/reforged-ts/blob/master/docs/agents/triage-labels.md#state-labels), ADR 0025). The board derives the same pair from the Spec's sub-issues, so its next reconcile leaves it as is. Done when `gh issue view <spec> --json labels` shows `ready-for-agent`, or the Spec's other triage label, and no `needs-split`.

The Spec stays open, with its assignees, its other labels and the rest of its body as they were: the table and the label swap are the only writes to it.

<issue-template>

## Parent

#<spec>, the sections and items of the Spec this Ticket carries; `phmilk/reforged-ts#<spec>` from a Ticket in the Template.

## What to build

The end-to-end behaviour this Ticket makes work, from the user's perspective, not layer-by-layer implementation.

## Acceptance criteria

- [ ] Criterion 1
- [ ] Criterion 2

</issue-template>

Avoid specific file paths or code snippets in a Ticket: they go stale fast. Exception: if a prototype produced a snippet that encodes a decision more precisely than prose can (state machine, reducer, schema, type shape), inline it and note briefly that it came from a prototype, trimmed to the decision-rich parts.

## Done

The split is done when the human approved it, every approved Ticket is published as step 6 says, the Spec's body carries its Coverage table with a row for every item, and the Spec has lost `needs-split`.
