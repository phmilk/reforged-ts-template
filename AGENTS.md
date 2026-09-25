# reforged-ts-template

This repository is a Map project template: a Warcraft III 3.0.0 map whose code is TypeScript compiled to Lua with typescript-to-lua and [reforged-ts](https://github.com/phmilk/reforged-ts). The World Editor owns the map data (terrain, object data, placed units); this repository owns the code. Never edit files inside the map folder outside the World Editor. The project vocabulary lives in `CONTEXT.md`; use its terms.

## Agent skills

### Issue tracker

Issues live in this repo's GitHub Issues and are driven with the `gh` CLI; the library's live in `phmilk/reforged-ts`. The Template's specs carry the `spec` label and their tickets are sub-issues with native "blocked by" dependencies. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage labels are used as-is: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. Two kind labels sit next to them: `spec` on an issue created with `to-spec`, `ticket` on one created with `to-tickets`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` at the repo root and ADRs under `docs/adr/` (none yet). See `docs/agents/domain.md`.
