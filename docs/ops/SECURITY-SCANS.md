# Security scans

`.github/workflows/security-scan.yml` runs three scanners and reports to GitHub Code Scanning (#1279). It reports only: no finding fails a pull request.

## What runs

| Step          | Tool                                | Output                                                                                                         |
| ------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| SBOM          | Syft (`anchore/sbom-action`)        | `sbom.cyclonedx.json` (CycloneDX JSON), uploaded as the `sbom-cyclonedx` artifact.                             |
| CVE scan      | Grype (`anchore/scan-action`)       | Scans the SBOM, writes `grype-results.sarif`; `fail-build: false`.                                             |
| Cross-check   | Trivy (`aquasecurity/trivy-action`) | Filesystem scan for CVEs, secrets and IaC/Dockerfile misconfiguration, `trivy-results.sarif`, `CRITICAL,HIGH`. |
| Code Scanning | `github/codeql-action/upload-sarif` | Both SARIF files, in the categories `grype-engine` and `trivy-engine`.                                         |
| Tracking      | `actions/github-script`             | Scheduled runs only; see below.                                                                                |

Triggers: push to `main`, pull request to `main`, Mondays 04:00 UTC, and `workflow_dispatch`.

The Grype, Trivy and upload steps use `if: always()`, and each upload also checks that its file exists, so one scanner failing does not stop the other engine or its upload. Every action is pinned to a full commit SHA with the version as a comment.

## Decisions (#1279)

- Label: the existing `risk:security`; no `security` label was created.
- Trivy scan type: filesystem (`fs`) only. It reads the `Dockerfile` as a misconfiguration target but does not build the image; the image is already scanned by Harbor and the Docker workflow.
- Pull requests: report only. Raising a gate is a one-line change (`fail-build: true` on Grype, a non-zero `exit-code` on Trivy) once the baseline is clean.

## Weekly tracking issue

A scheduled run counts results in both SARIF files whose rule `security-severity` is 7.0 or higher (GitHub's High threshold); a result whose rule has no score counts too. With a count of zero nothing happens. Otherwise it looks for an open issue titled `Security scan: High or Critical findings` labelled `risk:security` and updates its body, or creates it if none exists, so there is never a duplicate. The body links to the Security tab for the itemised alerts.

## Not verified locally

The workflow runs only on GitHub. The SARIF parsing, the label lookup and the issue step are exercised by the first scheduled or manual run.
