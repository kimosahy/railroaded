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
