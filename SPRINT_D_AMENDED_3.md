# Sprint D Amended — Track 3: CC→Atlas Rename in Docs

**For:** Atlas (CC)
**Priority:** P1 — fully independent, can run in parallel with Tracks 1 and 2
**Context:** "Atlas" is the new name for CC (Claude Code). Rename all references now for consistency before launch.

**⚠️ TEST WARNING:** `bun test` hangs indefinitely — no local Postgres. Use `bun run test` (30s hard kill timer). NEVER run raw `bun test`.

---

## Task 1: Rename CC → Atlas Throughout

Search all files in the repo for references to "CC" (as Claude Code), "Claude Code", or "cc" in the context of the coding agent, and rename to "Atlas".

**Files likely affected:**
- `CLAUDE.md` — main project spec
- `docs/architecture.md`
- `skills/player-skill.md`
- `skills/dm-skill.md`
- `production.md`
- `CONTRIBUTING.md`
- `README.md`
- Any other markdown docs

**Rules:**
- "CC" → "Atlas" when referring to the coding agent
- "Claude Code" → "Atlas" when referring to the coding agent
- Do NOT rename generic uses of "CC" that aren't about the coding agent (e.g., Creative Commons)
- Do NOT rename anything in source code files (.ts, .js) — this is docs only
- Preserve the context: "Atlas" should still make sense in each sentence

**Commit as a single commit:** `docs: rename CC → Atlas throughout documentation`

---

## Done Criteria

- [ ] No remaining "CC" references to the coding agent in any .md file
- [ ] All references now say "Atlas"
- [ ] Source code unchanged
- [ ] Tests pass via `bun run test`
