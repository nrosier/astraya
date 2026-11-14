# Pill proposals mockup (issue #1545)

## Status

- Mockup only. Nothing in the app changes with this file.
- The owner has answered each proposal with a pill decision. The owner verdict on each mockup is still open, and no acceptance criterion on #1545 is ticked by it.
- Other candidates (segmented toggles other than rulers, badges, toggle switches) are not mocked, because the owner has not answered them.

## Mockup

- Page: `mockups/1545-pill-proposals/index.html`. Self-contained, no network requests. It uses the palette values and tokens already in `src/ui/app.css`, and adds no colour.
- Captures, each in light and dark: `mockups/1545-pill-proposals/pills-1920x1080-light.png`, `pills-1920x1080-dark.png`, `pills-390x844-light.png`, `pills-390x844-dark.png`.

```sh
cd mockups/1545-pill-proposals
python3 -m http.server 8000
```

Then open <http://127.0.0.1:8000/index.html>.

## P1. Planetary rulers: segmented pill

- Rule: Modern, Traditional and Both stay a segmented control. The container is a content-hugging pill (999px) and the options are pills. The active option has a solid accent fill and an outline for forced-colours mode. Options reach `--target-min` on a coarse pointer.
- Mockup: `mockups/1545-pill-proposals/index.html`, section P1.
- Owner answer, quoted: "Segmented pill (Recommended)" ([comment](https://github.com/nrosier/astraya/issues/1545#issuecomment-6869321843)). The comment continues: "Keep the segmented control and make it a pill. The spec's option-card line for planetary rulers (guidelines line 399) is to be corrected."

## P2. Fixed Stars search: full pill with side padding

- Rule: the single-line search field takes the 999px radius, 1rem side padding and the `--target-min` height. Other form fields keep `--radius-sm`.
- Mockup: `mockups/1545-pill-proposals/index.html`, section P2.
- Owner answer, quoted: "Pill (Recommended). Full pill shape with side padding." ([comment](https://github.com/nrosier/astraya/issues/1545#issuecomment-6869321843)).

## P3. Quick and bulk buttons: small capsule buttons

- Rule: All and Clear beside the PLANETS, MINOR PLANETS and POINTS labels, and the "Use the seven-star preset" button, are small capsules (999px). Carve-out: buttons keep the 6px radius in general (Section 11 stands), and only small inline action buttons are pills. The mockup shows a general Save button that stays at 6px.
- Mockup: `mockups/1545-pill-proposals/index.html`, section P3.
- Owner answer, quoted: "Pill (Recommended). Small capsule buttons beside the section labels." ([comment](https://github.com/nrosier/astraya/issues/1545#issuecomment-6869321843)).
- Carve-out, quoted: "buttons keep the 6px radius in general (Section 11 stands), with a carve-out: small inline action buttons (All / Clear beside section labels, and preset buttons) are pills." ([comment](https://github.com/nrosier/astraya/issues/1545#issuecomment-6869665161)).

## Related

- Issue #1545 and its comments: https://github.com/nrosier/astraya/issues/1545
- Spec: `docs/ui/UI-UX_GUIDELINES.md`, sections "Pill buttons and cards" and "Shape: pill or rounded rectangle".
