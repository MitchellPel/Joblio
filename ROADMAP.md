# Joblio Improvement Path

The goal: make Joblio feel as smooth and polished as the best desktop apps, then grow features on that foundation.
`Reference Program/` (AppFlowy) is a **design reference only** — see `.cursor/rules/reference-program.mdc`.

**No release is published to the share until the owner explicitly says so.**
The team gets **one big update** — not drip-fed version bumps.

---

## Already done (published as v0.2.0)

### Phase 1 — Layout
- Deleted the 1400×900 zoom viewport
- Board and all pages reflow to the real window size; text stays crisp

### Phase 2 — Feel
- Modal / panel entry animations, pressed button states
- Smooth drag-and-drop (no janky settle)
- Background sync no longer blinks the whole board
- Network-share saves moved off the interaction path
- Fast startup (window opens first; DB loads in the background)

Also in v0.2.0: Job Number field, Installs tab + daily popup, case-insensitive usernames.

---

## Next — build locally, publish as ONE big release (after v0.2.0)

Build and verify each item one at a time. Nothing goes to the share until the
whole list below is done **and** the owner says publish.

Local version while building: **0.3.0** (not on the share yet).

1. **@Mentions in job comments** — DONE (bell + Windows toasts + @picker)
2. **Global quick search (Ctrl+K)** — DONE
3. **Activity feed** — DONE
4. **Job checklists/templates + printable job sheet** — DONE
5. **Due-date calendar view** — DONE
6. **What's New changelog** — DONE

When every item above is ready: bump/confirm version, `npm run release`, team
installs one update.

---

## Parked (revisit after the big release)

Owner's view-only mobile app · Sage integration · file attachments · reporting ·
customer records · undo/trash · any platform rewrite.

### Selling Joblio (subscriptions) — future only

Stay a Windows desktop app. Sell a **monthly licence per company**, not per PC. Jobs stay on **their** share or self-host server. You only sell the right to use the software.

- **Create company:** first PC picks the shared folder, creates `jobs.db`, and the owner sets **their** admin username/password (no default `admin` / `admin123`).
- **Join company:** other PCs point at the same folder and log in as staff the admin already created.
- **Billing:** Stripe (or similar) for seats. Licence key or company code. Offline **grace** (7–14 days) if the card fails — do not wipe the board; drop to Free after grace.
- **Free vs paid (conversion):** Free is real for one person (board, notes, proofs) but capped — e.g. 1 admin + 1 staff, ~15 active jobs. Archive restore, calendars, orders, Cut / Print List, Joblio AI locked or “upgrade”. Small “Joblio Free” on login. Paid = seats they buy, modules on, clean branding.
- **Do not:** website login, host every shop’s jobs, rewrite Joblio as a web app.

When unparking: decide Free+trial vs trial-only, and whether the cap is jobs, users, or both. First slice is the Create / Join install wizard.

---

## Standing rules

1. **One publish for the team** — build locally in any order; publish only when the owner says so
2. AppFlowy = design reference only; patterns yes, code never (AGPL)
3. Mid-build ideas go to the backlog, not into the current item
4. Parked stays parked until the big release ships
