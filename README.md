# Steele Software website

A static site built from the structure wireframes on the "Steele Software Site Wireframes"
design canvas. It has no build step and no dependencies.

## Pages

| File | Page |
| --- | --- |
| `index.html` | Home |
| `real-estate.html` | Industry: real estate teams |
| `property-management.html` | Industry: property management |
| `bookkeeping.html` | Industry: bookkeeping and accounting |
| `case-study.html` | Case study (sample) |
| `power-session.html` | Offer: AI Power Session |

`css/site.css` holds the shared styles. `js/site.js` handles the forms.

## Run locally

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Before launch

- **Forms** validate and show a confirmation but don't send anything yet. Set `FORM_ENDPOINT`
  in `js/site.js` to a form service (Formspree, Basin, a Vercel function) to collect submissions.
- **Placeholders** are still in place: dashed boxes for photos and videos, `[X]` and
  `[Name]` text, and testimonials marked "Sample". Replace them with real content.
- **Styling** is wireframe-level. Most layout is still inline styles carried over from the canvas.

## Deploy

Any static host works. On Vercel, import the repo with no framework preset and no build command.
