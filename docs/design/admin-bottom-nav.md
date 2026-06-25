# Admin mobile bottom nav + command-palette FAB — visual spec

Audience: the component engineer building `AdminBottomNav` + `CommandPalette` (task #2).
Scope: **mobile only** (`< sm`, i.e. hidden at `sm:` and up). This is an oversight/review
admin console, not a consumer app — restraint over flash.

## Design intent

The existing admin UI is a quiet slate system: white surfaces, hairline `slate-200`
borders, `slate-500` muted text, `slate-900` for emphasis and the single active state,
`rounded-xl`, `ring-1 ring-inset`, `shadow-sm`. Status accents (green/amber/red) are used
sparingly and only to mean something.

This spec adds nothing to that language. The **one** bold element is the raised
`slate-900` center FAB — it is the page's signature and the only thing that breaks the
plane of the bar. Everything else stays flat and muted so the FAB reads as the primary
action ("jump anywhere"). Do not introduce new colors, gradients, or a second accent.

Reuses the same slate tokens already in `app/admin/_ui.tsx` (e.g. the active pill
`bg-slate-900 text-white`, the drawer's `slideIn` keyframe pattern, the backdrop
`bg-slate-900/30`).

---

## 1. Bar container

Fixed to the bottom, mobile only, sits above page content. Translucent-white with blur so
content scrolling under it stays legible; hairline top border; respects the iOS home-bar
safe area.

```
fixed inset-x-0 bottom-0 z-40 sm:hidden
border-t border-slate-200
bg-white/95 backdrop-blur
shadow-[0_-1px_3px_rgba(15,23,42,0.06)]
pb-[env(safe-area-inset-bottom)]
```

Inner row (the four tabs + the center notch for the FAB):

```
mx-auto grid h-16 max-w-md grid-cols-5 items-center px-2
```

- `h-16` (64px) is the touch-target height; `grid-cols-5` gives four nav items + one
  center column reserved for the FAB.
- The center (3rd) grid cell stays **empty** in the bar — the FAB is positioned over it
  (see §3), so the bar layout itself doesn't shift.
- Add bottom padding to the page/scroll container of `pb-20` (80px) on mobile so the last
  row of any list clears the bar.

### Four nav items

Pick the four highest-traffic destinations so the FAB covers the long tail. Recommended:
**Home** (`/admin`), **Beneficiaries**, **Tokens**, **Settlements**. Everything else lives
in the command palette (§4). Final selection is the engineer's call from `ADMIN_SECTIONS`,
but keep it to four and keep Home first.

---

## 2. Nav item — inactive vs active

Each item is a vertical icon-over-label tap target filling its grid cell.

Button / link shell:

```
group flex h-full flex-col items-center justify-center gap-1
rounded-lg text-[11px] font-medium
```

Icon wrapper: `h-[22px] w-[22px]` (see §5 for the SVG).

| State | Icon + label color | Weight | Indicator |
|---|---|---|---|
| **Inactive** | `text-slate-400` | `font-medium` | none |
| **Active** | `text-slate-900` | `font-semibold` | a 4px `slate-900` dot **above** the icon |

Active indicator dot (absolute, centered over the item, near the top edge):

```
absolute top-1.5 h-1 w-1 rounded-full bg-slate-900
```

Active vs inactive is driven the same way as `AdminHeader.tsx` `NavLink`:
`active = pathname === href || pathname.startsWith(href + "/")` (Home uses `exact`).
Apply `aria-current={active ? "page" : undefined}`.

Pressed feedback (no hover on touch): `active:bg-slate-100 transition-colors`.

Labels: sentence case, single word where possible ("Home", "Tokens", "Payouts" if
"Settlements" is too wide — test at 360px). Never wrap; the `text-[11px]` keeps four labels
on one line.

---

## 3. Center FAB (the signature)

A circular `slate-900` button lifted above the bar, opening the command palette. It
overlaps the bar's top edge and carries a white "halo" ring so it reads as floating, plus
a medium shadow for elevation. This is the only raised, only filled, only dark-circle
element — keep it that way.

Positioning: absolutely centered on the bar's top edge, lifted up by ~22px.

```
absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2
```

Button:

```
flex h-14 w-14 items-center justify-center
rounded-full bg-slate-900 text-white
ring-4 ring-white
shadow-lg shadow-slate-900/25
transition active:scale-95
hover:bg-slate-700
```

- `h-14 w-14` = 56px circle. `ring-4 ring-white` is the halo that visually punches it out
  of the bar (matches the white bar background, so it reads as a cutout).
- `shadow-lg shadow-slate-900/25` = medium elevation. Don't go heavier — this is an admin
  tool, not a consumer FAB.
- `active:scale-95` is the only motion. Respect `prefers-reduced-motion` by keeping it a
  transform-only nudge (no layout shift).
- Icon: a 3x3 grid / "sections" glyph at 24px (see §5), `text-white`. A grid glyph reads as
  "jump to a section" better than a bare `+`.
- A11y: `aria-label="Jump to a section"`, `aria-haspopup="dialog"`,
  `aria-expanded={open}`.

---

## 4. Command palette — bottom sheet

Tapping the FAB opens a searchable bottom sheet ("Jump to…") listing the admin sections.
Mirror the existing `DetailDrawer` mechanics from `_ui.tsx`: backdrop click + `Esc` close,
body scroll lock while open, `role="dialog" aria-modal="true"`, and a slide-in keyframe.
Difference: it slides up from the bottom (not in from the right) and is mobile-only.

### Backdrop

Same scrim token as the drawer:

```
fixed inset-0 z-50 bg-slate-900/30 sm:hidden
```

A full-size `<button aria-label="Close">` over it closes on tap.

### Sheet container

```
fixed inset-x-0 bottom-0 z-50 sm:hidden
max-h-[80vh] rounded-t-3xl bg-white
shadow-[0_-8px_30px_rgba(15,23,42,0.18)]
pb-[env(safe-area-inset-bottom)]
flex flex-col
animate-[sheetUp_0.22s_ease-out]
```

Keyframe (inline `<style>`, same pattern as `DetailDrawer`'s `slideIn`):

```css
@keyframes sheetUp { from { transform: translateY(100%) } to { transform: translateY(0) } }
```

Wrap the transform so reduced-motion users skip it:
`@media (prefers-reduced-motion: reduce){ .animate-[sheetUp_0.22s_ease-out]{animation:none} }`
(or gate the class in the component).

### Grab handle + header (sticky top of sheet)

```
shrink-0 px-5 pt-3 pb-2
```

- Grab handle: `mx-auto h-1 w-9 rounded-full bg-slate-300`
- Heading row under it: `mt-3 flex items-center justify-between`
  - Title: `text-base font-semibold text-slate-900` → "Jump to a section"
  - Close (X) button, reuse the drawer's exact close button:
    `shrink-0 rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700`
    with the same 20px X `<svg>` from `DetailDrawer`.

### Search input

Wrap so the magnifier sits inside the field:

```
relative mt-3
```

Magnifier SVG (absolute): `pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400`

Input (matches the `FilterBar` search styling, with left room for the icon):

```
w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm text-slate-900
outline-none focus:border-slate-600 focus:ring-1 focus:ring-slate-600
```

- `type="search"`, `placeholder="Search sections…"`, `autoFocus`.
- Filter `ADMIN_SECTIONS` client-side on `title` + `navLabel` + `description`
  (case-insensitive `includes`), same spirit as `useClientTable`'s search.
- Gate each row on `useCan(section.feature, section.action)` so a role only sees what it can
  open — identical to `GatedNavLink`.
- Empty result: a single muted row, `px-5 py-8 text-center text-sm text-slate-500` →
  "No sections match \"{term}\"."

### Section list (scrolls)

```
flex-1 overflow-y-auto px-2 pb-3
```

Each row is a `<Link>` (closes the sheet on navigate):

```
flex items-center gap-3 rounded-xl px-3 py-2.5
text-left transition active:bg-slate-100
aria-[current=page]:bg-slate-50
```

Row anatomy, left→right:
1. **Icon tile**: `flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600`
   containing the section's 20px line icon (§5). The current section's tile flips to
   `bg-slate-900 text-white` so the user sees where they are.
2. **Text block** (`min-w-0 flex-1`):
   - Title: `truncate text-sm font-medium text-slate-900` (use `navLabel ?? title`… no —
     use full `title` here; the palette has room and full names aid scanning).
   - Description: `truncate text-xs text-slate-500` (the `description` from `ADMIN_SECTIONS`).
3. **Chevron**: right-pointing 16px chevron, `h-4 w-4 shrink-0 text-slate-300`.

Keep rows flat (no per-row border); the gap + radius + active tint is enough separation,
consistent with how the admin tables stay calm.

---

## 5. Icons — inline SVG, no new deps

Use inline `<svg>` (no icon library — the repo already hand-rolls SVGs in `_ui.tsx`).
Stroke line-art, `viewBox="0 0 24 24"`, `fill="none" stroke="currentColor"`,
`stroke-width="1.5"`, `stroke-linecap="round" stroke-linejoin="round"`. Color comes from
the parent's `text-*` class (never hardcode a stroke color). Sizes: **22px** in the bar,
**24px** in the FAB, **20px** in the palette tiles, **16px** for the chevron/magnifier.

Define them once as small components (e.g. `app/admin/_nav-icons.tsx`) keyed so the palette
can look one up per section. Suggested glyphs (all simple, single-path-ish, stroke style):

| Section / use | Glyph idea |
|---|---|
| Home | house outline |
| Vendors | storefront / shop |
| Beneficiaries | user / people |
| Beneficiary registrations | clipboard-check |
| Vendor menus | menu card / list-on-card |
| Volunteers | hand-heart or people |
| Tokens | ticket / coupon |
| Proof review | image-check / camera |
| Settlements | bank / receipt |
| Fraud | shield-alert |
| Reports | bar-chart |
| Audit logs | scroll / list |
| NGO partners | handshake |
| System config | sliders / gear |
| **FAB (command)** | 3×3 grid of dots/squares (apps/sections) |
| Search | magnifier circle + handle |
| Chevron | single `>` chevron |

A missing/unmapped section should fall back to a generic square-grid glyph — never render an
empty tile.

---

## 6. Behavior + a11y checklist (for the engineer)

- Bar and sheet are `sm:hidden` — desktop keeps the existing `AdminHeader` strip untouched.
- FAB toggles `open`; `Esc` and backdrop close (reuse `DetailDrawer`'s keydown + scroll-lock
  effect verbatim).
- Trap focus to the sheet while open; return focus to the FAB on close; `autoFocus` the
  search input.
- Selecting a row navigates and closes the sheet.
- Reserve page bottom space (`pb-20` on the mobile scroll container) so the bar never covers
  content or the last table row.
- Respect `prefers-reduced-motion` for both the `sheetUp` slide and the FAB `active:scale`.

---

## 7. Stitch mockup

Reference mockup generated in Stitch project **`5299283210742058127`**
("pApAmA Admin — Bottom Nav + Command Palette", device: MOBILE).

- Project: `projects/5299283210742058127`
- Generated file id: `1422dcd87df04bc7a47524fc430be50a`
- Thumbnail screenshot: https://lh3.googleusercontent.com/aida/AP1WRLsJnh5MEQdCCY4hEstVF_m79ZOKj1zQ4qO-aGksbYr-FQoyXpm_CocDKmoOV3WgaJ6EMfKbzQvwnad1YYqYQq0Iehf3hCApZGHquRlC9B3xGg8IniCIp1aLESYoBftrQrQNCbmvvFm_awYapSvrUgDBT-XzOLLpUIo_YvfAmXu_Zsl71bxCMlUoICp5kZcMnDopdgusEbvKd1IxPYSCAyL-kEXtW6eiJE_kxwkrc17DFuw2OgmpjrwPTHI
  (Google-signed URL — open while signed into the Stitch account; may expire.)

Stitch derived a design system ("Slate Precision") from the prompt that independently
landed on the same tokens this spec mandates — a useful cross-check that the spec is
internally consistent and on-brand:

- FAB 56px circular, `slate-900` body, white halo ring, soft shadow — matches §3.
- Nav bar 64px, white, hairline `slate-200` top border; inactive `slate-400`, active
  `slate-900` with a 4px dot above the icon — matches §1–§2.
- Command palette: 24px top radius (`rounded-t-3xl`), 32×4px `slate-300` grab handle,
  `slate-900` @ 30% scrim, 12px list-row radius, chevron-right in muted slate — matches §4.
- Inter font, sentence case, 1.5px stroke icons at 22px — matches §5.

Treat **this markdown spec as authoritative** for implementation (it carries the exact
Tailwind classes and reuses `_ui.tsx` primitives); the Stitch render is a visual reference
only.
