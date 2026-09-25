# Triage Labels

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

| Label    | Applied to                                                             |
| -------- | ---------------------------------------------------------------------- |
| `spec`   | A spec, created with the `to-spec` skill. Its tickets are sub-issues.  |
| `ticket` | A ticket of a spec, created with the `to-tickets` skill (a sub-issue). |

Both repos (`phmilk/reforged-ts` and `phmilk/reforged-ts-template`) have them. Issues of the wayfinder map, bugs and follow-ups carry neither.
