# Design notes

## Direction

Dark-first, dense but breathable. The reference points are engineering tools —
Linear, Vercel's dashboard — rather than consumer analytics products: a lot of
data per screen, but quiet chrome, generous negative space, and no decoration
that isn't carrying information.

Concretely:

- **Cool neutral greys**, near-black at the base (`#0b0b0d`) rather than a
  warm or blue-tinted dark. Surfaces step up in lightness; borders stay at 1px.
- **No gradients, minimal shadows.** Elevation is communicated with a single
  hairline border and a small surface step. Shadows appear only on genuinely
  floating layers (tooltips, the mobile detail panel).
- **Typography does the hierarchy work.** Inter for UI, JetBrains Mono for every
  number. Headings use tight tracking (`-0.02em`); labels use wide tracking with
  uppercase at 11px.
- **Motion is fast and rare.** 120–180ms on a single easing curve, only on
  direct interaction. Fully disabled under `prefers-reduced-motion`.

### Tabular numerals everywhere

Every number in a column is being compared against the number above it. All
numeric cells use `font-variant-numeric: tabular-nums`, so digits keep a
constant width and columns don't shimmer while scrolling or re-sorting.

## Theming

Three states, handled explicitly:

| State | Mechanism |
|---|---|
| System default | bare `:root` (light) + `@media (prefers-color-scheme: dark)` |
| Explicit light | `:root[data-theme="light"]` beats OS-dark via `:not()` guard |
| Explicit dark | `:root[data-theme="dark"]` |

Every colour is defined once on bare `:root`. The dark blocks redefine *only*
the tokens that change. No colour has its sole definition inside a media query —
that's what makes a toggle work in both directions.

## Data visualisation

Charts follow a form-then-colour procedure: pick the mark from the data's job,
assign colour by role, then **validate the palette with a script** rather than
eyeballing it.

### Palette validation

The series colours are the validated categorical palette, but they were checked
against *this project's* surfaces, not assumed to transfer from the reference:

```
# dark, surface #131316
[PASS] Lightness band       all 5 inside L 0.48–0.67
[PASS] Chroma floor         all 5 >= 0.1
[PASS] CVD separation       worst adjacent ΔE 8.4 (protan)
[PASS] Normal-vision floor  worst adjacent ΔE 19.3
[PASS] Contrast vs surface  all 5 >= 3:1

# light, surface #fbfbfa
[WARN] Contrast vs surface  3 slots below 3:1 — relief required
```

**The light-mode WARN is load-bearing.** Three slots (aqua, yellow, magenta) sit
under 3:1 on the light surface, which obligates visible relief. That is why the
momentum breakdown always ships a **directly-labelled legend** stating each
component's name and value — identity is never carried by colour alone. Don't
remove those labels to "clean up" the component.

### Slot order is not cosmetic

The stacked momentum bar renders components in the exact order the palette was
validated in (blue → orange → aqua → yellow → magenta). CVD separation was
checked on *adjacent* pairs, so reordering segments can put two
indistinguishable hues next to each other. Reorder only after re-validating.

### Rules the charts follow

- **One y-axis, always.** Never a dual-axis chart. Where two measures matter
  (headcount and GitHub stars) they get two stacked charts sharing an x-axis.
- **Comparison uses small multiples.** Company headcounts differ by orders of
  magnitude; a shared axis would flatten a 5-person startup into the baseline.
- **Single series carries no legend** — the section title names it.
- **Hover layer by default.** Line charts get a crosshair and tooltip.
- **2px stroke lines, 2px gaps between stacked fills**, recessive 1px grid in
  border colour, axis labels in muted ink.
- **Text never wears a series colour.** Values and labels stay in text tokens; a
  coloured swatch beside them carries identity.

## Cold-start states

The hardest design problem here isn't a chart — it's that on day one there is
almost nothing to show. Every surface that depends on history has a designed
empty state that *explains the mechanism* rather than rendering empty axes:

- **Trend charts** → "Building history. Trend charts need at least two
  observations. Collection started {date} ({n} days so far)."
- **What's heating up** → a banner stating how many days of history back the
  ranking and which components are therefore inactive.
- **Momentum breakdown** → unmeasured components are labelled *"not measured"*
  in muted ink, visually distinct from a measured zero.

This is the visual expression of the same principle the scoring model follows:
absence of evidence is shown as absence, never as a zero.

## Performance

- The index is ~3.1 MB raw / ~590 KB gzipped for 6,209 companies. Nulls, empty
  arrays and `false` are omitted at export, which roughly halved it. Extracting
  the shared logo-URL prefix was measured and abandoned — it saved 10 KB
  gzipped, because gzip already handles repeated prefixes.
- The table is **virtualised**: only rows in the viewport plus a small overscan
  are mounted, so filtering 6,209 rows on every keystroke stays smooth.
- Logos are `loading="lazy"` with an initials fallback on error.
