---
description: Audit Nexus-Grid's UI for the specific things that make it read as generic or AI-templated — contrast, token discipline, and typographic weight — with a runnable checker, not a vibe check.
---

# Design review — Nexus-Grid

This project's design system lives entirely in `src/index.css` as `--color-*`
/ `--chart-*` / `--phase-*` CSS custom properties, exposed to Tailwind as
`ng-*` classes in `tailwind.config.mjs`. Every review starts from those
tokens, not from eyeballing a screenshot — the two real bugs found in this
project so far (a light-mode button at 3.77:1 contrast, three chart colors
that never cleared 3:1) were both invisible to a glance and obvious to the
math.

## Procedure

1. **Run the contrast checker.** `node .claude/skills/design-review/scripts/check-contrast.js`
   reads `src/index.css` directly and checks every real foreground/background
   pairing used in the app (body text, disabled text, buttons, status
   badges, phase labels, chart colors vs. card surface) against WCAG AA —
   4.5:1 for normal text, 3:1 for large text and graphical objects — in both
   dark and light mode. Exit code is 1 if anything fails. This is the single
   most valuable five seconds of this skill; run it before anything else.

   If it reports a chart-color (`chart-1`..`chart-5`) failure, don't
   hand-pick a replacement hex. Use the `dataviz` skill's
   `scripts/validate_palette.js` instead — contrast is only one of five
   checks it runs (lightness band, chroma floor, colorblind-safe adjacent
   separation, normal-vision separation, contrast), and a fix that only
   chases contrast can quietly break the CVD safety of an adjacent pair. See
   this project's own light-mode chart-3/4/5 fix (git history, `src/index.css`)
   for a worked example of running it iteratively until every check passes.

2. **Check for raw color values outside `index.css`.** `grep -rn "text-slate\|bg-slate\|#[0-9A-Fa-f]\{6\}" src/ --include="*.tsx"`.
   As of this skill being written, that returns nothing — every color in the
   app genuinely goes through the `ng-*` token system, including
   `src/components/charts/chart-kit.tsx`. That's the state to defend: a
   hardcoded hex or a generic Tailwind color name slipping in outside the
   token system is the single fastest way this app starts drifting from its
   own design system, and it's exactly the kind of thing that reads as
   "assembled from different templates" rather than one considered product.
   If this grep ever returns a hit, that's the finding — fix it before
   anything else on this list.

3. **Check text weight, not just color.** A foreground/background pair can
   pass WCAG AA and still read as "too light" if it's set in a small size
   *and* a muted color at the same time — two de-emphasizing choices
   stacking on the same text is usually one too many. `CoverageNote.tsx`'s
   "What it would take" field used to do exactly this (`text-ng-sm
   text-ng-secondary` while its siblings were `text-ng-base
   text-ng-primary`) — the fix wasn't a new color, it was noticing that
   field wasn't actually less important than the ones next to it. Look for
   the same pattern: is a muted color being used because the content is
   genuinely secondary, or just because muted is the second color anyone
   reaches for?

4. **Check the font scale is being used, not fought.** The scale is
   `ng-2xs` (10px) through `ng-hero` (32px) in `tailwind.config.mjs`. `ng-2xs`
   and `ng-xs` exist for uppercase eyebrow labels and dense table cells —
   they are not a body-text size. If a paragraph of real content (not a
   label, not a badge) is sitting at `ng-2xs`/`ng-xs`, that's a legibility
   bug even when the color contrast technically passes.

5. **Re-run the contrast checker after any token change.** It takes longer
   to describe than to run. A memory or comment claiming a palette was
   "validated" is a point-in-time claim, not a standing guarantee — this
   project already shipped a stale one once (light-mode chart palette,
   claimed validated, actually 3 of 5 slots failing) because nobody re-ran
   the check after the values had drifted from what the note described.

## What this skill deliberately doesn't cover

Layout, spacing rhythm, and information architecture are real design
concerns but aren't computable the way contrast and token discipline are —
review those by eye, informed by the `dataviz` skill's mark-spec and
component references (`references/marks-and-anatomy.md`,
`references/components.md`) for anything chart-adjacent.
