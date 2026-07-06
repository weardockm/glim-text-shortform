# Glim Design System

This document records the visual system already present in `index.html` and
`admin.html`. It is a preservation contract for launch hardening, not a
redesign brief.

## 1. Atmosphere & Identity

Glim is a quiet, cinematic reading surface: near-black space, warm ivory text,
and restrained copper light around the app mark. The signature is the
full-height text feed, where one Korean passage occupies the visual center and
controls remain secondary. Security, offline, empty, and error states must feel
like part of that same calm surface rather than a separate utility UI.

## 2. Color

### Palette

| Role | Token | Existing value family | Usage |
|---|---|---:|---|
| Surface/primary | `--glim-surface-primary` | `#050505` | App and feed background |
| Surface/secondary | `--glim-surface-secondary` | `#0a0a0a` to `#151515` | Cards, controls, sheets |
| Surface/elevated | `--glim-surface-elevated` | `#1a1a1a` to `#222` | Dialogs and settings rows |
| Text/primary | `--glim-text-primary` | `#fff` / `#f0f0f0` | Titles and primary copy |
| Text/reading | `--glim-text-reading` | `#eaeaea` | Feed prose |
| Text/secondary | `--glim-text-secondary` | `#aaa` / `#888` | Metadata and descriptions |
| Text/tertiary | `--glim-text-tertiary` | `#777` / `#555` | Disabled and quiet labels |
| Text/empty | `--glim-text-empty` | `#888` dark / `#555` light | Empty-data feed message |
| Border/subtle | `--glim-border-subtle` | white at 5–12% alpha | Surface separation |
| Accent/warm | `--glim-accent-warm` | warm beige/copper family | Brand glow and selected warmth |
| Status/error | `--glim-status-error` | `#e9554f` / `#ff3b30` | Destructive actions and errors |
| Status/success | `--glim-status-success` | muted green | Successful verification only |

### Rules

- Near-black tonal shifts establish hierarchy; borders remain translucent and
  quiet.
- Warm color is reserved for identity and selected states, never decoration
  without meaning.
- Destructive red is used only for destructive or failed states.
- New UI-affecting work must reuse the families above. Existing raw values are
  documented debt and are not a license to add new arbitrary colors.

## 3. Typography

### Scale

| Level | Existing size family | Weight | Line height | Usage |
|---|---:|---:|---:|---|
| Brand | `1.4rem` | 700 | compact | Glim wordmark |
| Page title | `1.1rem`–`1.25rem` | 600–700 | 1.3 | Settings and focused views |
| Reading | `1.125rem` | 300 | 1.7 | Full-screen post content |
| Body | `0.9rem`–`1rem` | 400 | 1.5–1.65 | Forms, notices, policy copy |
| Body/small | `0.78rem`–`0.85rem` | 400–500 | 1.4–1.5 | Supporting text |
| Caption | `0.68rem`–`0.76rem` | 400–600 | 1.3–1.4 | Metadata and labels |

### Font Stack

- Reading and expressive copy: `"Noto Serif KR", serif`.
- Controls and operational UI: `-apple-system, BlinkMacSystemFont, "Segoe UI",
  sans-serif`.
- Material Symbols provide the established icon language through the pinned,
  self-hosted `v355` WOFF2 asset. The local font uses blocking display so raw
  ligature names never replace icons while the asset loads.

### Rules

- Korean reading copy preserves natural phrase boundaries where practical and
  never clips glyphs or baselines.
- Body text must remain legible at narrow mobile widths.
- Launch hardening must not replace the serif/sans role split.

## 4. Spacing & Layout

### Base Unit

The implicit base is **4px**. Existing values mostly combine 4px steps with a
small set of compact 2px adjustments.

| Token | Value | Usage |
|---|---:|---|
| `--glim-space-1` | 4px | Icon and label micro-gap |
| `--glim-space-2` | 8px | Compact groups |
| `--glim-space-3` | 12px | Control padding |
| `--glim-space-4` | 16px | Standard page and row padding |
| `--glim-space-5` | 20px | Header and comfortable inset |
| `--glim-space-6` | 24px | Sheet and section rhythm |
| `--glim-space-8` | 32px | Major separation |

### Grid and Responsive Behavior

- The product is mobile-first and fills `100dvh`; the bottom navigation and
  safe-area variables are part of the layout contract.
