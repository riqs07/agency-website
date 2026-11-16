# Steele Software design system

AI setup and training for Triangle real estate agents. The site should feel like a
well-made working document: the precision of a listing sheet or a closing timeline,
not a startup landing page. The proof is the work itself, shown as real output.

Direction chosen without UXKIN references (not connected). Based on the subject,
the Draft v1 and Direction E boards, and the rules below.

## Principles

1. **Show the output, not a claim.** Every big section earns its place with a real
   artifact: a listing draft, a morning brief, a schedule. No stock photos, no icons
   standing in for content.
2. **One bold moment.** The hero demo (property facts becoming a listing draft) is
   the only animated, attention-seeking element. Everything else is quiet.
3. **Structure means something.** Numbers only for real sequences (the process).
   Tables for items with attributes (the setups). No decorative eyebrows, no
   all-caps labels, no arrows tacked onto links.
4. **Left-aligned, asymmetric.** A 12-column grid, text on the left, work surfaces
   on the right. Nothing centered except the footer's legal line.

## Color

Light only for now. Dark values are listed so a dark theme can be added later.

| Token | Light | Dark | Role |
| --- | --- | --- | --- |
| `--paper` | `#FAFAF7` | `#121513` | Page background |
| `--surface` | `#FFFFFF` | `#1B1F1C` | Work surfaces (demo, email, form) |
| `--ink` | `#161A17` | `#ECEEEA` | Headings and body text |
| `--ink-2` | `#4F5852` | `#A9B0AB` | Secondary text, captions (6.9:1 on paper) |
| `--rule` | `#DDE0DA` | `#2C322E` | Borders, table rules |
| `--pine` | `#1E4D3A` | `#7FC4A4` | Primary: buttons, links, focus ring |
| `--pine-ink` | `#FFFFFF` | `#0E1A14` | Text on primary |
| `--pine-wash` | `#E6EFEA` | `#1D2C25` | Selected rows, the "approved" state |
| `--marker` | `#F7DC5C` | `#8A7413` | Highlight behind a deadline or key fact, never decoration |
| `--error` | `#B42318` | `#F97066` | Form errors |

Pine was picked for the Carolina pines and because it reads as steady, not techy.
The marker yellow is the agent's highlighter on a contract: it marks one fact at a time.

## Typography

- **Schibsted Grotesk** (400, 500, 700) for everything in the interface: headings, body,
  buttons, tables. Sturdy and a little editorial, without Inter's default look.
  Numbers use `font-variant-numeric: tabular-nums` in tables, times and the calculator.
- **Newsreader** (400, italic 400) only for AI-written sample text inside work surfaces
  (the listing draft, the brief's sentences). Serif means "this is the output".

Scale (ratio about 1.25, body 17px):

| Token | Size / line height | Use |
| --- | --- | --- |
| `--t-xs` | 14 / 20 | Captions, table headers, legal |
| `--t-sm` | 15 / 22 | Secondary UI, form labels |
| `--t-body` | 17 / 27 | Body text, measure 64ch max |
| `--t-lg` | 21 / 30 | Lead paragraphs |
| `--t-h3` | 24 / 30 | Row titles, card titles |
| `--t-h2` | 36 / 40 | Section headings, weight 700, tracking -0.015em |
| `--t-h1` | 60 / 62 | Hero only, weight 700, tracking -0.025em (40 / 44 on phones) |

Sentence case everywhere. No all-caps labels.

## Spacing and layout

- 4px base: 4, 8, 12, 16, 24, 32, 48, 64, 96, 128 (`--s-1` to `--s-10`).
- Content width 1200px, 24px gutters (16px on phones), 12-column grid.
- Section spacing: 128px desktop, 80px phone. Sections are separated by space, not bands
  of alternating gray.

## Shape and depth

- Radius: 6px buttons and inputs, 12px work surfaces, 999px for status chips. Tables and
  text sections have none.
- One shadow, only on work surfaces: `0 1px 2px rgb(22 26 23 / .06), 0 8px 24px -8px rgb(22 26 23 / .12)`.

## Components

- **Button, primary:** pine fill, white text, 48px tall, 6px radius. Hover darkens to
  `#163B2C`. Focus: 2px pine outline, 3px offset. Disabled: 40% opacity.
- **Button, secondary:** transparent, 1px ink-2 border, ink text. Hover: pine-wash fill.
- **Link:** pine, underlined 1px with 3px offset. Hover thickens the underline.
- **Input:** surface fill, 1px rule border, 48px tall, label above in `--t-sm` 500.
  Focus: pine border plus the focus ring. Errors in `--error` text below the field.
- **Work surface:** white panel, 12px radius, the one shadow, a 44px title bar
  naming what it is ("Listing Launch Kit", "Inbox, 6:58 am").
- **Status chip:** pill, pine-wash fill, pine text, `--t-xs` 500 ("Fair housing check passed").
- **Setups table:** one row per setup. Columns: setup, what you get, tools, when it runs,
  your part. Collapses to stacked rows on phones.
- **Navigation:** wordmark left, four links, primary button right. Collapses to a
  menu button under 760px.
- **Footer:** two columns of plain links, contact line, service area.

## Imagery and icons

- No stock photography. One real portrait of T in the About section (placeholder until supplied).
- Icons: none by default. Where an icon helps (checks in the comparison, the menu button),
  inline 1.5px stroke SVG, drawn in `currentColor`.
- Product names (Claude, ChatGPT, Gmail, Canva) appear as text, never as logos.

## Motion

- The hero demo plays once on load (about 4 seconds): facts appear, the draft writes in,
  the fair housing chip lands. It shows the end state immediately when
  `prefers-reduced-motion` is set, and a replay button runs it again.
- Everything else: 150ms color and border transitions on interaction only. No scroll reveals.
