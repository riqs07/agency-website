# Steele Software website

AI setup and training for Triangle real estate agents. A static site with no build
step and no dependencies.

- `index.html` is the real estate landing page.
- `css/site.css` holds the styles, using the tokens from `DESIGN.md`.
- `js/site.js` runs the hero demo, the time-back calculator, the mobile menu and the form.
- `playground.html` is a soft body toy: 3D shapes drop in and you can grab, squeeze and throw them.
  Its code is `js/playground.js` and `css/playground.css`. It uses three.js, vendored in
  `js/vendor/three/` so the site still has no build step or install.
- `DESIGN.md` is the design system: colors, type, spacing and components, with the reasons behind them.
- `taste/` is a separate direction built with the taste skill (service page: off-white and deep navy,
  Hanken Grotesk, stand-in photos from Wikimedia Commons, credits in `taste/credits.html`). Free guides live in `taste/blog/`.
- `wireframes/` keeps the first structure wireframes (home, three industry pages,
  case study, offer page) for reference.

## Run locally

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000. Any static server works, for example `npx serve .`.

## Before launch

- **Copy and prices:** text is a working draft. Anything highlighted in yellow
  (prices, phone, email, the portrait) is a placeholder.
- **Form:** validates and shows a confirmation but doesn't send anything yet. Set
  `FORM_ENDPOINT` in `js/site.js` to a form service (Formspree, Basin, a Vercel function).
- **Photo:** replace the portrait placeholder in the About section.

## Deploy

Any static host works. On Vercel, import the repo with no framework preset and no build command.
