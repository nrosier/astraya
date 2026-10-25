> Historical: paths reflect the repo at the time this was written and may no longer exist.

# Comprehensive Audit Fix Implementation Plan

**Status:** Ready for systematic fix implementation  
**Total Issues:** 14 (11 from comprehensive audit + 3 PDF export)  
**Strategy:** One branch per issue, commit, PR, merge (per user request)

## Issues by Priority & Fixability

### Priority 0 - CRITICAL (Fix immediately)

- **#583 [QUAL-01]** Snapshot validation — MODERATE effort
  - Files: `src/domain/calculation-snapshot.ts`
  - Branches: Validate against canonical registries, enforce bounds, reject unknown versions

- **#582 [ASTRO-01]** Calculation artifact — COMPLEX (build on QUAL-01)
  - Files: `src/domain/calculation-snapshot.ts`, `src/domain/chart-share.ts`, `src/ui/ChartView.tsx`
  - Branches: Add immutable CalculationArtifactV2 with full provenance + SHA-256 hash

### Priority 1 - HIGH (Next release)

#### Quick-Fix (EASY - start here)

- **#584 [SEC-01]** Pin GitHub Actions — EASY
  - Files: `.github/workflows/ci.yml`, `.github/workflows/docker.yml`
  - Branches: Convert all `@v*` tags to pinned commit SHAs with version comments

- **#586 [I18N-01]** Comparison i18n — EASY
  - Files: `src/ui/ChartView.tsx`, `src/ui/ChartView.messages.ts`, `src/ui/ChartTypes.messages.ts`
  - Branches: Route "Comparison", "Natal" labels through message catalogs; add Dutch tests

#### Moderate Refactor

- **#587 [LOCAL-01]** Export restore/import — MODERATE
  - Files: `src/domain/full-export.ts`, new importer module
  - Branches: Implement validated restore flow with conflict preview

- **#585 [UX-01]** All-body visibility policy — COMPLEX
  - Files: `src/chart/extended-settings.ts`, `src/domain/chart-compute.ts`
  - Branches: Replace point-specific booleans with unified ObjectPolicy model

### Priority 2 - MEDIUM (Backlog/Technical Debt)

- **#588 [ARCH-01]** Tier 2 DTOs — MODERATE
  - Files: New `src/interpretation/tier2-contract.ts`, server routes, client code
  - Branches: Extract shared DTOs into pure module

- **#589 [PERF-01]** Lazy chart enrichments — MODERATE
  - Files: `src/domain/chart-compute.ts`, `src/ephemeris/worker.ts`
  - Branches: Split core from enrichments, cache by artifact

- **#590 [DOMAIN-01]** Orb profiles — COMPLEX
  - Files: `src/astrology/orb-profiles.ts`, `src/chart/extended-settings.ts`
  - Branches: Add per-body/per-aspect rules with provenance

- **#591 [DOMAIN-02]** AAF/A93 interchange — COMPLEX
  - Files: `src/domain/full-export.ts`, interchange module
  - Branches: Research & implement verified standard (after #590)

- **#592 [DOC-01]** Documentation reconciliation — EASY
  - Files: `docs/domain/EXPORT_SCHEMA.md`, `docs/audit/IMPLEMENTATION_PLAN.md`
  - Branches: Correct docs to match current behavior

### Priority 3 - PDF EXPORT ISSUES

- **#579** SVG scaling overflow — COMPLEX
  - Files: `src/domain/pdf-export-plan.ts`, `src/ui/pdf-export-*.ts`
  - Branches: Scale SVG graphs to fit page + remaining content

- **#580** Missing text labels in SVG — COMPLEX
  - Files: SVG rendering modules (wheel, matrix, aspects)
  - Branches: Ensure text elements export to PDF correctly

- **#581** Elements missing row/column amounts — MODERATE
  - Files: `src/ui/EmphasisGrid.tsx`, SVG rendering
  - Branches: Fix text rendering in elements grid

## Recommended Fix Order

1. **#592 [DOC-01]** (EASY) - 10 min - Documentation cleanup
2. **#586 [I18N-01]** (EASY) - 20 min - Comparison i18n
3. **#584 [SEC-01]** (EASY) - 30 min - GitHub Actions pinning
4. **#583 [QUAL-01]** (MODERATE) - 1.5 hrs - Snapshot validation (foundation for #582)
5. **#588 [ARCH-01]** (MODERATE) - 1.5 hrs - Tier 2 DTOs
6. **#589 [PERF-01]** (MODERATE) - 1.5 hrs - Lazy enrichments
7. **#587 [LOCAL-01]** (MODERATE) - 2 hrs - Export restore
8. **#582 [ASTRO-01]** (COMPLEX) - 3 hrs - Calculation artifact (after QUAL-01)
9. **#585 [UX-01]** (COMPLEX) - 2.5 hrs - All-body visibility
10. **#590 [DOMAIN-01]** (COMPLEX) - 3 hrs - Orb profiles
11. **#591 [DOMAIN-02]** (COMPLEX) - 3 hrs - AAF/A93 (after DOMAIN-01)
12. **#579** (COMPLEX) - 2 hrs - PDF scaling
13. **#580** (COMPLEX) - 1.5 hrs - PDF text labels
14. **#581** (MODERATE) - 1 hr - PDF amounts

**Total estimated effort:** ~26 hours

## Workflow Template

For each issue:

```bash
# 1. Create branch
git checkout main
git checkout -b fix/<issue>-<short-name>

# 2. Make changes
# (edit files)

# 3. Verify
npm run check
npm run test
npm run test:e2e  # if affecting UI

# 4. Commit
git add .
git commit -m "fix(#<issue>): <description>

<detailed explanation>

Co-Authored-By: Claude Code <noreply@anthropic.com>"

# 5. Create PR (push & open on GitHub)
git push origin fix/<issue>-<short-name>
gh pr create --fill

# 6. Merge when ready
gh pr merge --squash --auto

# 7. Close issue (auto-closed by commit message with fix(#<num>))
```

## Notes

- **#582 [ASTRO-01]** depends on **#583 [QUAL-01]** landing first
- **#591 [DOMAIN-02]** depends on research completed in **#590 [DOMAIN-01]**
- PDF issues (#579, #580, #581) are independent and can be paralleled
- Tests pass at commit: 59219cc (v0.38.0 release)

---

## Status Tracking

Track progress by closing issues as each PR merges.

Target: All 14 issues fixed by end of session.
