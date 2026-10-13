# Chart overlays

## Purpose

An overlay is an optional additional calculation ring in the canonical **Charts → Wheel** workspace. It is not a separate person-navigation destination. The selected chart remains the base ring; no extra ring is drawn until the reader enables one in **Overlay settings**.

## Context matrix

| Chart context         | Overlay settings       | Reason                                                                                                                                 |
| :-------------------- | :--------------------- | :------------------------------------------------------------------------------------------------------------------------------------- |
| Natal                 | Supported              | A natal wheel is a stable base for natal, transit, progressed, directed, return, relocated, and other compatible rings.                |
| Draconic              | Supported              | The draconic chart remains the base ring; compatible source rings can be configured independently.                                     |
| Harmonic/Varga        | Supported              | The selected harmonic remains the base ring; the additional rings retain their own provenance.                                         |
| Solar or lunar return | Supported              | The chosen return chart remains the base ring; source rings use the visible calculation basis.                                         |
| Relocated             | Supported              | The relocated chart remains the base ring, with the selected relocation as its own context.                                            |
| Synastry              | Intentionally separate | Its two rings are independently calculated people, not optional overlays. It retains person isolation and a legend-to-ring arrow.      |
| Composite             | Unsupported            | A composite is one synthetic midpoint chart, not independently calculated source rings. Use synastry for a two-person ring comparison. |

## Interaction and exports

- **Configuration:** A staged **Overlay settings** dialog lists every optional ring on one row with its dependent input disabled until selected. Apply commits all changes; Cancel/Escape retains the visible wheel.
- **Order:** Selected source rings can be moved inward or outward independently. The base ring stays innermost.
- **Legend:** Each multi-ring legend entry is keyboard reachable. Activating it isolates that ring and leaves its arrow visible so the label remains traceable to its band; activating another entry or clicking empty wheel space restores the normal view.
- **Aspects:** Inter-ring contacts are optional. Contacts touching points hidden by the current visibility settings are omitted rather than producing an invalid chord.
- **Exports:** Wheel SVG and PNG exports use the visible multi-ring rendering when overlays are active, including legend labels and ring arrows. Print/PDF retains the rendered wheel and its provenance panel.
