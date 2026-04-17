# Sprint N — Authored Copy Surfaces

**Author:** Mercury  
**For:** Fekry (approval) → Atlas (verbatim build)  
**Companion to:** `SPRINT_N_PRODUCT_THESIS.md` §2B  
**Date:** April 17, 2026  
**Status:** APPROVED — ported verbatim by Atlas during build

---

**Voice anchor:** The house narrator. Not a help center. Not a chatbot. The voice that runs every session — dry, knowing, unhurried. It speaks like someone who has seen a thousand parties enter and knows how few return.

---

## 1. Bestiary — Empty

> The bestiary remains unwritten. No creature has yet earned a name in these halls. That changes the moment a party is brave enough — or foolish enough — to encounter one.

---

## 2. Characters — Empty

> No souls have signed the ledger. The stage is set, the world is drawn, but every chair at the table sits empty. For now.

---

## 3. Journals — Empty

> No sessions have been chronicled. The ink is dry, the pages blank. Every story begins with someone willing to sit down and play.

---

## 4. Worlds — Empty

> The halls are quiet. No dungeon master has spoken a world into existence yet. When one does, you'll find it here.

---

## 5. Narration Stream — Loading

> The narrator considers…

---

## 6. Session Detail — Loading

> Unrolling the scroll…

---

## 7. Tracker Feed — Paused

> Waiting for the next beat.

---

## 8. 404 — Page Not Found

> You've wandered off the map. The corridor you were looking for either never existed or has since collapsed. The narrator suggests retracing your steps — the entrance is always where you left it.

---

## 9. Server Error / 500

> The narrator has stepped away from the table. Something broke behind the screen — not in the world, but in the machinery that runs it. Give it a moment. These things tend to resolve themselves, or someone gets fired.

---

## 10. Footer Sign-Off

> A Karim Elsahy × Poormetheus production

---

## Implementation Notes for Atlas

- All copy above is **final**. Do not edit, rephrase, or "improve."
- Surfaces 1–4 and 8–9: render in **Crimson Text** (narrative prose).
- Surface 5: render with blinking cursor or equivalent micro-interaction alongside text.
- Surface 7: sub-line, minimal weight — this is ambient, not a message.
- Surface 10: **Cinzel**, gold (#c9a84c), small. Every page.
- Surfaces 5–7 are micro-copy — keep rendering lightweight. No cards, no containers. Text only.

---

## MF Prime Addendum (for Atlas build-time reasoning)

Copy above applies to **truly-empty** states only — no data ever exists for that surface. For **filtered-empty** states (data exists globally but filter returns zero matches), default to stock HeroUI "No results" language. Do not fire the authored narrative voice on filter misses. When in doubt: stock HeroUI, per thesis §4 tiebreaker.

— MF Prime (added 2026-04-17)
