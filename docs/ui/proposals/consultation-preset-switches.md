# Consultation preset switches proposal (#1190)

Status: built in one pass with screenshots on the issue (owner decision 2026-11-07); the owner judges the result. Per the issue, no code is written until this note is approved, and the 2026-11-06 decisions on #1190 (per chart; separate controls, not the orb-profile controls) are taken as given.

## Goal and scope

The consultation presets shipped in #1186 set aspect families and orb caps for natal contacts only. The preset contents recorded on #1063 (2026-11-05) also switch layer visibility, essential dignities, sect, the Almuten Figuris and the chart ruler, transits and progressions, and the transit and solar-arc orbs. The wheel and the matrix have no switch for those, so a preset cannot set them yet.

In scope: the switches the presets need, where each lives, and how a preset applies them.

## Non-goals

- No change to any default. A preset applies on demand only; opening a chart looks exactly as it does today.
- No change to a calculation. A switch changes what is shown, or the orb limit used to decide which contacts are drawn.
- No persona, no mode and no per-user level (guidelines §3).
- Decile, Septile and Novile stay in #1184.

## Scope of the choices

Per chart, as decided on 2026-11-06. Each chart keeps its own switch and orb choices in the screen's component state, like the aspect family and the preset already do (`ChartView.tsx`). Nothing is written to the account, the device or the person, and leaving the chart resets them. A preset therefore never changes a person's calculation settings, the orb library or an account default (§3.4: a preset changes the current draft, not defaults).

## The switches

| Switch         | What it does                                                                                          | Where it lives                                                                                                                                                  |
| -------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Layers         | Which of the wheel's rings are drawn: natal, draconic, transit, progressed, directed, return.         | The existing Overlay settings drawer (`ChartOverlaySettingsPanel`), which already stages these rings. A preset sets the draft the drawer would apply.           |
| Chart facts    | Whether the essential dignities, sect, Almuten Figuris and chart ruler are shown on the chart screen. | A new group of checkboxes in the same drawer, under Layers, so the screen has one place for "what this chart shows".                                            |
| Transits       | Whether the transit ring and its contacts are drawn.                                                  | The Layers group (transit is one ring), not a separate control.                                                                                                 |
| Transit orbs   | The orb scale used for transit contacts on this chart (tight, balanced, wide).                        | A new choice in the drawer beside the layer it affects. It reuses the existing three scales of the transit filter (`orbSensitivity`), not a new set of numbers. |
| Solar-arc orbs | The orb limit used for solar-arc contacts on this chart.                                              | A new choice in the drawer beside the directed layer.                                                                                                           |

The drawer is the one existing staged surface for a chart's overlay choices, so the switches add no new surface and follow §4 (one control, one surface).

## How a preset applies

Choosing a preset on the chart sets, in one step: the aspect families and natal orb caps (as today), the Layers, the Chart facts, and the transit and solar-arc orb choices listed for it on #1063. It is a draft you can still change: each switch can be changed afterwards, and choosing "No preset" restores the defaults of every switch, as it restores families and orbs now. Nothing applies on load.

## Open for the owner

1. **Solar-arc and transit orb values.** #1063 names the strict values (3 for transits, 1 for solar arc, 6 for synastry) but the transit scales are tight, balanced and wide, and no solar-arc orb scale exists. Either the solar-arc limit is a single number per preset (taken from #1063), or it is a three-step scale like transits. A number must cite a source, so this needs your decision.
2. **Where the Chart facts show.** The dignities, sect, Almuten and chart ruler appear today in the Condition and Dignities tables and in the Selection card. The proposal switches them everywhere on the chart screen. If you want them hidden only in the Selection card, say so.
3. **Dynamic Synastry.** Its inter-chart matrix and bi-wheel overlay belong to the synastry screen, not to the natal chart. The proposal sets only the layers and orbs that exist on the chart the preset is chosen on, and leaves the synastry screen's own controls alone.
4. **Mockup.** Guidelines §17.2 requires the owner to approve a static 390, 1280 and 3440 light and dark mockup of the drawer before a build; this text does not replace it.
