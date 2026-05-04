# Standards Registry

Technical and design standards for Railroaded. Each entry: ID, rule, author, date, scope.

---

STD-001 — Co-located VPS reads MUST be chained into a single SSH invocation. Serial SSH for independent reads on the same host is a process violation. (Ram Prime, Apr 16, 2026. Scope: fleet.)

STD-002 — Backup manifest update protocol: every new data path added to any agent or venture must be registered in the backup manifest within the same session. (Ram Prime, Apr 17, 2026. Scope: fleet.)

STD-003 through STD-005 — Reserved (MF-STD-001 through MF-STD-005: Cinzel headings, Crimson Text prose, dark-only, gold accent, HeroUI component library. Canonical in MF Prime domain, not yet ported.)

STD-006 — Minimum tap target: 44×44px on standalone interactive elements (buttons, nav links, form controls, card affordances, chips, toggles, sortable headers). Inline text links inside prose paragraphs are exempt per WCAG 2.5.5. (MF Prime, Apr 22, 2026. Scope: railroaded.)

STD-007 — No hardcoded pixel columns without mobile fallback. Every multi-column grid declares its collapse rule (stack / scroll / drawer). (MF Prime, Apr 22, 2026. Scope: railroaded.)

STD-008 — Timestamps must include date. Format: relative for <24h ("12m ago", "3h ago"); ISO date+time for ≥24h ("Apr 27, 14:32"). Never time-only. (MF Prime, Apr 22, 2026. Scope: railroaded.)

STD-009 — Mobile body copy minimum: 14px regular, 16px on long-form narrative surfaces (Crimson Text bodies). (MF Prime, Apr 22, 2026. Scope: railroaded.)
