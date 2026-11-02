# Route audit: the sidebar on every route (#964, #965)

Audit of every route kind in `src/ui/route.ts` (35 kinds) against the app sidebar, the `nav#app-nav` list rendered by `src/ui/AppNav.tsx`. Each row cites the test that asserts it on `origin/main`. No route is UNTESTED.

## What the sidebar shows

- **Full sidebar (baseline):** the person tabs from `PERSON_TABS` in `src/ui/person-nav.ts` (keys: overview, consultation, birth-record, chart, report, timing-timeline, profections, progressions, solar-arc, primary-directions, transit, synastry, composite, periodic-transit, astrocartography), then **Tools** (`#/explore/cycles`) and **PDF** (`#/documents`). This is what a person page shows, and what Admin, Preferences and the other app-scoped screens show when a last-viewed person exists in the store.
- **Tools and PDF only:** the five no-person screens listed as deliberate exceptions in #914 (`people`, `home`, `shared`, `set-password`, `setup`).
- **Precondition for the full sidebar:** `test/ui-app-nav.test.tsx` opens a store with a last-viewed person (`openStoreWithLastPerson`). The person tabs are shown on app-scoped routes only when that person is in the store (`src/ui/AppNav.tsx:194-200`; the app-scoped kinds are in `src/ui/AppNav.tsx:167-177`).
- **Admin and Preferences links:** these are not in the sidebar. They are in the profile tile popover (`src/ui/ProfileTile.tsx:180`, `:190`), asserted at `test/ui-profile-tile-964.test.tsx:163-187`.

## Route kinds

Hash: the hash the test maps to the kind (`test/ui-app-nav.test.tsx:295-331`). Coverage: the test that asserts the sidebar on that kind. For the 30 full-sidebar kinds (`person-overview` included), the `it.each` at `test/ui-app-nav.test.tsx:375-390` runs one case per kind and checks that its sidebar links, text and hrefs equal the person-page baseline, with at most one `aria-current` item.

| Route kind         | Hash in test                              | Sidebar shown           | Asserted at                        |
| ------------------ | ----------------------------------------- | ----------------------- | ---------------------------------- |
| home               | `#/no-such-screen`                        | Tools and PDF only      | `test/ui-app-nav.test.tsx:392-396` |
| about              | `#/about`                                 | Full sidebar            | `test/ui-app-nav.test.tsx:375-390` |
| changelog          | `#/changelog`                             | Full sidebar            | `test/ui-app-nav.test.tsx:375-390` |
| people             | `#/people`                                | Tools and PDF only      | `test/ui-app-nav.test.tsx:392-396` |
| shared             | `#/shared`                                | Tools and PDF only      | `test/ui-app-nav.test.tsx:392-396` |
| documents          | `#/documents`                             | Full sidebar            | `test/ui-app-nav.test.tsx:375-390` |
| export-builder     | `#/documents/pdf`                         | Full sidebar            | `test/ui-app-nav.test.tsx:375-390` |
| preferences        | `#/preferences`                           | Full sidebar            | `test/ui-app-nav.test.tsx:375-390` |
| admin              | `#/admin`                                 | Full sidebar            | `test/ui-app-nav.test.tsx:375-390` |
| admin-usage        | `#/admin/usage`                           | Full sidebar            | `test/ui-app-nav.test.tsx:375-390` |
| corpus-overrides   | `#/admin/corpus-overrides`                | Full sidebar            | `test/ui-app-nav.test.tsx:375-390` |
| corpus-candidates  | `#/admin/corpus-candidates`               | Full sidebar            | `test/ui-app-nav.test.tsx:375-390` |
| set-password       | `#/set-password`                          | Tools and PDF only      | `test/ui-app-nav.test.tsx:392-396` |
| setup              | `#/setup`                                 | Tools and PDF only      | `test/ui-app-nav.test.tsx:392-396` |
| person             | `#/people/{id}/birth-record`              | Full sidebar            | `test/ui-app-nav.test.tsx:375-390` |
| person-overview    | `#/people/{id}/overview`                  | Full sidebar (baseline) | `test/ui-app-nav.test.tsx:364-370` |
| consultation       | `#/people/{id}/consultation`              | Full sidebar            | `test/ui-app-nav.test.tsx:375-390` |
| chart              | `#/people/{id}/charts/natal/wheel`        | Full sidebar            | `test/ui-app-nav.test.tsx:375-390` |
| report             | `#/people/{id}/interpretation`            | Full sidebar            | `test/ui-app-nav.test.tsx:375-390` |
| profections        | `#/people/{id}/timing/profections`        | Full sidebar            | `test/ui-app-nav.test.tsx:375-390` |
| progressions       | `#/people/{id}/timing/progressions`       | Full sidebar            | `test/ui-app-nav.test.tsx:375-390` |
| solar-arc          | `#/people/{id}/timing/solar-arc`          | Full sidebar            | `test/ui-app-nav.test.tsx:375-390` |
| primary-directions | `#/people/{id}/timing/primary-directions` | Full sidebar            | `test/ui-app-nav.test.tsx:375-390` |
| timing-timeline    | `#/people/{id}/timing/timeline`           | Full sidebar            | `test/ui-app-nav.test.tsx:375-390` |
| transit            | `#/people/{id}/timing/transits`           | Full sidebar            | `test/ui-app-nav.test.tsx:375-390` |
| periodic-transit   | `#/people/{id}/timing/forecast`           | Full sidebar            | `test/ui-app-nav.test.tsx:375-390` |
| synastry           | `#/people/{id}/relationships/synastry`    | Full sidebar            | `test/ui-app-nav.test.tsx:375-390` |
| composite          | `#/people/{id}/relationships/composite`   | Full sidebar            | `test/ui-app-nav.test.tsx:375-390` |
| astrocartography   | `#/people/{id}/location/astrocartography` | Full sidebar            | `test/ui-app-nav.test.tsx:375-390` |
| cycles             | `#/explore/cycles`                        | Full sidebar            | `test/ui-app-nav.test.tsx:375-390` |
| event-search       | `#/explore/event-search`                  | Full sidebar            | `test/ui-app-nav.test.tsx:375-390` |
| eclipses           | `#/explore/eclipses`                      | Full sidebar            | `test/ui-app-nav.test.tsx:375-390` |
| horary             | `#/explore/horary`                        | Full sidebar            | `test/ui-app-nav.test.tsx:375-390` |
| electional         | `#/explore/electional`                    | Full sidebar            | `test/ui-app-nav.test.tsx:375-390` |
| rectification      | `#/explore/rectification`                 | Full sidebar            | `test/ui-app-nav.test.tsx:375-390` |

## Summary

- 35 route kinds, all asserted by `test/ui-app-nav.test.tsx`. The count check is at `test/ui-app-nav.test.tsx:352-358`.
- 30 kinds show the full sidebar. The five no-person kinds (home, people, shared, set-password, setup) show Tools and PDF only, as #914 intends.
- Routes UNTESTED: none.
