# Railroaded — Design System

> **This file is controlled by the CPO (Fekry). Do not modify without explicit CPO approval.**
> Agents: read this before any UI work. Do not add sections, change decisions, or "improve" this file.

---

## Icons — Phosphor Icons

**Library:** [Phosphor Icons](https://phosphoricons.com/) v2.1.1
**CDN:** `<script src="https://unpkg.com/@phosphor-icons/web@2.1.1"></script>`

### Allowed Weights

| Weight | Class prefix | Use for |
|--------|-------------|---------|
| Regular (outlined) | `ph` | Default. Inline icons, small UI elements, navigation. |
| Duotone | `ph-duotone` | Emphasis. Section headers, feature icons, empty states. |

**No other weights.** Do not use `ph-bold`, `ph-fill`, `ph-thin`, or `ph-light`.

### Usage

```html
<i class="ph ph-sword"></i>           <!-- regular -->
<i class="ph-duotone ph-trophy"></i>  <!-- duotone for emphasis -->
```

### Rules

1. All UI icons must use Phosphor. No Unicode emoji as icons. No inline SVG for standard icons.
2. Emoji are for user-generated content only (reactions, chat).
3. Icon size inherits from parent font-size. Override with inline style only when layout requires it.
4. Social platforms use their official Phosphor logo variant: `ph-x-logo`, `ph-github-logo`, `ph-discord-logo`, `ph-reddit-logo`, `ph-linkedin-logo`.

---

## Typography

| Font | Use | CSS Variable |
|------|-----|-------------|
| **Cinzel** | Headings (H1–H4), navbar brand, footer sign-off, hero moments | `var(--font-heading)` |
| **Geist** | All body/paragraph text, UI chrome (buttons, labels, form copy, nav links) | `var(--font-geist)` / body default |
| **Crimson Text** | Narrative prose only — narrations, journals, session replay feeds, DM vision panels | `var(--font-prose)` / `.prose-narrative` |

### Rules

1. **Cinzel is the brand font.** Every H1–H4, logo instance, navbar brand mark, footer sign-off renders in Cinzel. No exceptions. (MF-STD-001)
2. **Geist is the default body font.** All paragraph text, UI elements, navigation, buttons, labels, tooltips. Applied at `<body>` level.
3. **Crimson Text is the prose font only.** Narrations, journals, session replays, DM vision panels. Not a second UI font — it is the storytelling font. (MF-STD-002)
4. System sans-serif is not used directly — Geist replaces it as the UI sans-serif.

---

## Theme

### Dark Mode Only (MF-STD-004)

Railroaded ships dark mode. No light-mode toggle. No system-preference respect.

### Gold Accent Ramp

Primary accent is gold, mapped to HeroUI's `--accent` token.

| Token | OKLCH | Approx Hex | Use |
|-------|-------|-----------|-----|
| `--accent` | `oklch(0.73 0.13 85)` | `#c9a84c` | Primary buttons, links, focus rings |
| `--accent-foreground` | `oklch(0.13 0.01 270)` | `#0a0a0f` | Text on gold backgrounds |

### Decisions Log

| # | Decision | Date | Ruled by |
|---|----------|------|----------|
| 1 | Cinzel for headings, Geist for body, Crimson Text for narrative prose only | 2026-04-17 | Fekry |
| 2 | Dark mode only, no toggle | 2026-04-17 | Fekry |
| 3 | Gold accent (`--accent`) overrides HeroUI default blue | 2026-04-17 | Fekry |
| 4 | Body font changed from system sans to Geist | 2026-04-17 | Fekry |
| 5 | Layout Balance: 3-col default for stat/card grids, no orphaned items | 2026-04-18 | Fekry |

---

## Layout Balance

### Rules

1. Grid layouts must always produce visually balanced rows. If N items don't divide evenly into the column count, either adjust the column count or add/remove items to fill the grid. No orphaned items on a partial last row.
2. Default stat/card grids: 3 columns. Only use more if the item count divides evenly.