- Feed text is centered and capped near 450px while the viewport remains
  edge-to-edge.
- Required verification breakpoints are 375px, 768px, and 1280px.
- Narrow/short screens may tighten padding and type but may not hide core
  actions.
- Settings and admin surfaces remain centered, scrollable, and usable on
  desktop without turning into a separate desktop design.

## 5. Components

### Full-height post

- **Structure**: full-viewport article, centered prose, author metadata, side
  actions, and optional BGM control.
- **States**: loading, visible, long-text scrollable, empty, error.
- **Accessibility**: readable contrast, text remains selectable, controls have
  button semantics or equivalent keyboard behavior.
- **Motion**: prose and controls settle with opacity/transform only.

### Bottom navigation

- **Structure**: fixed five-destination navigation with a distinct write action.
- **States**: default, active, pressed, focus-visible, hidden in focused views.
- **Accessibility**: every destination has a stable accessible label and
  keyboard activation.

### Settings row/card

- **Structure**: grouped elevated card containing icon, title, description, and
  optional chevron/toggle.
- **States**: default, pressed, focus-visible, disabled, destructive.
- **Accessibility**: row actions must be real buttons or links; toggles expose
  their checked state and label.

### Sheet

- **Structure**: backdrop plus bottom-aligned surface with title, body, and
  actions.
- **States**: closed, open, loading, empty, error.
- **Accessibility**: focus is visible, Escape/backdrop behavior is predictable,
  and destructive confirmation is explicit.

### Alert dialog

- **Structure**: branded icon/kicker, title, message, optional verification
  input, primary and secondary actions.
- **States**: hidden, open, destructive, verification-required, disabled.
- **Accessibility**: modal semantics, labelled controls, and deterministic
  focus order.

### Empty/offline/error state

- **Structure**: concise title, honest explanation, and one recovery action when
  recovery exists.
- **States**: empty-data, offline, service-error, retrying.
- **Accessibility**: status text is announced without trapping focus; the retry
  action is keyboard operable.
- **Visual contract**: uses the same typography, quiet border, and near-black
  surfaces as existing feed/settings states.

## 6. Motion & Interaction

| Type | Existing duration | Usage |
|---|---:|---|
| Press | 50–150ms | Button and icon feedback |
| Micro | 180–240ms | Color, opacity, refresh state |
| Standard | 300–420ms | View/sheet transitions |
| Reading reveal | 1–1.5s | Feed prose and metadata |
| Brand emphasis | 1.8–2.2s | Splash breathing/glow only |

- New motion uses `transform`, `opacity`, or `filter`; layout animation is
  existing debt and must not expand.
- Motion communicates entry, navigation, loading, or selection. Decorative
  motion outside the splash is not added.
- `prefers-reduced-motion: reduce` must disable non-essential animation.
- Hover, pressed, focus-visible, disabled, loading, empty, and error states are
  verified where each primitive supports them.

## 7. Depth & Surface

Glim uses a **mixed tonal-shift and restrained-shadow** strategy. Primary depth
comes from near-black tonal differences and translucent white borders. Shadows
belong to elevated dialogs, sheets, the refresh indicator, and the app mark;
they do not turn every card into a floating object. Blur is reserved for
overlays and controls layered over the feed.

## 8. Accessibility Constraints

- Preserve semantic landmarks, button/link semantics, accessible names, and
  visible keyboard focus.
- Maintain at least WCAG AA contrast for body copy and controls.
- Do not communicate status by color alone.
- Avoid one-syllable Korean orphan lines and clipped CJK glyphs in all fresh
  375/768/1280 captures.
- Offline and service failures must be explicit; a blank or endlessly loading
  screen is not an acceptable state.

## 9. Accepted Design Debt

- Styles live in large inline `<style>` blocks and contain repeated raw color,
  spacing, and type values. Launch security work will document and preserve
  these values rather than perform a risky visual refactor.
- Several legacy interactive elements use inline event handlers and non-button
  containers. Security-sensitive flows should migrate first, with visual and
  keyboard equivalence pinned by tests.
- Noto Serif KR remains a Google-hosted network dependency and degrades to the
  documented serif stack. Material Symbols are self-hosted because ligature
  fallback exposes raw icon names and can destroy compact control layouts.
- The app has a buildless global-script architecture. Reusable primitives are
  behavioral/CSS contracts rather than framework components.
