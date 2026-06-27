# Type & Polish — pApAmA shared scale

The single reference for the "Refined & cohesive / compact body" pass. The slate
portals (admin / vendor / volunteer) use the classes below verbatim; the donor
portal uses the **same scale** swapping slate → zinc and the slate accents → emerald.

Goal: tighten consistency and hierarchy. The **body stays compact** — `text-sm`
for body and tables, never enlarged. Only headings, chrome, and surface polish change.

## Type scale (paste-ready)

| Token | Classes |
| --- | --- |
| Brand wordmark | `text-xl font-bold tracking-tight bg-gradient-to-r from-slate-900 to-slate-500 bg-clip-text text-transparent` |
| Portal label (pill) | `rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500` |
| Page title `h1` (PageHeader / AdminPageHeader) | `text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900` |
| Section heading `h2` (SectionHeading) | `text-base font-semibold text-slate-900` |
| Subtitle | `text-sm text-slate-500` |
| Body & table text | `text-sm` — **do not enlarge** |
| Meta / labels | `text-xs font-medium uppercase tracking-wide text-slate-400` — never below `text-[10px]` |

Donor swap: `slate-900 → zinc-900`, `slate-500 → zinc-500`, accents → `emerald-*`.

## Polish tokens ("little shine", restrained)

| Surface | Classes |
| --- | --- |
| Sticky header | `sticky top-0 z-40 border-b border-slate-200/70 bg-white/80 backdrop-blur-md` |
| Card / surface | `rounded-2xl border border-slate-200/80 bg-white shadow-sm` |
| Clickable / list row | add `transition-shadow hover:shadow-md` |
| TableShell | `rounded-2xl border border-slate-200/80 bg-white shadow-sm` (was `rounded-xl`) |
| Button focus/press (add to existing) | `focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-1 active:scale-[.98] transition` |
| App background (layout wrapper) | `bg-gradient-to-b from-slate-50 to-slate-100/60` (was `bg-slate-50`) |

## Radius hierarchy

- Cards / surfaces / tables → `rounded-2xl`
- Buttons / inputs → `rounded-lg`
- Pills / avatars → `rounded-full`

## Base layer (globals.css)

`@layer base` adds: antialiasing (`-webkit-font-smoothing: antialiased`),
`text-rendering: optimizeLegibility`, a slate `::selection` tint
(`rgb(51 65 85 / 0.15)`), and `scroll-behavior: smooth` gated behind
`@media (prefers-reduced-motion: no-preference)`.

## Shared helpers exported from each `_ui.tsx`

- **`SectionHeading`** `{ title, subtitle?, action? }` — the `h2` section heading
  with optional subtitle and a right-aligned action slot. Available in all of
  `app/admin/_ui.tsx`, `app/vendor/_ui.tsx`, `app/volunteer/_ui.tsx`.
- **`PageHeader` / `AdminPageHeader`**, **`TableShell`**, **`ActionButton`**,
  **`RunJobBar`** — public APIs unchanged; only their internal classes were
  refined to this scale, so existing pages keep compiling.
