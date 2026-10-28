# Triage Labels

_Template maintenance: this file serves the development of the Template itself. Delete it in a generated Map project (see the Template maintenance section of `AGENTS.md`)._

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

Edit the right-hand column to match whatever vocabulary you actually use.

## Kind labels

Two more labels say what an issue is, next to its triage label. Apply them when creating the issue.

| Label    | Applied to                                                                                                          |
| -------- | ------------------------------------------------------------------------------------------------------------------- |
| `spec`   | A spec, created with the `to-spec` or `write-spec` skill. Its tickets are sub-issues.                               |
| `ticket` | A ticket of a spec, created with the `split-spec` skill (a sub-issue), which splits a Spec with its Coverage table. |

Both repos (`phmilk/reforged-ts` and `phmilk/reforged-ts-template`) have them. Issues of the wayfinder map, bugs and follow-ups carry neither.

An issue carrying `wayfinder:*`, `ticket` or `spec` is not triaged: its body is its brief, and the map or the split gave it its labels. An assigned Ticket or issue is taken, whatever its labels, and a Spec carries the logins of its Tickets: see "Claim" in `docs/agents/issue-tracker.md`.

## State labels

One more label says where a Spec stands. It is not a triage role: the Claim board derives it, in both repos, whatever set it ([ADR 0025](https://github.com/phmilk/reforged-ts/blob/master/docs/adr/0025-only-a-split-specs-unblocked-tickets-are-worked.md)).

| Label         | Applied to                                                                                                                                                                                                                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `needs-split` | An open Spec with no Ticket yet (no sub-issue), in place of `ready-for-agent`, so the board shows it as Backlog: split it first, with `split-spec`, whose last step drops `needs-split`. Once it has a Ticket, the board removes `needs-split` and puts `ready-for-agent` back, within the hour. |

A Spec with another triage label (`ready-for-human`, `needs-triage`, `needs-info`, `wontfix`) keeps it and only gets or loses `needs-split`.
