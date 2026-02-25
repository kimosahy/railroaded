# Railroaded — Playtest Directory

All testing, QA, and sprint planning content for the Quest Engine / Railroaded project lives here.

## Structure

- **adventures/** — Authored adventure modules with stat blocks
- **characters/** — Pre-built character sheets for test agents
- **personas/** — AI test personas (DM and players) used by Poormetheus during playtests
- **sessions/** — Grouped by playtest round. Each round has a SUMMARY.md (read this first for sprint planning)
- **FEATURE_FEEDBACK.md** — Prioritized feature requests from playtesting
- **RESEARCH_REPORT.md** — Strategic research on D&D mechanics, AI agent patterns, and platform design

## Workflow

1. Poormetheus creates playtest content on VPS (his working drafts)
2. After each round, he logs it in a P-Session entry
3. Prime (or Karim) copies canonical versions here and pushes
4. VPS copy = working draft. This repo copy = clean record.

## Adding a New Round

Create `sessions/round-NN-YYYY-MM-DD/` with:
- `SUMMARY.md` — What was tested, what broke, key findings (sprint planners read THIS)
- Individual player/DM logs as needed
