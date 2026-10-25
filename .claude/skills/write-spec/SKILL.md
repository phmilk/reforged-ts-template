---
name: write-spec
description: Write a Spec from the conversation and publish it as an issue. Use when explicitly asked to write a Spec, or when another skill asks for one.
metadata:
  upstream: to-spec
  upstream-hash: 3fa1a0695d4ea242fae9e569e4d22aa1788623197abb33bfadafae7315789bbf
---

# Write a Spec

A Skill variant of the Upstream skill `to-spec`, with its steps, that an Agent may invoke ([Skill variants](../../../docs/agents/development-loop.md#skill-variants)). It turns what the conversation and the codebase already hold into a Spec: synthesis, no interview. It runs on an explicit request for a Spec or on another skill's call for one; when neither asked, ask the user whether they want a Spec before writing one.

The Spec speaks the glossary's vocabulary and respects the ADRs, both named under "Domain docs" in [`AGENTS.md`](../../../AGENTS.md#domain-docs). It goes to the tracker of [`docs/agents/issue-tracker.md`](../../../docs/agents/issue-tracker.md), with the labels of [`docs/agents/triage-labels.md`](../../../docs/agents/triage-labels.md), and with no assignee: whoever works it claims it then ([Claim](../../../docs/agents/issue-tracker.md#claim)).

## Steps

1. **Explore.** Read the repository where the Spec touches it, unless the conversation already did: the code, the glossary and the ADRs of that area. Done when every term the Spec will use is the glossary's or one the Spec defines, and you can name each ADR the Spec must respect.
2. **Sketch the seams.** Name the seams at which the change will be tested. Prefer existing seams to new ones and the highest seam possible; propose a new seam at the highest point you can. The fewer seams across the codebase, the better: the ideal number is one. Check with the user that these seams match their expectations. Done when the user has agreed to the seams.
3. **Write and publish.** Write the Spec with the template below, then create the issue with `gh issue create`, its body from a heredoc. Apply the labels a new Spec takes: `ready-for-agent`, its triage label, with no further triage, and `spec`, its kind label ([Kind labels](../../../docs/agents/triage-labels.md#kind-labels)). Done when the issue exists with both labels and no assignee; report its number and link.

<spec-template>

## Problem Statement

The problem that the user is facing, from the user's perspective.

## Solution

The solution to the problem, from the user's perspective.

## User Stories

A LONG, numbered list of user stories. Each user story should be in the format of:

1. As an <actor>, I want a <feature>, so that <benefit>

<user-story-example>
1. As a mobile bank customer, I want to see balance on my accounts, so that I can make better informed decisions about my spending
</user-story-example>

This list of user stories should be extremely extensive and cover all aspects of the feature.

## Implementation Decisions

A list of implementation decisions that were made. This can include:

- The modules that will be built/modified
- The interfaces of those modules that will be modified
- Technical clarifications from the developer
- Architectural decisions
- Schema changes
- API contracts
- Specific interactions

Do NOT include specific file paths or code snippets. They may end up being outdated very quickly.

Exception: if a prototype produced a snippet that encodes a decision more precisely than prose can (state machine, reducer, schema, type shape), inline it within the relevant decision and note briefly that it came from a prototype. Trim to the decision-rich parts, not a working demo, just the important bits.

## Testing Decisions

A list of testing decisions that were made. Include:

- A description of what makes a good test (only test external behavior, not implementation details)
- Which modules will be tested
- Prior art for the tests (i.e. similar types of tests in the codebase)

## Out of Scope

A description of the things that are out of scope for this spec.

## Further Notes

Any further notes about the feature.

</spec-template>

## Done

The Spec is written when it uses only the glossary's terms and its own, respects the ADRs of its area, names the seams the user agreed to, and is published as step 3 says.
