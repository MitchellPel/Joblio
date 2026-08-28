# Jobtrack Design System

Signage Job Tracker — Windows desktop Electron app for a signage workshop. Warm, professional, tactile UI that feels native on Windows 10/11. Built for daily use by production staff, not marketing demos.

---

## 1. Brand & Personality

**Voice:** Clear, calm, confident. No fluff. Labels are short and practical ("New Job", "Design", "Production").

**Feel:** A well-organized workshop whiteboard — warm paper tones, ink-like text, orange accent for primary actions. Stage columns use soft tinted backgrounds so the board feels alive without shouting.

**Anti-patterns (do NOT):**
- Purple/blue AI gradients, glassmorphism, or neon glow
- Changing layout structure when adding dark mode
- Replacing `jt-*` component classes with one-off Tailwind soup
- Web-only patterns (hover-only critical actions, tiny touch targets)

---

## 2. Color System

All semantic colors use CSS custom properties in `src/index.css`. Tailwind maps to `rgb(var(--token) / <alpha-value>)`. **Light mode values must match the original hex palette exactly.**

### Core tokens

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `--color-canvas` | 242 241 237 | 28 27 24 | Page background |
| `--color-card` | 255 255 255 | 42 41 36 | Cards, modals, job cards |
| `--color-input` | 255 255 255 | 38 37 32 | Form fields (60% opacity in jt-input) |
| `--color-ink` | 38 37 30 | 235 233 226 | Primary text |
| `--color-surface` | 230 229 224 | 52 51 46 | Pills, secondary surfaces |
| `--color-surface-warm` | 235 234 229 | 58 57 51 | Primary button bg |
| `--color-surface-deep` | 225 224 219 | 48 47 42 | "New Job" column |
| `--color-surface-soft` | 247 247 244 | 35 34 30 | Subtle fills |
| `--color-border` | 38 37 30 / 0.1 | 235 233 226 / 0.12 | Borders, rings |

### Accent & status

| Token | Value | Usage |
|-------|-------|-------|
| `--color-brand` | #f54e00 (both modes) | Primary CTA, links on hover |
| `--color-brand-hover` | #e04800 | Button hover |
| `--color-danger` | #cf2d56 | Delete, errors, ghost hover text |
| `--color-success` | #22a574 | Success states, install stage |
| `--color-warn` | #eab308 | Warnings |

### Stage colors (livelier palette)

Used for column dots, borders, and text — not full backgrounds.

| Stage | Color | Light column tint |
|-------|-------|-------------------|
| New | #6b6560 | surface-deep |
| Design | #4a7eb8 | soft blue |
| Production | #d4922a | warm amber |
| Install | #22a574 | soft green |
| Collection | #d07a4a | terracotta |
| Completed | #5c5a52 | surface |

Column tints use `--stage-col-*` RGB variables so dark mode gets muted, readable versions.

---

## 3. Typography

**Font stack:** Segoe UI → system-ui → sans-serif (Windows-native).

| Role | Class | Size | Weight | Tracking |
|------|-------|------|--------|----------|
| Page title | `jt-section-title` | 20px (text-xl) | 500 | -0.03em |
| Eyebrow | `jt-eyebrow` | 11px | 500 | 0.08em caps |
| Body | default | 14px (text-sm) | 400 | normal |
| Labels | `jt-label` | 14px | 500 | normal |
| Mono (paths) | `font-mono` | 13px | 400 | normal |

No decorative display fonts. Hierarchy comes from size, weight, and ink opacity (`text-ink-90`, `text-ink-55`, `text-ink-40`).

---

## 4. Spacing & Layout

- **Page padding:** `p-6` on `jt-page`
- **Card padding:** `p-6` for settings/admin, `p-3.5` for job cards
- **Gap rhythm:** 4, 6, 8 (Tailwind scale)
- **Max content width:** Settings/Setup use `max-w-2xl`; board is full-width horizontal scroll
- **Kanban columns:** Fixed min-width, stage-tinted header + scrollable card stack

Dark mode must NOT change spacing, border-radius, or component dimensions.

---

## 5. Components (`jt-*` primitives)

Always prefer these over raw Tailwind for consistency:

| Class | Purpose |
|-------|---------|
| `jt-page` | Full-height scrollable page on canvas |
| `jt-card` | Elevated panel with border + shadow-card |
| `jt-btn` / `jt-btn-primary` / `jt-btn-accent` / `jt-btn-ghost` / `jt-btn-danger` | Buttons |
| `jt-input` | Text inputs |
| `jt-label` | Form labels |
| `jt-pill` | Small status badges |
| `jt-section-title` / `jt-eyebrow` | Page headings |

**Cards and inputs:** Use `bg-card` and `bg-input` tokens — never hardcoded `bg-white` except toggle knobs and lightbox overlays.

---

## 6. Shadows & Borders

Defined via CSS variables for theme-aware shadows:

- `shadow-ring` — 1px outline
- `shadow-card` — subtle card elevation
- `shadow-card-hover` — job card drag/hover
- `shadow-raised` — login/setup modals
- `shadow-focus` — focus rings on inputs/buttons

Dark mode shadows use higher opacity black; borders use `--color-border`.

---

## 7. Dark Mode Rules

1. Toggle via `class="dark"` on `<html>` (Tailwind `darkMode: 'class'`)
2. Persist preference in `localStorage` key `jobtrack-theme`
3. Apply theme before React paint (inline script in `index.html`) to avoid flash
4. Settings page has Appearance section: Light / Dark segmented control
5. **Never** rewrite Tailwind config with different structure — only CSS variable values change
6. Light mode screenshot parity is mandatory — if light mode looks different, the implementation is wrong

### Dark mode aesthetic

Warm charcoal backgrounds (#1c1b18 family), not cold blue-gray. Stage tints become deep muted versions of their hue. Brand orange stays the same — it pops on dark canvas.

---

## 8. Motion

- **Duration:** 150–200ms for hovers, 200ms for card transitions
- **Easing:** `ease-out`
- **Restrained:** No page transitions, no parallax. Drag-and-drop on kanban is the main motion.
- **Reduced motion:** Respect `prefers-reduced-motion` for non-essential animations

---

## 9. Accessibility

- Focus visible on all interactive elements (`focus-visible:shadow-focus`)
- Minimum 44px touch targets on coarse pointers (already in `index.css`)
- Contrast: ink-40 for placeholders only; body text uses ink or ink-90
- Semantic HTML: buttons for actions, labels for inputs
- Lightbox: keyboard nav (Escape, arrows), aria labels on icon buttons

---

## 10. Screens Reference

| Screen | Key elements |
|--------|--------------|
| Login | Centered raised card, brand accent on submit |
| Board | Horizontal kanban, stage-tinted columns, filter pills |
| Job Detail | Two-column layout, proof gallery with lightbox |
| Settings | Stacked jt-cards: Database, Appearance, Updates |
| Admin | User list, role toggles |

---

## Implementation files

- Tokens: `src/index.css`, `tailwind.config.js`
- Theme state: `src/context/ThemeContext.tsx`
- Stage defs: `src/data/stages.ts`
- Skill for codegen: `.od-skills/jobtrack-electron-ui/SKILL.md`
