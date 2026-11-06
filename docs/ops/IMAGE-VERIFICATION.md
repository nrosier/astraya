# Verifying the Astraya Docker image

Every image pushed to `ghcr.io/nrosier/astraya` on a version tag is signed with
Cosign. The signature is keyless: there is no long-lived signing key. The
release workflow (`.github/workflows/docker.yml`) requests a GitHub OIDC token,
and Sigstore (Fulcio and Rekor) issues a short-lived certificate for that
workflow identity. The signature is stored in GHCR next to the image.

To check that an image was built by this repository's release workflow, run:

```
cosign verify \
  --certificate-identity-regexp="https://github.com/nrosier/astraya/.*" \
  --certificate-oidc-issuer="https://token.actions.githubusercontent.com" \
  ghcr.io/nrosier/astraya:<TAG>
```

Replace `<TAG>` with a published version, for example `1.2.3`. Each version tag
and `latest` point to the same signed digest, so any of them verifies.

A successful check prints the verified signature as JSON. The
`Issuer` field is `https://token.actions.githubusercontent.com`, and the
`Subject` field is the workflow identity, which starts with
`https://github.com/nrosier/astraya/`.

Pull-request builds are not pushed and are not signed, so they do not verify.
