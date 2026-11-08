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

## Download retries (#1279)

Syft, Grype and Trivy each download a binary (and Grype its vulnerability database) at run time. Those downloads have failed with HTTP 504 from github.com and with a Grype checksum mismatch after a partial download. Each of the three scanner steps therefore runs as up to three attempts of the same pinned action, with a 2 minute backoff before attempt 2 and a 5 minute backoff before attempt 3. The scan job `timeout-minutes` is 60: the worst case is 21 minutes of backoff (3 scanners x 7 minutes), plus 9 attempts at about 2 minutes each (18 minutes), plus about 5 minutes for checkout, artifact and SARIF uploads, which is 44 minutes, leaving a 16 minute margin. Attempts 1 and 2 are `continue-on-error`; attempt 3 is not, so a download that keeps failing still fails the job. Before a Grype or Trivy retry the previous SARIF output is deleted, so a partial file is never uploaded. Each retry re-fetches its download; nothing is cached between attempts. Tool versions, `severity-cutoff`, `fail-build` and Trivy's `exit-code` are unchanged.

## Decisions (#1279)

- Label: the existing `risk:security`; no `security` label was created.
- Trivy scan type: filesystem (`fs`) only. It reads the `Dockerfile` as a misconfiguration target but does not build the image; the image is already scanned by Harbor and the Docker workflow.
- Pull requests: report only. Raising a gate is a one-line change (`fail-build: true` on Grype, a non-zero `exit-code` on Trivy) once the baseline is clean.

## Weekly tracking issue

A scheduled run counts results in both SARIF files whose rule `security-severity` is 7.0 or higher (GitHub's High threshold); a result whose rule has no score counts too. With a count of zero nothing happens. Otherwise it looks for an open issue titled `Security scan: High or Critical findings` labelled `risk:security` and updates its body, or creates it if none exists, so there is never a duplicate. The body links to the Security tab for the itemised alerts.

## Not verified locally

The workflow runs only on GitHub. The SARIF parsing, the label lookup and the issue step are exercised by the first scheduled or manual run.
