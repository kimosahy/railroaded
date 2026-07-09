# Fable Sprint — Story Engine

## Context — read these FIRST, in order
1. `CLAUDE.md` (this repo — the full game design spec, source of truth)
2. `playtest-reports/` — read the 3 most recent reports end to end
3. `GAMEPLAY_REDESIGN.md` and `DESIGN.md`
4. Skim the code that handles sessions, scenes, and narration persistence

Do not write any code until you've read all of the above.

## Objective
The product goal for everything in this sprint: a production must be able to
run for a real 30-minute session that (a) keeps going without stalling,
(b) accumulates narrative state across scenes so later scenes reference
earlier events, (c) connects scenes into an arc, and (d) can export the
finished session as a single readable markdown story file.

Uptime, transcript volume, and atmospheric filler do NOT count as progress.
Judge every change against: "does this get us closer to a real exported story?"

## Your tasks
1. **Gap audit.** After reading context, write `STORY_GAP_AUDIT.md` listing,
   in priority order, what currently blocks the objective above. Ground every
   claim in a specific file/function or a specific playtest report finding.
2. **Implement the top gaps**, highest priority first, as far as your run
   allows. Likely candidates (verify against your audit, don't assume):
   - Narrative state persistence across scenes (facts, consequences, NPC
     state surviving scene transitions)
   - Session continuation — whatever causes sessions to stall or reset
   - A story export: endpoint or script that takes a completed session and
     produces one markdown file with the full narrative arc, readable as a
     story (not a raw transcript dump)
3. **Tests** for everything you add.
4. **Final summary.** Write `FABLE_SPRINT_REPORT.md`: what you changed, why,
   how to verify each piece, and what you'd do next with more time.

## Hard constraints
- Work on a new branch: `git checkout -b fable/story-engine-sprint`. Never
  commit to main. Push the branch when done.
- Run tests ONLY via `./test-runner.sh`. NEVER run raw `bun test` — it hangs
  forever (no local Postgres). This has deadlocked sprints before.
- No new dependencies. No broad refactors. No destructive DB migrations.
- Commit after each completed task with a clear message, not one giant
  commit at the end. Commit even if you exit early.
- For each task, include a "How to verify" note in your final summary:
  the exact command or request that proves it works.
